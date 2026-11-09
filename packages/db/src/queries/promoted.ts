import { randomUUID } from 'node:crypto';
import {
  applyWalletMovement,
  decideClickBilling,
  floorFor,
  isPriceBandKey,
  PRICE_BANDS,
  priceBandOf,
  RATE_HOLD,
  runAuction,
  WalletError,
  type AuctionCandidate,
  type AuctionResult,
  type FloorRow,
  type NotBilledReason,
  type PriceBandKey,
} from '@pretoscop/core';
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client';
import { baniToNumeric, numericToBani } from '../money';
import type { PlacementStatus, PromotedSlot } from '../schema/promoted';

/**
 * Promoted placements and merchant billing (M25, ADR-027): candidates and auctions for a slot,
 * click billing under a wallet row lock, idempotent top-up credits, refunds and admin adjustments,
 * campaigns, floors and the numbers of the merchant and admin pages. Every money movement writes a
 * `wallet_ledger` row and an `audit_log` row in the same transaction. Amounts are integer bani.
 */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Exec = Db | Tx;

const bani = (v: string | null | undefined): number => numericToBani(v ?? '0') ?? 0;
const money = (b: number): string => baniToNumeric(b);

export class PromotedError extends Error {
  constructor(readonly code: 'not_found' | 'exists' | 'bad_status' | 'insufficient' | 'no_wallet' | 'invalid') {
    super(`promoted: ${code}`);
  }
}

/** A unique violation, raw (pg) or wrapped by drizzle (`DrizzleQueryError.cause`). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

async function audit(db: Exec, actor: string, action: string, entity: string, entityId: string | number | null, before: unknown, after: unknown): Promise<void> {
  await db.execute(sql`
    INSERT INTO audit_log (actor, action, entity, entity_id, before, after)
    VALUES (${actor}, ${action}, ${entity}, ${entityId === null ? null : String(entityId)}, ${before === null ? null : JSON.stringify(before)}::jsonb, ${after === null ? null : JSON.stringify(after)}::jsonb)`);
}

// ---------------------------------------------------------------------------------------------
// Eligibility and candidates

/** Start of today in Europe/Bucharest (daily caps reset at local midnight). */
const BUCHAREST_DAY_START = sql.raw(`(date_trunc('day', now() AT TIME ZONE 'Europe/Bucharest') AT TIME ZONE 'Europe/Bucharest')`);

/** The band key of a total price column, from PRICE_BANDS (same bounds as `priceBandOf`; constants only). */
function bandOfSql(total: SQL): SQL {
  const chunks: SQL[] = [sql.raw('(CASE')];
  for (const b of PRICE_BANDS) if (b.maxBani !== null) chunks.push(sql` WHEN ${total} < ${sql.raw(baniToNumeric(b.maxBani))} THEN ${sql.raw(`'${b.key}'`)}`);
  chunks.push(sql.raw(` ELSE '${PRICE_BANDS.at(-1)!.key}' END)`));
  return sql.join(chunks, sql.raw(''));
}

/**
 * An offer that may fill a promoted slot (ADR-027): the merchant's own, shop-sold, new, in stock,
 * matched, active, not a bundle or accessory, not blacklisted, checked within its shop's freshness
 * SLO and without a pending quarantine; its shop is active and the merchant approved. Aliases:
 * `o` offers, `s` shops, `m` merchants, `p` products.
 */
export const ELIGIBLE_PROMOTED_OFFER: SQL = sql.raw(`(
  m.status = 'approved' AND o.shop_id = m.shop_id AND s.status = 'active' AND p.status = 'active'
  AND o.active AND o.availability = 'in_stock' AND o.match_status IN ('auto','manual') AND o.condition = 'new'
  AND NOT o.is_bundle AND NOT o.is_accessory AND NOT o.blacklisted AND o.seller_type = 'shop'
  AND o.last_checked_at > now() - make_interval(hours => coalesce((s.crawl_policy->>'freshness_slo_hours')::int, 26))
  AND NOT EXISTS (SELECT 1 FROM price_events_quarantine q WHERE q.offer_id = o.id AND q.status = 'pending')
)`);

export type PromotedContext = { slot: 'product'; productId: number } | { slot: 'category'; categoryId: number };

type CandidateRow = {
  placement_id: string;
  merchant_id: string;
  bid: string;
  daily_cap: string;
  offer_id: string;
  product_id: string;
  total: string;
  chain: string[] | null;
  balance: string;
  spent_today: string;
};

export async function listFloorRows(db: Exec): Promise<FloorRow[]> {
  const r = await db.execute<{ category_id: string | null; price_band: string; floor: string; cap: string }>(sql`
    SELECT category_id::text, price_band, floor::text, cap::text FROM placement_floors`);
  return r.rows
    .filter((x) => isPriceBandKey(x.price_band))
    .map((x) => ({ categoryId: x.category_id === null ? null : Number(x.category_id), band: x.price_band as PriceBandKey, floorBani: bani(x.floor), capBani: bani(x.cap) }));
}

/**
 * Every (campaign, offer) pair that could fill the slot, with what the auction needs: the bid, the
 * floor and cap of the offer's category and band, and what the campaign can still spend today. One
 * offer per campaign: on a product page the merchant's cheapest eligible offer of that product; on
 * a category page its offer of the most compared product (most offers), then the cheapest. The
 * category chain of the chosen offer (for its floor) is computed once per campaign, after the pick.
 */
export async function promotedCandidates(db: Exec, ctx: PromotedContext): Promise<AuctionCandidate[]> {
  const where =
    ctx.slot === 'product'
      ? sql`o.product_id = ${ctx.productId}`
      : sql`EXISTS (SELECT 1 FROM categories x WHERE x.id = ${ctx.categoryId} AND (pcat.id = x.id OR starts_with(pcat.path, x.path || '/')))`;
  const order = ctx.slot === 'product' ? sql`pl.id, o.total_price, o.id` : sql`pl.id, p.offer_count DESC, o.total_price, o.id`;
  const r = await db.execute<CandidateRow>(sql`
    WITH pick AS (
      SELECT DISTINCT ON (pl.id)
        pl.id AS placement_id, pl.merchant_id, pl.bid, pl.daily_cap, o.id AS offer_id, o.product_id, o.total_price, pcat.id AS category_id, pcat.path AS category_path, w.balance
      FROM placements pl
      JOIN merchants m ON m.id = pl.merchant_id
      JOIN merchant_wallets w ON w.merchant_id = m.id
      JOIN offers o ON o.shop_id = m.shop_id
      JOIN shops s ON s.id = o.shop_id
      JOIN products p ON p.id = o.product_id
      JOIN categories pcat ON pcat.id = p.category_id
      JOIN categories tcat ON tcat.id = pl.category_id
      WHERE pl.status = 'active' AND NOT pl.admin_hold
        AND ${where}
        AND (pcat.id = tcat.id OR starts_with(pcat.path, tcat.path || '/'))
        AND (pl.price_band IS NULL OR pl.price_band = ${bandOfSql(sql`o.total_price`)})
        AND ${ELIGIBLE_PROMOTED_OFFER}
      ORDER BY ${order}
    )
    SELECT pick.placement_id::text, pick.merchant_id::text, pick.bid::text, pick.daily_cap::text,
      pick.offer_id::text, pick.product_id::text, pick.total_price::text AS total, pick.balance::text,
      ARRAY(SELECT c.id::text FROM categories c WHERE c.id = pick.category_id OR starts_with(pick.category_path, c.path || '/') ORDER BY c.depth DESC) AS chain,
      (SELECT coalesce(sum(pc.price), 0) FROM promoted_clicks pc
        WHERE pc.placement_id = pick.placement_id AND pc.status = 'billed' AND pc.created_at >= ${BUCHAREST_DAY_START})::text AS spent_today
    FROM pick`);
  if (r.rows.length === 0) return [];
  const floors = await listFloorRows(db);
  return r.rows.map((row) => {
    const totalBani = bani(row.total);
    const band = priceBandOf(totalBani);
    const { floorBani, capBani } = floorFor(floors, (row.chain ?? []).map(Number), band);
    const dailyCap = bani(row.daily_cap);
    return {
      placementId: Number(row.placement_id),
      merchantId: Number(row.merchant_id),
      offerId: Number(row.offer_id),
      productId: Number(row.product_id),
      bidBani: bani(row.bid),
      floorBani,
      capBani,
      remainingBani: Math.max(0, Math.min(bani(row.balance), dailyCap - bani(row.spent_today))),
      totalBani,
    };
  });
}

