import { Counter } from 'k6/metrics';
import type { RefinedResponse, ResponseType } from 'k6/http';

export const http2xx = new Counter('status_2xx');
export const http3xx = new Counter('status_3xx');
export const http4xx = new Counter('status_4xx');
export const http5xx = new Counter('status_5xx');
export const httpOther = new Counter('status_other');
export const status200 = new Counter('status_200');
export const status201 = new Counter('status_201');
export const status302 = new Counter('status_302');
export const status400 = new Counter('status_400');
export const status404 = new Counter('status_404');
export const status409 = new Counter('status_409');
export const status429 = new Counter('status_429');
export const status500 = new Counter('status_500');
export const status502 = new Counter('status_502');
export const status503 = new Counter('status_503');
export const status504 = new Counter('status_504');
export const conflictAliasExists = new Counter('conflict_alias_exists');
export const conflictAliasMightExist = new Counter('conflict_alias_might_exist');
export const conflictOther = new Counter('conflict_other');

export function recordStatus(response: RefinedResponse<ResponseType | undefined>): void {
  const status = response.status;

  if (status >= 200 && status <= 299) {
    http2xx.add(1);
  } else if (status >= 300 && status <= 399) {
    http3xx.add(1);
  } else if (status >= 400 && status <= 499) {
    http4xx.add(1);
  } else if (status >= 500 && status <= 599) {
    http5xx.add(1);
  } else {
    httpOther.add(1);
  }

  switch (status) {
    case 200:
      status200.add(1);
      break;
    case 201:
      status201.add(1);
      break;
    case 302:
      status302.add(1);
      break;
    case 400:
      status400.add(1);
      break;
    case 404:
      status404.add(1);
      break;
    case 409:
      status409.add(1);
      break;
    case 429:
      status429.add(1);
      break;
    case 500:
      status500.add(1);
      break;
    case 502:
      status502.add(1);
      break;
    case 503:
      status503.add(1);
      break;
    case 504:
      status504.add(1);
      break;
  }
}

export function recordConflictReason(response: RefinedResponse<ResponseType | undefined>): void {
  if (response.status !== 409) {
    return;
  }

  const parsed = response.json();

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    conflictOther.add(1);
    return;
  }

  const reason = parsed.reason;

  if (reason === 'alias_exists') {
    conflictAliasExists.add(1);
    return;
  }

  if (reason === 'alias_might_exist') {
    conflictAliasMightExist.add(1);
    return;
  }

  conflictOther.add(1);
}
