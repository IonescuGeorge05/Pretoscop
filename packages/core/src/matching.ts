/**
 * Matching v1 (M07, docs/03 §6.3): pure scoring and routing of an offer against candidate
 * products. Deterministic and explainable: every decision carries its reasons.
 *
 * Decision table (see VERDICTS.md's sibling MATCHING.md):
 *   GTIN equal, no hard conflict                       → accept (1.00)
 *   brand equal + MPN equal, no hard conflict           → accept (0.98)
 *   brand equal + MPN regional variant (≥ 9 chars, ≤ 4 extra) + title agrees → accept (≥ 0.97) else review
 *   title/attributes only                               → score; ≥ 0.97 accept, ≤ 0.30 reject, else needs_review
 *   any hard conflict                                   → that candidate is rejected
 */

import { compareBeauty } from './beauty';
import { compareBooks } from './books';
import { categoriesCompatible, categoryVertical } from './taxonomy';
import { isBooklandGtin, type Vertical } from './verticals';

export interface MatchSide {
  /** Raw or cleaned title; tokenized here. */
  title: string;
  brand: string | null;
  mpnNorm: string | null;
  gtin14: string | null;
  category: string | null;
  attributes: Record<string, unknown>;
  /** The MPN was guessed from the title (it may be a series code such as Lenovo's "14IPH11"). */
  mpnFromTitle?: boolean;
}

export interface PairScore {
  score: number;
  conflicts: string[];
  via: 'gtin' | 'mpn' | 'mpn_variant' | 'title';
  features: Record<string, number | string | boolean | null>;
}

export const ACCEPT_AT = 0.97;
export const REJECT_AT = 0.3;

const STOP = new Set(
  'telefon mobil smartphone laptop tableta televizor tv monitor consola joc pentru cu si de la din in pe sau ce un o al ale a led oled qled smart negru alb gri argintiu albastru verde rosu roz auriu mov galben portocaliu bej maro black white silver gray grey blue green red pink gold purple yellow orange beige brown dual sim wifi wi fi bluetooth nfc gps edition editie versiune nou noua new original oficial garantie'.split(
    ' ',
  ),
);

/** Words that turn one product into another (Pro vs Pro Max, FE, Slim…): must agree. */
const EDITION = new Set(['pro', 'max', 'ultra', 'plus', 'mini', 'lite', 'fe', 'slim', 'digital', 'se', 'air', 'neo', 'edge', 'fold', 'flip', 'xl', 'note', 'prime']);

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șşȘŞ]/g, 's')
    .replace(/[țţȚŢ]/g, 't')
    .toLowerCase();
}

/** Attribute-like tokens (capacities, sizes, network generations, years) are not model tokens. */
function isAttributeToken(t: string): boolean {
  return (
    /^\d+(gb|tb|mb|mah|w|hz|kg|l|ml|in|inch|cm|mm|mp|rpm|v|wh|nm)$/.test(t) ||
    /^[2-6]g$/.test(t) ||
    /^(19|20)\d\d$/.test(t) ||
    /^\d+k$/.test(t) ||
    /^ddr\d$/.test(t) ||
    /^(usb|type|c|pcie|gen\d)$/.test(t)
  );
}

export interface Tokens {
  all: Set<string>;
  model: Set<string>;
  edition: Set<string>;
}

