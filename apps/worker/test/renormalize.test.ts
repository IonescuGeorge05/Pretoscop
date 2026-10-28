import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeOffer, type RawOffer } from '@pretoscop/core';
import { type OfferObservation, recordObservation } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { offerIdentity } from '../src/recorder/identity';
import { renormalizeOffers } from '../src/recorder/renormalize';
import { syncShops } from '../src/registry/sync';
import { createNormalize } from '../src/services';

/**
 * Offers in the states the pre-hint pipeline left behind (live eMAG run, 2026-10-27): slug tails
 * stored as field MPNs, a false brand and bundle on a retro handheld, stale attributes, and the
 * products the matcher created from such offers.
 */
let t: TestDatabase;
let shopId: number;
const observedAt = new Date('2026-10-27T22:50:00Z');

const URL_S26 =
  'https://www.emag.ro/telefon-mobil-samsung-galaxy-s26-fe-dual-sim-8gb-ram-128gb-5g-blueberry-sm-s741bzvdeue/pd/DF1MLR2BM/';
const URL_ACER =
  'https://www.emag.ro/laptop-acer-nitro-v15-anv15-41-r948-nh-qsgex-00h-15-6-amd-ryzen-7-7735hs-kxg0214352/pd/D1ACER/';
const URL_R36S =
  'https://www.emag.ro/consola-retro-portabila-r36s-64gb-cu-jocuri-15000-jocuri-emulator-n64-psp-ps1-playstation-sega-alb/pd/D1R36S/';
const URL_DECK = 'https://www.emag.ro/consola-portabila-gaming-valve-steam-deck-256gb-negru-b0bhpq5msm/pd/D1DECK/';
const URL_A16 = 'https://www.emag.ro/telefon-mobil-samsung-galaxy-a16-dual-sim-128gb-4gb-ram-4g-black-sm-a165fzkbeue/pd/D1A16/';
const URL_YOGA =
  'https://www.emag.ro/laptop-lenovo-yoga-slim-7-14iph11-cu-procesor-intel-core-ultra-7-355-16gb-1tb-ssd-seashell-83qm0034rm/pd/D1YOGA/';
const TITLE_YOGA = 'Laptop Lenovo Yoga Slim 7 14IPH11 cu procesor Intel Core Ultra 7 355, 16GB, 1TB SSD, Seashell';

function legacy(externalId: string, url: string, title: string, o: Partial<OfferObservation>): OfferObservation {
  const priceBani = 199_999;
  return {
    shopId,
    sourceId: null,
    sourceTier: 1,
    runId: null,
    externalId,
    url,
    titleRaw: title,
    priceBani,
    totalBani: priceBani,
    availability: 'in_stock',
    condition: 'new',
    contentHash: createHash('sha256').update(`${externalId}|${priceBani}`).digest('hex'),
    observedAt,
    identityHash: `legacy-${externalId}`,
    ...o,
  };
}

/** A product as the matcher creates it from an offer (createProductFromOffer), linked to `offers`. */
async function matcherProduct(title: string, brand: string, mpn: string, offers: string[]): Promise<number> {
  const b = await t.db.execute<{ id: string }>(sql`
    INSERT INTO brands (name, slug) VALUES (${brand}, ${brand.toLowerCase()})
    ON CONFLICT (slug) DO UPDATE SET name = brands.name RETURNING id::text`);
  const p = await t.db.execute<{ id: string }>(sql`
    INSERT INTO products (slug, title, title_ascii, brand_id, mpn, mpn_norm, mpn_source, attributes, created_by)
    VALUES (${`p-${mpn}`}, ${title}, ${title.toLowerCase()}, ${Number(b.rows[0]!.id)}, ${mpn}, ${mpn.replace(/[^A-Z0-9]/g, '')}, 'field', '{}'::jsonb, 'matcher')
    RETURNING id::text`);
  const id = Number(p.rows[0]!.id);
  await t.db.execute(sql`UPDATE offers SET product_id = ${id}, match_status = 'auto', matched_at = now() WHERE external_id = ANY(${sql.param(offers)}::text[])`);
  return id;
}

async function offer(externalId: string) {
  const r = await t.db.execute<{
    brand_name: string | null;
    mpn_raw: string | null;
    mpn_norm: string | null;
    mpn_source: string | null;
    is_bundle: boolean;
    attributes: Record<string, unknown>;
    identity_hash: string | null;
    match_status: string;
    product_id: string | null;
    price: string;
  }>(sql`SELECT brand_name, mpn_raw, mpn_norm, mpn_source, is_bundle, attributes, identity_hash, match_status, product_id::text, price::text
         FROM offers WHERE external_id = ${externalId}`);
  return r.rows[0]!;
}

async function product(id: number) {
  const r = await t.db.execute<{ mpn: string | null; mpn_norm: string | null; mpn_source: string | null; brand: string | null; attributes: Record<string, unknown> }>(sql`
    SELECT p.mpn, p.mpn_norm, p.mpn_source, b.name AS brand, p.attributes FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE p.id = ${id}`);
  return r.rows[0]!;
}

