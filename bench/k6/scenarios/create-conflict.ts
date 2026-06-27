import http from 'k6/http';
import { config, jsonHeaders } from '../lib/config.ts';
import { aliasFor, targetUrl } from '../lib/aliases.ts';
import { checkStatusOneOf } from '../lib/checks.ts';
import { recordConflictReason, recordStatus } from '../lib/status-metrics.ts';

const cfg = config({
  aliasPrefix: 'conflict',
  vus: 50,
  duration: '1m',
});

const conflictKeyCount = Number.parseInt(__ENV.CONFLICT_KEYS ?? '10', 10);

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 409));

export const options = {
  vus: cfg.vus,
  duration: cfg.duration,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
};

export default function (): void {
  const key = Number.isFinite(conflictKeyCount) && conflictKeyCount > 0
    ? __ITER % conflictKeyCount
    : 0;
  const alias = aliasFor(cfg, 'conflict', key);
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
  checkStatusOneOf(response, [201, 409], 'create conflict');
}
