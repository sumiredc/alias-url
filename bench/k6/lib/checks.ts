import { check } from 'k6';
import type { RefinedResponse, ResponseType } from 'k6/http';

export function checkStatus(
  response: RefinedResponse<ResponseType | undefined>,
  expectedStatus: number,
  label: string,
): boolean {
  return check(response, {
    [`${label}: status is ${expectedStatus}`]: (res) => res.status === expectedStatus,
  });
}

export function checkStatusOneOf(
  response: RefinedResponse<ResponseType | undefined>,
  expectedStatuses: number[],
  label: string,
): boolean {
  return check(response, {
    [`${label}: status is one of ${expectedStatuses.join(', ')}`]: (res) =>
      expectedStatuses.includes(res.status),
  });
}
