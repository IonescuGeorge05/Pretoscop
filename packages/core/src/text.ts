/**
 * Romanian text normalization (ADR-014, architecture §13). Pure functions, no I/O.
 *
 * - `normalizeText`: the canonical display form (NFC, comma-below diacritics, clean whitespace).
 * - `asciiFold`: diacritic-free copy for search fields and slugs.
 * - `slugify`: URL slugs.
 * - `cleanTitle`: removes shop boilerplate from offer titles.
 * - `titleForMatch` / `matchTokens`: lower-case ASCII tokens with units normalized, for matching.
 *
 * Invisible characters are always written as `\u{…}` escapes in this file, never literally.
 */
import { cmToScreenInches, screenContextOf } from './units';

const CEDILLA_TO_COMMA: Readonly<Record<string, string>> = {
  '\u{15F}': '\u{219}', // s with cedilla → s with comma below
  '\u{15E}': '\u{218}', // S with cedilla → S with comma below
  '\u{163}': '\u{21B}', // t with cedilla → t with comma below
  '\u{162}': '\u{21A}', // T with cedilla → T with comma below
};

/**
 * Canonical text form: NFC; legacy cedilla ş ţ Ş Ţ (U+015F/0163/015E/0162) → comma-below ș ț Ș Ț
 * (U+0219/021B/0218/021A); control, zero-width and soft-hyphen characters removed; typographic
 * quotes → `"`/`'`; dashes and the minus sign → `-`; every kind of whitespace (incl. NBSP U+00A0
 * and narrow NBSP U+202F) collapsed to one space; trimmed.
 */
export function normalizeText(input: string | null | undefined): string {
  if (input == null) return '';
  let s = String(input).normalize('NFC');
  s = s.replace(/[\u{15F}\u{15E}\u{163}\u{162}]/gu, (c) => CEDILLA_TO_COMMA[c] ?? c);
  s = s.replace(/[\u{AD}\u{200B}-\u{200D}\u{2060}\u{FEFF}]/gu, '');
  // C0 controls except TAB/LF/VT/FF/CR (those become spaces below), DEL and C1 controls.
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g, '');
  s = s.replace(/[\u{201C}\u{201D}\u{201E}\u{201F}\u{AB}\u{BB}\u{2033}\u{2DD}\u{FF02}]/gu, '"');
  s = s.replace(/[\u{2018}\u{2019}\u{201A}\u{201B}\u{2032}\u{B4}\u{60}\u{2BC}\u{FF07}]/gu, "'");
  s = s.replace(/[\u{2010}-\u{2015}\u{2212}\u{FE58}\u{FE63}\u{FF0D}]/gu, '-');
  s = s.replace(/\u{2026}/gu, '...');
  // `\s` covers NBSP, narrow NBSP, the U+2000–U+200A block, U+2028/2029 and U+3000.
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

const SPECIAL_FOLDS: Readonly<Record<string, string>> = {
  ß: 'ss',
  ẞ: 'SS',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ø: 'o',
  Ø: 'O',
  đ: 'd',
  Đ: 'D',
  ð: 'd',
  Ð: 'D',
  ł: 'l',
  Ł: 'L',
  þ: 'th',
  Þ: 'TH',
  ı: 'i',
  ħ: 'h',
  Ħ: 'H',
  ŧ: 't',
  Ŧ: 'T',
  ŀ: 'l',
  Ŀ: 'L',
  ŋ: 'n',
  Ŋ: 'N',
};

/**
 * Removes diacritics, keeping case: ș/ş→s, ț/ţ→t, ă→a, â→a, î→i (and capitals), plus every other
 * Latin diacritic (é→e, ö→o, ñ→n …) and a few letters without a decomposition (ß→ss, ø→o, ł→l).
 * Symbols such as ™ are left alone (see `titleForMatch`).
 */
export function asciiFold(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u{300}-\u{36F}]/gu, '')
    .replace(/[ßẞæÆœŒøØđĐðÐłŁþÞıħĦŧŦŀĿŋŊ]/g, (c) => SPECIAL_FOLDS[c] ?? c)
    .normalize('NFC');
}

/** `asciiFold(normalizeText(s)).toLowerCase()`: the form most detectors work on. */
export function foldLower(input: string | null | undefined): string {
  return asciiFold(normalizeText(input)).toLowerCase();
}

/**
 * URL slug: ASCII, lower case, words joined by `-`, at most `maxLength` (80) characters, cut at a
 * word boundary when possible, never a leading or trailing dash. Apostrophes are dropped
 * (De'Longhi → delonghi), `&` is dropped, a `+` glued to a word becomes `plus` (S25+ → s25-plus).
 */
