import http from 'k6/http';
import { config, jsonHeaders } from '../lib/config.ts';
import { aliasFor, targetUrl } from '../lib/aliases.ts';
import { checkStatusOneOf } from '../lib/checks.ts';
import { recordConflictReason, recordStatus } from '../lib/status-metrics.ts';

const cfg = config({
  aliasPrefix: 'bench',
  seedCount: 1000,
});

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 409));

export const options = {
  vus: 1,
  iterations: cfg.seedCount,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    checks: ['rate>0.99'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
};

export default function (): void {
  const alias = aliasFor(cfg, 'seed', __ITER);
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
  checkStatusOneOf(response, [201, 409], 'seed alias');
}
