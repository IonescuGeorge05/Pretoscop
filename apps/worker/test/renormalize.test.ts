import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RawOffer } from '@pretoscop/core';
import { type OfferObservation, recordObservation } from '@pretoscop/db';
import { createTestDatabase, type TestDatabase } from '@pretoscop/db/testing';
import { offerIdentity } from '../src/recorder/identity';
import { renormalizeOffers } from '../src/recorder/renormalize';
import { syncShops } from '../src/registry/sync';
import { createNormalize } from '../src/services';

/**
 * Offers in the states the pre-hint pipeline left behind (live eMAG run, 2026-10-27): slug tails
 * stored as field MPNs, a false brand and bundle on a retro handheld, stale attributes.
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
const URL_DECK =
  'https://www.emag.ro/consola-portabila-gaming-valve-steam-deck-256gb-negru-b0bhpq5msm/pd/D1DECK/';
const URL_A16 =
  'https://www.emag.ro/telefon-mobil-samsung-galaxy-a16-dual-sim-128gb-4gb-ram-4g-black-sm-a165fzkbeue/pd/D1A16/';

function legacy(
  externalId: string,
  url: string,
  title: string,
  o: Partial<OfferObservation>,
): OfferObservation {
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
    price: string;
  }>(sql`SELECT brand_name, mpn_raw, mpn_norm, mpn_source, is_bundle, attributes, identity_hash, match_status, price::text
         FROM offers WHERE external_id = ${externalId}`);
  return r.rows[0]!;
}

async function priceEvents(): Promise<number> {
  const r = await t.db.execute<{ n: string }>(sql`SELECT count(*)::text n FROM price_events`);
  return Number(r.rows[0]!.n);
}

beforeAll(async () => {
  t = await createTestDatabase();
  await syncShops(t.db);
  shopId = Number(
    (await t.db.execute<{ id: string }>(sql`SELECT id::text FROM shops WHERE slug = 'emag'`))
      .rows[0]!.id,
  );

  // A: the slug P/N stored as a field MPN; the title has no code.
  await recordObservation(
    t.db,
    legacy(
      'S26',
      URL_S26,
      'Telefon mobil Samsung Galaxy S26 FE, Dual SIM, 8GB RAM, 128GB, 5G, Blueberry',
      {
        brandName: 'Samsung',
        mpnRaw: 'SM-S741BZVDEUE',
        mpnNorm: 'SMS741BZVDEUE',
        mpnSource: 'field',
      },
    ),
  );
  // B: a seller's SKU in the slug beat the title's own codes; a human linked this offer.
  await recordObservation(
    t.db,
    legacy(
      'ACER',
      URL_ACER,
      'Laptop Acer Nitro V15 ANV15-41-R948, NH.QSGEX.00H, 15.6", AMD Ryzen 7 7735HS, 16GB, 512GB SSD',
      {
        brandName: 'Acer',
        mpnRaw: 'KXG0214352',
        mpnNorm: 'KXG0214352',
        mpnSource: 'field',
      },
    ),
  );
  await t.db.execute(
    sql`INSERT INTO offer_aliases (shop_id, external_id, product_id, decided_by) VALUES (${shopId}, 'ACER', NULL, 'human:1')`,
  );
  // C: an emulated platform read as the brand, built-in games as a bundle, stale attributes.
  await recordObservation(
    t.db,
    legacy(
      'R36S',
      URL_R36S,
      'Consola retro portabila R36S 64GB cu jocuri, 15000 jocuri, Emulator N64 PSP PS1 PlayStation Sega, Alb',
      {
        brandName: 'Sony',
        isBundle: true,
        attributes: { storageGb: 64, ramGb: 999, kind: 'console' },
      },
    ),
  );
  // D: an Amazon ASIN in the slug stored as a field MPN.
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

  await t.db.execute(
    sql`UPDATE offers SET match_status = 'auto' WHERE external_id IN ('S26', 'ACER', 'DECK', 'A16')`,
  );
  await t.db.execute(sql`UPDATE offers SET match_status = 'manual' WHERE external_id = 'R36S'`);
});

afterAll(async () => {
  await t?.drop();
});

describe('renormalizeOffers', () => {
  it('reports in a dry run and writes nothing', async () => {
    const events = await priceEvents();
    const s = await renormalizeOffers(t.db, { shopSlug: 'emag', dryRun: true });
    expect(s).toMatchObject({
      dryRun: true,
      scanned: 5,
      rejected: 0,
      changed: 4,
      urlDerivedMpnFields: 3,
    });
    expect(await offer('S26')).toMatchObject({
      mpn_source: 'field',
      mpn_raw: 'SM-S741BZVDEUE',
      match_status: 'auto',
    });
    expect(await priceEvents()).toBe(events);
  });

  it('rewrites normalized columns, re-queues changed identities and keeps human decisions', async () => {
    const events = await priceEvents();
    const before = await offer('S26');
    const s = await renormalizeOffers(t.db, { shopSlug: 'emag' });
    expect(s).toMatchObject({ scanned: 5, changed: 4, raced: 0, urlDerivedMpnFields: 3 });
    expect(s.before).toMatchObject({ mpnField: 3, noBrand: 0, bundles: 1 });
    expect(s.after).toMatchObject({ mpnField: 0, bundles: 0 });

    // A: the genuine P/N survives, as a guess; the identity changed, so it is re-matched.
    const s26 = await offer('S26');
    expect(s26).toMatchObject({
      mpn_norm: 'SMS741BZVDEUE',
      mpn_source: 'title',
      mpn_raw: null,
      match_status: 'pending',
    });
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
    // D: an ASIN is no part number.
    expect(await offer('DECK')).toMatchObject({
      mpn_norm: null,
      mpn_source: null,
      mpn_raw: null,
      brand_name: 'Valve',
    });
    // E: untouched.
    expect(await offer('A16')).toMatchObject({
      mpn_norm: 'SMA165FZKBEUE',
      mpn_source: 'title',
      match_status: 'auto',
    });

    expect(s).toMatchObject({ identityChanged: 4, requeued: 2, locked: 2 }); // kept: ACER (alias), R36S (manual)
    // Legacy fixtures stored no attributes or clean titles: all four get them (C's are replaced).
    // S26 keeps its MPN value; only the raw field and the source change.
    expect(s.columns).toMatchObject({
      title: 4,
      brand: 1,
      mpn: 2,
      mpnRaw: 3,
      mpnSource: 3,
      bundle: 1,
      attributes: 4,
    });
    expect(await priceEvents()).toBe(events);
    expect((await offer('S26')).price).toBe(before.price);
  });

  it('is idempotent', async () => {
    const s = await renormalizeOffers(t.db, { shopSlug: 'emag' });
    expect(s).toMatchObject({ scanned: 5, changed: 0, identityChanged: 0 });
  });

  it('stores the same identity the recorder computes', async () => {
    const a16 = await offer('A16');
    const n = (await import('@pretoscop/core')).normalizeOffer(
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
