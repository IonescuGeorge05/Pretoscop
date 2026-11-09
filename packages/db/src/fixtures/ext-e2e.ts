import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import { KNOWN_FLAGS } from '../queries/flags';
import { recordObservation } from '../queries/offers';
import { addDaysIso, bucharestToday, computeProductStats, rollupProducts } from '../queries/rollup';

/**
 * Browser-extension e2e (M26): two throwaway products the extension's panel is checked against,
 * and the lookup flag switched on for the run and put back afterwards. Marked like every e2e
 * fixture (`e2e-fixture-` ids, "(produs de test E2E)" in the title), so `dropE2eFixture` removes
 * it too; `dropExtFixture` removes only this one.
 *
 * - `tv`: an eMAG offer at an eMAG product address (`/pd/<code>/`, resolved by URL) at 2.999 lei for
 *   40 days, then 2.499 lei, and an IT Galaxy offer at 2.449 lei for the last 3 days: a verified
 *   drop and an all-time low (M15), verdict "Preț bun", cheapest at another shop. Not provisional
 *   (provisional products get no badges, like their page).
 * - `young`: one IT Galaxy offer for 5 days, its GTIN in product_gtins (resolved by GTIN from an
 *   Altex page): "Istoric insuficient", no badge.
 */
export const EXT_FLAG = 'extension.lookup.enabled';
const PREFIX = 'e2e-fixture-ext-';
const MARK = '(produs de test E2E)';
export const EXT_TV_CODE = 'DE2EEXT01';
export const EXT_YOUNG_GTIN = '5940000000028';

interface Step {
  daysAgo: number;
  lei: number;
}
interface ExtProduct {
  key: 'tv' | 'young';
  title: string;
  offers: Array<{ key: string; shop: string; url: string; steps: Step[] }>;
}

const PRODUCTS: ExtProduct[] = [
  {
    key: 'tv',
    title: `Televizor Testoscop Ext 55TV9, 139 cm, Smart, 4K Ultra HD ${MARK}`,
    offers: [
      {
        key: 'tv-emag',
        shop: 'emag',
        url: `https://www.emag.ro/televizor-testoscop-ext-55tv9-139-cm-smart-4k-produs-de-test-e2e/pd/${EXT_TV_CODE}/`,
        steps: [
          { daysAgo: 40, lei: 2999 },
          { daysAgo: 3, lei: 2499 },
        ],
      },
      { key: 'tv-itgalaxy', shop: 'itgalaxy', url: 'https://www.itgalaxy.ro/e2e-fixture/ext-tv', steps: [{ daysAgo: 3, lei: 2449 }] },
    ],
  },
  {
    key: 'young',
    title: `Telefon mobil Testoscop Ext Y1, 128GB, Negru ${MARK}`,
    offers: [{ key: 'young-itgalaxy', shop: 'itgalaxy', url: 'https://www.itgalaxy.ro/e2e-fixture/ext-young', steps: [{ daysAgo: 5, lei: 1299 }] }],
  },
];

export interface ExtFixtureProduct {
  id: number;
  slug: string;
  title: string;
  observationsDays: number;
}

export interface E2eExtFixture {
  tv: ExtFixtureProduct & { emagUrl: string };
  young: ExtFixtureProduct & { gtin: string };
  /** The flag as it was before (`ext-drop` restores it; null = there was no row). */
  flagWas: { enabled: boolean; config: Record<string, unknown> } | null;
}

const slugPart = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** The lookup flag's row, or null. */
export async function extFlagState(db: Db): Promise<E2eExtFixture['flagWas']> {
  const r = await db.execute<{ enabled: boolean; config: Record<string, unknown> | null }>(sql`SELECT enabled, config FROM feature_flags WHERE key = ${EXT_FLAG}`);
  const row = r.rows[0];
  return row ? { enabled: row.enabled, config: row.config ?? {} } : null;
}

/** Sets the lookup flag (and its config, e.g. `{ "disabled_shops": ["altex"] }`). */
export async function setExtFlag(db: Db, enabled: boolean, config: Record<string, unknown> = {}): Promise<void> {
  await db.execute(sql`
    INSERT INTO feature_flags (key, enabled, config, description) VALUES (${EXT_FLAG}, ${enabled}, ${JSON.stringify(config)}::jsonb, ${KNOWN_FLAGS[EXT_FLAG] ?? null})
    ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, config = EXCLUDED.config, updated_at = now()`);
}

