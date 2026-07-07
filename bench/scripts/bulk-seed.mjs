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
  const nodes = redisClusterNodes();
  const slotRanges = await redisClusterSlotRanges({ composeDir, nodes });
  const pipes = new Map();

  for (const node of nodes) {
    const child = spawn(
      'docker',
      ['compose', '-f', path.join(composeDir, 'compose.yaml'), 'exec', '-T', node.service, 'redis-cli', '--pipe'],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );

    pipes.set(node.key, child);
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
    const node = resolveClusterNode(slotRanges, alias);
    const child = pipes.get(node.key);
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

function redisClusterNodes() {
  const value = process.env.REDIS_CLUSTER_NODES ?? 'redis-1:6379,redis-2:6379,redis-3:6379,redis-4:6379,redis-5:6379,redis-6:6379,redis-7:6379,redis-8:6379,redis-9:6379,redis-10:6379,redis-11:6379,redis-12:6379';

  return value.split(',').map((address) => {
    const [host, port] = address.trim().split(':', 2);

    if (!host || !port) {
      throw new Error(`Invalid Redis node address: ${address}`);
    }

    return {
      host,
      port,
      key: `${host}:${port}`,
      service: host,
    };
  });
}

async function redisClusterSlotRanges({ composeDir, nodes }) {
  const [entrypoint] = nodes;
  const output = await runCapture('docker', [
    'compose',
    '-f',
    path.join(composeDir, 'compose.yaml'),
    'exec',
    '-T',
    entrypoint.service,
    'redis-cli',
    '--json',
    'CLUSTER',
    'SLOTS',
  ]);
  const slots = JSON.parse(output);
  const nodesByKey = new Map(nodes.map((node) => [node.key, node]));

  return slots.sort((left, right) => left[0] - right[0]).map((slot, index) => {
    const [start, end, primary] = slot;
    const [host, port] = primary;
    const key = `${host}:${port}`;
    const node = nodesByKey.get(key) ?? nodesByKey.get(`${host}:${Number(port)}`) ?? nodes[index];

    if (!node) {
      throw new Error(`Redis Cluster returned an unknown node: ${key}`);
    }

    return { start, end, node };
  });
}

function resolveClusterNode(slotRanges, alias) {
  const slot = redisClusterSlot(alias);
  const range = slotRanges.find((candidate) => slot >= candidate.start && slot <= candidate.end);

  if (!range) {
    throw new Error(`No Redis Cluster node owns slot ${slot}`);
  }

  return range.node;
}

function redisClusterSlot(key) {
  const tag = redisHashTag(key);

  return crc16(tag) % 16384;
}

function redisHashTag(key) {
  const start = key.indexOf('{');

  if (start === -1) {
    return key;
  }

  const end = key.indexOf('}', start + 1);

  if (end === -1 || end === start + 1) {
    return key;
  }

  return key.slice(start + 1, end);
}

function crc16(value) {
  let crc = 0;

  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }

      crc &= 0xffff;
    }
  }

  return crc;
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

function runCapture(command, commandArgs) {
  const child = spawn(command, commandArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
  let output = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });

  return waitFor(child).then(() => output);
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
