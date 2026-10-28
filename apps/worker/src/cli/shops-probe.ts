/**
 * Re-probe one shop from where this runs (M21; docs/12 §2 layer 1):
 *
 *   pnpm --filter @pretoscop/worker shops:probe <slug> --vantage "Hetzner FSN1, production IP" [--url <page>] [--write]
 *
 * At most three requests with the honest PretoscopBot identity, 5 s apart (or the shop's crawl
 * delay): robots.txt, the home page and one public page from the registry (or --url). robots.txt is
 * obeyed and a block or challenge stops the probe; nothing is solved, retried around or stored.
 * Prints the `probes:` entry for packages/config/shops/<slug>.yaml; --write adds it to the file.
 * Works without a database (state in data/probe-state.json), so it can run from any vantage point.
 * eMAG is refused unless --allow-emag (ADR-013: eMAG requests are a founder decision).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { findRepoRoot, loadRootEnvFile } from '@pretoscop/config/env';
import { getDomainPolicy, loadShops, SHOPS_DIR } from '@pretoscop/config/shops';
import { hostOnDomain } from '@pretoscop/extractors';
import { createFetcher, createGuardedDispatcher, FileDomainStateStore } from '@pretoscop/fetch';
import { addProbeToYaml, probeTargets, probeYaml, summarizeProbe, type ProbeFetch } from '../registry/probe';

loadRootEnvFile();
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    vantage: { type: 'string' },
    url: { type: 'string' },
    write: { type: 'boolean', default: false },
    'allow-emag': { type: 'boolean', default: false },
  },
});
const slug = positionals[0];
if (!slug || !values.vantage) {
  process.stderr.write('usage: shops:probe <slug> --vantage "<where this runs>" [--url <page>] [--write]\n');
  process.exit(64);
}
const shops = loadShops();
const shop = shops.find((s) => s.slug === slug);
if (!shop) {
  process.stderr.write(`unknown shop ${slug} (packages/config/shops/*.yaml)\n`);
  process.exit(64);
}
if (slug === 'emag' && !values['allow-emag']) {
  process.stderr.write('eMAG is isolated (ADR-013): pass --allow-emag only after a founder decision.\n');
  process.exit(64);
}

const statePath = join(findRepoRoot(), 'data', 'probe-state.json');
const dispatcher = createGuardedDispatcher({ allowPrivate: false });
// The probe checks reachability whatever the registry's access mode says (that is what it is for),
// with the shop's politeness settings; it never goes through the assisted channel.
const fetcher = createFetcher({
  stateStore: new FileDomainStateStore(statePath),
  policyFor: (host) => ({ ...getDomainPolicy(host, shops), accessMode: 'direct' }),
  crawlEnabled: true,
  dispatcher,
  retry: { maxRetries: 0 },
});

const fetches: ProbeFetch[] = [];
try {
  for (const t of probeTargets(shop, values.url)) {
    if (!hostOnDomain(t.url, shop.domain)) {
      process.stderr.write(`skipping ${t.url}: not on ${shop.domain}\n`);
      continue;
    }
    const r = await fetcher.fetchPolite(t.url, { purpose: t.purpose, shopSlug: shop.slug });
    fetches.push({
      url: t.url,
      status: r.status,
      ok: r.ok,
      blocked: r.blocked,
      blockReason: r.blockReason,
      skipped: r.skipped,
      errorCode: r.errorCode,
      error: r.error,
      contentType: r.contentType,
      bytes: r.body?.length,
    });
    if (r.blocked || r.skipped) break; // never push past a refusal
  }
} finally {
  await fetcher.close();
  await dispatcher.close();
}

const { result, note } = summarizeProbe(fetches);
const entry = { date: new Date().toISOString().slice(0, 10), vantage: values.vantage, result, note };
process.stdout.write(`${shop.name}: ${result}\n\nprobes:\n${probeYaml(entry)}\n`);
if (values.write) {
  const file = join(SHOPS_DIR, `${shop.slug}.yaml`);
  writeFileSync(file, addProbeToYaml(readFileSync(file, 'utf8'), entry, `${shop.slug}.yaml`));
  process.stdout.write(`\nadded to ${file}; review the diff and run shops:sync.\n`);
}
