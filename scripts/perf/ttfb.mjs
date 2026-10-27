#!/usr/bin/env node
// Time-to-first-byte percentiles for one URL: node scripts/perf/ttfb.mjs URL [requests=200] [concurrency=8]
// (The plan names k6; scripts/perf/product-page.k6.js is the same check for machines that have it.)
import { request } from 'node:http';

const [url, total = '200', conc = '8'] = process.argv.slice(2);
if (!url) {
  console.error('usage: ttfb.mjs URL [requests] [concurrency]');
  process.exit(2);
}
const N = Number(total);
const C = Number(conc);

function once() {
  return new Promise((resolve, reject) => {
    const t0 = process.hrtime.bigint();
    const req = request(url, { headers: { 'user-agent': 'pretoscop-perf/1.0' } }, (res) => {
      const ttfb = Number(process.hrtime.bigint() - t0) / 1e6;
      res.resume();
      res.on('end', () => resolve({ ttfb, status: res.statusCode }));
    });
    req.on('error', reject);
    req.end();
  });
}

await once(); // warm the cache
const times = [];
const statuses = new Map();
let next = 0;
await Promise.all(
  Array.from({ length: C }, async () => {
    while (next < N) {
      next++;
      const r = await once();
      times.push(r.ttfb);
      statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
    }
  }),
);
times.sort((a, b) => a - b);
const p = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))].toFixed(1);
console.log(JSON.stringify({ url, requests: times.length, concurrency: C, statuses: Object.fromEntries(statuses), p50_ms: Number(p(0.5)), p95_ms: Number(p(0.95)), max_ms: Number(times.at(-1).toFixed(1)) }));
