/**
 * Looks one product up in Open Icecat and prints what Pretoscop would store (M11 founder check):
 *   pnpm icecat:lookup <gtin> [--lang RO] [--save <dir>]
 *   pnpm icecat:lookup --brand Philips --mpn HD9252/90
 *   pnpm icecat:lookup 5397184119709 --mock        # offline: the local stand-in with synthetic data
 * A live lookup needs the Open Icecat account name in ICECAT_USERNAME (setup B1) and counts against
 * the monthly cap. It goes through the polite fetcher (PretoscopBot-Feed, robots.txt obeyed).
 * Nothing is written to the database or the blob store.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { defaultDomainPolicy } from '@pretoscop/config/policy';
import { createFetcher, MemoryDomainStateStore, type RequestLogEntry } from '@pretoscop/fetch';
import {
  createIcecatClient,
  hasContent,
  icecatAttribution,
  mapIcecatProduct,
  MemoryIcecatUsage,
  type IcecatLookupKey,
} from '@pretoscop/icecat';
import { startIcecatMock } from '@pretoscop/icecat/mock';

loadRootEnvFile();
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    lang: { type: 'string' },
    brand: { type: 'string' },
    mpn: { type: 'string' },
    mock: { type: 'boolean' },
    'base-url': { type: 'string' },
    save: { type: 'string' },
  },
});
const gtin = positionals[0];
if (!gtin && !(values.brand && values.mpn)) {
  console.error(
    'usage: icecat:lookup <gtin> | --brand <brand> --mpn <code>  [--lang RO] [--mock] [--base-url URL] [--save dir]',
  );
  process.exit(64);
}
if (gtin && !/^\d{8,14}$/.test(gtin)) {
  console.error(`not a GTIN: ${gtin}`);
  process.exit(64);
}
const env = getEnv();
const lang = (values.lang ?? env.ICECAT_LANGS.split(',')[0] ?? 'RO').trim().toUpperCase();
const mock = values.mock ? await startIcecatMock() : null;
const baseUrl = mock?.apiUrl ?? values['base-url'] ?? env.ICECAT_BASE_URL;
const shopname = mock ? 'demo-mock' : env.ICECAT_USERNAME;
if (!shopname) {
  console.error(
    'ICECAT_USERNAME is not set: an Open Icecat account is needed for live lookups (docs/09 B1).',
  );
  console.error('Offline demo with synthetic data: pnpm icecat:lookup 5397184119709 --mock');
  process.exit(3);
}

const entries: RequestLogEntry[] = [];
const fetcher = createFetcher({
  stateStore: new MemoryDomainStateStore(),
  crawlEnabled: true,
  policyFor: (host) =>
    defaultDomainPolicy(host, {
      shopSlug: 'icecat',
      minIntervalMs: mock ? 0 : env.ICECAT_MIN_INTERVAL_MS,
    }),
  requestLog: { write: (e) => void entries.push(e) },
  botInfoUrl: env.BOT_INFO_URL,
});
const client = createIcecatClient({
  fetcher,
  shopname,
  baseUrl,
  usage: new MemoryIcecatUsage(),
  monthlyCap: env.ICECAT_MONTHLY_CAP,
});
const key: IcecatLookupKey = gtin ? { gtin } : { brand: values.brand!, mpn: values.mpn! };

try {
  console.log(
    `Open Icecat lookup${mock ? ' (local mock, synthetic data)' : ''}: ${client.lookupUrl(key, lang).replace(`shopname=${encodeURIComponent(shopname)}`, 'shopname=…')}`,
  );
  const r = await client.lookup(key, lang);
  for (const e of entries.filter((x) => x.attempt > 0)) {
    console.log(
      `  ${e.ts.toISOString()}  GET ${e.url.replace(/shopname=[^&]+/, 'shopname=…')}  ${e.status || '---'}  [${e.purpose}${e.blocked ? `, BLOCKED ${e.blockReason}` : ''}]`,
    );
  }
  if (r.status !== 'found') {
    console.log(
      `\nResult: ${r.status}${'detail' in r ? ` — ${r.detail}` : ''}${'reason' in r ? ` — ${r.reason}` : ''}`,
    );
    process.exitCode = r.status === 'stop' ? 2 : 1;
  } else {
    const m = mapIcecatProduct(r.response, lang, {
      by: gtin ? 'gtin' : 'brand_mpn',
      key: gtin ?? `${values.brand} ${values.mpn}`,
    });
    const s = m.specs;
    console.log(`\n${s.title ?? '(no title)'}`);
    console.log(
      `  brand ${s.brand ?? '-'}, product code ${s.mpn ?? '-'}, GTIN ${s.gtins.join(', ') || '-'}, category ${s.category ?? '-'}, Icecat id ${s.icecatId ?? '-'}${s.demoAccount ? ' (demo account)' : ''}`,
    );
    if (s.summary)
      console.log(`  summary: ${s.summary.slice(0, 300)}${s.summary.length > 300 ? '…' : ''}`);
    console.log(
      `  marketing text: ${s.marketingText ? `${s.marketingText.length} characters` : 'none'}`,
    );
    console.log(`  features (${s.features.length}):`);
    for (const f of s.features.slice(0, 20))
      console.log(`    ${f.group.padEnd(22)} ${f.name.padEnd(32)} ${f.value}`);
    if (s.features.length > 20) console.log(`    … ${s.features.length - 20} more`);
    console.log(
      `  images to copy (${m.images.length}): ${m.images.map((i) => `${i.isMain ? '*' : ''}${i.url}`).join(', ') || 'none'}`,
    );
    console.log(
      `  would be stored: product_specs (source icecat, locale ${s.locale}${hasContent(m) ? '' : ', NO CONTENT: the next language would be tried'})`,
    );
    console.log(`  attribution: ${icecatAttribution(new Date().getUTCFullYear())}`);
    if (values.save) {
      mkdirSync(values.save, { recursive: true });
      const file = join(
        values.save,
        `product-${(gtin ?? `${values.brand}-${values.mpn}`).toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${lang.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.json`,
      );
      writeFileSync(file, `${JSON.stringify(r.response, null, 2)}\n`);
      console.log(`  saved ${file}`);
    }
  }
} finally {
  await fetcher.close();
  await mock?.close();
}
