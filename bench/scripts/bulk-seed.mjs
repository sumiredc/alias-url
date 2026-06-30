#!/usr/bin/env node

import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const profiles = {
  medium: 1_000_000,
  large: 100_000_000,
};

const args = parseArgs(process.argv.slice(2));
const store = stringArg(args, 'store', process.env.SEED_STORE ?? '');
const variantDir = stringArg(args, 'variant-dir', process.env.VARIANT_DIR ?? defaultVariantDir(store));
const profile = stringArg(args, 'profile', process.env.SEED_PROFILE ?? 'medium');
const count = intArg(args, 'count', process.env.SEED_COUNT, profiles[profile]);
const aliasPrefix = sanitizeAliasPart(stringArg(args, 'alias-prefix', process.env.ALIAS_PREFIX ?? 'bench'));
const seedNamespace = sanitizeAliasPart(
  stringArg(args, 'seed-namespace', process.env.SEED_NAMESPACE ?? String(count)),
);
const csv = stringArg(
  args,
  'csv',
  process.env.SEED_CSV ?? defaultCsvPath(seedNamespace),
);

if (store !== 'mysql' && store !== 'redis') {
  throw new Error(`Invalid --store ${store}; expected mysql or redis`);
}

if (!Number.isSafeInteger(count) || count <= 0) {
  throw new Error(`Invalid seed count: ${count}`);
}

await ensureCsv(csv);

console.log(`seed_store=${store}`);
console.log(`seed_csv=${csv}`);
console.log(`seed_count=${count}`);
console.log(`seed_namespace=${seedNamespace}`);
console.log(`alias_prefix=${aliasPrefix}`);
console.log(`variant_dir=${variantDir}`);

if (store === 'mysql') {
  await seedMysql({ variantDir, csv });
} else {
  await seedRedis({ variantDir, csv });
}

async function ensureCsv(csvPath) {
  try {
    await access(csvPath);
  } catch {
    await run(process.execPath, [
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'generate-seed-csv.mjs'),
      '--profile',
      profile,
      '--count',
      String(count),
      '--seed-namespace',
      seedNamespace,
      '--alias-prefix',
      aliasPrefix,
      '--out',
      csvPath,
    ]);
  }
}

async function seedMysql({ variantDir: composeDir, csv: csvPath }) {
  const loadSql = [
    'SET SESSION unique_checks = 0;',
    [
      "LOAD DATA LOCAL INFILE '/tmp/aliases.csv'",
      'IGNORE INTO TABLE aliases',
      "FIELDS TERMINATED BY ','",
      "LINES TERMINATED BY '\\n'",
      '(alias, url);',
    ].join(' '),
    'SET SESSION unique_checks = 1;',
    'SELECT COUNT(*) AS aliases_count FROM aliases',
  ].join(' ');

  const child = spawn(
    'docker',
    [
      'compose',
      '-f',
      path.join(composeDir, 'compose.yaml'),
      'exec',
      '-T',
      'mysql',
      'sh',
      '-lc',
      [
        'trap "rm -f /tmp/aliases.csv" EXIT',
        'cat > /tmp/aliases.csv',
        'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SET GLOBAL local_infile = 1"',
        `mysql --local-infile=1 -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e ${shellQuote(loadSql)}`,
      ].join(' && '),
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );

  createReadStream(csvPath).pipe(child.stdin);

  await waitFor(child);
}

async function seedRedis({ variantDir: composeDir, csv: csvPath }) {
  const shards = redisShards();
  const ring = consistentHashRing(shards);
  const pipes = new Map();

  for (const shard of shards) {
    const child = spawn(
      'docker',
      ['compose', '-f', path.join(composeDir, 'compose.yaml'), 'exec', '-T', shard.service, 'redis-cli', '--pipe'],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );

    pipes.set(shard.key, child);
  }

  const reader = readline.createInterface({
    input: createReadStream(csvPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    if (line === '') {
      continue;
    }

    const comma = line.indexOf(',');
    const alias = line.slice(0, comma);
    const url = line.slice(comma + 1);
    const shard = resolveShard(ring, alias);
    const child = pipes.get(shard.key);
    const command = respCommand(['SET', alias, url, 'NX']);

    if (!child.stdin.write(command)) {
      await onceDrain(child.stdin);
    }
  }

  for (const child of pipes.values()) {
    child.stdin.end();
  }

  await Promise.all([...pipes.values()].map(waitFor));
}

function redisShards() {
  const value = process.env.REDIS_SHARDS ?? 'redis-1:6379,redis-2:6379,redis-3:6379,redis-4:6379,redis-5:6379,redis-6:6379,redis-7:6379,redis-8:6379,redis-9:6379,redis-10:6379,redis-11:6379,redis-12:6379';

  return value.split(',').map((address) => {
    const [host, port] = address.trim().split(':', 2);

    if (!host || !port) {
      throw new Error(`Invalid Redis shard address: ${address}`);
    }

    return {
      host,
      port,
      key: `${host}:${port}`,
      service: host,
    };
  });
}

function consistentHashRing(shards) {
  const ring = [];

  for (const shard of shards) {
    for (let index = 0; index < 1024; index += 1) {
      ring.push({
        position: crc32(`${shard.key}#${index}`),
        shard,
      });
    }
  }

  ring.sort((left, right) => left.position - right.position);

  return ring;
}

function resolveShard(ring, alias) {
  const hash = crc32(alias);
  const index = lowerBound(ring, hash);

  return ring[index % ring.length].shard;
}

function lowerBound(ring, hash) {
  let left = 0;
  let right = ring.length;

  while (left < right) {
    const middle = Math.floor((left + right) / 2);

    if (ring[middle].position < hash) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }

  return left;
}

function crc32(value) {
  let crc = 0xffffffff;

  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index);

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function respCommand(values) {
  let command = `*${values.length}\r\n`;

  for (const value of values) {
    command += `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
  }

  return command;
}

function defaultVariantDir(seedStore) {
  if (seedStore === 'redis') {
    return 'variants/distributed';
  }

  return 'variants/simple';
}

function defaultCsvPath(namespace) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed-data');
  const name = `${namespace}.csv`;

  return path.join(root, name);
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

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function onceDrain(stream) {
  return new Promise((resolve, reject) => {
    stream.once('drain', resolve);
    stream.once('error', reject);
  });
}

function run(command, commandArgs) {
  const child = spawn(command, commandArgs, { stdio: 'inherit' });

  return waitFor(child);
}

function waitFor(child) {
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
