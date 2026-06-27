import http from 'k6/http';
import { config, jsonHeaders } from '../lib/config.ts';
import { targetUrl, uniqueAlias } from '../lib/aliases.ts';
import { checkStatus } from '../lib/checks.ts';
import { recordConflictReason, recordStatus } from '../lib/status-metrics.ts';

const cfg = config({
  aliasPrefix: 'create',
  vus: 50,
  duration: '1m',
});

export const options = {
  vus: cfg.vus,
  duration: cfg.duration,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
};

export default function (): void {
  const alias = uniqueAlias(cfg, 'create');
  const response = http.post(
    `${cfg.baseUrl}/api/aliases`,
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
  checkStatus(response, 201, 'create');
}
