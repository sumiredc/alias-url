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
const variants = (args.variants ?? [
  { name: simpleVariant, runDir: args.simple },
  { name: distributedVariant, runDir: args.distributed },
]).map((variant) => ({
  ...variant,
  runDir: variant.runDir ?? latestRunDir(variant.name, scenarios),
}));

const missingVariants = variants.filter((variant) => !variant.runDir);

if (missingVariants.length > 0) {
  console.error('Could not find all result directories.');
  console.error(`missing variants: ${missingVariants.map((variant) => variant.name).join(', ')}`);
  process.exit(1);
}

const rows = [];

for (const scenario of scenarios) {
  for (const variant of variants) {
    rows.push(summaryRow(variant.name, variant.runDir, scenario));
  }
}

const labelWidth = Math.max(...variants.map((variant) => variant.name.length));
for (const variant of variants) {
  console.log(`${variant.name.padEnd(labelWidth)}: ${displayPath(variant.runDir)}`);
}
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

    if (key === '--variants' && value) {
      parsed.variants = value
        .split(',')
        .map((variant) => variant.trim())
        .filter(Boolean)
        .map((variant) => ({ name: variant, runDir: null }));
    }
  }

  return parsed;
}

function latestRunDir(variant, requiredScenarios) {
  const variantDir = path.join(resultRoot, variant);

  if (!fs.existsSync(variantDir)) {
    return null;
  }

  const entries = fs.readdirSync(variantDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(variantDir, entry.name))
    .filter((runDir) => hasScenarioSummaries(runDir, requiredScenarios))
    .map((runDir) => ({ runDir, mtime: latestSummaryMtime(runDir, requiredScenarios) }))
    .sort((left, right) => {
      if (left.mtime !== right.mtime) {
        return left.mtime - right.mtime;
      }

      return left.runDir.localeCompare(right.runDir);
    });

  return entries.at(-1)?.runDir ?? null;
}

function hasScenarioSummaries(runDir, requiredScenarios) {
  return requiredScenarios.every((scenario) => fs.existsSync(path.join(runDir, `${scenario}.json`)));
}

function latestSummaryMtime(runDir, requiredScenarios) {
  return Math.max(
    ...requiredScenarios.map((scenario) => fs.statSync(path.join(runDir, `${scenario}.json`)).mtimeMs),
  );
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
      p999: '-',
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
    p999: msOrDash(duration['p(99.9)']),
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
  const headers = ['scenario', 'variant', 'vus', 'reqs', 'rps', 'med', 'p95', 'p99', 'p99.9', 'max', 'failed', 'checks', 'statuses', 'conflicts'];
  const displayValue = (row, header) => String(row[header === 'p99.9' ? 'p999' : header]);
  const widths = Object.fromEntries(headers.map((header) => [
    header,
    Math.max(header.length, ...rows.map((row) => displayValue(row, header).length)),
  ]));

  console.log(headers.map((header) => pad(header, widths[header])).join('  '));
  console.log(headers.map((header) => '-'.repeat(widths[header])).join('  '));

  for (const row of rows) {
    console.log(headers.map((header) => pad(displayValue(row, header), widths[header])).join('  '));
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