export function slugify(input: string, maxLength = 80): string {
  let s = foldLower(input);
  s = s.replace(/'/g, '');
  s = s.replace(/([a-z0-9])\+(?![+a-z0-9])/g, '$1 plus ');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > maxLength) {
    s = s.slice(0, maxLength);
    const cut = s.lastIndexOf('-');
    if (cut >= Math.floor(maxLength / 2)) s = s.slice(0, cut);
    s = s.replace(/-+$/, '');
  }
  return s;
}

/**
 * Shop names that appear as `<title> - eMAG.ro`, `<title> | Altex` etc. Matched case- and
 * diacritic-insensitively after a separator (`-`, `|`, `:`) at the end of a title, with an
 * optional `.ro` / `Romania`.
 */
export const SHOP_TITLE_SUFFIXES: readonly string[] = [
  'emag',
  'altex',
  'media galaxy',
  'mediagalaxy',
  'flanco',
  'pc garage',
  'pcgarage',
  'evomag',
  'libris',
  'dedeman',
  'vexio',
  'it galaxy',
  'itgalaxy',
  'carrefour',
  'auchan',
  'bonami',
  'jysk',
  'istyle',
  'notino',
  'sephora',
  'answear',
  'fashion days',
  'fashiondays',
  'leroy merlin',
  'hornbach',
  'decathlon',
  'quickmobile',
  'mobilissimo',
];

/** Shop names that are also ordinary words: removed only when written with `.ro`. */
export const SHOP_TITLE_SUFFIXES_DOT_RO_ONLY: readonly string[] = [
  'cel',
  'elefant',
  'flip',
  'forit',
  'olx',
  'douglas',
];

const namesAlt = (names: readonly string[]): string =>
  names.map((n) => n.replace(/ /g, String.raw`\s*`)).join('|');
const SHOP_SUFFIX_RE = new RegExp(
  String.raw`\s*[-|:]\s*(?:www\.)?(?:(?:${namesAlt(SHOP_TITLE_SUFFIXES)})(?:\s*\.\s*ro)?|(?:${namesAlt(SHOP_TITLE_SUFFIXES_DOT_RO_ONLY)})\s*\.\s*ro)(?:\s+romania)?\s*$`,
  'i',
);
const PROMO_PREFIX_RE =
  /^(?:oferta|promo|promotie|nou|new|hot|lichidare(?: de)? stoc|black friday|reducere|super pret|pret special)\s*[!:|-]+\s*/i;
const BUY_PREFIX_RE = /^cump[aă]r[aă]\s+/i;
const BUY_TAIL_RE =
  /\s+(?:(?:la|cu)\s+(?:cel(?:\s+mai)?\s+(?:bun|mic)\s+)?pre[tț](?:ul|uri)?\b.*|online\b.*)$/i;
