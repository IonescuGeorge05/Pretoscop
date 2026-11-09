/**
 * Promoted placements (M25): the pure rules of the paid "Promovat" slot. No I/O; amounts are
 * integer bani (core money convention). The default (organic) ranking is not touched here or
 * anywhere else: the slot sits outside the offers table and never reorders it (ADR-024).
 *
 * - Price bands split offers by their total price (price + known delivery); bids, floors and caps
 *   are set per category and band.
 * - The auction is a second-price auction with per-bidder reserves: the winner pays the second
 *   highest effective bid + 1 ban, at least its own floor and never more than its own bid.
 * - A click is billed at most once per hashed session, offer and day, only for clicks from the
 *   slot, and only when the fraud filters pass (`decideClickBilling`).
 */
import { mulDivRound, type Bani } from './money';

// ---------------------------------------------------------------------------------------------
// Price bands, floors and caps

export const PRICE_BAND_KEYS = ['0-200', '200-1000', '1000-3000', '3000+'] as const;
export type PriceBandKey = (typeof PRICE_BAND_KEYS)[number];

export interface PriceBand {
  key: PriceBandKey;
  /** Inclusive lower bound of the offer's total price, in bani. */
  minBani: Bani;
  /** Exclusive upper bound, in bani (null: no upper bound). */
  maxBani: Bani | null;
  /** Romanian label for forms and tables. */
  label: string;
}

export const PRICE_BANDS: readonly PriceBand[] = [
  { key: '0-200', minBani: 0, maxBani: 20_000, label: 'sub 200 lei' },
  { key: '200-1000', minBani: 20_000, maxBani: 100_000, label: '200–999,99 lei' },
  { key: '1000-3000', minBani: 100_000, maxBani: 300_000, label: '1.000–2.999,99 lei' },
  { key: '3000+', minBani: 300_000, maxBani: null, label: 'de la 3.000 lei' },
];

export function isPriceBandKey(v: unknown): v is PriceBandKey {
  return typeof v === 'string' && (PRICE_BAND_KEYS as readonly string[]).includes(v);
}

/** The band of an offer's total price. */
export function priceBandOf(totalBani: Bani): PriceBandKey {
  for (const b of PRICE_BANDS) if (totalBani >= b.minBani && (b.maxBani === null || totalBani < b.maxBani)) return b.key;
  return '0-200';
}

export interface FloorAndCap {
  /** Lowest bid that can win, and lowest price a winner pays. */
  floorBani: Bani;
  /** Highest bid that counts (a higher bid is treated as the cap). */
  capBani: Bani;
}

/**
 * Defaults when the founders have set nothing for a category (placeholders inside the playbook's
 * range, docs/08 §5: floors €0.05–0.15, caps €0.60; human task: confirm the price list).
 */
export const DEFAULT_FLOORS: Readonly<Record<PriceBandKey, FloorAndCap>> = {
  '0-200': { floorBani: 25, capBani: 150 },
  '200-1000': { floorBani: 40, capBani: 250 },
  '1000-3000': { floorBani: 60, capBani: 300 },
  '3000+': { floorBani: 75, capBani: 300 },
};

/** A row of `placement_floors`: `categoryId` null is the site-wide default for the band. */
export interface FloorRow extends FloorAndCap {
  categoryId: number | null;
  band: PriceBandKey;
}

/**
 * Floor and cap for an offer in a category: the most specific row along the category chain
 * (`categoryChain` = the product's category first, then its parent, … up to the root), then the
 * site-wide row of the band, then `DEFAULT_FLOORS`.
 */
export function floorFor(rows: readonly FloorRow[], categoryChain: readonly number[], band: PriceBandKey): FloorAndCap {
  for (const id of categoryChain) {
    const r = rows.find((x) => x.categoryId === id && x.band === band);
    if (r) return { floorBani: r.floorBani, capBani: r.capBani };
  }
  const site = rows.find((x) => x.categoryId === null && x.band === band);
  return site ? { floorBani: site.floorBani, capBani: site.capBani } : DEFAULT_FLOORS[band];
}

