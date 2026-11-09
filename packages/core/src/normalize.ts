/**
 * `normalizeOffer`: RawOffer (as a page or feed showed it) → NormalizedOffer (what ingestion
 * stores and matching uses). Pure and deterministic: the same input and context always give the
 * same output. The content-hash function is injected (`ctx.hash`), so this module never imports
 * Node crypto; workers pass `contentHash` from `@pretoscop/core/hash`.
 */
import { detectAccessory } from './accessory';
import { type Attributes, extractAttributes } from './attributes';
import { type Availability, mapAvailability } from './availability';
import { detectBeautyBrand, extractBeautyAttributes, type BeautyAttributes } from './beauty';
import { extractBookAttributes, findPublisher, isbnsInText, stripIsbnMentions, validateIsbn, type BookAttributes } from './books';
import { type BrandMatch, type BrandVia, brandTokens, detectBrand } from './brands';
import { type BundleKind, detectBundle } from './bundle';
import { type Condition, type ConditionDetail, detectCondition } from './condition';
import type { ContentHasher } from './content-hash';
import {
  extractGtins,
  type GtinQuality,
  type GtinReason,
  isValidGtinCheckDigit,
  summarizeGtins,
} from './gtin';
import type { Bani } from './money';
import { extractMpnCandidates, isSpecToken, mpnHintOf, normalizeMpn } from './mpn';
import {
  BELOW_MIN_MINOR,
  convertToRonBani,
  grossUpVat,
  parsePrice,
  parseShippingCost,
  PLACEHOLDER_MIN_MINOR,
  type PriceFormat,
  type PriceRejectReason,
} from './price';
import { type ShippingBasis, type ShippingRules, totalPrice } from './pricing';
import { detectProductKind, type ProductKind } from './product-kind';
import type { RawOffer } from './raw-offer';
import {
  asciiFold,
  cleanTitleDetailed,
  isHexJunkTitle,
  normalizeText,
  slugify,
  titleForMatch,
} from './text';
import { categorize } from './taxonomy';
import type { UnknownBrandRule } from './unknown-brand';
import { crumbSegments, detectVertical, isBooklandGtin } from './verticals';

/** Where an offer's MPN came from: the shop's MPN field, a code in the title, or the URL hint. */
export type MpnOrigin = 'field' | 'title' | 'url';

/**
 * Attributes stored with an offer: the launch attributes (M06), or a book's or a beauty product's
 * (M29), whose `kind` is then `book`, `fragrance` or `cosmetics`.
 */
export type OfferAttributes = Attributes &
  Partial<Omit<BookAttributes, 'kind'>> &
  Partial<Omit<BeautyAttributes, 'kind'>>;

/** Accessories of the verticals (bookmarks, book covers, make-up brushes): from the shop's category only. */
function verticalAccessory(categoryRaw: string | null): { isAccessory: boolean; reason: string | null } {
  const seg = crumbSegments(categoryRaw).find((c) => /\b(?:accesorii|semne de carte|huse|coperti|genti|pensule|bureti|oglinzi)\b/.test(c));
  return seg ? { isAccessory: true, reason: `category:${seg}` } : { isAccessory: false, reason: null };
}

/** Why an offer must not be ingested. */
export type RejectReason =
  | 'external_id_missing'
  | 'title_missing'
  | 'title_junk_hex'
  | 'price_missing'
  | 'price_unparseable'
  | 'price_range'
  | 'price_instalment'
  | 'price_unit'
  | 'price_zero'
  | 'price_negative'
  | 'price_placeholder'
  | 'price_too_low'
  | 'price_currency'
  | 'fx_rate_missing';

export interface NormalizeShopContext {
  slug: string;
  /** `shops.shipping_rules` (amounts in lei). */
  shippingRules?: ShippingRules | null;
  /** False for shops whose prices exclude VAT unless an offer says otherwise (B2B feeds). */
  vatIncludedDefault?: boolean;
  /** Price format of the shop's source when the RawOffer does not state one. */
  priceFormat?: PriceFormat | null;
  /** Extra fake GTINs known for this shop (added to `KNOWN_FAKE_GTINS`). */
  fakeGtins?: readonly string[];
}