const PRICE_TAIL_RE = /\s*[-|]\s*pre[tț](?:uri)?\s+(?:mic|bun|redus|avantajos|special)\b.*$/i;
const PRODUCT_CODE_TAIL_RE =
  /(\s*[,;|(-]\s*|\s+)(cod(?:\s+(?:produs|articol|intern|ean))?|sku|ref\.?|referin[tț][aă]|art\.?\s*nr\.?|nr\.?\s*art\.?)\s*[:.#]?\s*([A-Za-z0-9][\w./-]*)\)?\s*$/i;

export interface CleanedTitle {
  /** Title without shop boilerplate. */
  title: string;
  /** A trailing "cod produs XYZ" value that was removed (may be the manufacturer part number). */
  productCode: string | null;
  /** Pieces of boilerplate that were removed, for audit. */
  removed: string[];
}

/**
 * Removes shop boilerplate from an offer title and reports what was removed:
 * `Cumpara … la pret mic - eMAG.ro` → `…`; `… | Altex` / `… - PC Garage` / `… – Libris` → `…`;
 * leading promo words (`OFERTA!`, `Promo:`); a trailing `, cod produs 12345` (returned as
 * `productCode` because shops sometimes put the manufacturer part number there).
 * Condition words (Resigilat …) are kept on purpose.
 */
export function cleanTitleDetailed(input: string | null | undefined): CleanedTitle {
  let s = normalizeText(input);
  const removed: string[] = [];
  let productCode: string | null = null;
  const strip = (re: RegExp): boolean => {
    const m = re.exec(s);
    if (!m || m[0].trim() === '') return false;
    removed.push(m[0].trim());
    s = (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim();
    return true;
  };
  for (let i = 0; i < 3; i++) {
    const changed = strip(SHOP_SUFFIX_RE) || strip(PRICE_TAIL_RE);
    if (!changed) break;
  }
  if (strip(BUY_PREFIX_RE)) strip(BUY_TAIL_RE);
  strip(PROMO_PREFIX_RE);
  const code = PRODUCT_CODE_TAIL_RE.exec(s);
  if (code && code.index > 0) {
    // Keep titles like "Joc COD MW3": a bare "cod" needs a separator before it (", cod 123").
    const [raw, sep = '', keyword = '', value = ''] = code;
    const qualified = !/^cod$/i.test(keyword.trim()) || /[,;|(-]/.test(sep);
    if (qualified) {
      productCode = value;
      removed.push(raw.trim());
      s = s.slice(0, code.index).trim();
    }
  }
  s = s.replace(/[\s,;:|/-]+$/, '').replace(/^[\s,;:|/-]+/, '');
  return { title: s.replace(/\s{2,}/g, ' ').trim(), productCode, removed };
}

/** `cleanTitleDetailed(title).title`. */
export function cleanTitle(input: string | null | undefined): string {
  return cleanTitleDetailed(input).title;
}

const UNIT_GLUE_RE =
  /(\d+(?:\.\d+)?)\s*(tb|gb|mb|kb|mah|wh|kw|w|khz|mhz|ghz|hz|mp|mm|cm|kg|ml|l|v|rpm|btu|db|nits|lm)\b/g;

/**
 * Matching form of a title: ASCII-folded, lower case, symbols removed, decimal commas → dots,
 * units glued to their numbers (`16 GB`→`16gb`, `1 TB`→`1tb`, `120 Hz`→`120hz`), screen sizes
 * unified (`55"`, `55 inch`, `55 inchi`, and `139 cm` on TVs/monitors/laptops → `55in`),
 * `Wi-Fi`→`wifi` (`Wi-Fi 6E`→`wifi6e`), `USB Type-C`→`usbc`, `Full HD`→`fullhd`,
 * `Ultra HD`→`uhd`, `1920 x 1080`→`1920x1080`, a `+` glued to a model (`S25+`) → ` plus`.
 */
export function titleForMatch(input: string | null | undefined): string {
  let s = foldLower(input);
  const context = screenContextOf(s);
  s = s.replace(/[\u{2122}\u{AE}\u{A9}\u{2117}\u{2120}\u{B0}]/gu, ' ').replace(/\u{D7}/gu, 'x');
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  s = s.replace(/\b(\d{1,3})\.(\d{3})(?=\s*(?:w|kw|btu|rpm|mah|lm|ron|lei)\b)/g, '$1$2');
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:"|''|inch(?:es)?\b|inchi\b|inci\b|toli\b)/g, '$1in ');
  if (context) {
    s = s.replace(/\b(\d{2,3}(?:\.\d)?)\s*cm\b/g, (_m, v: string) => {
      const inches = cmToScreenInches(Number(v), context);
      return inches == null ? `${v}cm` : `${inches}in`;
    });
  }
  s = s.replace(/\bwi[\s-]?fi\b/g, 'wifi').replace(/\bwifi\s*(\d)(e?)\b/g, 'wifi$1$2');
  s = s.replace(/\busb[\s-]?type[\s-]?c\b|\btype[\s-]?c\b|\busb[\s-]c\b/g, 'usbc');
  s = s.replace(/\bfull[\s-]?hd\b/g, 'fullhd').replace(/\bultra[\s-]?hd\b/g, 'uhd');
  s = s.replace(UNIT_GLUE_RE, '$1$2');
  s = s.replace(/\b(\d{3,4})\s*x\s*(\d{3,4})\b/g, '$1x$2');
  s = s.replace(/([a-z0-9])\+(?![+a-z0-9])/g, '$1 plus ');
  s = s.replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
  s = s.replace(/[^a-z0-9.\s]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** `titleForMatch(title)` split into tokens. */
export function matchTokens(input: string | null | undefined): string[] {
  const s = titleForMatch(input);
  return s === '' ? [] : s.split(' ');
}

/**
 * True when a title looks like machine junk rather than a product name: cel.ro serves decoy
 * products named like `Husa Pro b6fc26eb` or `a3f9c2e17b` behind its captcha. A title is junk
 * when it contains a lower-case hexadecimal token of 6+ characters mixing digits and letters a–f
 * and either the title is short (≤ 4 words) or such tokens make up ≥ 40% of its words.
 */
export function isHexJunkTitle(input: string | null | undefined): boolean {
  const s = normalizeText(input);
  if (s === '') return false;
  const words = s.split(/[\s,;:|/()[\]]+/).filter((w) => w !== '');
  const isHex = (w: string): boolean =>
    /^[0-9a-f]{6,}$/.test(w) && /[0-9]/.test(w) && /[a-f]/.test(w) && !/^\d+$/.test(w);
  const hex = words.filter(isHex);
  if (hex.length === 0) return false;
  return words.length <= 4 || hex.length / words.length >= 0.4;
}
