#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const resultRoot = path.resolve('bench/results');
const defaultScenarios = ['redirect', 'create-existing', 'create'];

const args = parseArgs(process.argv.slice(2));
const scenarios = args.scenarios ?? defaultScenarios;
const simpleVariant = args.simpleVariant ?? 'simple';
const distributedVariant = args.distributedVariant ?? 'distributed';
const simpleRun = args.simple ?? latestRunDir(simpleVariant);
const distributedRun = args.distributed ?? latestRunDir(distributedVariant);

if (!simpleRun || !distributedRun) {
  console.error('Could not find both simple and distributed result directories.');
  console.error(`simple variant: ${simpleVariant}`);
  console.error(`distributed variant: ${distributedVariant}`);
  process.exit(1);
}

const rows = [];

for (const scenario of scenarios) {
  rows.push(summaryRow(simpleVariant, simpleRun, scenario));
  rows.push(summaryRow(distributedVariant, distributedRun, scenario));
}

console.log(`simple:      ${displayPath(simpleRun)}`);
console.log(`distributed: ${displayPath(distributedRun)}`);
console.log('');
printTable(rows);

function parseArgs(argv) {
  const parsed = {};

  for (const arg of argv) {
    const [key, value] = arg.split('=', 2);

    if (key === '--simple' && value) {
      parsed.simple = path.resolve(value);
    }

    if (key === '--distributed' && value) {
      parsed.distributed = path.resolve(value);
    }

    if (key === '--simple-variant' && value) {
      parsed.simpleVariant = value;
    }

    if (key === '--distributed-variant' && value) {
      parsed.distributedVariant = value;
    }

    if (key === '--scenarios' && value) {
      parsed.scenarios = value.split(',').map((scenario) => scenario.trim()).filter(Boolean);
    }
  }

  return parsed;
}

function latestRunDir(variant) {
  const variantDir = path.join(resultRoot, variant);

  if (!fs.existsSync(variantDir)) {
    return null;
  }

  const entries = fs.readdirSync(variantDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(variantDir, entry.name))
    .sort();

  return entries.at(-1) ?? null;
}

function summaryRow(variant, runDir, scenario) {
  const filePath = path.join(runDir, `${scenario}.json`);

  if (!fs.existsSync(filePath)) {
    return {
      scenario,
      variant,
      vus: '-',
      reqs: '-',
      rps: '-',
      med: '-',
      p95: '-',
      p99: '-',
      max: '-',
      failed: '-',
      checks: '-',
      statuses: '-',
      conflicts: '-',
    };
  }

  const result = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const metrics = result.metrics ?? {};
  const duration = metrics.http_req_duration ?? {};
  const checks = metrics.checks ?? {};
  const failed = metrics.http_req_failed ?? {};
  const reqs = metrics.http_reqs ?? {};
  const vus = metrics.vus_max ?? metrics.vus ?? {};

  return {
    scenario,
    variant,
    vus: numberOrDash(vus.value),
    reqs: integerOrDash(reqs.count),
    rps: fixedOrDash(reqs.rate, 0),
    med: msOrDash(duration.med),
    p95: msOrDash(duration['p(95)']),
    p99: msOrDash(duration['p(99)']),
    max: msOrDash(duration.max),
    failed: percentOrDash(failed.value),
    checks: checks.value === undefined
      ? '-'
      : `${percent(checks.value)} (${checks.fails ?? 0} fail)`,
    statuses: statusSummary(metrics),
    conflicts: conflictSummary(metrics),
  };
}

function printTable(rows) {
  const headers = ['scenario', 'variant', 'vus', 'reqs', 'rps', 'med', 'p95', 'p99', 'max', 'failed', 'checks', 'statuses', 'conflicts'];
  const widths = Object.fromEntries(headers.map((header) => [
    header,
    Math.max(header.length, ...rows.map((row) => String(row[header]).length)),
  ]));

  console.log(headers.map((header) => pad(header, widths[header])).join('  '));
  console.log(headers.map((header) => '-'.repeat(widths[header])).join('  '));

  for (const row of rows) {
    console.log(headers.map((header) => pad(String(row[header]), widths[header])).join('  '));
  }
}

function pad(value, width) {
  return value.padEnd(width, ' ');
}

function displayPath(value) {
  return path.relative(process.cwd(), value);
}

function numberOrDash(value) {
  return Number.isFinite(value) ? String(value) : '-';
}

function integerOrDash(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '-';
}

function fixedOrDash(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function msOrDash(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}ms` : '-';
}

function percentOrDash(value) {
  return Number.isFinite(value) ? percent(value) : '-';
}

function percent(value) {
  return `${(value * 100).toFixed(3)}%`;
}

function statusSummary(metrics) {
  const statuses = [
    ['200', metrics.status_200?.count],
    ['201', metrics.status_201?.count],
    ['302', metrics.status_302?.count],
    ['400', metrics.status_400?.count],
    ['404', metrics.status_404?.count],
    ['409', metrics.status_409?.count],
    ['429', metrics.status_429?.count],
    ['500', metrics.status_500?.count],
    ['502', metrics.status_502?.count],
    ['503', metrics.status_503?.count],
    ['504', metrics.status_504?.count],
    ['2xx', metrics.status_2xx?.count],
    ['3xx', metrics.status_3xx?.count],
    ['4xx', metrics.status_4xx?.count],
    ['5xx', metrics.status_5xx?.count],
    ['other', metrics.status_other?.count],
  ]
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .map(([label, count]) => `${label}:${Math.round(count).toLocaleString('en-US')}`);

  return statuses.length === 0 ? '-' : statuses.join(' ');
}

function conflictSummary(metrics) {
  const conflicts = [
    ['exists', metrics.conflict_alias_exists?.count],
    ['might_exist', metrics.conflict_alias_might_exist?.count],
    ['other', metrics.conflict_other?.count],
  ]
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .map(([label, count]) => `${label}:${Math.round(count).toLocaleString('en-US')}`);

  return conflicts.length === 0 ? '-' : conflicts.join(' ');
}
