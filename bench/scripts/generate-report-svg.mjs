#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const resultRoot = path.resolve('bench/results');
const args = parseArgs(process.argv.slice(2));
const variants = stringListArg('variants', 'simple-scaled,simple-rs-scaled,distributed-scaled');
const scenarios = stringListArg('scenarios', 'redirect,create-existing,create');
const title = stringArg('title', 'Alias URL benchmark');
const output = path.resolve(stringArg('output', 'bench/report/summary.svg'));

const rows = [];

for (const scenario of scenarios) {
  for (const variant of variants) {
    const runDir = latestRunDir(variant, scenarios);
    rows.push(summaryRow(variant, runDir, scenario));
  }
}

await fs.promises.mkdir(path.dirname(output), { recursive: true });
await fs.promises.writeFile(output, renderSvg(rows), 'utf8');
console.log(`wrote ${path.relative(process.cwd(), output)}`);

function parseArgs(values) {
  const parsed = {};

  for (const arg of values) {
    const [key, value] = arg.split('=', 2);

    if (key.startsWith('--') && value !== undefined) {
      parsed[key.slice(2)] = value;
    }
  }

  return parsed;
}

function stringArg(name, fallback) {
  const value = args[name] ?? fallback;

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing --${name}`);
  }

  return value.trim();
}

function stringListArg(name, fallback) {
  return stringArg(name, fallback)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function latestRunDir(variant, requiredScenarios) {
  const variantDir = path.join(resultRoot, variant);

  if (!fs.existsSync(variantDir)) {
    return null;
  }

  const entries = fs.readdirSync(variantDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(variantDir, entry.name))
    .filter((runDir) => requiredScenarios.every((scenario) => fs.existsSync(path.join(runDir, `${scenario}.json`))))
    .map((runDir) => ({
      runDir,
      mtime: Math.max(...requiredScenarios.map((scenario) => fs.statSync(path.join(runDir, `${scenario}.json`)).mtimeMs)),
    }))
    .sort((left, right) => left.mtime - right.mtime || left.runDir.localeCompare(right.runDir));

  return entries.at(-1)?.runDir ?? null;
}

function summaryRow(variant, runDir, scenario) {
  if (runDir === null) {
    return {
      scenario,
      variant,
      vus: '-',
      reqs: '-',
      rps: '-',
      p99: '-',
      failed: '-',
    };
  }

  const filePath = path.join(runDir, `${scenario}.json`);
  const result = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const metrics = result.metrics ?? {};
  const duration = metrics.http_req_duration ?? {};
  const failed = metrics.http_req_failed ?? {};
  const reqs = metrics.http_reqs ?? {};
  const vus = metrics.vus_max ?? metrics.vus ?? {};

  return {
    scenario,
    variant,
    vus: numberOrDash(vus.value),
    reqs: integerOrDash(reqs.count),
    rps: fixedOrDash(reqs.rate, 0),
    p99: msOrDash(duration['p(99)']),
    failed: percentOrDash(failed.value),
  };
}

function fixedOrDash(value, digits) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function numberOrDash(value) {
  return Number.isFinite(value) ? String(value) : '-';
}

function integerOrDash(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '-';
}

function msOrDash(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}ms` : '-';
}

function percentOrDash(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(3)}%` : '-';
}

function renderSvg(rows) {
  const rowHeight = 34;
  const headerHeight = 86;
  const footerHeight = 28;
  const width = 860;
  const height = headerHeight + rowHeight * (rows.length + 1) + footerHeight;
  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const columns = [
    { label: 'scenario', x: 28, width: 155 },
    { label: 'variant', x: 190, width: 210 },
    { label: 'vus', x: 410, width: 50, align: 'end' },
    { label: 'reqs', x: 475, width: 95, align: 'end' },
    { label: 'rps', x: 590, width: 80, align: 'end' },
    { label: 'p99', x: 690, width: 75, align: 'end' },
    { label: 'failed', x: 785, width: 45, align: 'end' },
  ];

  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
    '<style>',
    'text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:#172033}',
    '.title{font-size:24px;font-weight:700}',
    '.meta{font-size:12px;fill:#637083}',
    '.head{font-size:12px;font-weight:700;fill:#455166;text-transform:uppercase}',
    '.cell{font-size:14px}',
    '.num{font-variant-numeric:tabular-nums}',
    '.stripe{fill:#f7f9fc}',
    '.line{stroke:#d8dee9;stroke-width:1}',
    '</style>',
    '<rect width="100%" height="100%" rx="12" fill="#ffffff"/>',
    '<rect x="0" y="0" width="100%" height="62" rx="12" fill="#edf3ff"/>',
    `<text x="28" y="38" class="title">${escapeXml(title)}</text>`,
    `<text x="28" y="58" class="meta">generated at ${escapeXml(generatedAt)} / vus, reqs, rps, p99, failed</text>`,
  ];

  const headerY = headerHeight;
  lines.push(`<line x1="20" x2="${width - 20}" y1="${headerY - 12}" y2="${headerY - 12}" class="line"/>`);

  for (const column of columns) {
    const x = column.align === 'end' ? column.x + column.width : column.x;
    const anchor = column.align === 'end' ? 'end' : 'start';
    lines.push(`<text x="${x}" y="${headerY + 10}" text-anchor="${anchor}" class="head">${escapeXml(column.label)}</text>`);
  }

  rows.forEach((row, index) => {
    const y = headerY + rowHeight * (index + 1);

    if (index % 2 === 0) {
      lines.push(`<rect x="20" y="${y - 20}" width="${width - 40}" height="${rowHeight}" rx="6" class="stripe"/>`);
    }

    for (const column of columns) {
      const value = row[column.label];
      const x = column.align === 'end' ? column.x + column.width : column.x;
      const anchor = column.align === 'end' ? 'end' : 'start';
      const className = column.align === 'end' ? 'cell num' : 'cell';
      lines.push(`<text x="${x}" y="${y + 2}" text-anchor="${anchor}" class="${className}">${escapeXml(value)}</text>`);
    }
  });

  lines.push(`<text x="28" y="${height - 16}" class="meta">Source: k6 summary JSON in bench/results</text>`);
  lines.push('</svg>');

  return `${lines.join('\n')}\n`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
