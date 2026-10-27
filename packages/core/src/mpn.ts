/**
 * Manufacturer part numbers (MPN): normalization for comparison and extraction of model codes
 * from titles. Pure.
 */
import { brandTokens } from './brands';
import { asciiFold, normalizeText } from './text';

const MPN_PLACEHOLDERS = new Set([
  'NA',
  'NONE',
  'NULL',
  'GENERIC',
  'FARA',
  'OEM',
  'TBD',
  'UNKNOWN',
  'NECUNOSCUT',
  'NONAME',
  'DIVERSE',
  'XXX',
  'XXXX',
  'NOMPN',
  'NUEXISTA',
  'NU',
  'NOU',
  'DEFAULT',
  'TEST',
]);

/**
 * Comparison form of an MPN: upper case ASCII, every space, dash, slash, dot and other separator
 * removed ("MXU23ZD/A" → "MXU23ZDA", "SM-S938BZKDEUE" → "SMS938BZKDEUE"). Null for empty values,
 * placeholders ("N/A", "Generic", "-") and anything shorter than 3 characters.
 */
export function normalizeMpn(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = asciiFold(normalizeText(raw))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (s.length < 3 || s.length > 40) return null;
  if (MPN_PLACEHOLDERS.has(s) || /^0+$/.test(s)) return null;
  return s;
}

export interface MpnCandidate {
  /** The token as written in the title. */
  raw: string;
  /** `normalizeMpn(raw)`. */
  norm: string;
  /** Higher is more likely to be the manufacturer code. */
  score: number;
  source: 'title' | 'product_code';
}

/** Spec and unit tokens that are never part numbers (checked on lower-case tokens). */
const SPEC_PATTERNS: readonly RegExp[] = [
  /^\d+(?:[.,]\d+)?(?:gb|tb|mb|kb|mah|wh|w|kw|hz|khz|mhz|ghz|mp|mm|cm|m|km|kg|g|l|ml|v|a|rpm|btu|db|dbi|nits|lm|k|p|fps|ms|bit|bits|nm|ore|h|min|pa|bar|ah|inch|in|x|°c|c|km\/h)$/,
  /^\d+x\d+(?:gb|tb|mm|cm)?$/,
  /^\d+in\d+$/,
  /^\d+-?(?:core|cores|nuclee|thread|threads|bit|inch|in|pack|buc|zone|seturi|piese|ani|luni|port|porturi|ways?|speed|trepte)$/,
  /^[2-6]g$/,
  /^(?:wi-?fi|wifi)\d*e?$/,
  /^usb(?:-?[abc]|\d(?:\.\d)?)?$/,
  /^type-?c$/,
  /^(?:lp)?g?ddr\d+x?$/,
  /^pcie?\d*(?:\.\d)?$/,
  /^m\.?2$/,
  /^hdmi\d*(?:\.\d+)?$/,
  /^dp\d*(?:\.\d+)?$/,
  /^bt\d(?:\.\d)?$/,
  /^ip[x\d]\d$/,
  /^a\+{1,3}$/,
  /^hdr(?:10)?\+?$/,
  /^\d+(?:st|nd|rd|th)$/,
  /^gen\.?\d+$/,
  /^v\d+(?:\.\d+)*$/,
  /^cl\d{2}$/,
  /^lga\d+$/,
  /^h\.?26[45]$/,
  /^\d{3,4}x\d{3,4}$/,
  /^\d+(?:\.\d)?k$/,
  /^\d{3,4}p$/,
  /^x\d{2,3}$/,
  // CPUs: i5-13420H, i3-N305, 8645HS, 275HX, 9800X3D, 265K, 125U
  /^(?:i[3579]|core)-?n?\d{3,5}[a-z]{0,3}$/,
  /^\d{3,5}(?:h|hs|hx|u|p|k|kf|ks|f|t|g\d|x|x3d|xt|xtx|ti|s|v|ge|hk|m)$/,
  /^n\d{3,4}$/,
  // GPUs: RTX4070, RX7600, 4070Ti
  /^(?:rtx|gtx|rx|mx|arc|quadro|radeon|vega)-?\d{3,4}[a-z]*$/,
  /^\d{4}(?:ti|xt|xtx|super)$/,
  // Motherboard chipsets: B650, X870E, Z890, H610M, B650-A, B650M-PLUS
  /^[abhxzq]\d{3}[a-z]?(?:-[a-z]+)?$/,
];

/** Series words that form model names with a small number (HERO13, PRO1, Watch8). */
const SERIES_WORDS = new Set([
  'hero',
  'pro',
  'max',
  'mini',
  'note',
  'fold',
  'flip',
  'watch',
  'buds',
  'band',
  'tab',
  'pad',
  'book',
  'magic',
  'reno',
  'find',
  'mate',
  'nova',
  'edge',
  'moto',
  'razr',
  'nord',
  'pixel',
  'galaxy',
  'series',
  'gen',
  'ultra',
  'plus',
  'lite',
  'neo',
  'air',
  'one',
  'smart',
  'iphone',
  'ipad',
  'vivo',
  'redmi',
  'poco',
  'honor',
  'zenfone',
  'xperia',
  'pura',
  'mix',
  'civi',
]);

