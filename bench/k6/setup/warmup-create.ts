import http from 'k6/http';
import { config, jsonHeaders } from '../lib/config.ts';
import { targetUrl, uniqueAlias } from '../lib/aliases.ts';
import { checkStatus } from '../lib/checks.ts';
import { recordConflictReason, recordStatus } from '../lib/status-metrics.ts';

const cfg = config({
  aliasPrefix: 'warmup-create',
  vus: 100,
  duration: '30s',
});

export const options = {
  vus: cfg.vus,
  duration: cfg.duration,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'p(99.9)'],
  thresholds: {
    checks: ['rate>0.99'],
  },
};

export default function (): void {
  const alias = uniqueAlias(cfg, 'warmup-create');
  const response = http.post(
    `${cfg.apiBaseUrl}/api/aliases`,
    JSON.stringify({
      alias,
      url: targetUrl(alias),
    }),
    {
      headers: jsonHeaders(),
    },
  );

  recordStatus(response);
  recordConflictReason(response);
  checkStatus(response, 201, 'warmup create');
}