/** A floor/cap pair the admin may save: 1 ban ≤ floor ≤ cap ≤ 100 lei. */
export function floorProblem(f: FloorAndCap): 'floor' | 'cap' | null {
  if (!Number.isSafeInteger(f.floorBani) || f.floorBani < 1) return 'floor';
  if (!Number.isSafeInteger(f.capBani) || f.capBani < f.floorBani || f.capBani > 10_000) return 'cap';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Auction

export interface AuctionCandidate {
  placementId: number;
  merchantId: number;
  offerId: number;
  productId: number;
  /** The campaign's bid per click. */
  bidBani: Bani;
  /** Floor and cap that apply to this offer (its category and band). */
  floorBani: Bani;
  capBani: Bani;
  /** What the campaign can still spend now: min(wallet balance, daily cap − spent today). */
  remainingBani: Bani;
  /** The offer's total price (a tie between equal bids goes to the cheaper offer). */
  totalBani: Bani;
}

export type IneligibleReason = 'below_floor' | 'budget';

export interface AuctionResult {
  winner: AuctionCandidate;
  /** The winner's bid after the cap. */
  effectiveBidBani: Bani;
  /** What the winner pays per click. */
  priceBani: Bani;
  /** The runner-up's effective bid (null: no other eligible bidder). */
  secondBidBani: Bani | null;
  /** Eligible bidders after keeping one candidate per merchant. */
  bidders: number;
}

/** The bid that counts: capped at the band's cap. */
export function effectiveBid(c: Pick<AuctionCandidate, 'bidBani' | 'capBani'>): Bani {
  return Math.min(c.bidBani, c.capBani);
}

/**
 * Why a candidate cannot take part (null: it can). It needs a bid at least at the floor and enough
 * budget left to pay its whole bid, so whatever the clearing price the click can be paid; this is
 * also what stops the display once a daily cap or the wallet runs low.
 */
export function ineligibility(c: AuctionCandidate): IneligibleReason | null {
  const bid = effectiveBid(c);
  if (bid < c.floorBani || bid <= 0) return 'below_floor';
  if (c.remainingBani < bid) return 'budget';
  return null;
}

const better = (a: AuctionCandidate, b: AuctionCandidate): number =>
  effectiveBid(b) - effectiveBid(a) || a.totalBani - b.totalBani || a.placementId - b.placementId;

/**
 * Second-price auction for one slot. One candidate per merchant (its best one: a merchant never
 * sets its own price); ties go to the cheaper offer, then to the older campaign. The winner pays
 * max(its floor, runner-up's effective bid + 1 ban), never more than its own effective bid.
 */
export function runAuction(candidates: readonly AuctionCandidate[]): AuctionResult | null {
  const bestPerMerchant = new Map<number, AuctionCandidate>();
  for (const c of candidates) {
    if (ineligibility(c) !== null) continue;
    const prev = bestPerMerchant.get(c.merchantId);
    if (!prev || better(c, prev) < 0) bestPerMerchant.set(c.merchantId, c);
  }
  const ranked = [...bestPerMerchant.values()].sort(better);
  const winner = ranked[0];
  if (!winner) return null;
  const bid = effectiveBid(winner);
  const second = ranked[1] ? effectiveBid(ranked[1]) : null;
  const priceBani = Math.min(bid, Math.max(winner.floorBani, second === null ? 0 : second + 1));
  return { winner, effectiveBidBani: bid, priceBani, secondBidBani: second, bidders: ranked.length };
}

// ---------------------------------------------------------------------------------------------
// Click billing and fraud filters

/** Placements of /out/{offerId}?p=… that come from a promoted slot. */
export const PROMOTED_PLACEMENTS = ['promoted_product', 'promoted_category'] as const;
export type PromotedPlacement = (typeof PROMOTED_PLACEMENTS)[number];

export function isPromotedPlacement(v: unknown): v is PromotedPlacement {
  return typeof v === 'string' && (PROMOTED_PLACEMENTS as readonly string[]).includes(v);
}

/** Why a click from the slot was not billed (stored in `promoted_clicks.reason`). */
export type NotBilledReason =
  | 'disabled' // promoted.enabled is off
  | 'bot' // crawler, preview or audit User-Agent
  | 'prefetch' // a browser prefetch, not a click
  | 'no_referer' // not navigated from one of our pages
  | 'duplicate' // already billed for this session, offer and day
  | 'rate_hold' // too many promoted clicks from one session or network: held, never billed
  | 'ineligible' // offer, merchant or campaign no longer eligible
  | 'not_winner' // the slot now shows another campaign (the page was older)
  | 'budget'; // daily cap or wallet balance too low for this click

/**
 * Click-rate anomaly hold: a click is held (not billed) when the same hashed session already made
 * this many promoted clicks in the last 10 minutes, or the same hashed network address this many in
 * the last hour (counted over every merchant's slots).
 */
export const RATE_HOLD = { sessionPer10Min: 5, ipPerHour: 20 } as const;

export interface ClickBillingInput {
  enabled: boolean;
  bot: boolean;
  prefetch: boolean;
  /** Referer is one of our pages. */
  internalReferer: boolean;
  /** A billed (or refunded) click exists for this session, offer and day. */
  alreadyBilled: boolean;
  sessionClicks10Min: number;
  ipClicksHour: number;
  /** The auction for the slot's context, run now (null: nobody is eligible any more). */
  auction: AuctionResult | null;
  placementId: number;
  offerId: number;
}

export type ClickBillingDecision = { bill: true; priceBani: Bani } | { bill: false; reason: NotBilledReason };

/**
 * Whether a click from a promoted slot is billed, and at what price. The order matters only for the
 * reason recorded: every check must pass. The auction is re-run at click time, so a page served from
 * an older cache never bills a campaign that has since lost the slot or run out of budget.
 */
export function decideClickBilling(i: ClickBillingInput): ClickBillingDecision {
  if (!i.enabled) return { bill: false, reason: 'disabled' };
  if (i.bot) return { bill: false, reason: 'bot' };
  if (i.prefetch) return { bill: false, reason: 'prefetch' };
  if (!i.internalReferer) return { bill: false, reason: 'no_referer' };
  if (i.alreadyBilled) return { bill: false, reason: 'duplicate' };
  if (i.sessionClicks10Min >= RATE_HOLD.sessionPer10Min || i.ipClicksHour >= RATE_HOLD.ipPerHour) return { bill: false, reason: 'rate_hold' };
  if (!i.auction) return { bill: false, reason: 'ineligible' };
  if (i.auction.winner.placementId !== i.placementId || i.auction.winner.offerId !== i.offerId) return { bill: false, reason: 'not_winner' };
  if (i.auction.winner.remainingBani < i.auction.priceBani) return { bill: false, reason: 'budget' };
  return { bill: true, priceBani: i.auction.priceBani };
}

// ---------------------------------------------------------------------------------------------
// Wallets and top-ups

/** Smallest and largest top-up (compari.ro asks 150 lei minimum; the cap limits card fraud). */
export const TOPUP_LIMITS = { minBani: 15_000, maxBani: 1_000_000 } as const;
/** Bids and daily caps a merchant may set. */
export const CAMPAIGN_LIMITS = { maxBidBani: 10_000, maxDailyCapBani: 1_000_000 } as const;

export class WalletError extends Error {
  constructor(readonly code: 'insufficient' | 'invalid') {
    super(code === 'insufficient' ? 'wallet balance would go below zero' : 'invalid amount');
  }
}

/** Balance after a signed movement (credits > 0, debits < 0); a wallet never goes below zero. */
export function applyWalletMovement(balanceBani: Bani, amountBani: Bani): Bani {
  if (!Number.isSafeInteger(balanceBani) || !Number.isSafeInteger(amountBani) || amountBani === 0 || balanceBani < 0) throw new WalletError('invalid');
  const next = balanceBani + amountBani;
  if (next < 0) throw new WalletError('insufficient');
  if (!Number.isSafeInteger(next)) throw new WalletError('invalid');
  return next;
}

export interface TopUpAmounts {
  /** Credited to the wallet (spent on clicks). */
  netBani: Bani;
  /** VAT on top (0 while the company is not a VAT payer). */
  vatBani: Bani;
  /** What the card is charged. */
  grossBani: Bani;
}

/** Card charge for a wallet credit, with VAT on top at `vatPercent` (integer, rounded half up to the ban). */
export function topUpAmounts(netBani: Bani, vatPercent: number): TopUpAmounts {
  if (!Number.isSafeInteger(netBani) || netBani <= 0) throw new WalletError('invalid');
  if (!Number.isInteger(vatPercent) || vatPercent < 0 || vatPercent > 30) throw new RangeError('vatPercent must be an integer between 0 and 30');
  const vatBani = mulDivRound(netBani, BigInt(vatPercent), 100n);
  return { netBani, vatBani, grossBani: netBani + vatBani };
}

/**
 * A lei amount typed in a form: "150", "150,5", "1.500,50", "1500.50", "0,40 lei". A comma is the
 * decimal separator and dots group thousands; without a comma, a dot followed by one or two digits
 * at the end is the decimal point ("1.50") and a dot before three digits groups thousands ("1.500").
 * Null for anything else (negative, more than two decimals, letters).
 */
export function parseLeiInput(input: string): Bani | null {
  const s = input.replace(/\s+/g, '').replace(/lei$/i, '').replace(/ron$/i, '');
  if (s === '' || s.length > 20) return null;
  let intPart: string;
  let frac = '';
  if (s.includes(',')) {
    const m = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/.exec(s);
    if (!m) return null;
    intPart = m[1]!.replace(/\./g, '');
    frac = m[2]!;
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    [intPart, frac] = s.split('.') as [string, string];
  } else if (/^(\d{1,3}(?:\.\d{3})+|\d+)$/.test(s)) {
    intPart = s.replace(/\./g, '');
  } else return null;
  const bani = Number(intPart) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(bani) ? bani : null;
}

// ---------------------------------------------------------------------------------------------
// Honesty of the slot

export type PromotedPriceComparison = { kind: 'not_more_expensive' } | { kind: 'more_expensive'; diffBani: Bani; bestBani: Bani };

/**
 * How the promoted offer compares with the cheapest organic total (ADR-024: a promoted offer may cost
 * more than the best organic offer, and then the slot says by how much; it is never called "best").
 */
export function comparePromotedPrice(promotedTotalBani: Bani, bestOrganicTotalBani: Bani | null): PromotedPriceComparison {
  if (bestOrganicTotalBani === null || promotedTotalBani <= bestOrganicTotalBani) return { kind: 'not_more_expensive' };
  return { kind: 'more_expensive', diffBani: promotedTotalBani - bestOrganicTotalBani, bestBani: bestOrganicTotalBani };
}