export interface NormalizeContext {
  shop: NormalizeShopContext;
  /** Observation instant: decides the VAT rate. Replays pass the original time. */
  observedAt: Date;
  /** BNR EUR reference rate (RON per EUR) of the observation day; needed only for EUR prices. */
  eurRonRate?: number | null;
  /** Content-hash function, normally `contentHash` from `@pretoscop/core/hash`. */
  hash: ContentHasher;
}

interface NormalizedOfferBase {
  shopSlug: string;
  externalId: string;
  url: string;
  affiliateUrl: string | null;
  observedAt: Date;

  /** Crossed-out price, only when strictly above the price (else null, with a warning). */
  oldPriceBani: Bani | null;
  /** Delivery cost stated by the offer or feed (0 = free); null when not stated. Hashed. */
  shippingBani: Bani | null;
  /** Delivery included in `totalBani`: the stated cost, else the shop-rule estimate. */
  totalShippingBani: Bani | null;
  shippingEstimated: boolean;
  shippingBasis: ShippingBasis;
  /** The shop's own "lowest price in the last 30 days" (Omnibus), when published. */
  shopLowest30dBani: Bani | null;
  /** Currency as observed (ISO 4217). */
  currency: string;
  /** RON per unit used to convert a foreign currency; null for RON. */
  fxRate: number | null;
  /** True when prices were stated without VAT and grossed up with the rate of `observedAt`. */
  vatGrossedUp: boolean;
  /** The price was a "de la …" lower bound. */
  priceIsFrom: boolean;

  /** Valid GTIN-14 only (never a placeholder or restricted code). */
  gtin14: string | null;
  gtinQuality: GtinQuality;
  gtinReason: GtinReason | null;
  /** Further valid GTIN-14s when the source listed several. */
  gtinAlternates: string[];
  gtinRaw: string | null;

  brandName: string | null;
  brandSlug: string | null;
  brandConfidence: number | null;
  brandVia: BrandVia | null;
  /** False when the brand is not in the dictionary (an unknown brand field or a title guess). */
  brandKnown: boolean;
  /**
   * How an unknown title brand was read (`trademark` ®/™ at 0.8; `prefix`, `after_noun`,
   * `segment` by position at 0.6), null otherwise. See `guessUnknownBrand`.
   */
  brandGuess: UnknownBrandRule | null;
  brandRaw: string | null;

  /** Normalized MPN: from the MPN field, else the best code in the title, else the URL hint. */
  mpnNorm: string | null;
  /** The shop's MPN field as seen (never the URL hint). */
  mpnRaw: string | null;
  /**
   * 'field' when the shop stated it, 'title' when it was guessed (from the title or the URL
   * hint): what `offers.mpn_source` stores and matching trusts accordingly.
   */
  mpnSource: 'field' | 'title' | null;
  /** Where `mpnNorm` came from: the MPN field, a title code or the URL hint (`raw.mpnHint`). */
  mpnOrigin: MpnOrigin | null;
  /** The URL hint, normalized, when plausible (`mpnHintOf`), whether or not it was used. */
  mpnHint: string | null;
  /** All normalized code candidates from the title, best first. */
  mpnCandidates: string[];

  attributes: OfferAttributes;
  productKind: ProductKind;
  condition: Condition;
  conditionDetail: ConditionDetail | null;
  conditionReason: string;
  isBundle: boolean;
  /** game, gift, accessory, subscription or other (see `detectBundle`); null when not a bundle. */
  bundleKind: BundleKind | null;
  /** `<kind>:<evidence>`, e.g. `gift:plus:woven`, `game:bundle`; null when not a bundle. */
  bundleReason: string | null;
  isAccessory: boolean;
  accessoryReason: string | null;
  availability: Availability;

  titleRaw: string;
  /** Canonical title without shop boilerplate (display). */
  titleClean: string;
  /** `titleClean` without diacritics (search, slugs). */
  titleAscii: string;
  /** Lower-case match form (tokens, units normalized). */
  titleMatch: string;
  categoryRaw: string | null;
  sellerName: string | null;
  isMarketplaceSeller: boolean;

