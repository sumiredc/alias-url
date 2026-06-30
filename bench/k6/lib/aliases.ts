import type { BenchmarkConfig } from './config.ts';

export function aliasFor(config: BenchmarkConfig, scenario: string, value: number | string): string {
  return `${config.aliasPrefix}-${config.runId}-${scenario}-${value}`;
}

export function uniqueAlias(config: BenchmarkConfig, scenario: string): string {
  return aliasFor(config, scenario, `${__VU}-${__ITER}-${Date.now()}`);
}

export function seededAlias(config: BenchmarkConfig): string {
  const index = ((__VU - 1) * 100000 + __ITER) % config.seedCount;

  return seedAliasFor(config, index);
}

export function seedAliasFor(config: BenchmarkConfig, value: number | string): string {
  return `${config.aliasPrefix}-${config.seedNamespace}-seed-${value}`;
}

export function targetUrl(alias: string): string {
  return `https://example.com/benchmark/${alias}`;
}
