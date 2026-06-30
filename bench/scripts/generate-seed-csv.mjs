#!/usr/bin/env node

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const profiles = {
  small: 1_000,
  medium: 1_000_000,
  large: 100_000_000,
};

const args = parseArgs(process.argv.slice(2));
const profile = stringArg(args, 'profile', process.env.SEED_PROFILE ?? 'medium');
const count = intArg(args, 'count', process.env.SEED_COUNT, profiles[profile]);
const aliasPrefix = sanitizeAliasPart(stringArg(args, 'alias-prefix', process.env.ALIAS_PREFIX ?? 'bench'));
const seedNamespace = sanitizeAliasPart(
  stringArg(args, 'seed-namespace', process.env.SEED_NAMESPACE ?? String(count)),
);
const out = stringArg(
  args,
  'out',
  process.env.SEED_CSV ?? defaultOutputPath(seedNamespace),
);

if (!Number.isSafeInteger(count) || count <= 0) {
  throw new Error(`Invalid seed count: ${count}`);
}

await mkdir(path.dirname(out), { recursive: true });

const stream = createWriteStream(out, { encoding: 'utf8' });

for (let index = 0; index < count; index += 1) {
  const alias = aliasFor(aliasPrefix, seedNamespace, index);
  const line = `${alias},${targetUrl(alias)}\n`;

  if (!stream.write(line)) {
    await onceDrain(stream);
  }
}

await closeStream(stream);

console.log(`seed_csv=${out}`);
console.log(`seed_count=${count}`);
console.log(`seed_namespace=${seedNamespace}`);
console.log(`alias_prefix=${aliasPrefix}`);

function defaultOutputPath(namespace) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed-data');
  const name = `${namespace}.csv`;

  return path.join(root, name);
}

function aliasFor(prefix, namespace, index) {
  return `${prefix}-${namespace}-seed-${index}`;
}

function targetUrl(alias) {
  return `https://example.com/benchmark/${alias}`;
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

function sanitizeAliasPart(value) {
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-');

  return sanitized === '' ? 'bench' : sanitized.slice(0, 64);
}

function onceDrain(stream) {
  return new Promise((resolve, reject) => {
    stream.once('drain', resolve);
    stream.once('error', reject);
  });
}

function closeStream(stream) {
  return new Promise((resolve, reject) => {
    stream.end(resolve);
    stream.once('error', reject);
  });
}