  /** Non-blocking findings, e.g. `old_price_not_higher`, `gtin_placeholder`, `price_from`. */
  warnings: string[];
}

export interface AcceptedOffer extends NormalizedOfferBase {
  ok: true;
  priceBani: Bani;
  /** Price + delivery used for ranking. */
  totalBani: Bani;
  contentHash: string;
  rejects: RejectReason[];
}

export interface RejectedOffer extends NormalizedOfferBase {
  ok: false;
  priceBani: Bani | null;
  totalBani: Bani | null;
  contentHash: null;
  /** At least one reason. */
  rejects: RejectReason[];
}

export type NormalizedOffer = AcceptedOffer | RejectedOffer;

export function isAcceptedOffer(offer: NormalizedOffer): offer is AcceptedOffer {
  return offer.ok;
}

const PRICE_REJECTS: Readonly<Record<PriceRejectReason, RejectReason>> = {
  empty: 'price_missing',
  unparseable: 'price_unparseable',
  multiple_numbers: 'price_unparseable',
  range: 'price_range',
  instalment: 'price_instalment',
  unit_price: 'price_unit',
  zero: 'price_zero',
  negative: 'price_negative',
  placeholder: 'price_placeholder',
  currency: 'price_currency',
  currency_mismatch: 'price_currency',
};

function textOrNull(value: string | null | undefined): string | null {
  const s = normalizeText(value);
  return s === '' ? null : s;
}

/**
 * Normalizes one offer. Never throws for bad data (it rejects instead); throws only for an
 * invalid `ctx.observedAt` or a missing `ctx.hash`, which are programming errors.
 */
