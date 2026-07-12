import http from 'k6/http';
import { config, jsonHeaders } from '../lib/config.ts';
import { seededAlias, targetUrl } from '../lib/aliases.ts';
import { checkStatus } from '../lib/checks.ts';
import { recordConflictReason, recordStatus } from '../lib/status-metrics.ts';

const cfg = config({
  aliasPrefix: 'bench',
  vus: 50,
  duration: '1m',
  seedCount: 1000,
});

http.setResponseCallback(http.expectedStatuses(409));

export const options = {
  vus: cfg.vus,
  duration: cfg.duration,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'p(99.9)'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
};

export default function (): void {
  const alias = seededAlias(cfg);
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
  checkStatus(response, 409, 'create existing');
}
