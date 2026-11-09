import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acceptPromotedTerms,
  adjustWallet,
  adminPromotedOverview,
  billPromotedClick,
  closeTopUp,
  createPlacement,
  createTopUp,
  creditTopUp,
  deleteFloor,
  getWallet,
  merchantPromotedSummary,
  monthlyPromotedStatement,
  promotedAuction,
  promotedCandidates,
  promotedMaintenance,
  PromotedError,
  promotedSlot,
  recordObservation,
  refundPromotedClick,
  seedDev,
  setPlacementHold,
  setPlacementStatus,
  setTopUpCheckout,
  suspendMerchant,
  updatePlacement,
  upsertFloor,
  type PromotedClickInput,
} from '../src/index';
import { createTestDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
const cat: Record<string, number> = {};
const shop: Record<string, number> = {};
const merchant: Record<string, number> = {};
const offer: Record<string, number> = {};
let p1 = 0;
let p2 = 0;
const today = new Date().toISOString().slice(0, 10);
const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);

async function addShop(slug: string): Promise<number> {
  const r = await t.db.execute<{ id: string }>(sql`
    INSERT INTO shops (slug, name, domain, website_url, kind, status, access_mode, trust_tier)
    VALUES (${slug}, ${slug.toUpperCase()}, ${`${slug}.ro`}, ${`https://www.${slug}.ro`}, 'retail', 'active', 'direct', 2) RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

async function addMerchant(key: string, shopId: number): Promise<number> {
  await t.db.execute(sql`INSERT INTO users (id, email, role) VALUES (${`u-${key}`}, ${`${key}@${key}.ro`}, 'merchant')`);
  const r = await t.db.execute<{ id: string }>(sql`
    INSERT INTO merchants (user_id, shop_id, status, shop_name, company_name, cui, contact_email, domain, verification_token)
    VALUES (${`u-${key}`}, ${shopId}, 'approved', ${key.toUpperCase()}, ${`SC ${key.toUpperCase()} SRL`}, '18547290', ${`${key}@${key}.ro`}, ${`${key}.ro`}, 'tok')
    RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

async function addOffer(key: string, shopId: number, productId: number, lei: number, extra: { availability?: 'in_stock' | 'out_of_stock'; sellerType?: 'shop' | 'marketplace' } = {}): Promise<number> {
  const r = await recordObservation(t.db, {
    shopId,
    sourceId: null,
    sourceTier: 1,
    runId: null,
    externalId: `promo-${key}`,
    url: `https://www.example.ro/${key}`,
    titleRaw: `Telefon test ${key}`,
    priceBani: Math.round(lei * 100),
    shippingBani: 0,
    totalBani: Math.round(lei * 100),
    availability: extra.availability ?? 'in_stock',
    condition: 'new',
    sellerType: extra.sellerType ?? 'shop',
    contentHash: createHash('sha256').update(`${key}|${lei}`).digest('hex'),
    observedAt: new Date(Date.now() - 60_000),
  });
  await t.db.execute(sql`UPDATE offers SET product_id = ${productId}, match_status = 'manual' WHERE id = ${r.offerId}`);
  return r.offerId!;
}

async function addProduct(slug: string, categoryId: number, offerCount: number): Promise<number> {
  const r = await t.db.execute<{ id: string }>(sql`
    INSERT INTO products (slug, title, title_ascii, category_id, offer_count) VALUES (${slug}, ${slug}, ${slug}, ${categoryId}, ${offerCount}) RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

const click = (over: Partial<PromotedClickInput> & Pick<PromotedClickInput, 'placementId' | 'offerId'>): PromotedClickInput => ({
  slot: 'product',
  categoryId: null,
  clickId: null,
  sessionHash: 's-default',
  ipHash: 'ip-default',
  day: today,
  enabled: true,
  bot: false,
  prefetch: false,
  internalReferer: true,
  ...over,
});

const balance = async (merchantId: number) => (await getWallet(t.db, merchantId))?.balanceBani ?? null;

/** Pays a top-up through the same calls the web and the webhook make. */
async function topUp(merchantId: number, netBani: number, checkoutId: string): Promise<void> {
  const tu = await createTopUp(t.db, { merchantId, provider: 'stripe', netBani, vatBani: 0, vatPercent: 0, actor: 'test' });
  await setTopUpCheckout(t.db, tu.id, checkoutId);
  const res = await creditTopUp(t.db, { provider: 'stripe', externalId: checkoutId, eventId: `evt_${checkoutId}`, paidGrossBani: netBani, currency: 'ron', actor: 'stripe:webhook' });
  expect(res.result).toBe('credited');
}

beforeAll(async () => {
  t = await createTestDatabase();
  await seedDev(t.db);
  const root = await t.db.execute<{ id: string }>(sql`INSERT INTO categories (slug, name_ro, depth, path) VALUES ('pt-telefoane', 'Telefoane', 0, 'pt-telefoane') RETURNING id::text`);
  cat.root = Number(root.rows[0]!.id);
  const leaf = await t.db.execute<{ id: string }>(sql`
    INSERT INTO categories (parent_id, slug, name_ro, depth, path) VALUES (${cat.root}, 'pt-mobile', 'Telefoane mobile', 1, 'pt-telefoane/pt-mobile') RETURNING id::text`);
  cat.leaf = Number(leaf.rows[0]!.id);
  const other = await t.db.execute<{ id: string }>(sql`INSERT INTO categories (slug, name_ro, depth, path) VALUES ('pt-tv', 'Televizoare', 0, 'pt-tv') RETURNING id::text`);
  cat.other = Number(other.rows[0]!.id);
  for (const s of ['shopa', 'shopb', 'shopc']) shop[s] = await addShop(s);
  merchant.a = await addMerchant('shopa', shop.shopa!);
  merchant.b = await addMerchant('shopb', shop.shopb!);
  p1 = await addProduct('pt-p1', cat.leaf, 3);
  p2 = await addProduct('pt-p2', cat.leaf, 5);
  offer.a1 = await addOffer('a1', shop.shopa!, p1, 2300);
  offer.b1 = await addOffer('b1', shop.shopb!, p1, 2250);
  offer.c1 = await addOffer('c1', shop.shopc!, p1, 2100);
  offer.a2 = await addOffer('a2', shop.shopa!, p2, 899);
  offer.b2 = await addOffer('b2', shop.shopb!, p2, 949, { availability: 'out_of_stock' });
});
afterAll(async () => t?.drop());

describe('wallets and top-ups (M25)', () => {
  it('opens a wallet once, when the merchant accepts the terms', async () => {
    expect(await acceptPromotedTerms(t.db, merchant.a!, 'promotedTerms.v1', 'merchant:u-shopa')).toBe(true);
    expect(await acceptPromotedTerms(t.db, merchant.a!, 'promotedTerms.v1', 'merchant:u-shopa')).toBe(false);
    expect(await getWallet(t.db, merchant.a!)).toMatchObject({ balanceBani: 0, termsVersion: 'promotedTerms.v1' });
  });

  it('refuses a top-up without a wallet, and a bad amount', async () => {
    await expect(createTopUp(t.db, { merchantId: merchant.b!, provider: 'stripe', netBani: 15_000, vatBani: 0, vatPercent: 0, actor: 't' })).rejects.toThrow(PromotedError);
    await expect(createTopUp(t.db, { merchantId: merchant.a!, provider: 'stripe', netBani: 0, vatBani: 0, vatPercent: 0, actor: 't' })).rejects.toThrow(PromotedError);
  });

  it('credits a paid top-up exactly once, only for the amount and currency asked, and snapshots the buyer', async () => {
    const tu = await createTopUp(t.db, { merchantId: merchant.a!, provider: 'stripe', netBani: 20_000, vatBani: 4_200, vatPercent: 21, actor: 'merchant:u-shopa' });
    expect(tu).toMatchObject({ netBani: 20_000, vatBani: 4_200, grossBani: 24_200 });
    await setTopUpCheckout(t.db, tu.id, 'cs_1');
    const billing = await t.db.execute<{ billing_name: string; billing_cui: string; status: string }>(sql`SELECT billing_name, billing_cui, status FROM wallet_topups WHERE id = ${tu.id}`);
    expect(billing.rows[0]).toEqual({ billing_name: 'SC SHOPA SRL', billing_cui: '18547290', status: 'pending' });

    const wrongAmount = await creditTopUp(t.db, { provider: 'stripe', externalId: 'cs_1', eventId: 'evt_x', paidGrossBani: 20_000, currency: 'ron', actor: 'stripe:webhook' });
    expect(wrongAmount.result).toBe('mismatch');
    const wrongCurrency = await creditTopUp(t.db, { provider: 'stripe', externalId: 'cs_1', eventId: 'evt_y', paidGrossBani: 24_200, currency: 'eur', actor: 'stripe:webhook' });
    expect(wrongCurrency.result).toBe('mismatch');
    expect(await balance(merchant.a!)).toBe(0);

    const paid = await creditTopUp(t.db, { provider: 'stripe', externalId: 'cs_1', eventId: 'evt_1', paidGrossBani: 24_200, currency: 'ron', actor: 'stripe:webhook' });
    expect(paid).toMatchObject({ result: 'credited', netBani: 20_000, balanceBani: 20_000 });
    const again = await creditTopUp(t.db, { provider: 'stripe', externalId: 'cs_1', eventId: 'evt_1b', paidGrossBani: 24_200, currency: 'ron', actor: 'stripe:webhook' });
    expect(again.result).toBe('duplicate');
    expect(await creditTopUp(t.db, { provider: 'stripe', externalId: 'cs_nope', eventId: 'evt_2', paidGrossBani: 1, currency: 'ron', actor: 'x' })).toEqual({ result: 'unknown' });
    expect(await balance(merchant.a!)).toBe(20_000);
    const ledger = await t.db.execute<{ kind: string; amount: string; balance_after: string; ref: string }>(sql`SELECT kind, amount::text, balance_after::text, ref FROM wallet_ledger WHERE merchant_id = ${merchant.a}`);
    expect(ledger.rows).toEqual([{ kind: 'topup', amount: '200.00', balance_after: '200.00', ref: 'stripe:cs_1' }]);
  });

  it('closes an expired checkout without moving money; a late payment is still credited', async () => {
    const tu = await createTopUp(t.db, { merchantId: merchant.a!, provider: 'stripe', netBani: 15_000, vatBani: 0, vatPercent: 0, actor: 't' });
    await setTopUpCheckout(t.db, tu.id, 'cs_exp');
    expect(await closeTopUp(t.db, { provider: 'stripe', externalId: 'cs_exp', eventId: 'evt_e', status: 'expired' })).toBe(true);
    expect(await closeTopUp(t.db, { provider: 'stripe', externalId: 'cs_exp', eventId: 'evt_e', status: 'expired' })).toBe(false);
    expect(await balance(merchant.a!)).toBe(20_000);
    // An asynchronous payment method that succeeds after we closed the checkout: the money arrived.
    const late = await creditTopUp(t.db, { provider: 'stripe', externalId: 'cs_exp', eventId: 'evt_late', paidGrossBani: 15_000, currency: 'RON', actor: 'stripe:webhook' });
    expect(late.result).toBe('credited');
    expect(await balance(merchant.a!)).toBe(35_000);
  });

  it('admin adjustments apply once per form token and never take a wallet below zero', async () => {
    expect(await adjustWallet(t.db, { merchantId: merchant.a!, amountBani: -5_000, actor: 'admin:x', note: 'test debit', token: 'tok-1' })).toEqual({ applied: true, balanceBani: 30_000 });
    expect(await adjustWallet(t.db, { merchantId: merchant.a!, amountBani: -5_000, actor: 'admin:x', note: 'test debit', token: 'tok-1' })).toEqual({ applied: false, balanceBani: 30_000 });
    await expect(adjustWallet(t.db, { merchantId: merchant.a!, amountBani: -30_001, actor: 'admin:x', note: 'too much' })).rejects.toMatchObject({ code: 'insufficient' });
    expect(await adjustWallet(t.db, { merchantId: merchant.a!, amountBani: 5_000, actor: 'admin:x', note: 'back', token: 'tok-2' })).toEqual({ applied: true, balanceBani: 35_000 });
  });
});

describe('campaigns, eligibility and the auction (M25)', () => {
  let plA = 0;
  let plB = 0;

  it('a campaign needs a funded wallet to take part', async () => {
    plA = await createPlacement(t.db, { merchantId: merchant.a!, categoryId: cat.root!, priceBand: null, bidBani: 150, dailyCapBani: 1_000, actor: 'merchant:u-shopa' });
    await expect(createPlacement(t.db, { merchantId: merchant.a!, categoryId: cat.root!, priceBand: null, bidBani: 200, dailyCapBani: 1_000, actor: 'x' })).rejects.toMatchObject({ code: 'exists' });
    // B has a campaign but no wallet yet: never a candidate.
    plB = await createPlacement(t.db, { merchantId: merchant.b!, categoryId: cat.leaf!, priceBand: '1000-3000', bidBani: 100, dailyCapBani: 1_000, actor: 'merchant:u-shopb' });
    const c = await promotedCandidates(t.db, { slot: 'product', productId: p1 });
    expect(c.map((x) => x.merchantId)).toEqual([merchant.a]);
    await acceptPromotedTerms(t.db, merchant.b!, 'promotedTerms.v1', 'merchant:u-shopb');
    const zero = await promotedCandidates(t.db, { slot: 'product', productId: p1 });
    expect(zero.find((x) => x.merchantId === merchant.b)?.remainingBani).toBe(0);
    await topUp(merchant.b!, 15_000, 'cs_b1');
  });

  it('second price: the winner pays the runner-up bid + 1 ban; the slot says by how much it costs more than the cheapest offer', async () => {
    const a = await promotedAuction(t.db, { slot: 'product', productId: p1 });
    expect(a).toMatchObject({ priceBani: 101, secondBidBani: 100, bidders: 2, effectiveBidBani: 150 });
    expect(a!.winner).toMatchObject({ placementId: plA, offerId: offer.a1, floorBani: 60, capBani: 300 });
    const slot = await promotedSlot(t.db, { slot: 'product', productId: p1 });
    expect(slot).toMatchObject({ placementId: plA, offerId: offer.a1, shopName: 'SHOPA', totalBani: 230_000, bestTotalBani: 210_000, liveShops: 3 });
  });

  it('price bands and categories filter campaigns', async () => {
    // p2 (899 lei) is in band 200-1000: B's 1000-3000 campaign does not apply, and B's p2 offer is out of stock anyway.
    const c = await promotedCandidates(t.db, { slot: 'product', productId: p2 });
    expect(c.map((x) => [x.placementId, x.offerId])).toEqual([[plA, offer.a2]]);
    // A category with no campaign target.
    expect(await promotedCandidates(t.db, { slot: 'category', categoryId: cat.other! })).toEqual([]);
    // Category page: one offer per campaign, from the most compared product (p2 has offer_count 5).
    const onRoot = await promotedCandidates(t.db, { slot: 'category', categoryId: cat.root! });
    expect(onRoot.find((x) => x.placementId === plA)?.offerId).toBe(offer.a2);
    expect(onRoot.find((x) => x.placementId === plB)?.offerId).toBe(offer.b1);
  });

  it('a floor above a bid takes that campaign out; the most specific floor wins', async () => {
    await upsertFloor(t.db, { categoryId: cat.leaf!, band: '1000-3000', floorBani: 120, capBani: 400, actor: 'admin:x' });
    const a = await promotedAuction(t.db, { slot: 'product', productId: p1 });
    expect(a).toMatchObject({ bidders: 1, priceBani: 120, secondBidBani: null });
    await upsertFloor(t.db, { categoryId: cat.leaf!, band: '1000-3000', floorBani: 50, capBani: 120, actor: 'admin:x' });
    // A's 1,50 lei bid is capped at 1,20 lei; B's 1,00 lei is above the 0,50 lei floor.
    expect(await promotedAuction(t.db, { slot: 'product', productId: p1 })).toMatchObject({ effectiveBidBani: 120, priceBani: 101, bidders: 2 });
    const floors = await t.db.execute<{ id: string }>(sql`SELECT id::text FROM placement_floors WHERE category_id = ${cat.leaf}`);
    expect(await deleteFloor(t.db, { id: Number(floors.rows[0]!.id), actor: 'admin:x' })).toBe(cat.leaf);
    expect(await promotedAuction(t.db, { slot: 'product', productId: p1 })).toMatchObject({ priceBani: 101, effectiveBidBani: 150 });
  });

  it('paused, held and suspended campaigns or merchants never win; only approved merchants do', async () => {
    await setPlacementStatus(t.db, { placementId: plA, merchantId: merchant.a!, status: 'paused', actor: 'm' });
    expect((await promotedAuction(t.db, { slot: 'product', productId: p1 }))?.winner.placementId).toBe(plB);
    await setPlacementStatus(t.db, { placementId: plA, merchantId: merchant.a!, status: 'active', actor: 'm' });
    await setPlacementHold(t.db, { placementId: plA, hold: true, reason: 'verificare', actor: 'admin:x' });
    expect((await promotedAuction(t.db, { slot: 'product', productId: p1 }))?.winner.placementId).toBe(plB);
    await setPlacementHold(t.db, { placementId: plA, hold: false, reason: null, actor: 'admin:x' });
    // Another merchant's campaign id cannot be changed by this merchant.
    await expect(updatePlacement(t.db, { placementId: plB, merchantId: merchant.a!, bidBani: 1, dailyCapBani: 1, actor: 'm' })).rejects.toMatchObject({ code: 'not_found' });

    await t.db.execute(sql`UPDATE merchants SET status = 'pending' WHERE id = ${merchant.b}`);
    expect((await promotedCandidates(t.db, { slot: 'product', productId: p1 })).map((c) => c.merchantId)).toEqual([merchant.a]);
    await t.db.execute(sql`UPDATE merchants SET status = 'approved' WHERE id = ${merchant.b}`);
    expect((await promotedCandidates(t.db, { slot: 'product', productId: p1 })).length).toBe(2);
  });

  it('stale, unmatched or out-of-stock offers and inactive shops are never promoted', async () => {
    await t.db.execute(sql`UPDATE offers SET last_checked_at = now() - interval '3 days' WHERE id = ${offer.a1}`);
    expect((await promotedCandidates(t.db, { slot: 'product', productId: p1 })).map((c) => c.merchantId)).toEqual([merchant.b]);
    await t.db.execute(sql`UPDATE offers SET last_checked_at = now() WHERE id = ${offer.a1}`);
    await t.db.execute(sql`UPDATE shops SET status = 'paused' WHERE id = ${shop.shopa}`);
    expect((await promotedCandidates(t.db, { slot: 'product', productId: p1 })).map((c) => c.merchantId)).toEqual([merchant.b]);
    await t.db.execute(sql`UPDATE shops SET status = 'active' WHERE id = ${shop.shopa}`);
    await t.db.execute(sql`UPDATE offers SET match_status = 'pending' WHERE id = ${offer.a1}`);
    expect((await promotedCandidates(t.db, { slot: 'product', productId: p1 })).map((c) => c.merchantId)).toEqual([merchant.b]);
    await t.db.execute(sql`UPDATE offers SET match_status = 'manual' WHERE id = ${offer.a1}`);
    expect((await promotedCandidates(t.db, { slot: 'product', productId: p1 })).length).toBe(2);
  });

  describe('click billing', () => {
    it('bills the winner once per hashed session, offer and day, and records why other clicks are not billed', async () => {
      const before = await balance(merchant.a!);
      const first = await billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a1!, sessionHash: 's1', ipHash: 'ip1' }));
      expect(first).toMatchObject({ recorded: true, billed: true, priceBani: 101, reason: null, merchantId: merchant.a, exhausted: false });
      expect(await balance(merchant.a!)).toBe(before! - 101);
      const dup = await billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a1!, sessionHash: 's1', ipHash: 'ip1' }));
      expect(dup).toMatchObject({ billed: false, reason: 'duplicate' });
      // The next day (a new salt) is a new session.
      const tomorrow = await billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a1!, sessionHash: 's1', ipHash: 'ip1', day: '2999-01-01' }));
      expect(tomorrow.billed).toBe(true);
      await refundPromotedClick(t.db, { promotedClickId: tomorrow.promotedClickId!, actor: 'admin:x', reason: 'test day' });

      expect((await billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a1!, bot: true }))).reason).toBe('bot');
      expect((await billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a1!, prefetch: true }))).reason).toBe('prefetch');
      expect((await billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a1!, internalReferer: false }))).reason).toBe('no_referer');
      expect((await billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a1!, enabled: false }))).reason).toBe('disabled');
      // B's campaign is not showing on this product page now: its clicks are not billed.
      expect((await billPromotedClick(t.db, click({ placementId: plB, offerId: offer.b1!, sessionHash: 's2' }))).reason).toBe('not_winner');
      // A tampered link (A's campaign with B's offer) or an unknown campaign.
      expect((await billPromotedClick(t.db, click({ placementId: plA, offerId: offer.b1!, sessionHash: 's3' }))).reason).toBe('ineligible');
      expect(await billPromotedClick(t.db, click({ placementId: 999_999, offerId: offer.a1! }))).toMatchObject({ recorded: false, billed: false });
      expect(await balance(merchant.a!)).toBe(before! - 101);

      const rows = await t.db.execute<{ status: string; reason: string | null; n: number }>(sql`
        SELECT status, reason, count(*)::int AS n FROM promoted_clicks GROUP BY status, reason ORDER BY status, reason`);
      expect(rows.rows).toEqual([
        { status: 'billed', reason: null, n: 1 },
        { status: 'not_billed', reason: 'bot', n: 1 },
        { status: 'not_billed', reason: 'disabled', n: 1 },
        { status: 'not_billed', reason: 'duplicate', n: 1 },
        { status: 'not_billed', reason: 'ineligible', n: 1 },
        { status: 'not_billed', reason: 'no_referer', n: 1 },
        { status: 'not_billed', reason: 'not_winner', n: 1 },
        { status: 'not_billed', reason: 'prefetch', n: 1 },
        { status: 'refunded', reason: null, n: 1 },
      ]);
      const ledger = await t.db.execute<{ kind: string; amount: string }>(sql`SELECT kind, amount::text FROM wallet_ledger WHERE merchant_id = ${merchant.a} AND kind IN ('click','click_refund') ORDER BY id`);
      expect(ledger.rows).toEqual([
        { kind: 'click', amount: '-1.01' },
        { kind: 'click', amount: '-1.01' },
        { kind: 'click_refund', amount: '1.01' },
      ]);
    });

    it('holds a session or a network that clicks too much', async () => {
      for (let i = 0; i < 5; i++) await billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a2!, slot: 'product', sessionHash: 'busy', ipHash: `ipb${i}`, internalReferer: false }));
      const held = await billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a2!, sessionHash: 'busy', ipHash: 'ipb9' }));
      expect(held.reason).toBe('rate_hold');
    });

    it('a refunded click gives the money back once and still counts for the day', async () => {
      const c = await billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a1!, sessionHash: 's-ref', ipHash: 'ip-ref' }));
      expect(c.billed).toBe(true);
      const before = await balance(merchant.a!);
      expect(await refundPromotedClick(t.db, { promotedClickId: c.promotedClickId!, actor: 'admin:x', reason: 'fraud' })).toMatchObject({ priceBani: 101, balanceBani: before! + 101 });
      await expect(refundPromotedClick(t.db, { promotedClickId: c.promotedClickId!, actor: 'admin:x', reason: 'again' })).rejects.toMatchObject({ code: 'bad_status' });
      expect((await billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a1!, sessionHash: 's-ref', ipHash: 'ip-ref' }))).reason).toBe('duplicate');
    });

    it('concurrent clicks: one bill per session, never more than the daily cap, never below zero', async () => {
      // A daily cap that leaves room for exactly three more clicks at 1,01 lei with a 1,50 lei bid.
      const spent = await t.db.execute<{ s: string }>(sql`SELECT coalesce(sum(price), 0)::text AS s FROM promoted_clicks WHERE placement_id = ${plA} AND status = 'billed'`);
      const spentBani = Math.round(Number(spent.rows[0]!.s) * 100);
      await updatePlacement(t.db, { placementId: plA, merchantId: merchant.a!, bidBani: 150, dailyCapBani: spentBani + 101 * 2 + 150, actor: 'm' });
      const before = await balance(merchant.a!);
      const sameSession = await Promise.all(Array.from({ length: 6 }, () => billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a1!, sessionHash: 'race', ipHash: 'ip-race' }))));
      expect(sameSession.filter((r) => r.billed)).toHaveLength(1);
      const many = await Promise.all(Array.from({ length: 8 }, (_, i) => billPromotedClick(t.db, click({ placementId: plA, offerId: offer.a1!, sessionHash: `par${i}`, ipHash: `ip-par${i}` }))));
      const billed = many.filter((r) => r.billed);
      // 1 (race) + 2 more fit before the remaining budget drops below the bid; the rest are budget-refused or lose the slot.
      expect(billed).toHaveLength(2);
      expect(many.filter((r) => !r.billed).every((r) => r.reason === 'not_winner' || r.reason === 'budget' || r.reason === 'ineligible')).toBe(true);
      expect(billed.filter((r) => r.exhausted)).toHaveLength(1);
      expect(await balance(merchant.a!)).toBe(before! - 3 * 101);
      // The display stops: A no longer affords its bid today, B takes the slot.
      expect((await promotedAuction(t.db, { slot: 'product', productId: p1 }))?.winner.placementId).toBe(plB);
      const sums = await t.db.execute<{ ok: boolean }>(sql`
        SELECT (SELECT sum(amount) FROM wallet_ledger WHERE merchant_id = ${merchant.a}) = (SELECT balance FROM merchant_wallets WHERE merchant_id = ${merchant.a}) AS ok`);
      expect(sums.rows[0]!.ok).toBe(true);
    });

    it('a category-slot click needs its category page and bills the category winner', async () => {
      const a = await promotedAuction(t.db, { slot: 'category', categoryId: cat.root! });
      expect(a?.winner.placementId).toBe(plB);
      expect((await billPromotedClick(t.db, click({ placementId: plB, offerId: offer.b1!, slot: 'category', categoryId: null, sessionHash: 'cat0' }))).reason).toBe('ineligible');
      const ok = await billPromotedClick(t.db, click({ placementId: plB, offerId: offer.b1!, slot: 'category', categoryId: cat.root!, sessionHash: 'cat1', ipHash: 'ipc1' }));
      expect(ok).toMatchObject({ billed: true, priceBani: 60 });
    });
  });

  it('merchant and admin numbers, and a monthly statement that reconciles with the wallets', async () => {
    const s = await merchantPromotedSummary(t.db, merchant.a!);
    // s1, race and two parallel clicks (two more were refunded).
    expect(s.billed30).toBe(4);
    expect(s.spend30Bani).toBe(4 * 101);
    expect(s.cpc30Bani).toBe(101);
    expect(s.placements.map((p) => p.id)).toEqual([plA]);
    expect(s.notBilled30.duplicate).toBeGreaterThanOrEqual(1);
    const o = await adminPromotedOverview(t.db);
    expect(o.billed30).toBe(5);
    expect(o.walletsTotalBani).toBe((await balance(merchant.a!))! + (await balance(merchant.b!))!);
    const st = await monthlyPromotedStatement(t.db, month);
    for (const r of st) {
      expect(r.closingBani).toBe(r.openingBani + r.topupsNetBani - r.clicksBani + r.refundsBani + r.adjustmentsBani);
      expect(r.closingBani).toBe(await balance(r.merchantId));
    }
    const a = st.find((r) => r.merchantId === merchant.a)!;
    expect(a).toMatchObject({ companyName: 'SC SHOPA SRL', cui: '18547290', topups: 2, topupsNetBani: 35_000, topupsVatBani: 4_200, topupsGrossBani: 39_200, clicks: 6, refundsBani: 202, adjustmentsBani: 0 });
    await expect(monthlyPromotedStatement(t.db, '2026-13')).rejects.toThrow(PromotedError);
  });

  it('suspension stops the merchant at once; deleting its account keeps the accounting rows', async () => {
    await suspendMerchant(t.db, merchant.b!, 'test', 'admin:x');
    expect((await promotedCandidates(t.db, { slot: 'category', categoryId: cat.root! })).map((c) => c.merchantId)).not.toContain(merchant.b);
    const left = await balance(merchant.b!);
    await t.db.execute(sql`DELETE FROM users WHERE id = 'u-shopb'`);
    expect(await getWallet(t.db, merchant.b!)).toMatchObject({ balanceBani: left });
    const placements = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM placements WHERE merchant_id = ${merchant.b}`);
    expect(placements.rows[0]!.n).toBe(0);
    const o = await adminPromotedOverview(t.db);
    expect(o.wallets.find((w) => w.merchantId === merchant.b)).toMatchObject({ status: null, balanceBani: left });
    const st = await monthlyPromotedStatement(t.db, month);
    expect(st.find((r) => r.merchantId === merchant.b)).toMatchObject({ companyName: 'SC SHOPB SRL', cui: '18547290', closingBani: left });
  });

  it('maintenance clears old session hashes and expires abandoned checkouts', async () => {
    await t.db.execute(sql`UPDATE promoted_clicks SET created_at = now() - interval '31 days' WHERE session_hash = 's1'`);
    const tu = await createTopUp(t.db, { merchantId: merchant.a!, provider: 'stripe', netBani: 15_000, vatBani: 0, vatPercent: 0, actor: 't' });
    await t.db.execute(sql`UPDATE wallet_topups SET created_at = now() - interval '25 hours' WHERE id = ${tu.id}`);
    const r = await promotedMaintenance(t.db);
    expect(r.hashesCleared).toBeGreaterThanOrEqual(2);
    expect(r.topupsExpired).toBe(1);
    const left = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM promoted_clicks WHERE session_hash = 's1'`);
    expect(left.rows[0]!.n).toBe(0);
  });
});