export function normalizeOffer(raw: RawOffer, ctx: NormalizeContext): NormalizedOffer {
  if (!(ctx.observedAt instanceof Date) || Number.isNaN(ctx.observedAt.getTime())) {
    throw new RangeError('ctx.observedAt must be a valid Date');
  }
  if (typeof ctx.hash !== 'function') throw new TypeError('ctx.hash is required');
  const rejects: RejectReason[] = [];
  const warnings: string[] = [];
  const reject = (r: RejectReason): void => {
    if (!rejects.includes(r)) rejects.push(r);
  };

  // ---- identity and title
  const externalId = normalizeText(raw.externalId);
  if (externalId === '') reject('external_id_missing');
  const titleRaw = raw.title ?? '';
  const cleaned = cleanTitleDetailed(titleRaw);
  let titleClean = cleaned.title;
  if (titleClean === '') reject('title_missing');
  else if (isHexJunkTitle(titleRaw)) reject('title_junk_hex');
  const categoryRaw = textOrNull(raw.category);

  // ---- prices
  const format = raw.priceFormat ?? ctx.shop.priceFormat ?? null;
  const parsed = parsePrice(raw.price, { format, currency: raw.currency ?? null });
  let currency = 'RON';
  let fxRate: number | null = null;
  let vatGrossedUp = false;
  let priceBani: Bani | null = null;
  let priceIsFrom = false;
  let convert: (minor: number) => Bani | null = () => null;
  if (!parsed.ok) {
    reject(PRICE_REJECTS[parsed.reason]);
  } else {
    currency = parsed.currency;
    priceIsFrom = parsed.flags.includes('from');
    for (const f of parsed.flags) if (f !== 'below_min') warnings.push(`price_${f}`);
    const textSaysExcluded = parsed.flags.includes('vat_excluded');
    if (raw.vatIncluded === true && textSaysExcluded) warnings.push('vat_conflict');
    const vatExcluded =
      raw.vatIncluded === false ||
      (raw.vatIncluded == null && (textSaysExcluded || ctx.shop.vatIncludedDefault === false));
    if (currency !== 'RON') {
      if (currency === 'EUR' && ctx.eurRonRate != null && ctx.eurRonRate > 0)
        fxRate = ctx.eurRonRate;
      else reject(currency === 'EUR' ? 'fx_rate_missing' : 'price_currency');
    }
    const ok = !rejects.some((r) => r === 'fx_rate_missing' || r === 'price_currency');
    convert = (minor: number): Bani | null => {
      if (!ok) return null;
      const gross = vatExcluded ? grossUpVat(minor, ctx.observedAt) : minor;
      return currency === 'RON' ? gross : convertToRonBani(gross, currency, fxRate);
    };
    vatGrossedUp = vatExcluded && ok;
    priceBani = convert(parsed.minor);
    if (priceBani !== null) {
      if (priceBani <= BELOW_MIN_MINOR) reject('price_too_low');
      else if (priceBani >= PLACEHOLDER_MIN_MINOR) reject('price_placeholder');
    }
  }
  const amountOf = (value: string | undefined, label: string, shipping = false): Bani | null => {
    if (value == null || normalizeText(value) === '' || !parsed.ok) return null;
    const r = shipping
      ? parseShippingCost(value, { format, currency })
      : parsePrice(value, { format, currency });
    if (!r.ok) {
      warnings.push(`${label}_unparseable`);
      return null;
    }
    return convert(r.minor);
  };

  let oldPriceBani = amountOf(raw.oldPrice, 'old_price');
  if (oldPriceBani !== null && priceBani !== null) {
    if (oldPriceBani <= priceBani) {
      warnings.push('old_price_not_higher');
      oldPriceBani = null;
    } else if (oldPriceBani > priceBani * 10) {
      warnings.push('old_price_implausible');
      oldPriceBani = null;
    }
  }
  if (oldPriceBani !== null && oldPriceBani <= BELOW_MIN_MINOR) oldPriceBani = null;
  let shopLowest30dBani = amountOf(raw.shopLowest30d, 'lowest30d');
  if (shopLowest30dBani !== null && shopLowest30dBani <= BELOW_MIN_MINOR) shopLowest30dBani = null;

  let shippingBani = amountOf(raw.shippingCost, 'shipping', true);
  if (shippingBani === null && raw.shippingCost == null && raw.shippingNote && parsed.ok) {
    const note = parseShippingCost(raw.shippingNote, { currency });
    if (note.ok && note.minor === 0) shippingBani = 0;
  }
  const total =
    priceBani !== null
      ? totalPrice({ priceBani, shippingBani, rules: ctx.shop.shippingRules ?? null })
      : null;

  // ---- identifiers
  const gtinResults = extractGtins(raw.gtin, {
    shopSlug: ctx.shop.slug,
    extraFakes: ctx.shop.fakeGtins ?? null,
  });
  const gtinSummary = summarizeGtins(gtinResults);
  let gtinQuality: GtinQuality =
    gtinResults.length === 0 ? 'missing' : gtinSummary.primary.quality;
  let gtin14 = gtinQuality === 'valid' ? gtinSummary.primary.gtin14 : null;
  let gtinReason: GtinReason | null = gtinQuality === 'valid' ? null : (gtinSummary.primary.reason ?? null);

  // M29: books and beauty products follow their vertical's rules (verticals.ts). A book's
  // identifier is its ISBN (the ISBN field is read as an ISBN-10 first, and an ISBN written in the
  // title counts too), its brand is the publisher and it has no MPN; a beauty product's brand comes
  // from the fragrance/cosmetics dictionary. Launch offers are untouched.
  const vertical = detectVertical({ title: titleClean, categoryRaw: raw.category ?? null, gtin14 });
  if (vertical === 'books') {
    const fromField = [raw.gtin, raw.specs?.isbn].map((g) => validateIsbn(g)).find((r) => r.quality === 'valid' && isBooklandGtin(r.gtin14));
    const fromTitle = isbnsInText(titleRaw)[0];
    const isbn = fromField?.gtin14 ?? fromTitle?.gtin14 ?? null;
    if (isbn && isbn !== gtin14) {
      if (gtin14) warnings.push('gtin_replaced_by_isbn');
      else if (!fromField) warnings.push('isbn_from_title');
      gtin14 = isbn;
      gtinQuality = 'valid';
      gtinReason = null;
    }
    const stripped = stripIsbnMentions(titleClean);
    if (stripped !== '') titleClean = stripped;
  }
  if (gtinQuality !== 'valid' && gtinQuality !== 'missing') warnings.push(`gtin_${gtinQuality}`);

  let brand: BrandMatch | null;
  let productKind: ProductKind;
  let attributes: OfferAttributes;
  if (vertical === 'books') {
    const book = extractBookAttributes(titleClean, raw.specs ?? {}, raw.category ?? null);
    const publisher = findPublisher(raw.specs?.publisher ?? raw.brand ?? null);
    // A publisher field is a statement, not a guess: an unknown publisher still identifies the
    // book's maker (confidence 0.7, so it is stored), never a word read from the title.
    brand = publisher
      ? { name: publisher.name, slug: publisher.slug, confidence: publisher.known ? 1 : 0.7, via: 'field', known: publisher.known, matched: raw.specs?.publisher ?? raw.brand ?? '' }
      : null;
    if (publisher && !publisher.known) warnings.push('publisher_unknown');
    productKind = 'book';
    attributes = book;
  } else if (vertical === 'beauty') {
    const fragrance = categorize(titleClean, raw.category ?? null) === 'parfumuri';
    const beauty = extractBeautyAttributes(titleClean, { fragrance });
    const found = detectBeautyBrand(titleClean, raw.brand ?? null);
    const generic = found ? null : detectBrand(titleClean, raw.brand ?? null, raw.category ?? null);
    brand = found
      ? { name: found.name, slug: slugify(found.name), confidence: found.via === 'field' ? 1 : found.via === 'title' ? 0.9 : 0.8, via: found.via === 'line' ? 'product_line' : found.via, known: true }
      : generic;
    if (brand && !brand.known) warnings.push('brand_unknown');
    productKind = beauty.kind;
    attributes = beauty;
  } else {
    brand = detectBrand(titleClean, raw.brand ?? null, raw.category ?? null);
    if (brand && !brand.known) warnings.push('brand_unknown');
    if (brand?.conflict) warnings.push('brand_conflict');

    productKind = detectProductKind(titleClean, raw.category ?? null);
    attributes = extractAttributes(titleClean, {
      categoryHint: raw.category ?? null,
      brand: brand?.name ?? null,
      kind: productKind,
    });
  }

  const mpnRaw = textOrNull(raw.mpn);
  // Books have no MPN (a shop's "mpn" is a publisher code or the ISBN again: Libris writes
  // "ART978-630-321-865-6"); beauty titles carry no part numbers, only a stated MPN counts.
  let fieldMpn = vertical === 'books' ? null : normalizeMpn(mpnRaw);
  if (fieldMpn && /^\d{8,14}$/.test(fieldMpn) && isValidGtinCheckDigit(fieldMpn)) {
    warnings.push('mpn_looks_like_gtin');
    fieldMpn = null;
  }
  // A spec or chip in an MPN field ("67INCH", "CORTEXA35", "RK3326").
  if (fieldMpn && isSpecToken(mpnRaw)) {
    warnings.push('mpn_looks_like_spec');
    fieldMpn = null;
  }
  const candidates = vertical
    ? []
    : extractMpnCandidates(titleClean, {
        brand: brand?.name ?? null,
        productCode: cleaned.productCode,
      }).map((c) => c.norm);
  let mpnNorm = fieldMpn ?? candidates[0] ?? null;
  let mpnSource: 'field' | 'title' | null = fieldMpn ? 'field' : candidates[0] ? 'title' : null;
  let mpnOrigin: MpnOrigin | null = fieldMpn ? 'field' : candidates[0] ? 'title' : null;
  // The URL hint (an eMAG slug tail) stays a guess: it is as often a seller SKU as a manufacturer
  // code. A stated MPN always wins; a title code wins too, unless the hint contains it and extends
  // it (the title corroborates the hint, which adds the regional or configuration suffix:
  // "43U8072H" in the title, "UE43U8072HUXXH" in the slug).
  const hint =
    fieldMpn === null && textOrNull(raw.mpnHint) !== null ? mpnHintOf(raw.mpnHint) : null;
  if (!vertical && fieldMpn === null && textOrNull(raw.mpnHint) !== null) {
    const brandWords = new Set(brandTokens(brand?.name ?? ''));
    const usable = hint !== null && !brandWords.has(hint.toLowerCase());
    const titleCode = candidates[0];
    const corroborated =
      usable &&
      titleCode !== undefined &&
      hint.length > titleCode.length &&
      hint.includes(titleCode);
    if (usable && (titleCode === undefined || corroborated)) {
      mpnNorm = hint;
      mpnSource = 'title';
      mpnOrigin = 'url';
      warnings.push(corroborated ? 'mpn_from_url_confirmed_by_title' : 'mpn_from_url');
    } else if (!usable) {
      warnings.push('mpn_url_hint_rejected');
    }
  }

  // ---- flags
  const condition = detectCondition(titleClean, raw.condition ?? null);
  // A box set or a perfume gift set has its own identifier: a product of its own (attribute
  // `bookSet`/`giftSet`), not a "product + extras" bundle. Words such as "pentru telefon" or
  // "rezervă" in a book title or a refill do not make an accessory; only the shop's category does.
  const bundle = vertical
    ? { isBundle: false, kind: null, reason: null }
    : detectBundle(titleClean, raw.category ?? null);
  const accessory = vertical
    ? verticalAccessory(raw.category ?? null)
    : detectAccessory(titleClean, raw.category ?? null);
  const availability = mapAvailability(raw.availability);

  const base: NormalizedOfferBase = {
    shopSlug: ctx.shop.slug,
    externalId,
    url: normalizeText(raw.url),
    affiliateUrl: textOrNull(raw.affiliateUrl),
    observedAt: ctx.observedAt,
    oldPriceBani,
    shippingBani,
    totalShippingBani: total?.shippingBani ?? null,
    shippingEstimated: total?.shippingEstimated ?? true,
    shippingBasis: total?.basis ?? 'unknown',
    shopLowest30dBani,
    currency,
    fxRate,
    vatGrossedUp,
    priceIsFrom,
    gtin14,
    gtinQuality,
    gtinReason,
    gtinAlternates: gtinSummary.alternates,
    gtinRaw: textOrNull(raw.gtin),
    brandName: brand?.name ?? null,
    brandSlug: brand?.slug ?? null,
    brandConfidence: brand?.confidence ?? null,
    brandVia: brand?.via ?? null,
    brandKnown: brand?.known ?? false,
    brandGuess: brand?.guess ?? null,
    brandRaw: textOrNull(raw.brand),
    mpnNorm,
    mpnRaw,
    mpnSource,
    mpnOrigin,
    mpnHint: textOrNull(raw.mpnHint) !== null ? mpnHintOf(raw.mpnHint) : null,
    mpnCandidates: candidates,
    attributes,
    productKind,
    condition: condition.condition,
    conditionDetail: condition.detail ?? null,
    conditionReason: condition.reason,
    isBundle: bundle.isBundle,
    bundleKind: bundle.kind,
    bundleReason: bundle.reason,
    isAccessory: accessory.isAccessory,
    accessoryReason: accessory.reason,
    availability,
    titleRaw,
    titleClean,
    titleAscii: asciiFold(titleClean),
    titleMatch: titleForMatch(titleClean),
    categoryRaw,
    sellerName: textOrNull(raw.sellerName),
    isMarketplaceSeller: raw.isMarketplaceSeller ?? false,
    warnings,
  };

  if (rejects.length > 0 || priceBani === null || total === null) {
    if (rejects.length === 0) reject('price_unparseable');
    return {
      ...base,
      ok: false,
      priceBani,
      totalBani: total?.totalBani ?? null,
      contentHash: null,
      rejects,
    };
  }
  return {
    ...base,
    ok: true,
    priceBani,
    totalBani: total.totalBani,
    contentHash: ctx.hash({ priceBani, oldPriceBani, shippingBani, availability }),
    rejects: [],
  };
}
