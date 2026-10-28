// Load test through the production edge (Caddy → two web replicas), M18:
//   k6 run -e BASE=https://pretoscop.ro -e SLUG=<product slug> -e PRODUCT_ID=<id> scripts/perf/prod-smoke.k6.js
// `make verify M=18` runs it in Caddy's network namespace against the local prod-like stack.
// Thresholds: cached product pages p95 TTFB < 400 ms (M13/docs/03 §9), the uncached history API
// p95 < 1.5 s, errors < 1%.
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  insecureSkipTLSVerify: __ENV.INSECURE === '1',
  scenarios: {
    cached_product_page: { executor: 'constant-vus', vus: 8, duration: __ENV.DURATION || '20s', exec: 'cachedPage' },
    uncached_history_api: { executor: 'constant-vus', vus: 2, duration: __ENV.DURATION || '20s', exec: 'historyApi' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_waiting{kind:cached}': ['p(95)<400'],
    'http_req_waiting{kind:uncached}': ['p(95)<1500'],
  },
};

const BASE = __ENV.BASE;
const SLUG = __ENV.SLUG;
const ID = __ENV.PRODUCT_ID;

export function cachedPage() {
  const r = http.get(`${BASE}/p/${SLUG}`, { tags: { kind: 'cached' } });
  check(r, { 'page 200': (x) => x.status === 200 });
}

export function historyApi() {
  const r = http.get(`${BASE}/api/products/${ID}/history?range=90d`, { tags: { kind: 'uncached' } });
  check(r, { 'history 200': (x) => x.status === 200 });
}
