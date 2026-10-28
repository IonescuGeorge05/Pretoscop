/**
 * Records one page of a designated shop through the assisted channel as an extractor fixture
 * (M05B; usable only after setup A10). docs/05 A.5: fixtures are real recorded pages, dated,
 * never edited by hand; at most three per shop.
 *
 *   pnpm --filter @pretoscop/worker assisted:record <shop> <name> <url> [listing|product]
 *   → packages/extractors/fixtures/<shop>/<name>_<YYYY-MM-DD>.html (+ .meta.json)
 *
 * Nothing is bypassed: the request goes through `fetchPolite` with the worker's own services, so
 * the shop must be on `access_mode: assisted` in the registry, `assisted.enabled` on, a vendor
 * configured, CRAWL_ENABLED on, the month under the cap and robots.txt allowing the URL; the call
 * is written to the request log and the cost ledger like any other.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAssistedDesignated } from '@pretoscop/config';
import { findRepoRoot, getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { createDb, createPool } from '@pretoscop/db';
import { createServices } from '../services';

loadRootEnvFile();
const [shop, name, url, kind = 'listing'] = process.argv.slice(2);
if (!shop || !name || !url || !/^[a-z0-9-]+$/.test(name) || (kind !== 'listing' && kind !== 'product')) {
  console.error('usage: assisted:record <shop> <name: a-z0-9-> <url> [listing|product]');
  process.exit(64);
}
if (!isAssistedDesignated(shop)) {
  console.error(`${shop} is not a shop designated for assisted access (packages/config/src/assisted.ts)`);
  process.exit(2);
}
const env = getEnv();
const log = createLogger('assisted-record');
const pool = createPool(env.DATABASE_URL, 2);
const services = createServices(env, createDb(pool), log);
try {
  const res = await services.fetcher.fetchPolite(url, { purpose: kind, shopSlug: shop });
  if (!res.ok || res.body === null || res.channel !== 'assisted') {
    console.error(`not recorded: ${res.skipped ? `skipped (${res.skipped}) ${res.error ?? ''}` : res.blocked ? `blocked (${res.blockReason})` : `HTTP ${res.status} ${res.error ?? ''}`} [channel ${res.channel}]`);
    process.exitCode = 3;
  } else {
    const day = new Date().toISOString().slice(0, 10);
    const dir = join(findRepoRoot(), 'packages', 'extractors', 'fixtures', shop);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name}_${day}.html`);
    writeFileSync(file, res.body);
    writeFileSync(
      `${file}.meta.json`,
      `${JSON.stringify({ url, final_url: res.finalUrl, status: res.status, channel: res.channel, vendor: env.ASSISTED_VENDOR, recorded_at: new Date().toISOString() }, null, 2)}\n`,
    );
    console.log(`recorded ${file} (${res.body.length} chars, HTTP ${res.status}, through ${env.ASSISTED_VENDOR})`);
  }
} finally {
  await services.close();
  await pool.end();
}
