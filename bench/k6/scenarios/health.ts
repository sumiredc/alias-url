import http from 'k6/http';
import { config } from '../lib/config.ts';
import { checkStatus } from '../lib/checks.ts';
import { recordStatus } from '../lib/status-metrics.ts';

const cfg = config({
  aliasPrefix: 'health',
  vus: 20,
  duration: '1m',
});

export const options = {
  vus: cfg.vus,
  duration: cfg.duration,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'p(99.9)'],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<200', 'p(99)<500'],
  },
};

export default function (): void {
  const response = http.get(`${cfg.baseUrl}/health`);

  recordStatus(response);
  checkStatus(response, 200, 'health');
}
