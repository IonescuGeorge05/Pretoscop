/**
 * Bundle detection: an offer that sells the product together with something else (a game, a gift,
 * a controller, a subscription) and therefore cannot be compared with the product's plain price.
 * Pure. Multipacks ("Set 2 becuri", "3-pack") are not bundles: they are counted in
 * `attributes.packCount` and matched as their own products. What a product always ships with is
 * not a bundle either: the built-in games of a retro handheld ("cu jocuri", "15000 jocuri", "card
 * inclus de 64GB") or the controllers and light gun in a no-name TV console's box.
 */
import { detectProductKind, type ProductKind } from './product-kind';
import { foldLower } from './text';

/** What the extra item is: a game, a gift, an accessory, a subscription, or something else. */
export type BundleKind = 'game' | 'gift' | 'accessory' | 'subscription' | 'other';

export interface BundleResult {
  isBundle: boolean;
  /** The kind of extra item; null when not a bundle. */
  kind: BundleKind | null;
  /**
   * `<kind>:<evidence>`, evidence being `bundle`, `pachet`, `cadou`, `joc inclus` or
   * `plus:<word>` (e.g. `gift:plus:woven`, `game:plus:joc`, `other:bundle`); null when not a
   * bundle.
   */
  reason: string | null;
}

const NOT_A_BUNDLE: BundleResult = { isBundle: false, kind: null, reason: null };

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

/** Devices whose extra accessory is a promotional gift ("Telefon … + Woven Strap Ring Stand"). */
const GIFT_HOST_KINDS: ReadonlySet<ProductKind> = new Set([
  'phone',
  'tablet',
  'smartwatch',
  'fitness_band',
]);

const GIFT_RE =
  /(?:\+|\bcu\b|\bsi\b|\bplus\b|\bprimesti\b|\bbonus\b)[^,]{0,40}\bcadou\b|\bcadou\s*[:!]|\+\s*cadou\b/;
const GIFT_PRODUCT_RE = /\b(?:card|voucher|cutie|punga|set|pachet|ambalaj|hartie)\s+cadou\b/;
const GAME_RE =
  /\bcu (?:\d\s+)?(?:jocul|joc|jocurile|jocuri)\b|\bjoc(?:ul|uri|urile)? inclus[ea]?\b|\binclude(?:\s+[^\s,]+){0,3}\s+jocu?r?i?l?\b|\b(?:cod|voucher)\s+(?:de\s+)?(?:descarcare\s+)?joc\b|\b(?:si|plus)\s+(?:\d+\s+)?(?:joc|jocuri|controller|controllere|manete?)\b/;

/**
 * What the product ships with, never bundle evidence: built-in games ("cu jocuri", "15000
 * jocuri", "+ 20.000 jocuri", "jocuri preinstalate", "400 in 1"), memory cards with the games
 * ("card inclus de 64GB", "Game Memory Card"), and compatibility phrases ("compatibil doar cu
 * jocuri din PS4").
 */
const BUILT_IN: readonly RegExp[] = [
  /\b(?:compatibil\w*|compatil)\s+(?:doar\s+)?cu\s+jocuri\b/g,
  /\bjocuri\s+(?:din|preinstalate|preincarcate|incorporate|integrate|instalate|clasice|retro)\b/g,
  /(?:\+\s*)?\b(?:\d{1,3}(?:[.,]\d{3})+|\d{2,})\+?\s+(?:de\s+)?jocuri\b/g,
  /\b(?:cu|include|incorporat\w*|integrat\w*|preinstalat\w*)\s+jocuri\b/g,
  /\b(?:game\s+)?memory\s+card\b|\bcard\s+(?:sd\s+|tf\s+|micro\s?sd\s+)?(?:inclus|incorporat|integrat)\w*/g,
  /\b\d+\s+in\s+1\b/g,
];

/** A mainstream console platform named before any compatibility or emulation phrase. */
const MAINSTREAM_CONSOLE =
  /\b(?:playstation|ps[345]|xbox|nintendo|switch|steam deck|rog ally|legion go|msi claw)\b/;
const PLATFORM_CUT =
  /\b(?:pentru|compatibil\w*|compatil|compatible|for|emulat\w*|emulare|emuleaza|suporta|suport|jocuri din)\b/;

const SUBSCRIPTION_RE =
  /\b(?:abonament\w*|subscription|game pass|ps plus|playstation plus|switch online|\d+ (?:zile|luni|months?) (?:abonament|online))\b/;
const GAME_ITEM_RE = /^(?:\d+\s+)?(?:joc|jocul|jocuri|jocurile|game|games)\b/;
const ACCESSORY_ITEM_RE =
  /\b(?:extra|controller\w*|controler\w*|manet\w*|gamepad\w*|joy-?con\w*|casti|headset|buds|earbuds|husa|huse|folie|incarcator|statie|stativ|stand|suport|strap|ring|curea|cablu|card|mouse|tastatura|geanta|rucsac|powerbank|baterie externa)\b/;
