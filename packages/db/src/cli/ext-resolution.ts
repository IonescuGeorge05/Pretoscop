import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { createDb, createPool } from '../client';
import { extResolutionReport } from '../queries/ext-lookup';

// Usage: tsx src/cli/ext-resolution.ts [shop-slug …] [--json]   (default: emag)
//
// M26 release gate ("ship the extension only when ≥ 70 % of the top eMAG/Altex electronics SKUs
// resolve"): resolves, like GET /api/ext/lookup, the identifiers each active offer's product page
// would give the extension, over our own catalogue's offers of the shop. Read-only; no request to
// any shop. Altex cannot be measured until we have Altex offers (feed or allowlist): its row then
// shows 0 offers. `identifiersOnly` (no URL) approximates a shop we have no offers from.
loadRootEnvFile();
const env = getEnv();
const args = process.argv.slice(2);
const json = args.includes('--json');
const shops = args.filter((a) => !a.startsWith('--'));
const pool = createPool(env.DATABASE_URL, 2);
const pct = (n: number, d: number) => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)} %`);
try {
  const db = createDb(pool);
  const reports = [];
  for (const shop of shops.length ? shops : ['emag']) reports.push(await extResolutionReport(db, shop));
  if (json) {
    console.log(JSON.stringify(reports));
  } else {
    for (const r of reports) {
      console.log(`${r.shop}: ${r.offers} active offers`);
      console.log(`  resolved                      ${r.resolved}  ${pct(r.resolved, r.offers)}  (url ${r.byMethod.url}, gtin ${r.byMethod.gtin}, brand+mpn ${r.byMethod.brand_mpn})`);
      console.log(`    the offer's own product      ${r.sameProduct}`);
      console.log(`    offer not matched (ids only) ${r.unmatchedOffer}`);
      console.log(`    another product (wrong)      ${r.otherProduct}`);
      console.log(`  with live offers at ≥ 2 shops ${r.withOtherShops}  ${pct(r.withOtherShops, r.offers)}`);
      console.log(`  with ≥ 14 observed days       ${r.withVerdict}  ${pct(r.withVerdict, r.offers)}`);
      console.log(`  identifiers only (no URL)     ${r.identifiersOnly}  ${pct(r.identifiersOnly, r.offers)}`);
      console.log(`  release-gate threshold 70 %:  ${r.offers === 0 ? 'not measurable (no offers of this shop)' : r.resolved / r.offers >= 0.7 ? 'above for this shop' : 'below for this shop'}`);
    }
  }
} finally {
  await pool.end();
}
