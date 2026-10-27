/**
 * Bundle detection: an offer that sells the product together with something else (a game, a gift,
 * a case) and therefore cannot be compared with the product's plain price. Pure.
 * Multipacks ("Set 2 becuri", "3-pack") are not bundles: they are counted in
 * `attributes.packCount` and matched as their own products.
 */
import { detectProductKind, type ProductKind } from './product-kind';
import { foldLower } from './text';

export interface BundleResult {
  isBundle: boolean;
  /** Why: `bundle`, `pachet`, `cadou`, `joc inclus`, `plus:<word>`; null when not a bundle. */
  reason: string | null;
}

/** Words after (or before) a "+" that describe the same product, not an extra item. */
const SPEC_WORDS = new Set([
  'cellular',
  'bluetooth',
  'bt',
  'wifi',
  'gps',
  'lte',
  '4g',
  '5g',
  'nfc',
  'usb',
  'usbc',
  'typec',
  'lightning',
  'micro',
  'microusb',
  'hdmi',
  'displayport',
  'dp',
  'atmos',
  'dolby',
  'hdr',
  'hdr10',
  'esim',
  'sim',
  'ram',
  'ssd',
  'hdd',
  'rom',
  'wireless',
  'qi',
  'magsafe',
  'anc',
  'enc',
  'ldac',
  'scan',
  'copy',
  'fax',
  'print',
  'copiere',
  'scanare',
  'tva',
  'adaptor',
  'adapter',
  'jack',
  'aux',
  'ethernet',
  'lan',
  'ir',
  'dab',
  'fm',
  'thunderbolt',
  'gb',
  'tb',
]);

/** Device kinds: a "Set" or "Kit" of these with a "+" item is a bundle ("Set PS5 + 2 jocuri"). */
const DEVICE_BUNDLE_KINDS: ReadonlySet<ProductKind> = new Set([
  'console',
  'phone',
  'tablet',
  'laptop',
  'desktop',
  'tv',
  'monitor',
  'smartwatch',
]);

/** Kinds whose "+" lists components of one product (keyboard + mouse combo, lamp kit). */
const COMPONENT_KINDS: ReadonlySet<ProductKind> = new Set([
  'peripheral',
  'accessory',
  'lighting',
  'kitchen',
  'network',
]);

const GIFT_RE =
  /(?:\+|\bcu\b|\bsi\b|\bplus\b|\bprimesti\b|\bbonus\b)[^,]{0,40}\bcadou\b|\bcadou\s*[:!]|\+\s*cadou\b/;
const GIFT_PRODUCT_RE = /\b(?:card|voucher|cutie|punga|set|pachet|ambalaj|hartie)\s+cadou\b/;
const GAME_RE =
  /\bcu (?:jocul|joc|jocurile|jocuri)\b|\bjoc(?:ul|urile)? inclus[ea]?\b|\binclude(?:\s+\S+){0,3}\s+jocu?r?i?l?\b|\b(?:cod|voucher)\s+(?:de\s+)?(?:descarcare\s+)?joc\b|\b(?:si|plus)\s+(?:\d+\s+)?(?:joc|jocuri|controller|controllere|manete?)\b/;

function plusItem(s: string, kind: ProductKind, kitLike: boolean): string | null {
  for (let k = s.indexOf('+'); k !== -1; k = s.indexOf('+', k + 1)) {
    const prevChar = s[k - 1];
    if (prevChar !== undefined && /[a-z0-9+]/.test(prevChar)) continue; // S25+, A+++, 80+
    const after = s.slice(k + 1).trimStart();
    const nextWord = /^([a-z0-9][a-z0-9-]*)(?:\s+([a-z0-9-]+))?/.exec(after);
    if (!nextWord) continue;
    const w = (nextWord[1] ?? '').replace(/-/g, '');
    const w2 = (nextWord[2] ?? '').replace(/-/g, '');
    if (SPEC_WORDS.has(w)) continue;
    if (/^\d+(?:\.\d+)?(?:gb|tb|mb|w|mah|hz|k|l|kg)$/.test(w)) continue;
    if (/^\d+(?:\.\d+)?$/.test(w) && SPEC_WORDS.has(w2)) continue;
    const before = s.slice(0, k).trimEnd();
    const prevWord = (/([a-z0-9-]+)$/.exec(before)?.[1] ?? '').replace(/-/g, '');
    if (SPEC_WORDS.has(prevWord)) continue;
    if (kitLike || COMPONENT_KINDS.has(kind)) continue;
    return w;
  }
  return null;
}

/**
 * Detects bundles: the words `bundle` and a leading `pachet` (not "pachet 4 baterii"); gifts
 * ("+ … cadou", "cu … cadou", "cadou:"; not "card cadou"); included games ("cu joc", "joc inclus",
 * "include … jocul", "cod joc", "și 2 jocuri"); and a free-standing `+` followed by an item
 * ("+ joc", "+ Mario Kart", "+ Husa") — not specs ("Wi-Fi + Cellular", "8GB + 256GB",
 * "+ adaptor SD"), not model suffixes ("S25+", "A+++"), not component lists of kits, accessories
 * and peripherals ("Kit … 3 becuri + Bridge"). `set` alone is never a bundle ("Set cuțite").
 */
export function detectBundle(
  title: string | null | undefined,
  categoryHint?: string | null,
): BundleResult {
  const s = foldLower(title);
  if (s === '') return { isBundle: false, reason: null };
  const kind = detectProductKind(title, categoryHint);
  if (/\bbundle\b/.test(s)) return { isBundle: true, reason: 'bundle' };
  if (
    /^pachet\b/.test(s) &&
    !/^pachet\s+(?:de\s+)?\d/.test(s) &&
    !/^pachet\s+(?:software|office|microsoft)\b/.test(s)
  ) {
    return { isBundle: true, reason: 'pachet' };
  }
  if (GIFT_RE.test(s) && !GIFT_PRODUCT_RE.test(s)) return { isBundle: true, reason: 'cadou' };
  if (GAME_RE.test(s) && kind !== 'game') return { isBundle: true, reason: 'joc inclus' };
  const kitLike = /^(?:kit|set|combo|starter kit)\b/.test(s) && !DEVICE_BUNDLE_KINDS.has(kind);
  const item = plusItem(s, kind, kitLike);
  if (item) return { isBundle: true, reason: `plus:${item}` };
  return { isBundle: false, reason: null };
}