/** Tokens for matching: ASCII-folded, units glued to numbers ("16 GB" → "16gb"), stopwords dropped. */
export function tokenSets(title: string): Tokens {
  const t = fold(title)
    // "S26+" is the Plus model, not the S26 ("SSD+2TB" keeps its plus as a separator).
    .replace(/([a-z0-9])\+(?=[^a-z0-9]|$)/g, '$1 plus')
    // Decimal comma ("6,7 inch") joins; a list comma before a capacity ("Acebook 10,16GB") does not.
    .replace(/(\d)[,.](\d{1,2})(?!\d|\s*(?:gb|tb|mb)\b)/g, '$1$2')
    .replace(/(\d+)\s*(gb|tb|mb|mah|w|hz|kg|l|ml|inch|inchi|cm|mm|mp|rpm)\b/g, '$1$2')
    .replace(/(\d+)\s*("|''|”)/g, '$1in')
    .replace(/wi-?fi/g, 'wifi')
    .replace(/[^a-z0-9]+/g, ' ');
  const all = new Set<string>();
  const model = new Set<string>();
  const edition = new Set<string>();
  for (const tok of t.split(' ')) {
    if (!tok || tok.length === 0) continue;
    if (EDITION.has(tok)) {
      edition.add(tok);
      all.add(tok);
      continue;
    }
    if (STOP.has(tok)) continue;
    all.add(tok);
    if (/\d/.test(tok) && !isAttributeToken(tok)) model.add(tok);
  }
  return { all, model, edition };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Hard attribute conflicts (both sides known and different). Attribute keys come from M06. */
export function attributeConflicts(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const out: string[] = [];
  const exact = ['storageGb', 'ramGb', 'capacityKg'];
  for (const k of exact) {
    const x = num(a[k]);
    const y = num(b[k]);
    if (x !== null && y !== null && x !== y) out.push(`${k} ${x}≠${y}`);
  }
  const si = num(a.screenInches);
  const sj = num(b.screenInches);
  if (si !== null && sj !== null && Math.abs(si - sj) > 0.6) out.push(`screenInches ${si}≠${sj}`);
  const ci = num(a.capacityL);
  const cj = num(b.capacityL);
  if (ci !== null && cj !== null && Math.abs(ci - cj) / Math.max(ci, cj) > 0.03) out.push(`capacityL ${ci}≠${cj}`);
  // Galaxy A17 5G and A17 4G are different phones (5G models also speak 4G, but titles name one).
  const gen = (v: unknown) => (Array.isArray(v) ? (v.includes('5g') ? '5g' : v.includes('4g') ? '4g' : null) : null);
  const ga = gen(a.connectivity);
  const gb = gen(b.connectivity);
  if (ga && gb && ga !== gb) out.push(`network ${ga}≠${gb}`);
  const colA = typeof a.color === 'string' ? a.color : null;
  const colB = typeof b.color === 'string' ? b.color : null;
  if (colA && colB && colA !== colB) out.push(`color ${colA}≠${colB}`);
  return out;
}

/** "SMS741BZVDEUE" vs "SMS741BZVD" — same product sold with a regional/packaging suffix. */
export function mpnVariant(a: string, b: string): boolean {
  if (a === b) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 9 && l.startsWith(s) && l.length - s.length <= 4;
}

/** The vertical of a match side: from its category, its attributes' kind, or an ISBN (M29). */
export function sideVertical(s: Pick<MatchSide, 'category' | 'attributes' | 'gtin14'>): Vertical | null {
  const byCategory = categoryVertical(s.category);
  if (byCategory) return byCategory;
  const kind = s.attributes.kind;
  if (kind === 'book') return 'books';
  if (kind === 'fragrance' || kind === 'cosmetics') return 'beauty';
  return isBooklandGtin(s.gtin14) ? 'books' : null;
}

/**
 * Two books (M29, books.ts): equal ISBNs accept unless a stated fact conflicts; different ISBNs
 * never match; without an ISBN on one side the title, author and publisher rules decide and the
 * score stays below the accept threshold (a human or the LLM decides, as for every title match).
 */
function scoreBooks(offer: MatchSide, product: MatchSide): PairScore {
  const cmp = compareBooks(
    { title: offer.title, publisher: offer.brand, gtin14: offer.gtin14, attributes: offer.attributes },
    { title: product.title, publisher: product.brand, gtin14: product.gtin14, attributes: product.attributes },
  );
  const conflicts = [...cmp.conflicts];
  if (!categoriesCompatible(offer.category, product.category)) conflicts.push('category');
  const features: PairScore['features'] = {
    vertical: 'books',
    titleSim: Math.round(cmp.titleSim * 1000) / 1000,
    authorsAgree: cmp.authorsAgree,
    publishersAgree: cmp.publishersAgree,
    brandEqual: cmp.publishersAgree === true,
  };
  if (cmp.gtinEqual) return { score: conflicts.length ? 0 : 1, conflicts, via: 'gtin', features };
  if (conflicts.length) return { score: 0, conflicts, via: 'title', features };
  const score = Math.min(0.96, 0.6 * cmp.titleSim + 0.2 * (cmp.authorsAgree ? 1 : 0) + 0.15 * (cmp.publishersAgree ? 1 : 0));
  return { score: Math.round(score * 1000) / 1000, conflicts, via: 'title', features };
}

/**
 * Two beauty products (M29, beauty.ts): GTIN or a stated MPN of the same brand accepts unless a
 * stated fact conflicts (size, concentration, shade, tester, gift set, refill); title matches also
 * check gender and flankers and stay below the accept threshold.
 */
function scoreBeauty(offer: MatchSide, product: MatchSide): PairScore {
  const conflicts: string[] = [];
  const brandEqual = !!offer.brand && !!product.brand && offer.brand.toLowerCase() === product.brand.toLowerCase();
  if (offer.brand && product.brand && !brandEqual) conflicts.push('brand');
  if (!categoriesCompatible(offer.category, product.category)) conflicts.push('category');
  const gtinEqual = !!offer.gtin14 && offer.gtin14 === product.gtin14;
  const mpnEqual = brandEqual && !!offer.mpnNorm && offer.mpnNorm === product.mpnNorm && !offer.mpnFromTitle && !product.mpnFromTitle;
  const cmp = compareBeauty(
    { title: offer.title, brand: offer.brand, attributes: offer.attributes },
    { title: product.title, brand: product.brand, attributes: product.attributes },
    { identifierEqual: gtinEqual || mpnEqual },
  );
  conflicts.push(...cmp.conflicts);
  const features: PairScore['features'] = { vertical: 'beauty', titleSim: Math.round(cmp.titleSim * 1000) / 1000, brandEqual };
  if (gtinEqual) return { score: conflicts.length ? 0 : 1, conflicts, via: 'gtin', features };
  if (mpnEqual) return { score: conflicts.length ? 0 : 0.98, conflicts, via: 'mpn', features };
  if (conflicts.length) return { score: 0, conflicts, via: 'title', features };
  const va = offer.attributes.volumeMl;
  const sizeAgrees = typeof va === 'number' && va === product.attributes.volumeMl;
  const score = Math.min(0.96, 0.55 * cmp.titleSim + 0.3 * (sizeAgrees ? 1 : 0) + (brandEqual ? 0.15 : 0));
  return { score: Math.round(score * 1000) / 1000, conflicts, via: 'title', features };
}

export function scorePair(offer: MatchSide, product: MatchSide): PairScore {
  const vo = sideVertical(offer);
  const vp = sideVertical(product);
  if (vo === 'books' && vp === 'books') return scoreBooks(offer, product);
  if (vo === 'beauty' && vp === 'beauty') return scoreBeauty(offer, product);
  const conflicts: string[] = [];
  // A book or a beauty product never matches a product of another vertical (or of the launch taxonomy).
  if (vo !== vp) conflicts.push('vertical');
  if (offer.brand && product.brand && offer.brand.toLowerCase() !== product.brand.toLowerCase()) conflicts.push('brand');
  if (!categoriesCompatible(offer.category, product.category)) conflicts.push('category');
  conflicts.push(...attributeConflicts(offer.attributes, product.attributes));

  const to = tokenSets(offer.title);
  const tp = tokenSets(product.title);
  const editionEqual = to.edition.size === tp.edition.size && [...to.edition].every((e) => tp.edition.has(e));
  // Model numbers must agree when both titles carry them (S25 ≠ S26, 17 ≠ 16).
  const modelDiff = [...to.model].filter((x) => !tp.model.has(x)).length + [...tp.model].filter((x) => !to.model.has(x)).length;
  const modelOverlap = jaccard(to.model, tp.model);
  const titleSim = jaccard(to.all, tp.all);
  const features: PairScore['features'] = {
    titleSim: Math.round(titleSim * 1000) / 1000,
    modelOverlap: Math.round(modelOverlap * 1000) / 1000,
    modelDiff,
    editionEqual,
    brandEqual: !!offer.brand && !!product.brand && offer.brand.toLowerCase() === product.brand.toLowerCase(),
  };

  if (offer.gtin14 && product.gtin14 && offer.gtin14 === product.gtin14) {
    // GTIN never merges alone when the titles contradict (bundles, refurb, wrong attributes).
    if (!editionEqual) conflicts.push('edition');
    return { score: conflicts.length ? 0 : 1, conflicts, via: 'gtin', features };
  }
  if (offer.mpnNorm && product.mpnNorm && features.brandEqual) {
    if (offer.mpnNorm === product.mpnNorm) {
      // Two title guesses can both be a series code shared by different products (Lenovo
      // "14IPH11" covers IdeaPad Slim 5, Yoga 7 and Yoga Slim 7): the titles must agree as well.
      if (offer.mpnFromTitle && product.mpnFromTitle) {
        if (!editionEqual) conflicts.push('edition');
        if (to.model.size > 0 && tp.model.size > 0 && modelDiff > 0) conflicts.push('model');
        return { score: conflicts.length ? 0 : ACCEPT_AT, conflicts, via: 'mpn', features };
      }
      return { score: conflicts.length ? 0 : 0.98, conflicts, via: 'mpn', features };
    }
    if (mpnVariant(offer.mpnNorm, product.mpnNorm)) {
      if (!editionEqual) conflicts.push('edition');
      const s = 0.9 + 0.08 * Math.max(titleSim, modelOverlap);
      return { score: conflicts.length ? 0 : Math.min(0.99, s), conflicts, via: 'mpn_variant', features };
    }
    // Different MPNs from the same brand are different products, whatever the title says.
    if (offer.mpnNorm.length >= 6 && product.mpnNorm.length >= 6) conflicts.push('mpn');
  }

  if (!editionEqual && (to.model.size > 0 || tp.model.size > 0)) conflicts.push('edition');
  if (to.model.size > 0 && tp.model.size > 0 && modelDiff > 0) conflicts.push('model');
  if (conflicts.length > 0) return { score: 0, conflicts, via: 'title', features };

  const brandBonus = features.brandEqual ? 0.15 : 0;
  const score = Math.min(0.96, 0.55 * titleSim + 0.3 * modelOverlap + brandBonus);
  return { score: Math.round(score * 1000) / 1000, conflicts, via: 'title', features };
}

export type MatchDecision = 'accept' | 'reject' | 'needs_review' | 'new_product' | 'unmatched';

export interface RoutedDecision {
  decision: MatchDecision;
  productId: number | null;
  score: number;
  reasons: string[];
}

export interface OfferIdentity {
  gtin14: string | null;
  mpnNorm: string | null;
  brand: string | null;
  category: string | null;
  condition: 'new' | 'refurbished' | 'used';
  isBundle: boolean;
  isAccessory: boolean;
  /** The shop is trusted to define canonical products from its titles (trust tier 1). */
  trustedSource: boolean;
  /** Title has at least one model token (a product, not a category word). */
  hasModelToken: boolean;
}

/**
 * Routing on the best candidate (docs/03 §6.3, M07 deviation: products may also be created from
 * brand + MPN, and from trusted shops' titles, because only ≈8% of offers carry a GTIN).
 */
export function route(identity: OfferIdentity, ranked: Array<{ productId: number; score: PairScore }>): RoutedDecision {
  if (identity.condition !== 'new') return { decision: 'unmatched', productId: null, score: 0, reasons: [`condition ${identity.condition}`] };
  if (identity.isBundle) return { decision: 'unmatched', productId: null, score: 0, reasons: ['bundle'] };
  if (identity.isAccessory) return { decision: 'unmatched', productId: null, score: 0, reasons: ['accessory'] };

  const viable = ranked.filter((r) => r.score.conflicts.length === 0).sort((a, b) => b.score.score - a.score.score);
  const best = viable[0];
  if (best && best.score.score >= ACCEPT_AT) {
    const second = viable[1];
    // Two near-identical strong candidates mean a duplicate product: a human decides.
    if (second && second.score.score >= ACCEPT_AT && best.score.via === 'title') {
      return { decision: 'needs_review', productId: best.productId, score: best.score.score, reasons: ['two strong candidates'] };
    }
    return { decision: 'accept', productId: best.productId, score: best.score.score, reasons: [`${best.score.via} ${best.score.score}`] };
  }
  if (best && best.score.score > REJECT_AT) {
    return { decision: 'needs_review', productId: best.productId, score: best.score.score, reasons: [`${best.score.via} ${best.score.score} in gray zone`] };
  }
  // No acceptable candidate: create a canonical product when the offer identifies one. An ISBN
  // identifies one edition of one book by itself (M29: publishers are often missing or unknown).
  if (isBooklandGtin(identity.gtin14)) {
    return { decision: 'new_product', productId: null, score: 1, reasons: [identity.brand ? 'valid ISBN + publisher' : 'valid ISBN'] };
  }
  if (identity.brand && (identity.gtin14 || identity.mpnNorm)) {
    return { decision: 'new_product', productId: null, score: 1, reasons: [identity.gtin14 ? 'valid GTIN + brand' : 'brand + MPN'] };
  }
  if (identity.trustedSource && identity.brand && identity.category && identity.hasModelToken) {
    return { decision: 'new_product', productId: null, score: 0.9, reasons: ['trusted source title with brand, category and model'] };
  }
  return { decision: 'unmatched', productId: null, score: best?.score.score ?? 0, reasons: [best ? `best ${best.score.score} below threshold` : 'no candidate and no identifier'] };
}

/** Family key for variant grouping (phones, tablets, laptops, watches, consoles): brand + model words. */
export const FAMILY_CATEGORIES = new Set(['telefoane-mobile', 'tablete', 'laptopuri', 'smartwatch', 'console']);

export function familyTitle(title: string): string {
  // Shop titles put the model first and the variant attributes after the first comma.
  const head = title.split(',')[0] ?? title;
  return head
    .replace(/^(telefon mobil|smartphone|tableta|laptop|notebook|ultrabook|smartwatch|ceas inteligent|consola)\s+/i, '')
    .replace(/\b\d+\s*(gb|tb)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function familyKey(brand: string, title: string): string {
  const t = tokenSets(familyTitle(title));
  return `${brand.toLowerCase()}|${[...t.all].filter((x) => x !== brand.toLowerCase()).sort().join(' ')}`;
}
