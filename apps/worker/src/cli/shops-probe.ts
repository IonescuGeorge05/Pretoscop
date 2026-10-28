/**
 * Re-probe one shop from where this runs (M21; docs/12 §2 layer 1):
 *
 *   pnpm --filter @pretoscop/worker shops:probe <slug> --vantage "Hetzner FSN1, production IP" [--url <page>] [--write]
 *
 * At most three requests (robots.txt, the home page, one public page from the registry or --url),
 * at least 5 s apart, with the honest PretoscopBot identity, through the polite fetcher: robots.txt
 * is obeyed, a block or challenge stops the probe and pauses the host like any crawl, nothing is
 * solved, retried around or stored. Prints the `probes:` entry for packages/config/shops/<slug>.yaml;
 * --write adds it to the file. Every probe leaves an audit row.
 *
 * Off by default: needs env CRAWL_ENABLED=true and the flags `crawl.enabled` and
 * `shops.probe.enabled` (switch the latter on in /admin/flaguri for a probe session, then off);
 * eMAG also needs `source.emag.enabled` (ADR-013). Shops removed from Pretoscop or read only
 * through their feed are refused. Needs the database (gates, kill switches, shared pauses): from
 * a second vantage point, run it with DATABASE_URL pointing at production (e.g. over WireGuard).
 * Exit codes: 0 probed, 2 refused (nothing sent), 64 usage.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createLogger } from '@pretoscop/config/logger';
import { loadShops, SHOPS_DIR } from '@pretoscop/config/shops';
import { createDb, createPool } from '@pretoscop/db';
import { createGuardedDispatcher } from '@pretoscop/fetch';
import { PgDomainStateStore } from '../fetch/pg-state';
import { PgRequestLogSink } from '../fetch/request-log';
import { addProbeToYaml, probeYaml } from '../registry/probe';
import { runProbe } from '../registry/probe-run';

loadRootEnvFile();
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    vantage: { type: 'string' },
    url: { type: 'string' },
    write: { type: 'boolean', default: false },
  },
});
const slug = positionals[0];
if (!slug || !values.vantage?.trim()) {
  process.stderr.write('usage: shops:probe <slug> --vantage "<where this runs>" [--url <page>] [--write]\n');
  process.exit(64);
}
const shop = loadShops().find((s) => s.slug === slug);
if (!shop) {
  process.stderr.write(`unknown shop ${slug} (packages/config/shops/*.yaml)\n`);
  process.exit(64);
}

const env = getEnv();
const log = createLogger('shops-probe', { level: env.LOG_LEVEL === 'info' ? 'warn' : env.LOG_LEVEL });
const pool = createPool(env.DATABASE_URL, 2);
const db = createDb(pool);
const dispatcher = createGuardedDispatcher({ allowPrivate: env.FETCH_ALLOW_PRIVATE_HOSTS, timeoutMs: env.FETCH_TIMEOUT_MS });
let exitCode = 0;
try {
  const out = await runProbe(
    { db, env, log, dispatcher, stateStore: new PgDomainStateStore(db), requestLog: new PgRequestLogSink(db, log) },
    shop,
    { vantage: values.vantage.trim(), url: values.url },
  );
  if (out.status === 'refused') {
    process.stdout.write(`${shop.name}: refused, nothing sent: ${out.reason}\n`);
    exitCode = 2;
  } else {
    const entry = { date: out.date, vantage: values.vantage.trim(), result: out.result, note: out.note };
    process.stdout.write(`${shop.name}: ${out.result} (${out.requests} request(s))\n\nprobes:\n${probeYaml(entry)}\n`);
    if (values.write) {
      const file = join(SHOPS_DIR, `${shop.slug}.yaml`);
      writeFileSync(file, addProbeToYaml(readFileSync(file, 'utf8'), entry, `${shop.slug}.yaml`));
      process.stdout.write(`\nadded to ${file}; review the diff, commit it and run shops:sync.\n`);
    }
  }
} finally {
  await dispatcher.close();
  await pool.end();
}
process.exitCode = exitCode;
