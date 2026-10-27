// k6 run -e URL=http://localhost:3200/p/<slug> scripts/perf/product-page.k6.js
// M13 acceptance: cached product page TTFB p95 < 400 ms on the dev box.
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 8,
  iterations: 200,
  thresholds: { http_req_waiting: ['p(95)<400'] },
};

export default function () {
  const res = http.get(__ENV.URL);
  check(res, { 'status 200': (r) => r.status === 200 });
}
