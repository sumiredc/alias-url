export type BenchmarkConfig = {
  baseUrl: string;
  vus: number;
  duration: string;
  runId: string;
  aliasPrefix: string;
  seedCount: number;
};

export function config(defaults: Partial<BenchmarkConfig> = {}): BenchmarkConfig {
  return {
    baseUrl: trimTrailingSlash(envString('BASE_URL', defaults.baseUrl ?? 'http://localhost:8080')),
    vus: envInt('VUS', defaults.vus ?? 20),
    duration: envString('DURATION', defaults.duration ?? '1m'),
    runId: sanitizeAliasPart(envString('RUN_ID', defaults.runId ?? 'local')),
    aliasPrefix: sanitizeAliasPart(envString('ALIAS_PREFIX', defaults.aliasPrefix ?? 'bench')),
    seedCount: envInt('SEED_COUNT', defaults.seedCount ?? 1000),
  };
}

export function jsonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

function envString(name: string, fallback: string): string {
  const value = __ENV[name];

  if (typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }

  return value.trim();
}

function envInt(name: string, fallback: number): number {
  const value = __ENV[name];

  if (typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function sanitizeAliasPart(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-');

  return sanitized === '' ? 'bench' : sanitized.slice(0, 64);
}