async function priceEvents(): Promise<number> {
  const r = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text n FROM price_events`);
  return Number(r.rows[0]!.n);
}

let deckProduct: number;
let yogaProduct: number;

beforeAll(async () => {
  t = await createTestDatabase();
  await syncShops(t.db);
  shopId = Number((await t.db.execute<{ id: string }>(sql`SELECT id::text FROM shops WHERE slug = 'emag'`)).rows[0]!.id);

  // A: the slug P/N stored as a field MPN; the title has no code; not linked to a product.
  await recordObservation(
    t.db,
    legacy('S26', URL_S26, 'Telefon mobil Samsung Galaxy S26 FE, Dual SIM, 8GB RAM, 128GB, 5G, Blueberry', {
      brandName: 'Samsung',
      mpnRaw: 'SM-S741BZVDEUE',
      mpnNorm: 'SMS741BZVDEUE',
      mpnSource: 'field',
    }),
  );
  // B: a seller's SKU in the slug beat the title's own codes; a human linked this offer.
  await recordObservation(
    t.db,
    legacy('ACER', URL_ACER, 'Laptop Acer Nitro V15 ANV15-41-R948, NH.QSGEX.00H, 15.6", AMD Ryzen 7 7735HS, 16GB, 512GB SSD', {
      brandName: 'Acer',
      mpnRaw: 'KXG0214352',
      mpnNorm: 'KXG0214352',
      mpnSource: 'field',
    }),
  );
  await t.db.execute(sql`INSERT INTO offer_aliases (shop_id, external_id, product_id, decided_by) VALUES (${shopId}, 'ACER', NULL, 'human:1')`);
  // C: an emulated platform read as the brand, built-in games as a bundle, stale attributes.
  await recordObservation(
    t.db,
    legacy('R36S', URL_R36S, 'Consola retro portabila R36S 64GB cu jocuri, 15000 jocuri, Emulator N64 PSP PS1 PlayStation Sega, Alb', {
      brandName: 'Sony',
      isBundle: true,
      attributes: { storageGb: 64, ramGb: 999, kind: 'console' },
    }),
  );
  // D: an Amazon ASIN in the slug stored as a field MPN; the matcher made a product from it.
  await recordObservation(
    t.db,
    legacy('DECK', URL_DECK, 'Consola portabila gaming Valve Steam Deck 256GB, Negru', {
      brandName: 'Valve',
      mpnRaw: 'B0BHPQ5MSM',
      mpnNorm: 'B0BHPQ5MSM',
      mpnSource: 'field',
    }),
  );
  // E: recorded by the current pipeline: nothing to change.
  const raw: RawOffer = {
    shopSlug: 'emag',
    externalId: 'A16',
    url: URL_A16,
    title: 'Telefon mobil Samsung Galaxy A16, Dual SIM, 128GB, 4GB RAM, 4G, Black',
    price: '1999.99',
    priceFormat: 'decimal',
    currency: 'RON',
    availability: 'in_stock',
    mpnHint: 'SM-A165FZKBEUE',
    category: 'Laptop, Tablete & Telefoane > Telefoane mobile & accesorii > Telefoane Mobile',
    observedAt: observedAt.toISOString(),
    raw: {},
  };
  const current = createNormalize(() => null)(raw, {
    shop: { id: shopId, slug: 'emag', shippingRules: {}, vatIncludedDefault: true },
    sourceId: 0,
    sourceTier: 1,
    runId: null,
    observedAt,
  });
  await recordObservation(t.db, { ...current.observation!, sourceId: null });
  // F, G: two sellers' offers of one Lenovo product whose slug P/N became the product's field MPN.
  for (const id of ['YOGA1', 'YOGA2']) {
    await recordObservation(
      t.db,
      legacy(id, URL_YOGA, TITLE_YOGA, { brandName: 'Lenovo', mpnRaw: '83QM0034RM', mpnNorm: '83QM0034RM', mpnSource: 'field' }),
    );
  }

  await t.db.execute(sql`UPDATE offers SET match_status = 'auto' WHERE external_id IN ('S26', 'ACER', 'A16')`);
  await t.db.execute(sql`UPDATE offers SET match_status = 'manual' WHERE external_id = 'R36S'`);
  deckProduct = await matcherProduct('Consola portabila gaming Valve Steam Deck 256GB, Negru', 'Valve', 'B0BHPQ5MSM', ['DECK']);
  yogaProduct = await matcherProduct(TITLE_YOGA, 'Lenovo', '83QM0034RM', ['YOGA1', 'YOGA2']);
});

afterAll(async () => {
  await t?.drop();
});

describe('renormalizeOffers', () => {
  it('reports in a dry run and writes nothing', async () => {
    const events = await priceEvents();
    const s = await renormalizeOffers(t.db, { shopSlug: 'emag', dryRun: true });
    expect(s).toMatchObject({ dryRun: true, scanned: 7, rejected: 0, changed: 6, urlDerivedMpnFields: 5, productsSynced: 2 });
    expect(await offer('S26')).toMatchObject({ mpn_source: 'field', mpn_raw: 'SM-S741BZVDEUE', match_status: 'auto' });
    expect(await product(deckProduct)).toMatchObject({ mpn_norm: 'B0BHPQ5MSM', mpn_source: 'field' });
    expect(await priceEvents()).toBe(events);
  });

  it('rewrites normalized columns, re-queues changed identities and keeps human decisions', async () => {
    const events = await priceEvents();
    const before = await offer('S26');
    const s = await renormalizeOffers(t.db, { shopSlug: 'emag' });
    expect(s).toMatchObject({ scanned: 7, changed: 6, raced: 0, urlDerivedMpnFields: 5 });
    expect(s.before).toMatchObject({ mpnField: 5, noBrand: 0, bundles: 1 });
    expect(s.after).toMatchObject({ mpnField: 0, bundles: 0 });
    // Re-queued: S26 (no product). Kept: DECK, YOGA1, YOGA2 (their products follow them),
    // ACER (alias) and R36S (manual).
    expect(s).toMatchObject({ identityChanged: 6, requeued: 1, linksKept: 3, locked: 2, productsSynced: 2 });
    // Legacy fixtures stored no attributes or clean titles: all six get them (C's are replaced).
    expect(s.columns).toMatchObject({ title: 6, brand: 1, mpn: 4, mpnRaw: 5, mpnSource: 5, bundle: 1, attributes: 6 });

    // A: the genuine P/N survives, as a guess; the identity changed, so it is re-matched.
    const s26 = await offer('S26');
    expect(s26).toMatchObject({ mpn_norm: 'SMS741BZVDEUE', mpn_source: 'title', mpn_raw: null, match_status: 'pending' });
    expect(s26.identity_hash).not.toBe(before.identity_hash);
    // B: the title's code wins over the seller SKU; the human alias keeps the mapping.
    const acer = await offer('ACER');
    expect(acer.mpn_norm).not.toBe('KXG0214352');
    expect(acer).toMatchObject({ mpn_source: 'title', mpn_raw: null, match_status: 'auto' });
    // C: no brand, no bundle, attributes replaced (not merged); 'manual' stays.
    const r36s = await offer('R36S');
    expect(r36s).toMatchObject({ brand_name: null, is_bundle: false, match_status: 'manual' });
    expect(r36s.attributes).not.toHaveProperty('ramGb');
    expect(r36s.attributes).toMatchObject({ storageGb: 64, kind: 'console' });
    // D: an ASIN is no part number; the single-offer product follows its offer and stays linked.
    expect(await offer('DECK')).toMatchObject({ mpn_norm: null, mpn_source: null, mpn_raw: null, brand_name: 'Valve', match_status: 'auto' });
    expect(await product(deckProduct)).toMatchObject({ mpn: null, mpn_norm: null, mpn_source: null, brand: 'Valve' });
    // E: untouched.
    expect(await offer('A16')).toMatchObject({ mpn_norm: 'SMA165FZKBEUE', mpn_source: 'title', match_status: 'auto' });
    // F, G: the product's slug MPN becomes the title code, as a guess; both offers keep the link.
    for (const id of ['YOGA1', 'YOGA2']) {
      expect(await offer(id)).toMatchObject({ mpn_norm: '14IPH11', mpn_source: 'title', match_status: 'auto', product_id: String(yogaProduct) });
    }
    expect(await product(yogaProduct)).toMatchObject({ mpn_norm: '14IPH11', mpn_source: 'title', brand: 'Lenovo' });

    expect(await priceEvents()).toBe(events);
    expect((await offer('S26')).price).toBe(before.price);
  });

  it('is idempotent', async () => {
    const s = await renormalizeOffers(t.db, { shopSlug: 'emag' });
    expect(s).toMatchObject({ scanned: 7, changed: 0, identityChanged: 0, productsSynced: 0 });
  });

  it('stores the same identity the recorder computes', async () => {
    const a16 = await offer('A16');
    const n = normalizeOffer(
      {
        shopSlug: 'emag',
        externalId: 'A16',
        url: URL_A16,
        title: 'Telefon mobil Samsung Galaxy A16, Dual SIM, 128GB, 4GB RAM, 4G, Black',
        price: '1999.99',
        priceFormat: 'decimal',
        mpnHint: 'SM-A165FZKBEUE',
        observedAt: observedAt.toISOString(),
        raw: {},
      },
      { shop: { slug: 'emag' }, observedAt, eurRonRate: null, hash: () => 'x' },
    );
    expect(a16.identity_hash).toBe(offerIdentity(n).identityHash);
  });
});