export async function promotedAuction(db: Exec, ctx: PromotedContext): Promise<AuctionResult | null> {
  return runAuction(await promotedCandidates(db, ctx));
}

/** What the slot shows (never the price per click). */
export interface PromotedSlotData {
  slot: PromotedSlot;
  placementId: number;
  offerId: number;
  productId: number;
  productSlug: string;
  productTitle: string;
  shopName: string;
  priceBani: number;
  shippingBani: number | null;
  shippingEstimated: boolean;
  totalBani: number;
  lastCheckedAt: string;
  /**
   * Lowest total among the product's live offers (new, in stock, checked within each shop's SLO,
   * marketplace sellers included: the product page's "cel mai mic preț total" rule), so the slot can
   * say when the promoted offer costs more. Null when none.
   */
  bestTotalBani: number | null;
  /** Shops with a live offer for the product (category slot: "compară N oferte"). */
  liveShops: number;
}

/** Runs the slot's auction and returns what to show (null: no eligible campaign). */
export async function promotedSlot(db: Exec, ctx: PromotedContext): Promise<PromotedSlotData | null> {
  const auction = await promotedAuction(db, ctx);
  if (!auction) return null;
  const w = auction.winner;
  const r = await db.execute<{
    slug: string;
    title: string;
    shop: string;
    price: string;
    shipping: string | null;
    estimated: boolean;
    total: string;
    checked: string;
    best: string | null;
    shops: number;
  }>(sql`
    SELECT p.slug, p.title, s.name AS shop, o.price::text, o.shipping_cost::text AS shipping, o.shipping_estimated AS estimated,
      o.total_price::text AS total, o.last_checked_at::text AS checked,
      (SELECT min(x.total_price)::text FROM offers x JOIN shops xs ON xs.id = x.shop_id
        WHERE x.product_id = p.id AND x.active AND x.match_status IN ('auto','manual') AND NOT x.blacklisted AND xs.status = 'active'
          AND x.availability = 'in_stock' AND x.condition = 'new'
          AND x.last_checked_at > now() - make_interval(hours => coalesce((xs.crawl_policy->>'freshness_slo_hours')::int, 26))) AS best,
      (SELECT count(DISTINCT x.shop_id)::int FROM offers x JOIN shops xs ON xs.id = x.shop_id
        WHERE x.product_id = p.id AND x.active AND x.match_status IN ('auto','manual') AND NOT x.blacklisted AND xs.status = 'active'
          AND x.last_checked_at > now() - make_interval(hours => coalesce((xs.crawl_policy->>'freshness_slo_hours')::int, 26))) AS shops
    FROM offers o JOIN shops s ON s.id = o.shop_id JOIN products p ON p.id = o.product_id
    WHERE o.id = ${w.offerId}`);
  const row = r.rows[0];
  if (!row) return null;
  return {
    slot: ctx.slot,
    placementId: w.placementId,
    offerId: w.offerId,
    productId: w.productId,
    productSlug: row.slug,
    productTitle: row.title,
    shopName: row.shop,
    priceBani: bani(row.price),
    shippingBani: row.shipping === null ? null : bani(row.shipping),
    shippingEstimated: row.estimated,
    totalBani: bani(row.total),
    lastCheckedAt: row.checked,
    bestTotalBani: row.best === null ? null : bani(row.best),
    liveShops: Number(row.shops),
  };
}

/** A product's category and its ancestors (leaf first); empty without a category. */
export async function productCategoryChain(db: Exec, productId: number): Promise<number[]> {
  const r = await db.execute<{ id: string }>(sql`
    SELECT c.id::text FROM products p JOIN categories pc ON pc.id = p.category_id
    JOIN categories c ON c.id = pc.id OR starts_with(pc.path, c.path || '/')
    WHERE p.id = ${productId} ORDER BY c.depth DESC`);
  return r.rows.map((x) => Number(x.id));
}

/** The target categories of a merchant's campaigns (cache tags of the pages its offers may appear on). */
export async function merchantPlacementCategories(db: Exec, merchantId: number): Promise<number[]> {
  const r = await db.execute<{ id: string }>(sql`SELECT DISTINCT category_id::text AS id FROM placements WHERE merchant_id = ${merchantId} AND status <> 'archived'`);
  return r.rows.map((x) => Number(x.id));
}

// ---------------------------------------------------------------------------------------------
// Click billing

export interface PromotedClickInput {
  placementId: number;
  offerId: number;
  slot: PromotedSlot;
  /** The category page of a category-slot click. */
  categoryId: number | null;
  clickId: number | null;
  sessionHash: string;
  ipHash: string;
  /** UTC day of the daily salt the hashes were made with (YYYY-MM-DD). */
  day: string;
  enabled: boolean;
  bot: boolean;
  prefetch: boolean;
  internalReferer: boolean;
}

export interface PromotedClickOutcome {
  /** False when the placement does not exist (nothing to attribute the click to). */
  recorded: boolean;
  billed: boolean;
  priceBani: number;
  reason: NotBilledReason | null;
  promotedClickId: number | null;
  merchantId: number | null;
  /** The merchant's campaigns may have dropped out of the auction (budget used up): refresh its slots. */
  exhausted: boolean;
}

async function insertNotBilled(db: Exec, i: PromotedClickInput, merchantId: number, productId: number | null, reason: NotBilledReason): Promise<number> {
  const r = await db.execute<{ id: string }>(sql`
    INSERT INTO promoted_clicks (click_id, placement_id, merchant_id, offer_id, product_id, category_id, slot, day, session_hash, ip_hash, status, reason, price)
    VALUES (${i.clickId}, ${i.placementId}, ${merchantId}, ${i.offerId}, ${productId}, ${i.categoryId}, ${i.slot}, ${i.day}, ${i.sessionHash}, ${i.ipHash}, 'not_billed', ${reason}, 0)
    RETURNING id::text`);
  return Number(r.rows[0]!.id);
}

/**
 * Records a click from a promoted slot and bills it when every rule passes (core
 * `decideClickBilling`). Billing runs in one transaction that first locks the merchant's wallet
 * row: every billing, top-up, refund and adjustment of that merchant is serialized, so the
 * duplicate check, the daily spend and the balance it reads are exact, and the balance can never go
 * below zero (CHECK constraint as the last guard). The auction is re-run at click time: a page
 * from an older cache never bills a campaign that has lost the slot or its budget.
 */
