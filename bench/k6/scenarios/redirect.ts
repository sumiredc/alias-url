import http from 'k6/http';
import { config } from '../lib/config.ts';
import { seededAlias } from '../lib/aliases.ts';
import { checkStatus } from '../lib/checks.ts';
import { recordStatus } from '../lib/status-metrics.ts';

const cfg = config({
  aliasPrefix: 'bench',
  vus: 100,
  duration: '1m',
  seedCount: 1000,
});

export const options = {
  vus: cfg.vus,
  duration: cfg.duration,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'p(99.9)'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300', 'p(99)<700'],
  },
};

export default function (): void {
  const alias = seededAlias(cfg);
  const response = http.get(`${cfg.baseUrl}/${alias}`, {
    redirects: 0,
    tags: {
      name: 'GET /:alias',
    },
  });

  recordStatus(response);
  checkStatus(response, 302, 'redirect');
}