export async function createExtFixture(db: Db): Promise<E2eExtFixture> {
  const flagWas = await extFlagState(db);
  await dropExtFixture(db);
  const shops = await db.execute<{ slug: string; id: string }>(sql`SELECT slug, id::text FROM shops WHERE slug IN ('emag','itgalaxy')`);
  const shopId = new Map(shops.rows.map((r) => [r.slug, Number(r.id)]));
  const brand = await db.execute<{ id: string }>(sql`
    INSERT INTO brands (name, slug) VALUES ('Testoscop', 'testoscop') ON CONFLICT (slug) DO UPDATE SET name = brands.name RETURNING id::text`);
  const brandId = Number(brand.rows[0]!.id);
  const now = Date.now();
  const ids: Partial<Record<ExtProduct['key'], number>> = {};
  for (const p of PRODUCTS) {
    const ins = await db.execute<{ id: string }>(sql`
      INSERT INTO products (slug, title, title_ascii, brand_id, category_id, provisional, created_by)
      VALUES (${`tmp-e2e-ext-${p.key}-${now}`}, ${p.title}, ${slugPart(p.title).replace(/-/g, ' ')}, ${brandId},
        (SELECT id FROM categories WHERE slug = ${p.key === 'tv' ? 'televizoare' : 'telefoane-mobile'}), false, 'manual')
      RETURNING id::text`);
    const id = Number(ins.rows[0]!.id);
    await db.execute(sql`UPDATE products SET slug = ${`${slugPart(p.title)}-${id}`} WHERE id = ${id}`);
    ids[p.key] = id;
    for (const o of p.offers) {
      const sid = shopId.get(o.shop);
      if (!sid) throw new Error(`e2e ext fixture: shop ${o.shop} missing (run make seed)`);
      // One check a day like the recorder (unchanged checks write no event); the last one an hour ago.
      for (let d = o.steps[0]!.daysAgo; d >= 0; d--) {
        const s = o.steps.filter((x) => x.daysAgo >= d).at(-1)!;
        const priceBani = Math.round(s.lei * 100);
        const r = await recordObservation(db, {
          shopId: sid,
          sourceId: null,
          sourceTier: 1,
          runId: null,
          externalId: `${PREFIX}${o.key}`,
          url: o.url,
          titleRaw: p.title,
          titleClean: p.title,
          priceBani,
          shippingBani: 0,
          totalBani: priceBani,
          availability: 'in_stock',
          condition: 'new',
          contentHash: createHash('sha256').update(`${o.key}|${s.lei}`).digest('hex'),
          observedAt: new Date(d === 0 ? now - 3600_000 : now - d * 86_400_000),
        });
        if (r.offerId) await db.execute(sql`UPDATE offers SET product_id = ${id}, match_status = 'manual', matched_at = now() WHERE id = ${r.offerId} AND product_id IS NULL`);
      }
    }
  }
  await db.execute(sql`INSERT INTO product_gtins (gtin14, product_id, source) VALUES (${`0${EXT_YOUNG_GTIN}`}, ${ids.young!}, 'manual')`);
  const today = bucharestToday();
  const productIds = Object.values(ids);
  await rollupProducts(db, { productIds, from: addDaysIso(today, -41), to: today });
  await computeProductStats(db, productIds, today);
  await setExtFlag(db, true);

  const rows = await db.execute<{ id: string; slug: string; title: string; days: number | null }>(sql`
    SELECT p.id::text, p.slug, p.title, ps.observations_days AS days FROM products p LEFT JOIN product_stats ps ON ps.product_id = p.id
    WHERE p.id = ANY(${sql.param(productIds)}::bigint[])`);
  const byId = new Map(rows.rows.map((r) => [Number(r.id), { id: Number(r.id), slug: r.slug, title: r.title, observationsDays: r.days ?? 0 }]));
  return {
    tv: { ...byId.get(ids.tv!)!, emagUrl: PRODUCTS[0]!.offers[0]!.url },
    young: { ...byId.get(ids.young!)!, gtin: EXT_YOUNG_GTIN },
    flagWas,
  };
}

/** Removes the fixture's offers and products; puts the flag back when `restoreFlag` is given (null row = delete it). */
export async function dropExtFixture(db: Db, opts: { restoreFlag?: E2eExtFixture['flagWas'] | undefined } = {}): Promise<number> {
  const like = `${PREFIX}%`;
  const products = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT product_id::text AS id FROM offers WHERE external_id LIKE ${like} AND product_id IS NOT NULL
    UNION SELECT id::text FROM products WHERE slug LIKE 'tmp-e2e-ext-%' OR title = ANY(${sql.param(PRODUCTS.map((p) => p.title))}::text[])`);
  const productIds = products.rows.map((r) => Number(r.id));
  await db.execute(sql`DELETE FROM clicks WHERE offer_id IN (SELECT id FROM offers WHERE external_id LIKE ${like})`);
  await db.execute(sql`DELETE FROM offers WHERE external_id LIKE ${like}`);
  if (productIds.length) await db.execute(sql`DELETE FROM products WHERE id = ANY(${sql.param(productIds)}::bigint[])`);
  if (opts.restoreFlag !== undefined) {
    if (opts.restoreFlag === null) await db.execute(sql`DELETE FROM feature_flags WHERE key = ${EXT_FLAG}`);
    else await setExtFlag(db, opts.restoreFlag.enabled, opts.restoreFlag.config);
  }
  return productIds.length;
}
