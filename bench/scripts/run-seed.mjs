#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const profiles = {
  small: 1_000,
  medium: 1_000_000,
  large: 100_000_000,
};

const args = parseArgs(process.argv.slice(2));
const profile = stringArg(args, 'profile', process.env.SEED_PROFILE ?? 'small');
const count = intArg(args, 'count', process.env.SEED_COUNT, profiles[profile]);
const store = stringArg(args, 'store', process.env.SEED_STORE ?? '');
const variantDir = stringArg(args, 'variant-dir', process.env.VARIANT_DIR ?? '');
const baseUrl = stringArg(args, 'base-url', process.env.BASE_URL ?? 'http://localhost:8080');
const resultDir = stringArg(args, 'result-dir', process.env.RESULT_DIR ?? '');
const runId = stringArg(args, 'run-id', process.env.RUN_ID ?? 'local');
const aliasPrefix = stringArg(args, 'alias-prefix', process.env.ALIAS_PREFIX ?? 'bench');
const seedNamespace = stringArg(args, 'seed-namespace', process.env.SEED_NAMESPACE ?? String(count));
const summaryPath = path.join(resultDir, 'seed-aliases.json');

if (!Object.hasOwn(profiles, profile)) {
  throw new Error(`Invalid seed profile ${profile}; expected small, medium, or large`);
}

if (!Number.isSafeInteger(count) || count <= 0) {
  throw new Error(`Invalid seed count: ${count}`);
}

await mkdir(resultDir, { recursive: true });

console.log(`seed_profile=${profile}`);
console.log(`seed_count=${count}`);
console.log(`seed_namespace=${seedNamespace}`);
console.log(`seed_method=${profile === 'small' ? 'k6' : 'bulk'}`);

if (profile === 'small') {
  await runK6Seed();
} else {
  const startedAt = new Date();

  await run(process.execPath, [
    scriptPath('bulk-seed.mjs'),
    '--store',
    store,
    '--variant-dir',
    variantDir,
    '--profile',
    profile,
    '--count',
    String(count),
    '--seed-namespace',
    seedNamespace,
    '--alias-prefix',
    aliasPrefix,
  ]);

  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        seed: {
          method: 'bulk',
          profile,
          count,
          store,
          variantDir,
          runId,
          aliasPrefix,
          seedNamespace,
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
        },
      },
      null,
      2,
    ),
  );
}

async function runK6Seed() {
  await run(
    'k6',
    ['run', '--summary-export', summaryPath, scriptPath('../k6/setup/seed-aliases.ts')],
    {
      ...process.env,
      BASE_URL: baseUrl,
      RUN_ID: runId,
      ALIAS_PREFIX: aliasPrefix,
      SEED_NAMESPACE: seedNamespace,
      SEED_COUNT: String(count),
    },
  );
}

function scriptPath(relativePath) {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), relativePath);
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

    parsed.set(key, nextValue);
  }

  return parsed;
}

function stringArg(argsMap, name, fallback) {
  const value = argsMap.get(name) ?? fallback;

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing --${name}`);
  }

  return value.trim();
}

function intArg(argsMap, name, envValue, fallback) {
  const rawValue = argsMap.get(name) ?? envValue;

  if (rawValue === undefined || rawValue === '') {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);

  return Number.isFinite(parsed) ? parsed : fallback;
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
