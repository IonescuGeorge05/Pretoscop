/**
 * CSS readiness report (M29, docs/playbooks/css-readiness.md): what Google's Comparison Shopping
 * Service programme requires that we can measure ourselves, read-only on the database.
 *
 *   pnpm --filter @pretoscop/worker css:readiness [--json]
 *
 * - merchant domains whose offers the site shows (live offers, the index rule's definition) against
 *   the programme's minimum of 50 distinct merchant domains per country;
 * - per shop, the affiliate programme's stance on Google Shopping / CSS promotion (`css_policy` in
 *   the registry): a shop that forbids it still counts as a merchant the site shows, but we cannot
 *   run Shopping ads for it;
 * - products compared across 2 and 3 shops per root category (a prominent filter must not leave
 *   fewer than 3 merchants on most queries; M29's acceptance counts ≥ 2 offers per new category);
 * - code facts checked on the checkout: no cart or checkout route in the web app (CSS sites must
 *   not be marketplaces with on-site transactions), ItemList markup on category pages.
 * Exit code 0 always (a report, not a gate); the eligibility line says ELIGIBLE or NOT YET.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { loadShops } from '@pretoscop/config/shops';
import { categoryCoverage, createDb, createPool, merchantDomainsShown } from '@pretoscop/db';

export const CSS_MIN_MERCHANT_DOMAINS = 50;

const WEB_APP = join(dirname(fileURLToPath(import.meta.url)), '../../../web/src/app');

/** Route folders of the web app that would mean on-site transactions. */
export function checkoutRoutes(dir = WEB_APP): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (!statSync(p).isDirectory()) continue;
      const seg = name.replace(/^\((.*)\)$/, '$1');
      const r = `${rel}/${name}`;
      if (/^(?:cos|cos-de-cumparaturi|cart|basket|checkout|plata|comanda|comenzi|order|orders|payment)$/i.test(seg)) out.push(r);
      walk(p, r);
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out;
}

/** The category page publishes a schema.org ItemList of its indexable products. */
export function categoryItemListPresent(dir = WEB_APP): boolean {
  const page = join(dir, '(site)', 'c', '[...path]', 'page.tsx');
  return existsSync(page) && /itemList\(/.test(readFileSync(page, 'utf8'));
}

async function main(): Promise<void> {
  loadRootEnvFile();
  const env = getEnv();
  const pool = createPool(env.DATABASE_URL, 2);
  const db = createDb(pool);
  try {
    const registry = new Map(loadShops().map((s) => [s.slug, s]));
    const shown = await merchantDomainsShown(db);
    const domains = [...new Set(shown.map((s) => s.domain))];
    const coverage = await categoryCoverage(db);
    const shops = shown.map((s) => ({ ...s, cssPolicy: registry.get(s.slug)?.affiliate?.css_policy ?? 'unknown' }));
    const checkout = checkoutRoutes();
    const report = {
      generatedAt: new Date().toISOString(),
      merchantDomains: domains.length,
      threshold: CSS_MIN_MERCHANT_DOMAINS,
      eligible: domains.length >= CSS_MIN_MERCHANT_DOMAINS,
      shops,
      coverage,
      code: { checkoutRoutes: checkout, noOnSiteCheckout: checkout.length === 0, categoryItemList: categoryItemListPresent() },
    };
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`CSS readiness, ${report.generatedAt}`);
    console.log(`\nMerchant domains shown: ${report.merchantDomains} of ${report.threshold} required → ${report.eligible ? 'ELIGIBLE' : `NOT YET (${report.threshold - report.merchantDomains} more needed)`}`);
    for (const s of shops) {
      console.log(`  ${s.domain.padEnd(18)} ${String(s.liveOffers).padStart(6)} live offers  ${String(s.products).padStart(6)} products  ${s.accessMode.padEnd(9)} CSS promotion: ${s.cssPolicy}`);
    }
    console.log('\nProducts shown per root category (≥ 2 offers / ≥ 2 shops / ≥ 3 shops):');
    for (const c of coverage) {
      console.log(`  ${(c.root ?? '(no category)').padEnd(22)} ${String(c.products).padStart(6)} products  ${String(c.withTwoOffers).padStart(6)} / ${String(c.withTwoShops).padStart(6)} / ${String(c.withThreeShops).padStart(6)}`);
    }
    for (const root of ['carti', 'frumusete']) {
      const c = coverage.find((x) => x.root === root);
      console.log(`  M29 acceptance ${root}: ${c?.withTwoOffers ?? 0} of 5,000 products with ≥ 2 offers`);
    }
    console.log('\nChecked in the code:');
    console.log(`  no on-site checkout (cart/checkout/payment routes): ${report.code.noOnSiteCheckout ? 'yes' : `NO: ${checkout.join(', ')}`}`);
    console.log(`  ItemList markup on category pages: ${report.code.categoryItemList ? 'yes' : 'NO'}`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
