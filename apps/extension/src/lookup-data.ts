/**
 * The lookup answer as the panel uses it, parsed strictly from `GET /api/ext/lookup` (contract in
 * apps/web/README.md "Browser extension API"). Anything out of shape is refused as a whole: the
 * panel then shows nothing rather than half-checked data. Strings are only ever rendered as text.
 */
export type VerdictCode = 'good_price' | 'usual' | 'above_usual' | 'insufficient_data';

export interface LookupOffer {
  shop: string;
  shopName: string;
  sellerName: string | null;
  marketplace: boolean;
  price: string;
  shipping: string | null;
  total: string;
  checkedAt: string;
}

export interface LookupData {
  productId: number;
  slug: string;
  title: string;
  matchedBy: 'url' | 'gtin' | 'brand_mpn';
  low30d: string | null;
  lowAllTime: string | null;
  median30d: string | null;
  verdict: { code: VerdictCode; label: string; text: string };
  observationsDays: number;
  historyStartedAt: string | null;
  badges: Array<{ kind: 'drop' | 'all_time_low'; label: string; text: string }>;
  bestOffers: LookupOffer[];
  /** [day, total] (ascending days). */
  history: Array<[string, string]>;
  updatedAt: string | null;
}

export const MAX_OFFERS = 5;
export const MAX_HISTORY = 180;

const MONEY = /^\d{1,9}\.\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERDICTS = new Set<VerdictCode>(['good_price', 'usual', 'above_usual', 'insufficient_data']);
const MATCHED = new Set(['url', 'gtin', 'brand_mpn']);

class Invalid extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function text(v: unknown, max: number): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new Invalid();
  return v;
}
function textOrNull(v: unknown, max: number): string | null {
  return v === null ? null : text(v, max);
}
function money(v: unknown): string {
  if (typeof v !== 'string' || !MONEY.test(v)) throw new Invalid();
  return v;
}
function moneyOrNull(v: unknown): string | null {
  return v === null ? null : money(v);
}
function iso(v: unknown): string {
  if (typeof v !== 'string' || v.length > 40 || !Number.isFinite(Date.parse(v))) throw new Invalid();
  return v;
}
function day(v: unknown): string {
  if (typeof v !== 'string' || !DAY.test(v)) throw new Invalid();
  return v;
}

function offer(v: unknown): LookupOffer {
  if (!isObj(v) || typeof v.marketplace !== 'boolean') throw new Invalid();
  return {
    shop: text(v.shop, 60),
    shopName: text(v.shop_name, 100),
    sellerName: textOrNull(v.seller_name, 120),
    marketplace: v.marketplace,
    price: money(v.price),
    shipping: moneyOrNull(v.shipping),
    total: money(v.total),
    checkedAt: iso(v.checked_at),
  };
}

/** The parsed answer, or null when it is not exactly the documented shape. */
export function parseLookupData(json: unknown): LookupData | null {
  try {
    if (!isObj(json)) throw new Invalid();
    const id = json.product_id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw new Invalid();
    const slug = text(json.slug, 200);
    if (!SLUG.test(slug) || !slug.endsWith(`-${id}`)) throw new Invalid();
    const v = json.verdict;
    if (!isObj(v) || !VERDICTS.has(v.code as VerdictCode)) throw new Invalid();
    if (!MATCHED.has(json.matched_by as string)) throw new Invalid();
    const days = json.observations_days;
    if (typeof days !== 'number' || !Number.isSafeInteger(days) || days < 0) throw new Invalid();
    if (!Array.isArray(json.badges) || json.badges.length > 4) throw new Invalid();
    if (!Array.isArray(json.best_offers) || json.best_offers.length > MAX_OFFERS) throw new Invalid();
    if (!Array.isArray(json.history) || json.history.length > MAX_HISTORY) throw new Invalid();
    const history = json.history.map((p): [string, string] => {
      if (!Array.isArray(p) || p.length !== 2) throw new Invalid();
      return [day(p[0]), money(p[1])];
    });
    for (let i = 1; i < history.length; i++) if (history[i]![0] <= history[i - 1]![0]) throw new Invalid();
    return {
      productId: id,
      slug,
      title: text(json.title, 300),
      matchedBy: json.matched_by as LookupData['matchedBy'],
      low30d: moneyOrNull(json.low_30d),
      lowAllTime: moneyOrNull(json.low_all_time),
      median30d: moneyOrNull(json.median_30d),
      verdict: { code: v.code as VerdictCode, label: text(v.label, 60), text: text(v.text, 300) },
      observationsDays: days,
      historyStartedAt: json.history_started_at === null ? null : day(json.history_started_at),
      badges: json.badges.map((b) => {
        if (!isObj(b) || (b.kind !== 'drop' && b.kind !== 'all_time_low')) throw new Invalid();
        return { kind: b.kind, label: text(b.label, 80), text: text(b.text, 600) };
      }),
      bestOffers: json.best_offers.map(offer),
      history,
      updatedAt: json.updated_at === null ? null : iso(json.updated_at),
    };
  } catch {
    return null;
  }
}
