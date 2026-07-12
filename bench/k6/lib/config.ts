export type BenchmarkConfig = {
  baseUrl: string;
  apiBaseUrl: string;
  redirectBaseUrl: string;
  vus: number;
  duration: string;
  runId: string;
  aliasPrefix: string;
  seedNamespace: string;
  seedCount: number;
};

const seedProfiles: Record<string, number> = {
  small: 1000,
  medium: 1_000_000,
  large: 100_000_000,
};

export function config(defaults: Partial<BenchmarkConfig> = {}): BenchmarkConfig {
  const resolvedSeedCount = seedCount(defaults.seedCount ?? 1000);
  const baseUrl = trimTrailingSlash(envString('BASE_URL', defaults.baseUrl ?? 'http://localhost:8080'));

  return {
    baseUrl,
    apiBaseUrl: trimTrailingSlash(envString('API_BASE_URL', defaults.apiBaseUrl ?? baseUrl)),
    redirectBaseUrl: trimTrailingSlash(envString('REDIRECT_BASE_URL', defaults.redirectBaseUrl ?? baseUrl)),
    vus: envInt('VUS', defaults.vus ?? 20),
    duration: envString('DURATION', defaults.duration ?? '1m'),
    runId: sanitizeAliasPart(envString('RUN_ID', defaults.runId ?? 'local')),
    aliasPrefix: sanitizeAliasPart(envString('ALIAS_PREFIX', defaults.aliasPrefix ?? 'bench')),
    seedNamespace: sanitizeAliasPart(envString('SEED_NAMESPACE', String(resolvedSeedCount))),
    seedCount: resolvedSeedCount,
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

function seedCount(fallback: number): number {
  const explicitCount = optionalEnvInt('SEED_COUNT');

  if (explicitCount !== null) {
    return explicitCount;
  }

  const explicitProfile = __ENV.SEED_PROFILE;

  if (typeof explicitProfile === 'string' && explicitProfile.trim() !== '') {
    return seedProfiles[explicitProfile.trim()] ?? seedProfiles.small;
  }

  return fallback;
}

function optionalEnvInt(name: string): number | null {
  const value = __ENV[name];

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function sanitizeAliasPart(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-');

  return sanitized === '' ? 'bench' : sanitized.slice(0, 64);
}