/** Games or in-game content named in a "… Bundle" / "Pachet …" title. */
const GAME_HINT_RE =
  /\bjoc(?:ul)?\b|\b(?:fortnite|fifa|fc \d{2}|call of duty|gta|mario|zelda|pokemon|minecraft|spider-?man|god of war|astro bot|gran turismo|horizon|nba 2k\d*|forza|halo|kirby|donkey kong|animal crossing|splatoon|metroid|hogwarts|ghost of)\b/;

function maskBuiltIn(s: string): string {
  let t = s;
  for (const re of BUILT_IN) t = t.replace(re, ' ');
  return t;
}

/** The first "+" item that is not a spec, a model suffix or a component of a kit. */
function plusItem(
  s: string,
  kind: ProductKind,
  kitLike: boolean,
): { word: string; text: string } | null {
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
    return { word: w, text: (/^[^+,|(]*/.exec(after)?.[0] ?? '').trim() };
  }
  return null;
}

function itemKind(text: string, host: ProductKind): BundleKind {
  if (SUBSCRIPTION_RE.test(text)) return 'subscription';
  if (GAME_ITEM_RE.test(text)) return 'game';
  const accessory = ACCESSORY_ITEM_RE.test(text);
  if (GIFT_HOST_KINDS.has(host)) return 'gift';
  if (accessory) return 'accessory';
  // A console with a named extra that is neither an accessory nor a subscription: a game.
  return host === 'console' ? 'game' : 'other';
}

/**
 * Detects bundles: the word `bundle`; a leading `pachet` (not "pachet 4 baterii"); gifts ("+ …
 * cadou", "cu … cadou", "cadou:"; not "card cadou"); included games ("cu jocul", "joc inclus",
 * "include … jocul", "cod joc", "și 2 jocuri"); and a free-standing `+` followed by an item ("+
 * joc", "+ Mario Kart", "+ Husa", "+ Woven Strap Ring Stand") — not specs ("Wi-Fi + Cellular",
 * "8GB + 256GB", "+ adaptor SD"), not model suffixes ("S25+", "A+++"), not component lists of
 * kits, accessories and peripherals ("Kit … 3 becuri + Bridge"). `set` alone is never a bundle.
 * Built-in content never counts (see `BUILT_IN`), and the package contents of a console that is
 * not a mainstream platform (retro handhelds, TV clones: "+ Controller", "+ Pistol 2x Pady") are
 * not extra items; only the word `bundle` or a gift makes those a bundle.
 * The kind: `gift` for "cadou" and for an extra accessory on a phone, tablet or watch; `game`,
 * `subscription` or `accessory` from the extra item ("+ Joc NBA 2K26", "+ 90 zile Abonament",
 * "+ Extra controller") or from a game named in a "… Bundle" title ("EA Sports FC 26 Bundle");
 * else `other` ("30th Anniversary Limited Edition Bundle", "+ Office 2024").
 */
export function detectBundle(
  title: string | null | undefined,
  categoryHint?: string | null,
): BundleResult {
  const s = foldLower(title);
  if (s === '') return NOT_A_BUNDLE;
  const kind = detectProductKind(title, categoryHint);
  const t = maskBuiltIn(s);
  const cut = PLATFORM_CUT.exec(t);
  const packaged = kind === 'console' && !MAINSTREAM_CONSOLE.test(cut ? t.slice(0, cut.index) : t);
  const kitLike = /^(?:kit|set|combo|starter kit)\b/.test(t) && !DEVICE_BUNDLE_KINDS.has(kind);
  const item = packaged ? null : plusItem(t, kind, kitLike);

  let evidence: string | null = null;
  if (/\bbundle\b/.test(t)) evidence = 'bundle';
  else if (
    !packaged &&
    /^pachet\b/.test(t) &&
    !/^pachet\s+(?:de\s+)?\d/.test(t) &&
    !/^pachet\s+(?:software|office|microsoft)\b/.test(t)
  ) {
    evidence = 'pachet';
  } else if (GIFT_RE.test(t) && !GIFT_PRODUCT_RE.test(t)) evidence = 'cadou';
  else if (!packaged && GAME_RE.test(t) && kind !== 'game') evidence = 'joc inclus';
  else if (item) evidence = `plus:${item.word}`;
  if (evidence === null) return NOT_A_BUNDLE;

  let bundleKind: BundleKind;
  if (evidence === 'cadou') bundleKind = 'gift';
  else if (item) bundleKind = itemKind(item.text, kind);
  else if (evidence === 'joc inclus' || GAME_HINT_RE.test(t)) bundleKind = 'game';
  else if (SUBSCRIPTION_RE.test(t)) bundleKind = 'subscription';
  else bundleKind = 'other';
  return { isBundle: true, kind: bundleKind, reason: `${bundleKind}:${evidence}` };
}