/**
 * Model names, not part numbers: a word followed by a 1–2 digit number, written in mixed case
 * ("Fold7", "Watch8", "Reno14", "Magic7") or using a known series word ("HERO13", "PRO1").
 * All-caps codes such as "FTXF35E" stay candidates.
 */
function isModelName(token: string): boolean {
  const m = /^([A-Za-z]{3,})(\d{1,2})([A-Za-z]?)$/.exec(token);
  if (!m) return false;
  const letters = m[1] ?? '';
  return /[a-z]/.test(token) || SERIES_WORDS.has(letters.toLowerCase());
}

function isSpec(lower: string): boolean {
  return SPEC_PATTERNS.some((re) => re.test(lower));
}

function isYearRange(lower: string): boolean {
  return /^(?:19|20)\d{2}-(?:19|20)?\d{2}$/.test(lower);
}

/** A single token (no slash) that could be a part number on its own. */
function plausiblePart(token: string): boolean {
  const lower = token.toLowerCase();
  if (isSpec(lower) || isModelName(token)) return false;
  const norm = lower.replace(/[^a-z0-9]/g, '');
  if (/^\d{3,6}-\d{2,6}$/.test(lower) && !isYearRange(lower)) return norm.length >= 6;
  if (!/[a-z]/.test(norm) || !/\d/.test(norm)) return false;
  const structured = /[a-z0-9][-.][a-z0-9]/.test(lower);
  return norm.length >= 5 || (structured && norm.length >= 4);
}

function plausibleToken(token: string): boolean {
  if (!token.includes('/')) return plausiblePart(token);
  const parts = token.split('/').filter((p) => p !== '');
  if (parts.length === 0) return false;
  // "MXU23ZD/A", "50PUS8009/12", "1074TWM6/1-S": a code with a short suffix.
  return plausiblePart(parts[0] as string) && parts.slice(1).every((p) => p.length <= 4);
}

function alternations(norm: string): number {
  let count = 0;
  for (let i = 1; i < norm.length; i++) {
    const a = /\d/.test(norm[i - 1] as string);
    const b = /\d/.test(norm[i] as string);
    if (a !== b) count++;
  }
  return count;
}

function scoreOf(raw: string, norm: string, source: MpnCandidate['source']): number {
  let score = Math.min(norm.length, 14);
  if (/[A-Za-z0-9][-/.][A-Za-z0-9]/.test(raw)) score += 4;
  if (/[A-Z]/.test(raw) && !/[a-z]/.test(raw)) score += 3;
  if (alternations(norm) >= 2) score += 2;
  if (source === 'product_code') score += 5;
  return score;
}

export interface ExtractMpnOptions {
  /** Brand name: its own words are never candidates. */
  brand?: string | null;
  /** A "cod produs" value removed from the title by `cleanTitleDetailed`. */
  productCode?: string | null;
}

/**
 * Candidate manufacturer codes in a title, best first. A candidate mixes letters and digits, has
 * at least 5 characters (4 with an inner dash or dot), and is not a spec or unit token (16GB, 55inch,
 * 4K, 5G, WiFi6, USB-C, DDR5, M.2, A+++, 2x16GB, 10-core), a year, a CPU or GPU model
 * (i5-13420H, 8645HS, RTX4070), a chipset (B650-A) or a model name (Fold7, Watch8).
 * Slash codes keep a short suffix ("MXU23ZD/A"). Ranking favours long, structured, upper-case codes
 * that alternate letters and digits; a trailing "cod produs" value gets a bonus.
 */
export function extractMpnCandidates(
  title: string | null | undefined,
  options: ExtractMpnOptions = {},
): MpnCandidate[] {
  const text = normalizeText(title).replace(/[\u{2122}\u{AE}\u{A9}]/gu, ' ');
  const brandWords = new Set(brandTokens(options.brand ?? ''));
  const out: MpnCandidate[] = [];
  const seen = new Set<string>();
  const push = (raw: string, source: MpnCandidate['source']): void => {
    const norm = normalizeMpn(raw);
    if (!norm || seen.has(norm)) return;
    if (brandWords.has(norm.toLowerCase())) return;
    seen.add(norm);
    out.push({ raw, norm, score: scoreOf(raw, norm, source), source });
  };
  const tokens = text.split(/[\s,;()[\]{}|"]+/);
  tokens.forEach((t) => {
    const token = t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (token !== '' && plausibleToken(token)) push(token, 'title');
  });
  const code = options.productCode?.trim();
  if (code && plausibleToken(code)) push(code, 'product_code');
  const order = new Map(out.map((c, i) => [c.norm, i] as const));
  return out.sort(
    (a, b) => b.score - a.score || (order.get(a.norm) ?? 0) - (order.get(b.norm) ?? 0),
  );
}
