#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));

const scenarios = [
  ['warmup-redirect', 'bench/k6/setup/warmup-redirect.ts'],
  ['redirect', 'bench/k6/scenarios/redirect.ts'],
  ['create-existing', 'bench/k6/scenarios/create-existing.ts'],
  ['warmup-create', 'bench/k6/setup/warmup-create.ts'],
  ['create', 'bench/k6/scenarios/create.ts'],
];

const variant = stringArg('variant');
const store = stringArg('store');
const variantDir = stringArg('variant-dir');
const resultVariant = stringArg('result-variant', variant);
const runIdPrefix = stringArg('run-id-prefix', resultVariant);
const baseUrl = stringArg('base-url', process.env.BASE_URL ?? 'http://localhost:8080');
const runId = stringArg('run-id', process.env.RUN_ID ?? `${runIdPrefix}-${timestamp()}`);
const resultDir = stringArg('result-dir', `bench/results/${resultVariant}/${runId}`);

await mkdir(resultDir, { recursive: true });

console.log(`variant=${resultVariant}`);
console.log(`run_id=${runId}`);
console.log(`base_url=${baseUrl}`);

await waitForHealth(baseUrl);

await run(process.execPath, [
  'bench/scripts/run-seed.mjs',
  '--store',
  store,
  '--variant-dir',
  variantDir,
  '--base-url',
  baseUrl,
  '--result-dir',
  resultDir,
  '--run-id',
  runId,
]);

for (const [summaryName, script] of scenarios) {
  await run('k6', ['run', '--summary-export', `${resultDir}/${summaryName}.json`, script], {
    ...process.env,
    BASE_URL: baseUrl,
    RUN_ID: runId,
  });
}

console.log(`results=${resultDir}`);

async function waitForHealth(url) {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const code = await runQuiet('curl', ['-fsS', `${url}/health`]);

    if (code === 0) {
      return;
    }

    if (attempt === 60) {
      throw new Error(`Backend did not become healthy: ${url}/health`);
    }

    await sleep(1000);
  }
}

function parseArgs(values) {
  const parsed = new Map();

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (!value.startsWith('--')) {
      continue;
    }

    const [key, inlineValue] = value.slice(2).split('=', 2);
    const nextValue = inlineValue ?? values[index + 1];

    if (inlineValue === undefined) {
      index += 1;
    }

    if (!parsed.has(key)) {
      parsed.set(key, []);
    }

    parsed.get(key).push(nextValue);
  }

  return {
    get(name) {
      return parsed.get(name)?.at(-1);
    },
  };
}

function stringArg(name, fallback = undefined) {
  const value = args.get(name) ?? fallback;

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing --${name}`);
  }

  return value.trim();
}

function timestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  ];

  return parts.map((part) => String(part).padStart(2, '0')).join('');
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function run(command, commandArgs, env = process.env) {
  const child = spawn(command, commandArgs, { env, stdio: 'inherit' });

  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

function runQuiet(command, commandArgs) {
  const child = spawn(command, commandArgs, { stdio: 'ignore' });

  return new Promise((resolve) => {
    child.once('error', () => resolve(1));
    child.once('exit', (code) => resolve(code ?? 1));
  });
}
