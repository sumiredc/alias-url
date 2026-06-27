import http from 'k6/http';
import { config } from '../lib/config.ts';
import { seededAlias } from '../lib/aliases.ts';
import { checkStatus } from '../lib/checks.ts';
import { recordStatus } from '../lib/status-metrics.ts';

const cfg = config({
  aliasPrefix: 'bench',
  vus: 5,
  duration: '30s',
  seedCount: 1000,
});

export const options = {
  vus: cfg.vus,
  duration: cfg.duration,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  thresholds: {
    checks: ['rate>0.99'],
  },
};

export default function (): void {
  const alias = seededAlias(cfg);
  const response = http.get(`${cfg.baseUrl}/${alias}`, {
    redirects: 0,
  });

  recordStatus(response);
  checkStatus(response, 302, 'warmup redirect');
}