export async function billPromotedClick(db: Db, i: PromotedClickInput): Promise<PromotedClickOutcome> {
  const base = await db.execute<{ merchant_id: string; merchant_shop: string | null; offer_shop: string | null; product_id: string | null }>(sql`
    SELECT pl.merchant_id::text, m.shop_id::text AS merchant_shop,
      (SELECT o.shop_id::text FROM offers o WHERE o.id = ${i.offerId}) AS offer_shop,
      (SELECT o.product_id::text FROM offers o WHERE o.id = ${i.offerId}) AS product_id
    FROM placements pl JOIN merchants m ON m.id = pl.merchant_id WHERE pl.id = ${i.placementId}`);
  const b = base.rows[0];
  const none: PromotedClickOutcome = { recorded: false, billed: false, priceBani: 0, reason: null, promotedClickId: null, merchantId: null, exhausted: false };
  if (!b) return none;
  const merchantId = Number(b.merchant_id);
  const productId = b.product_id === null ? null : Number(b.product_id);
  const notBilled = async (reason: NotBilledReason): Promise<PromotedClickOutcome> => ({
    recorded: true,
    billed: false,
    priceBani: 0,
    reason,
    promotedClickId: await insertNotBilled(db, i, merchantId, productId, reason),
    merchantId,
    exhausted: false,
  });
  // Cheap refusals first (no lock): the decision function orders them the same way.
  const pre = decideClickBilling({ enabled: i.enabled, bot: i.bot, prefetch: i.prefetch, internalReferer: i.internalReferer, alreadyBilled: false, sessionClicks10Min: 0, ipClicksHour: 0, auction: null, placementId: i.placementId, offerId: i.offerId });
  if (!pre.bill && pre.reason !== 'ineligible') return notBilled(pre.reason);
  // A tampered link (the campaign is not the offer's merchant) or a category click without its page.
  if (b.offer_shop === null || b.offer_shop !== b.merchant_shop || productId === null || (i.slot === 'category' && i.categoryId === null)) return notBilled('ineligible');

  try {
    return await db.transaction(async (tx) => {
      const w = await tx.execute<{ balance: string }>(sql`SELECT balance::text FROM merchant_wallets WHERE merchant_id = ${merchantId} FOR UPDATE`);
      const wallet = w.rows[0];
      if (!wallet) return { ...none, recorded: true, reason: 'ineligible' as const, merchantId, promotedClickId: await insertNotBilled(tx, i, merchantId, productId, 'ineligible') };
      const counts = await tx.execute<{ billed: boolean; session10: number; ip60: number }>(sql`
        SELECT
          EXISTS (SELECT 1 FROM promoted_clicks WHERE offer_id = ${i.offerId} AND session_hash = ${i.sessionHash} AND day = ${i.day} AND status <> 'not_billed') AS billed,
          (SELECT count(*)::int FROM promoted_clicks WHERE session_hash = ${i.sessionHash} AND created_at > now() - interval '10 minutes') AS session10,
          (SELECT count(*)::int FROM promoted_clicks WHERE ip_hash = ${i.ipHash} AND created_at > now() - interval '1 hour') AS ip60`);
      const c = counts.rows[0]!;
      const ctx: PromotedContext = i.slot === 'product' ? { slot: 'product', productId } : { slot: 'category', categoryId: i.categoryId! };
      // A duplicate or held click is decided without running the auction.
      const held = c.billed || c.session10 >= RATE_HOLD.sessionPer10Min || c.ip60 >= RATE_HOLD.ipPerHour;
      const auction = held ? null : await promotedAuction(tx, ctx);
      const decision = decideClickBilling({
        enabled: true,
        bot: false,
        prefetch: false,
        internalReferer: true,
        alreadyBilled: c.billed,
        sessionClicks10Min: c.session10,
        ipClicksHour: c.ip60,
        auction,
        placementId: i.placementId,
        offerId: i.offerId,
      });
      if (!decision.bill) {
        return { ...none, recorded: true, reason: decision.reason, merchantId, promotedClickId: await insertNotBilled(tx, i, merchantId, productId, decision.reason) };
      }
      const price = decision.priceBani;
      const balance = bani(wallet.balance);
      const after = applyWalletMovement(balance, -price);
      const ins = await tx.execute<{ id: string }>(sql`
        INSERT INTO promoted_clicks (click_id, placement_id, merchant_id, offer_id, product_id, category_id, slot, day, session_hash, ip_hash, status, reason, price)
        VALUES (${i.clickId}, ${i.placementId}, ${merchantId}, ${i.offerId}, ${productId}, ${i.categoryId}, ${i.slot}, ${i.day}, ${i.sessionHash}, ${i.ipHash}, 'billed', NULL, ${money(price)})
        RETURNING id::text`);
      const pcId = Number(ins.rows[0]!.id);
      await tx.execute(sql`
        INSERT INTO wallet_ledger (merchant_id, kind, amount, balance_after, ref, promoted_click_id, actor)
        VALUES (${merchantId}, 'click', ${money(-price)}, ${money(after)}, ${`click:${pcId}`}, ${pcId}, 'system:promoted')`);
      const upd = await tx.execute(sql`UPDATE merchant_wallets SET balance = ${money(after)}, updated_at = now() WHERE merchant_id = ${merchantId} AND balance = ${money(balance)}`);
      if ((upd.rowCount ?? 0) !== 1) throw new Error('wallet changed under its lock');
      await audit(tx, 'system:promoted', 'promoted.click_billed', 'promoted_clicks', pcId, { balanceBani: balance }, {
        merchantId,
        placementId: i.placementId,
        offerId: i.offerId,
        slot: i.slot,
        priceBani: price,
        balanceBani: after,
      });
      // Will the merchant's campaigns still afford a click? (Display stops once they cannot.)
      const left = await tx.execute<{ low: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM placements pl WHERE pl.merchant_id = ${merchantId} AND pl.status = 'active' AND NOT pl.admin_hold
            AND (pl.bid > ${money(after)} OR pl.daily_cap - (SELECT coalesce(sum(pc.price), 0) FROM promoted_clicks pc
              WHERE pc.placement_id = pl.id AND pc.status = 'billed' AND pc.created_at >= ${BUCHAREST_DAY_START}) < pl.bid)
        ) AS low`);
      return { recorded: true, billed: true, priceBani: price, reason: null, promotedClickId: pcId, merchantId, exhausted: left.rows[0]?.low === true };
    });
  } catch (err) {
    // The unique index caught a concurrent duplicate (same session, offer and day): nothing was billed.
    if (isUniqueViolation(err)) return notBilled('duplicate');
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// Wallets, top-ups, refunds, adjustments

export interface WalletRow {
  merchantId: number;
  balanceBani: number;
  termsVersion: string;
  termsAcceptedAt: Date;
}

export async function getWallet(db: Exec, merchantId: number): Promise<WalletRow | null> {
  const r = await db.execute<{ balance: string; terms_version: string; terms_accepted_at: string }>(sql`
    SELECT balance::text, terms_version, terms_accepted_at::text FROM merchant_wallets WHERE merchant_id = ${merchantId}`);
  const w = r.rows[0];
  return w ? { merchantId, balanceBani: bani(w.balance), termsVersion: w.terms_version, termsAcceptedAt: new Date(w.terms_accepted_at) } : null;
}

/** Opens the wallet when the merchant accepts the promoted-placement terms (idempotent). */
export async function acceptPromotedTerms(db: Db, merchantId: number, termsVersion: string, actor: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const r = await tx.execute(sql`
      INSERT INTO merchant_wallets (merchant_id, balance, terms_version, terms_accepted_at) VALUES (${merchantId}, 0, ${termsVersion}, now())
      ON CONFLICT (merchant_id) DO NOTHING`);
    const created = (r.rowCount ?? 0) > 0;
    if (created) await audit(tx, actor, 'promoted.terms_accepted', 'merchant_wallets', merchantId, null, { termsVersion });
    return created;
  });
}

export interface NewTopUp {
  id: number;
  netBani: number;
  vatBani: number;
  grossBani: number;
}

/**
 * A top-up request before the provider is called (status `created`), with the buyer's company name
 * and CUI copied from the profile for the invoice. Needs an open wallet.
 */
export async function createTopUp(db: Db, input: { merchantId: number; provider: string; netBani: number; vatBani: number; vatPercent: number; actor: string }): Promise<NewTopUp> {
  if (!Number.isSafeInteger(input.netBani) || input.netBani <= 0 || !Number.isSafeInteger(input.vatBani) || input.vatBani < 0) throw new PromotedError('invalid');
  const gross = input.netBani + input.vatBani;
  return db.transaction(async (tx) => {
    const r = await tx.execute<{ id: string }>(sql`
      INSERT INTO wallet_topups (merchant_id, provider, status, net, vat, gross, vat_percent, billing_name, billing_cui, created_by)
      SELECT ${input.merchantId}, ${input.provider}, 'created', ${money(input.netBani)}, ${money(input.vatBani)}, ${money(gross)}, ${input.vatPercent}, m.company_name, m.cui, ${input.actor}
      FROM merchant_wallets w LEFT JOIN merchants m ON m.id = w.merchant_id WHERE w.merchant_id = ${input.merchantId}
      RETURNING id::text`);
    if (!r.rows[0]) throw new PromotedError('no_wallet');
    const id = Number(r.rows[0]!.id);
    await audit(tx, input.actor, 'promoted.topup_started', 'wallet_topups', id, null, { merchantId: input.merchantId, netBani: input.netBani, vatBani: input.vatBani, grossBani: gross, provider: input.provider });
    return { id, netBani: input.netBani, vatBani: input.vatBani, grossBani: gross };
  });
}

/** The provider opened a checkout for the top-up: remember its id (webhooks are matched on it). */
export async function setTopUpCheckout(db: Exec, topupId: number, externalId: string): Promise<void> {
  await db.execute(sql`UPDATE wallet_topups SET external_id = ${externalId}, status = 'pending', updated_at = now() WHERE id = ${topupId} AND status = 'created'`);
}

/**
 * A webhook for a checkout whose id was never stored (saving it failed after the provider had
 * answered): binds it to our top-up by the reference the provider echoes back. Never rebinds.
 */
export async function bindTopUpCheckout(db: Exec, input: { topupId: number; provider: string; externalId: string }): Promise<boolean> {
  const r = await db.execute(sql`
    UPDATE wallet_topups SET external_id = ${input.externalId}, status = CASE WHEN status = 'created' THEN 'pending' ELSE status END, updated_at = now()
    WHERE id = ${input.topupId} AND provider = ${input.provider} AND external_id IS NULL`);
  return (r.rowCount ?? 0) > 0;
}

export async function failTopUp(db: Exec, topupId: number): Promise<void> {
  await db.execute(sql`UPDATE wallet_topups SET status = 'failed', updated_at = now() WHERE id = ${topupId} AND status IN ('created','pending')`);
}

/** Promoted-placement changes an actor made in the last 24 hours (campaign edits, terms, top-ups): a cap against abuse. */
export async function promotedActionsLastDay(db: Exec, actor: string): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM audit_log WHERE actor = ${actor} AND action LIKE 'promoted.%' AND ts > now() - interval '24 hours'`);
  return r.rows[0]?.n ?? 0;
}

/** Top-ups a merchant started in the last 24 hours (a cap against checkout spam). */
export async function topUpsLastDay(db: Exec, merchantId: number): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM wallet_topups WHERE merchant_id = ${merchantId} AND created_at > now() - interval '24 hours'`);
  return r.rows[0]?.n ?? 0;
}

export type CreditResult =
  | { result: 'credited'; merchantId: number; netBani: number; balanceBani: number; topupId: number }
  | { result: 'duplicate'; merchantId: number; topupId: number }
  | { result: 'unknown' }
  | { result: 'mismatch'; merchantId: number; topupId: number };

/**
 * Credits a paid top-up exactly once (the provider's signed webhook): the top-up row and then the
 * wallet are locked, the paid amount and currency must equal what we asked for, the ledger row's
 * `ref` (`<provider>:<checkout id>`) is unique. A retried or duplicated event is a no-op.
 */
export async function creditTopUp(
  db: Db,
  input: { provider: string; externalId: string; eventId: string; paidGrossBani: number; currency: string; actor: string },
): Promise<CreditResult> {
  return db.transaction(async (tx) => {
    const t = await tx.execute<{ id: string; merchant_id: string; status: string; net: string; gross: string; currency: string }>(sql`
      SELECT id::text, merchant_id::text, status, net::text, gross::text, currency FROM wallet_topups
      WHERE provider = ${input.provider} AND external_id = ${input.externalId} FOR UPDATE`);
    const topup = t.rows[0];
    if (!topup) return { result: 'unknown' as const };
    const topupId = Number(topup.id);
    const merchantId = Number(topup.merchant_id);
    if (topup.status === 'paid') return { result: 'duplicate' as const, merchantId, topupId };
    if (input.currency.toUpperCase() !== topup.currency.toUpperCase() || input.paidGrossBani !== bani(topup.gross)) {
      await audit(tx, input.actor, 'promoted.topup_mismatch', 'wallet_topups', topupId, null, {
        eventId: input.eventId,
        paidGrossBani: input.paidGrossBani,
        currency: input.currency,
        expectedGrossBani: bani(topup.gross),
      });
      return { result: 'mismatch' as const, merchantId, topupId };
    }
    const w = await tx.execute<{ balance: string }>(sql`SELECT balance::text FROM merchant_wallets WHERE merchant_id = ${merchantId} FOR UPDATE`);
    if (!w.rows[0]) throw new PromotedError('no_wallet');
    const net = bani(topup.net);
    const before = bani(w.rows[0].balance);
    const after = applyWalletMovement(before, net);
    const ref = `${input.provider}:${input.externalId}`;
    const led = await tx.execute(sql`
      INSERT INTO wallet_ledger (merchant_id, kind, amount, balance_after, ref, topup_id, actor, note)
      VALUES (${merchantId}, 'topup', ${money(net)}, ${money(after)}, ${ref}, ${topupId}, ${input.actor}, ${`event ${input.eventId}`})
      ON CONFLICT (ref) DO NOTHING`);
    if ((led.rowCount ?? 0) === 0) return { result: 'duplicate' as const, merchantId, topupId };
    await tx.execute(sql`UPDATE merchant_wallets SET balance = ${money(after)}, updated_at = now() WHERE merchant_id = ${merchantId}`);
    await tx.execute(sql`UPDATE wallet_topups SET status = 'paid', paid_at = now(), event_id = ${input.eventId}, updated_at = now() WHERE id = ${topupId}`);
    await audit(tx, input.actor, 'promoted.topup_credited', 'merchant_wallets', merchantId, { balanceBani: before }, { balanceBani: after, netBani: net, topupId, eventId: input.eventId });
    return { result: 'credited' as const, merchantId, netBani: net, balanceBani: after, topupId };
  });
}

/** A checkout that expired or failed: the top-up closes without any money moving. */
export async function closeTopUp(db: Exec, input: { provider: string; externalId: string; eventId: string; status: 'expired' | 'failed' }): Promise<boolean> {
  const r = await db.execute(sql`
    UPDATE wallet_topups SET status = ${input.status}, event_id = ${input.eventId}, updated_at = now()
    WHERE provider = ${input.provider} AND external_id = ${input.externalId} AND status IN ('created','pending')`);
  return (r.rowCount ?? 0) > 0;
}

/** Gives a billed click back to the merchant's wallet (admin; fraud found later, a wrong charge). */
export async function refundPromotedClick(db: Db, input: { promotedClickId: number; actor: string; reason: string }): Promise<{ merchantId: number; priceBani: number; balanceBani: number }> {
  return db.transaction(async (tx) => {
    const c = await tx.execute<{ merchant_id: string; price: string; status: string }>(sql`
      SELECT merchant_id::text, price::text, status FROM promoted_clicks WHERE id = ${input.promotedClickId} FOR UPDATE`);
    const click = c.rows[0];
    if (!click) throw new PromotedError('not_found');
    if (click.status !== 'billed') throw new PromotedError('bad_status');
    const merchantId = Number(click.merchant_id);
    const w = await tx.execute<{ balance: string }>(sql`SELECT balance::text FROM merchant_wallets WHERE merchant_id = ${merchantId} FOR UPDATE`);
    if (!w.rows[0]) throw new PromotedError('no_wallet');
    const price = bani(click.price);
    const before = bani(w.rows[0].balance);
    const after = applyWalletMovement(before, price);
    await tx.execute(sql`
      INSERT INTO wallet_ledger (merchant_id, kind, amount, balance_after, ref, promoted_click_id, actor, note)
      VALUES (${merchantId}, 'click_refund', ${money(price)}, ${money(after)}, ${`refund:click:${input.promotedClickId}`}, ${input.promotedClickId}, ${input.actor}, ${input.reason})`);
    await tx.execute(sql`UPDATE merchant_wallets SET balance = ${money(after)}, updated_at = now() WHERE merchant_id = ${merchantId}`);
    await tx.execute(sql`UPDATE promoted_clicks SET status = 'refunded', refunded_at = now(), refund_reason = ${input.reason} WHERE id = ${input.promotedClickId}`);
    await audit(tx, input.actor, 'promoted.click_refunded', 'promoted_clicks', input.promotedClickId, { balanceBani: before }, { balanceBani: after, priceBani: price, reason: input.reason });
    return { merchantId, priceBani: price, balanceBani: after };
  });
}

/**
 * An admin credit or debit (a bank transfer recorded by hand, a refund made in the provider's
 * dashboard, a goodwill credit). `token` makes a double-submitted form apply once. A debit never
 * takes the wallet below zero.
 */
export async function adjustWallet(
  db: Db,
  input: { merchantId: number; amountBani: number; actor: string; note: string; token?: string },
): Promise<{ applied: boolean; balanceBani: number }> {
  return db.transaction(async (tx) => {
    const w = await tx.execute<{ balance: string }>(sql`SELECT balance::text FROM merchant_wallets WHERE merchant_id = ${input.merchantId} FOR UPDATE`);
    if (!w.rows[0]) throw new PromotedError('no_wallet');
    const before = bani(w.rows[0].balance);
    let after: number;
    try {
      after = applyWalletMovement(before, input.amountBani);
    } catch (err) {
      if (err instanceof WalletError) throw new PromotedError(err.code === 'insufficient' ? 'insufficient' : 'invalid');
      throw err;
    }
    const led = await tx.execute(sql`
      INSERT INTO wallet_ledger (merchant_id, kind, amount, balance_after, ref, actor, note)
      VALUES (${input.merchantId}, 'adjustment', ${money(input.amountBani)}, ${money(after)}, ${`adjust:${input.token ?? randomUUID()}`}, ${input.actor}, ${input.note})
      ON CONFLICT (ref) DO NOTHING`);
    if ((led.rowCount ?? 0) === 0) return { applied: false, balanceBani: before };
    await tx.execute(sql`UPDATE merchant_wallets SET balance = ${money(after)}, updated_at = now() WHERE merchant_id = ${input.merchantId}`);
    await audit(tx, input.actor, 'promoted.wallet_adjusted', 'merchant_wallets', input.merchantId, { balanceBani: before }, { balanceBani: after, amountBani: input.amountBani, note: input.note });
    return { applied: true, balanceBani: after };
  });
}

// ---------------------------------------------------------------------------------------------
// Campaigns and floors

export interface PlacementInput {
  merchantId: number;
  categoryId: number;
  priceBand: PriceBandKey | null;
  bidBani: number;
  dailyCapBani: number;
  actor: string;
}

export async function createPlacement(db: Db, input: PlacementInput): Promise<number> {
  try {
    return await db.transaction(async (tx) => {
      const r = await tx.execute<{ id: string }>(sql`
        INSERT INTO placements (merchant_id, category_id, price_band, bid, daily_cap)
        VALUES (${input.merchantId}, ${input.categoryId}, ${input.priceBand}, ${money(input.bidBani)}, ${money(input.dailyCapBani)})
        RETURNING id::text`);
      const id = Number(r.rows[0]!.id);
      await audit(tx, input.actor, 'promoted.placement_created', 'placements', id, null, {
        merchantId: input.merchantId,
        categoryId: input.categoryId,
        priceBand: input.priceBand,
        bidBani: input.bidBani,
        dailyCapBani: input.dailyCapBani,
      });
      return id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new PromotedError('exists');
    throw err;
  }
}

/** Changes a campaign's bid and daily cap (its own merchant only; never an archived campaign). */
export async function updatePlacement(db: Db, input: { placementId: number; merchantId: number; bidBani: number; dailyCapBani: number; actor: string }): Promise<number> {
  return db.transaction(async (tx) => {
    const b = await tx.execute<{ bid: string; daily_cap: string; category_id: string }>(sql`
      SELECT bid::text, daily_cap::text, category_id::text FROM placements
      WHERE id = ${input.placementId} AND merchant_id = ${input.merchantId} AND status <> 'archived' FOR UPDATE`);
    const before = b.rows[0];
    if (!before) throw new PromotedError('not_found');
    await tx.execute(sql`UPDATE placements SET bid = ${money(input.bidBani)}, daily_cap = ${money(input.dailyCapBani)}, updated_at = now() WHERE id = ${input.placementId}`);
    await audit(tx, input.actor, 'promoted.placement_updated', 'placements', input.placementId, { bidBani: bani(before.bid), dailyCapBani: bani(before.daily_cap) }, { bidBani: input.bidBani, dailyCapBani: input.dailyCapBani });
    return Number(before.category_id);
  });
}

/** Merchant pause/resume/archive of its own campaign (archived is final). Returns the target category. */
export async function setPlacementStatus(db: Db, input: { placementId: number; merchantId: number; status: PlacementStatus; actor: string }): Promise<number> {
  return db.transaction(async (tx) => {
    const b = await tx.execute<{ status: string; category_id: string }>(sql`
      SELECT status, category_id::text FROM placements WHERE id = ${input.placementId} AND merchant_id = ${input.merchantId} FOR UPDATE`);
    const before = b.rows[0];
    if (!before) throw new PromotedError('not_found');
    if (before.status === 'archived') throw new PromotedError('bad_status');
    await tx.execute(sql`UPDATE placements SET status = ${input.status}, updated_at = now() WHERE id = ${input.placementId}`);
    await audit(tx, input.actor, 'promoted.placement_status', 'placements', input.placementId, { status: before.status }, { status: input.status });
    return Number(before.category_id);
  });
}

/** Admin pause (with a reason the merchant sees) or release of a campaign. Returns the target category and merchant. */
export async function setPlacementHold(db: Db, input: { placementId: number; hold: boolean; reason: string | null; actor: string }): Promise<{ categoryId: number; merchantId: number }> {
  return db.transaction(async (tx) => {
    const b = await tx.execute<{ admin_hold: boolean; category_id: string; merchant_id: string }>(sql`
      SELECT admin_hold, category_id::text, merchant_id::text FROM placements WHERE id = ${input.placementId} FOR UPDATE`);
    const before = b.rows[0];
    if (!before) throw new PromotedError('not_found');
    await tx.execute(sql`UPDATE placements SET admin_hold = ${input.hold}, admin_hold_reason = ${input.hold ? input.reason : null}, updated_at = now() WHERE id = ${input.placementId}`);
    await audit(tx, input.actor, input.hold ? 'promoted.placement_hold' : 'promoted.placement_release', 'placements', input.placementId, { adminHold: before.admin_hold }, { adminHold: input.hold, reason: input.reason });
    return { categoryId: Number(before.category_id), merchantId: Number(before.merchant_id) };
  });
}

export interface FloorListRow {
  id: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryPath: string | null;
  band: PriceBandKey;
  floorBani: number;
  capBani: number;
  updatedBy: string;
  updatedAt: string;
}

export async function listFloors(db: Exec): Promise<FloorListRow[]> {
  const r = await db.execute<{ id: string; category_id: string | null; name: string | null; path: string | null; price_band: string; floor: string; cap: string; updated_by: string; updated_at: string }>(sql`
    SELECT f.id::text, f.category_id::text, c.name_ro AS name, c.path, f.price_band, f.floor::text, f.cap::text, f.updated_by, f.updated_at::text
    FROM placement_floors f LEFT JOIN categories c ON c.id = f.category_id ORDER BY c.path NULLS FIRST, f.price_band`);
  return r.rows.map((x) => ({
    id: Number(x.id),
    categoryId: x.category_id === null ? null : Number(x.category_id),
    categoryName: x.name,
    categoryPath: x.path,
    band: x.price_band as PriceBandKey,
    floorBani: bani(x.floor),
    capBani: bani(x.cap),
    updatedBy: x.updated_by,
    updatedAt: x.updated_at,
  }));
}

export async function upsertFloor(db: Db, input: { categoryId: number | null; band: PriceBandKey; floorBani: number; capBani: number; actor: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const prev = await tx.execute<{ floor: string; cap: string }>(sql`
      SELECT floor::text, cap::text FROM placement_floors WHERE coalesce(category_id, 0) = ${input.categoryId ?? 0} AND price_band = ${input.band} FOR UPDATE`);
    await tx.execute(sql`
      INSERT INTO placement_floors (category_id, price_band, floor, cap, updated_by) VALUES (${input.categoryId}, ${input.band}, ${money(input.floorBani)}, ${money(input.capBani)}, ${input.actor})
      ON CONFLICT (coalesce(category_id, 0), price_band) DO UPDATE SET floor = EXCLUDED.floor, cap = EXCLUDED.cap, updated_by = EXCLUDED.updated_by, updated_at = now()`);
    const before = prev.rows[0] ? { floorBani: bani(prev.rows[0].floor), capBani: bani(prev.rows[0].cap) } : null;
    await audit(tx, input.actor, 'promoted.floor_set', 'placement_floors', `${input.categoryId ?? 'site'}:${input.band}`, before, { floorBani: input.floorBani, capBani: input.capBani });
  });
}

export async function deleteFloor(db: Db, input: { id: number; actor: string }): Promise<number | null> {
  return db.transaction(async (tx) => {
    const r = await tx.execute<{ category_id: string | null; price_band: string; floor: string; cap: string }>(sql`
      DELETE FROM placement_floors WHERE id = ${input.id} RETURNING category_id::text, price_band, floor::text, cap::text`);
    const row = r.rows[0];
    if (!row) return null;
    await audit(tx, input.actor, 'promoted.floor_deleted', 'placement_floors', `${row.category_id ?? 'site'}:${row.price_band}`, { floorBani: bani(row.floor), capBani: bani(row.cap) }, null);
    return row.category_id === null ? null : Number(row.category_id);
  });
}

// ---------------------------------------------------------------------------------------------
// Numbers for the merchant and admin pages

export interface MerchantPlacementRow {
  id: number;
  categoryId: number;
  categoryName: string;
  categoryPath: string;
  priceBand: PriceBandKey | null;
  bidBani: number;
  dailyCapBani: number;
  status: PlacementStatus;
  adminHold: boolean;
  adminHoldReason: string | null;
  spentTodayBani: number;
  billedToday: number;
  spend30Bani: number;
  billed30: number;
}

export interface MerchantPromotedSummary {
  wallet: WalletRow | null;
  spentTodayBani: number;
  spend30Bani: number;
  billed30: number;
  /** Clicks from the slot that were not billed, by reason (30 days). */
  notBilled30: Record<string, number>;
  /** Average cost per billed click over 30 days (null: no click). */
  cpc30Bani: number | null;
  placements: MerchantPlacementRow[];
  ledger: Array<{ id: number; kind: string; amountBani: number; balanceAfterBani: number; note: string | null; createdAt: string }>;
  topups: Array<{ id: number; status: string; netBani: number; vatBani: number; grossBani: number; createdAt: string; paidAt: string | null }>;
}

export async function merchantPromotedSummary(db: Exec, merchantId: number): Promise<MerchantPromotedSummary> {
  const [wallet, placementsRes, clicks, ledger, topups] = await Promise.all([
    getWallet(db, merchantId),
    db.execute<{
      id: string;
      category_id: string;
      name: string;
      path: string;
      price_band: string | null;
      bid: string;
      daily_cap: string;
      status: PlacementStatus;
      admin_hold: boolean;
      admin_hold_reason: string | null;
      spent_today: string;
      billed_today: number;
      spend30: string;
      billed30: number;
    }>(sql`
      SELECT pl.id::text, pl.category_id::text, c.name_ro AS name, c.path, pl.price_band, pl.bid::text, pl.daily_cap::text, pl.status, pl.admin_hold, pl.admin_hold_reason,
        coalesce(sum(pc.price) FILTER (WHERE pc.status = 'billed' AND pc.created_at >= ${BUCHAREST_DAY_START}), 0)::text AS spent_today,
        count(pc.id) FILTER (WHERE pc.status = 'billed' AND pc.created_at >= ${BUCHAREST_DAY_START})::int AS billed_today,
        coalesce(sum(pc.price) FILTER (WHERE pc.status = 'billed'), 0)::text AS spend30,
        count(pc.id) FILTER (WHERE pc.status = 'billed')::int AS billed30
      FROM placements pl JOIN categories c ON c.id = pl.category_id
      LEFT JOIN promoted_clicks pc ON pc.placement_id = pl.id AND pc.created_at > now() - interval '30 days'
      WHERE pl.merchant_id = ${merchantId} AND pl.status <> 'archived'
      GROUP BY pl.id, c.name_ro, c.path ORDER BY pl.id`),
    db.execute<{ status: string; reason: string | null; n: number; amount: string; today: string }>(sql`
      SELECT status, reason, count(*)::int AS n, coalesce(sum(price), 0)::text AS amount,
        coalesce(sum(price) FILTER (WHERE status = 'billed' AND created_at >= ${BUCHAREST_DAY_START}), 0)::text AS today
      FROM promoted_clicks WHERE merchant_id = ${merchantId} AND created_at > now() - interval '30 days' GROUP BY status, reason`),
    db.execute<{ id: string; kind: string; amount: string; balance_after: string; note: string | null; created_at: string }>(sql`
      SELECT id::text, kind, amount::text, balance_after::text, note, created_at::text FROM wallet_ledger WHERE merchant_id = ${merchantId} ORDER BY id DESC LIMIT 20`),
    db.execute<{ id: string; status: string; net: string; vat: string; gross: string; created_at: string; paid_at: string | null }>(sql`
      SELECT id::text, status, net::text, vat::text, gross::text, created_at::text, paid_at::text FROM wallet_topups WHERE merchant_id = ${merchantId} ORDER BY id DESC LIMIT 10`),
  ]);
  let spend30 = 0;
  let billed30 = 0;
  let spentToday = 0;
  const notBilled30: Record<string, number> = {};
  for (const r of clicks.rows) {
    if (r.status === 'billed') {
      spend30 += bani(r.amount);
      billed30 += r.n;
      spentToday += bani(r.today);
    } else if (r.status === 'not_billed') notBilled30[r.reason ?? 'necunoscut'] = (notBilled30[r.reason ?? 'necunoscut'] ?? 0) + r.n;
  }
  return {
    wallet,
    spentTodayBani: spentToday,
    spend30Bani: spend30,
    billed30,
    notBilled30,
    cpc30Bani: billed30 > 0 ? Math.round(spend30 / billed30) : null,
    placements: placementsRes.rows.map((p) => ({
      id: Number(p.id),
      categoryId: Number(p.category_id),
      categoryName: p.name,
      categoryPath: p.path,
      priceBand: isPriceBandKey(p.price_band) ? p.price_band : null,
      bidBani: bani(p.bid),
      dailyCapBani: bani(p.daily_cap),
      status: p.status,
      adminHold: p.admin_hold,
      adminHoldReason: p.admin_hold_reason,
      spentTodayBani: bani(p.spent_today),
      billedToday: p.billed_today,
      spend30Bani: bani(p.spend30),
      billed30: p.billed30,
    })),
    ledger: ledger.rows.map((l) => ({ id: Number(l.id), kind: l.kind, amountBani: bani(l.amount), balanceAfterBani: bani(l.balance_after), note: l.note, createdAt: l.created_at })),
    topups: topups.rows.map((t) => ({ id: Number(t.id), status: t.status, netBani: bani(t.net), vatBani: bani(t.vat), grossBani: bani(t.gross), createdAt: t.created_at, paidAt: t.paid_at })),
  };
}

export interface AdminPromotedOverview {
  walletsTotalBani: number;
  /** Every wallet; `status` null: the merchant profile was deleted (a balance left must be refunded). */
  wallets: Array<{ merchantId: number; shopName: string | null; companyName: string | null; status: string | null; balanceBani: number; spend30Bani: number; billed30: number }>;
  placements: Array<{
    id: number;
    merchantId: number;
    shopName: string | null;
    categoryName: string;
    priceBand: PriceBandKey | null;
    bidBani: number;
    dailyCapBani: number;
    status: PlacementStatus;
    adminHold: boolean;
    adminHoldReason: string | null;
    spentTodayBani: number;
  }>;
  clicks: Array<{ id: number; createdAt: string; merchantId: number; shopName: string | null; offerId: number; slot: string; status: string; reason: string | null; priceBani: number }>;
  byReason30: Record<string, number>;
  spendTodayBani: number;
  spend30Bani: number;
  billed30: number;
  topups30: { paidBani: number; paid: number; pending: number };
}

export async function adminPromotedOverview(db: Exec): Promise<AdminPromotedOverview> {
  const [wallets, placementsRes, clicks, reasons, topups] = await Promise.all([
    db.execute<{ merchant_id: string; shop_name: string | null; company_name: string | null; status: string | null; balance: string; spend30: string; billed30: number }>(sql`
      SELECT w.merchant_id::text, m.shop_name, m.company_name, m.status, w.balance::text,
        coalesce((SELECT sum(price) FROM promoted_clicks pc WHERE pc.merchant_id = w.merchant_id AND pc.status = 'billed' AND pc.created_at > now() - interval '30 days'), 0)::text AS spend30,
        (SELECT count(*)::int FROM promoted_clicks pc WHERE pc.merchant_id = w.merchant_id AND pc.status = 'billed' AND pc.created_at > now() - interval '30 days') AS billed30
      FROM merchant_wallets w LEFT JOIN merchants m ON m.id = w.merchant_id ORDER BY w.merchant_id`),
    db.execute<{
      id: string;
      merchant_id: string;
      shop_name: string | null;
      name: string;
      price_band: string | null;
      bid: string;
      daily_cap: string;
      status: PlacementStatus;
      admin_hold: boolean;
      admin_hold_reason: string | null;
      spent_today: string;
    }>(sql`
      SELECT pl.id::text, pl.merchant_id::text, m.shop_name, c.name_ro AS name, pl.price_band, pl.bid::text, pl.daily_cap::text, pl.status, pl.admin_hold, pl.admin_hold_reason,
        coalesce((SELECT sum(price) FROM promoted_clicks pc WHERE pc.placement_id = pl.id AND pc.status = 'billed' AND pc.created_at >= ${BUCHAREST_DAY_START}), 0)::text AS spent_today
      FROM placements pl JOIN merchants m ON m.id = pl.merchant_id JOIN categories c ON c.id = pl.category_id
      WHERE pl.status <> 'archived' ORDER BY pl.id`),
    db.execute<{ id: string; created_at: string; merchant_id: string; shop_name: string | null; offer_id: string; slot: string; status: string; reason: string | null; price: string }>(sql`
      SELECT pc.id::text, pc.created_at::text, pc.merchant_id::text, m.shop_name, pc.offer_id::text, pc.slot, pc.status, pc.reason, pc.price::text
      FROM promoted_clicks pc LEFT JOIN merchants m ON m.id = pc.merchant_id ORDER BY pc.id DESC LIMIT 50`),
    db.execute<{ status: string; reason: string | null; n: number; amount: string; today: string }>(sql`
      SELECT status, reason, count(*)::int AS n, coalesce(sum(price), 0)::text AS amount,
        coalesce(sum(price) FILTER (WHERE status = 'billed' AND created_at >= ${BUCHAREST_DAY_START}), 0)::text AS today
      FROM promoted_clicks WHERE created_at > now() - interval '30 days' GROUP BY status, reason`),
    db.execute<{ paid: string; n_paid: number; n_pending: number }>(sql`
      SELECT coalesce(sum(net) FILTER (WHERE status = 'paid'), 0)::text AS paid, count(*) FILTER (WHERE status = 'paid')::int AS n_paid,
        count(*) FILTER (WHERE status IN ('created','pending'))::int AS n_pending
      FROM wallet_topups WHERE created_at > now() - interval '30 days'`),
  ]);
  const byReason30: Record<string, number> = {};
  let spend30 = 0;
  let billed30 = 0;
  let spendToday = 0;
  for (const r of reasons.rows) {
    if (r.status === 'billed') {
      spend30 += bani(r.amount);
      billed30 += r.n;
      spendToday += bani(r.today);
    } else if (r.status === 'not_billed') byReason30[r.reason ?? '?'] = (byReason30[r.reason ?? '?'] ?? 0) + r.n;
    else byReason30.refunded = (byReason30.refunded ?? 0) + r.n;
  }
  const wl = wallets.rows.map((w) => ({
    merchantId: Number(w.merchant_id),
    shopName: w.shop_name,
    companyName: w.company_name,
    status: w.status,
    balanceBani: bani(w.balance),
    spend30Bani: bani(w.spend30),
    billed30: w.billed30,
  }));
  return {
    walletsTotalBani: wl.reduce((s, w) => s + w.balanceBani, 0),
    wallets: wl,
    placements: placementsRes.rows.map((p) => ({
      id: Number(p.id),
      merchantId: Number(p.merchant_id),
      shopName: p.shop_name,
      categoryName: p.name,
      priceBand: isPriceBandKey(p.price_band) ? p.price_band : null,
      bidBani: bani(p.bid),
      dailyCapBani: bani(p.daily_cap),
      status: p.status,
      adminHold: p.admin_hold,
      adminHoldReason: p.admin_hold_reason,
      spentTodayBani: bani(p.spent_today),
    })),
    clicks: clicks.rows.map((c) => ({
      id: Number(c.id),
      createdAt: c.created_at,
      merchantId: Number(c.merchant_id),
      shopName: c.shop_name,
      offerId: Number(c.offer_id),
      slot: c.slot,
      status: c.status,
      reason: c.reason,
      priceBani: bani(c.price),
    })),
    byReason30,
    spendTodayBani: spendToday,
    spend30Bani: spend30,
    billed30,
    topups30: { paidBani: bani(topups.rows[0]?.paid), paid: topups.rows[0]?.n_paid ?? 0, pending: topups.rows[0]?.n_pending ?? 0 },
  };
}

export interface MonthlyStatementRow {
  merchantId: number;
  companyName: string | null;
  cui: string | null;
  shopName: string | null;
  openingBani: number;
  topupsNetBani: number;
  topupsVatBani: number;
  topupsGrossBani: number;
  topups: number;
  clicksBani: number;
  clicks: number;
  refundsBani: number;
  adjustmentsBani: number;
  closingBani: number;
}

/**
 * Per-merchant statement of a calendar month (Europe/Bucharest) for the accountant: opening and
 * closing balances from the ledger, paid top-ups (net, VAT, gross), billed clicks, refunds and
 * adjustments. Opening + movements = closing (checked by the tests).
 */
export async function monthlyPromotedStatement(db: Exec, month: string): Promise<MonthlyStatementRow[]> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new PromotedError('invalid');
  const start = sql`((${`${month}-01`})::date::timestamp AT TIME ZONE 'Europe/Bucharest')`;
  const end = sql`(((${`${month}-01`})::date + interval '1 month')::timestamp AT TIME ZONE 'Europe/Bucharest')`;
  const r = await db.execute<{
    merchant_id: string;
    company_name: string | null;
    cui: string | null;
    shop_name: string | null;
    opening: string;
    topups_net: string;
    topups: number;
    clicks: string;
    n_clicks: number;
    refunds: string;
    adjustments: string;
    vat: string;
    gross: string;
  }>(sql`
    WITH ids AS (SELECT DISTINCT merchant_id FROM wallet_ledger WHERE created_at < ${end})
    SELECT ids.merchant_id::text,
      coalesce(m.company_name, (SELECT t.billing_name FROM wallet_topups t WHERE t.merchant_id = ids.merchant_id AND t.billing_name IS NOT NULL ORDER BY t.id DESC LIMIT 1)) AS company_name,
      coalesce(m.cui, (SELECT t.billing_cui FROM wallet_topups t WHERE t.merchant_id = ids.merchant_id AND t.billing_cui IS NOT NULL ORDER BY t.id DESC LIMIT 1)) AS cui,
      m.shop_name,
      coalesce((SELECT sum(amount) FROM wallet_ledger l WHERE l.merchant_id = ids.merchant_id AND l.created_at < ${start}), 0)::text AS opening,
      coalesce((SELECT sum(amount) FROM wallet_ledger l WHERE l.merchant_id = ids.merchant_id AND l.kind = 'topup' AND l.created_at >= ${start} AND l.created_at < ${end}), 0)::text AS topups_net,
      (SELECT count(*)::int FROM wallet_ledger l WHERE l.merchant_id = ids.merchant_id AND l.kind = 'topup' AND l.created_at >= ${start} AND l.created_at < ${end}) AS topups,
      coalesce((SELECT -sum(amount) FROM wallet_ledger l WHERE l.merchant_id = ids.merchant_id AND l.kind = 'click' AND l.created_at >= ${start} AND l.created_at < ${end}), 0)::text AS clicks,
      (SELECT count(*)::int FROM wallet_ledger l WHERE l.merchant_id = ids.merchant_id AND l.kind = 'click' AND l.created_at >= ${start} AND l.created_at < ${end}) AS n_clicks,
      coalesce((SELECT sum(amount) FROM wallet_ledger l WHERE l.merchant_id = ids.merchant_id AND l.kind = 'click_refund' AND l.created_at >= ${start} AND l.created_at < ${end}), 0)::text AS refunds,
      coalesce((SELECT sum(amount) FROM wallet_ledger l WHERE l.merchant_id = ids.merchant_id AND l.kind = 'adjustment' AND l.created_at >= ${start} AND l.created_at < ${end}), 0)::text AS adjustments,
      coalesce((SELECT sum(t.vat) FROM wallet_ledger l JOIN wallet_topups t ON t.id = l.topup_id WHERE l.merchant_id = ids.merchant_id AND l.kind = 'topup' AND l.created_at >= ${start} AND l.created_at < ${end}), 0)::text AS vat,
      coalesce((SELECT sum(t.gross) FROM wallet_ledger l JOIN wallet_topups t ON t.id = l.topup_id WHERE l.merchant_id = ids.merchant_id AND l.kind = 'topup' AND l.created_at >= ${start} AND l.created_at < ${end}), 0)::text AS gross
    FROM ids LEFT JOIN merchants m ON m.id = ids.merchant_id ORDER BY ids.merchant_id`);
  return r.rows.map((x) => {
    const opening = bani(x.opening);
    const topupsNet = bani(x.topups_net);
    const clicks = bani(x.clicks);
    const refunds = bani(x.refunds);
    const adjustments = bani(x.adjustments);
    return {
      merchantId: Number(x.merchant_id),
      companyName: x.company_name,
      cui: x.cui,
      shopName: x.shop_name,
      openingBani: opening,
      topupsNetBani: topupsNet,
      topupsVatBani: bani(x.vat),
      topupsGrossBani: bani(x.gross),
      topups: x.topups,
      clicksBani: clicks,
      clicks: x.n_clicks,
      refundsBani: refunds,
      adjustmentsBani: adjustments,
      closingBani: opening + topupsNet - clicks + refunds + adjustments,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Maintenance (worker `promoted.daily`)

/**
 * Clears the session and network hashes of promoted clicks older than `days` (they only serve the
 * daily dedupe and the hourly rate checks; the billing record stays) and closes checkouts nobody
 * finished within a day.
 */
export async function promotedMaintenance(db: Exec, days = 30): Promise<{ hashesCleared: number; topupsExpired: number }> {
  const h = await db.execute(sql`
    UPDATE promoted_clicks SET session_hash = NULL, ip_hash = NULL
    WHERE created_at < now() - make_interval(days => ${days}) AND (session_hash IS NOT NULL OR ip_hash IS NOT NULL)`);
  const t = await db.execute(sql`
    UPDATE wallet_topups SET status = 'expired', updated_at = now() WHERE status IN ('created','pending') AND created_at < now() - interval '24 hours'`);
  return { hashesCleared: h.rowCount ?? 0, topupsExpired: t.rowCount ?? 0 };
}
