/**
 * Beauty (M29, prepared vertical: no live source until a feed is approved, docs/12): brand lookup
 * in the fragrance/cosmetics dictionary, attributes read from titles (volume, concentration,
 * shade, gender, gift set, refill, tester) and the matching rules for two beauty products. Pure.
 *
 * Identity: a beauty product is one sellable size of one product (ADR-012): "Sauvage EDT 100 ml"
 * and "Sauvage EDT 60 ml" are different products, as are EDT and EDP, a tester and the boxed
 * bottle, a gift set and the bottle alone, a refill and the bottle, two shades of one lipstick,
 * and flankers of one line ("Sauvage" and "Sauvage Elixir").
 */
import { BEAUTY_BRAND_SEEDS } from './beauty-brands-data';
import { foldText } from './fold';

export type Concentration = 'extrait' | 'parfum' | 'edp' | 'edt' | 'edc' | 'body_mist' | 'aftershave';
export type BeautyGender = 'female' | 'male' | 'unisex';

export interface BeautyAttributes {
  kind: 'fragrance' | 'cosmetics';
  /** Largest stated volume in ml ("100 ml", "3,4 ml"); sets state the main item first. */
  volumeMl?: number;
  /** Net weight in grams (creams, powders: "50 g"). */
  weightG?: number;
  concentration?: Concentration;
  /** Shade code of make-up ("nuanța 01", "nr. 120", "#101"), upper case. */
  shade?: string;
  gender?: BeautyGender;
  giftSet: boolean;
  refill: boolean;
  tester: boolean;
}

// ---------------------------------------------------------------------------------------------
// Brands

export interface BeautyBrandMatch {
  name: string;
  via: 'field' | 'title' | 'line';
}

interface Entry {
  name: string;
  tokens: string[];
  startOnly: boolean;
  line: boolean;
}

const ENTRIES: Entry[] = (() => {
  const out: Entry[] = [];
  for (const b of BEAUTY_BRAND_SEEDS) {
    for (const a of [b.name, ...(b.aliases ?? [])]) out.push({ name: b.name, tokens: foldText(a).split(' '), startOnly: !!b.startOnly, line: false });
    for (const l of b.lines ?? []) out.push({ name: b.name, tokens: foldText(l).split(' '), startOnly: false, line: true });
  }
  // Longest first: "christian dior" before "dior", "farmec gerovital" before "farmec".
  return out.sort((x, y) => y.tokens.length - x.tokens.length);
})();

const BY_KEY = new Map<string, string>();
for (const e of ENTRIES) if (!e.line) BY_KEY.set(e.tokens.join(' '), e.name);

/** Aliases or lines that point to two brands (a dictionary error; tested). */
export function beautyDictionaryIssues(): string[] {
  const seen = new Map<string, string>();
  const issues: string[] = [];
  for (const e of ENTRIES) {
    const k = e.tokens.join(' ');
    const prev = seen.get(k);
    if (prev && prev !== e.name) issues.push(`${k}: ${prev} / ${e.name}`);
    seen.set(k, e.name);
  }
  return issues;
}

/** True when the (folded) title starts with a fragrance/cosmetics brand name or alias (not a line). */
export function startsWithBeautyBrand(folded: string): boolean {
  const tokens = folded.split(' ');
  return ENTRIES.some((e) => !e.line && e.tokens.every((t, k) => tokens[k] === t));
}

export function findBeautyBrand(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return BY_KEY.get(foldText(raw)) ?? null;
}

/** The beauty brand of an offer: the shop's brand field when known, else the title (earliest mention). */
export function detectBeautyBrand(title: string, brandField?: string | null): BeautyBrandMatch | null {
  const field = findBeautyBrand(brandField);
  if (field) return { name: field, via: 'field' };
  const tokens = foldText(title).split(' ');
  let best: { at: number; entry: Entry } | null = null;
  for (const e of ENTRIES) {
    for (let i = 0; i + e.tokens.length <= tokens.length; i++) {
      if (e.startOnly && i !== 0) break;
      if (e.tokens.every((t, k) => tokens[i + k] === t)) {
        // Brand names beat lines at the same position; earlier mentions beat later ones.
        if (!best || i < best.at || (i === best.at && best.entry.line && !e.line)) best = { at: i, entry: e };
        break;
      }
    }
  }
  return best ? { name: best.entry.name, via: best.entry.line ? 'line' : 'title' } : null;
}

// ---------------------------------------------------------------------------------------------
// Attributes

const CONCENTRATIONS: Array<[Concentration, RegExp]> = [
  ['extrait', /\b(?:extrait de parfum|extrait)\b/],
  ['edp', /\b(?:apa de parfum|eau de parfum|edp)\b/],
  ['edt', /\b(?:apa de toaleta|eau de toilette|edt)\b/],
  ['edc', /\b(?:apa de colonie|eau de cologne|edc|cologne)\b/],
  ['body_mist', /\b(?:body mist|spray de corp|brume)\b/],
  ['aftershave', /\b(?:after ?shave|dupa ras)\b/],
];

const GENDERS: Array<[BeautyGender, RegExp]> = [
  ['unisex', /\bunisex\b/],
  ['female', /\b(?:pentru femei|pt femei|de dama|dama|femei|women|woman|for her|pour femme|femme)\b/],
  ['male', /\b(?:pentru barbati|pt barbati|barbati|barbat|men|man|for him|pour homme|homme)\b/],
];

/** Numbers in titles use a decimal comma or dot ("3,4 ml"); thousands never appear in volumes. */
function num(s: string): number {
  return Number(s.replace(',', '.'));
}

/** Beauty attributes from a title (Romanian or English, with or without diacritics). */
export function extractBeautyAttributes(title: string, opts: { fragrance?: boolean } = {}): BeautyAttributes {
  const raw = title.replace(/(\d),(\d)/g, '$1.$2');
  const f = foldText(raw.replace(/(\d)\.(\d)/g, '$1d$2')).replace(/(\d)d(\d)/g, '$1.$2');
  const out: BeautyAttributes = {
    kind: 'cosmetics',
    giftSet: /\b(?:set(?: cadou)?|caseta(?: cadou)?|gift ?set|coffret|pachet cadou)\b/.test(f) || /\d\s?ml\s?\+|\s\+\s?\p{L}/u.test(raw),
    refill: /\b(?:refill|rezerva|reumplere)\b/.test(f),
    tester: /\b(?:tester|fara cutie|unboxed)\b/.test(f),
  };
  const mls = [...f.matchAll(/\b(\d{1,4}(?:\.\d{1,2})?)\s?ml\b/g)].map((m) => num(m[1]!)).filter((v) => v > 0 && v <= 5000);
  if (mls.length) out.volumeMl = out.giftSet ? mls[0]! : Math.max(...mls);
  const gs = [...f.matchAll(/\b(\d{1,4}(?:\.\d{1,2})?)\s?(?:g|gr|grame)\b/g)].map((m) => num(m[1]!)).filter((v) => v > 0 && v <= 5000);
  if (gs.length) out.weightG = out.giftSet ? gs[0]! : Math.max(...gs);
  // "Parfum Dior Sauvage, Apa de toaleta": the leading "Parfum" is the product noun, not the
  // concentration; a later "Parfum" ("Sauvage Parfum", "Le Parfum") is.
  for (const [c, re] of CONCENTRATIONS) {
    if (re.test(f)) {
      out.concentration = c;
      break;
    }
  }
  if (!out.concentration && /\s(?:le )?parfum\b/.test(` ${f.replace(/^(?:set cadou |tester |mini )?parfum(?:uri)? /, '')}`) && !/^parfum(?:uri)?$/.test(f)) {
    out.concentration = 'parfum';
  }
  if (out.concentration || opts.fragrance) out.kind = 'fragrance';
  const genders = GENDERS.filter(([, re]) => re.test(f)).map(([g]) => g);
  if (genders.includes('unisex') || (genders.includes('female') && genders.includes('male'))) out.gender = 'unisex';
  else if (genders[0]) out.gender = genders[0];
  // Shades belong to make-up and care products; "Chanel No 5" names a fragrance.
  if (out.kind === 'cosmetics') {
    const shade = /\b(?:nuanta|shade|culoare|cod culoare|nr|no)\s?(\d{1,4}[a-z]?|[a-z]\d{1,3})\b/.exec(f) ?? /#\s?(\d{1,4}[a-z]?)\b/i.exec(title);
    if (shade) out.shade = shade[1]!.toUpperCase();
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Matching two beauty products

/** Words of a beauty title that name the kind of product or its packaging, not the product line. */
const BEAUTY_STOP = new Set(
  'apa de parfum toaleta colonie eau toilette cologne extrait edp edt edc spray vapo vaporisateur natural pentru pt femei barbati barbat dama women woman men man unisex homme femme pour for her him ml g gr set cadou caseta tester mini travel original nou noua new si cu the and la le l with crema ser masca gel lotiune sampon balsam ruj mascara fond ten pudra fard deodorant antiperspirant body mist parfumuri'.split(' '),
);

/** Flanker words: a line with one of them is another product ("Sauvage" vs "Sauvage Elixir"). */
const FLANKERS = new Set(
  'elixir intense intensa intensely absolu absolute extreme noir nuit night sport fraiche fresh aqua acqua privee prive gold oud black blue red rouge rose pink white blanc platinum silver crystal summer winter limited collector legere tendre sensual bloom glow lumiere sheer ultra parfum'.split(' '),
);

/** Every word of a brand's name and aliases ("Dior" → dior, christian, beauty). */
const BRAND_WORDS = new Map<string, Set<string>>();
for (const e of ENTRIES) {
  if (e.line) continue;
  const set = BRAND_WORDS.get(e.name) ?? new Set<string>();
  for (const t of e.tokens) set.add(t);
  BRAND_WORDS.set(e.name, set);
}

function coreTokens(title: string, brand: string | null): string[] {
  const brandTokens = new Set(brand ? [...foldText(brand).split(' '), ...(BRAND_WORDS.get(findBeautyBrand(brand) ?? brand) ?? [])] : []);
  return [...new Set(foldText(title).split(' '))].filter((w) => w.length >= 2 && !BEAUTY_STOP.has(w) && !brandTokens.has(w) && !/^\d+(?:ml|g)?$/.test(w));
}

export interface BeautySide {
  title: string;
  brand: string | null;
  attributes: Record<string, unknown>;
}

export interface BeautyComparison {
  conflicts: string[];
  titleSim: number;
}

/**
 * Hard conflicts between two beauty products. With `identifierEqual` (same GTIN or same field
 * MPN) only stated facts count (volume, weight, concentration, shade, gift set, refill, tester):
 * a shop's marketing words never break an identifier match. Otherwise gender (both stated) and
 * flankers count too, and the title cores must not disagree on both sides.
 */
export function compareBeauty(a: BeautySide, b: BeautySide, opts: { identifierEqual: boolean }): BeautyComparison {
  const conflicts: string[] = [];
  const fa = a.attributes;
  const fb = b.attributes;
  for (const k of ['volumeMl', 'weightG'] as const) {
    const x = typeof fa[k] === 'number' ? (fa[k] as number) : null;
    const y = typeof fb[k] === 'number' ? (fb[k] as number) : null;
    if (x !== null && y !== null && Math.abs(x - y) > 0.5) conflicts.push(`${k} ${x}≠${y}`);
  }
  for (const k of ['concentration', 'shade'] as const) {
    const x = typeof fa[k] === 'string' ? fa[k] : null;
    const y = typeof fb[k] === 'string' ? fb[k] : null;
    if (x && y && x !== y) conflicts.push(`${k} ${x}≠${y}`);
  }
  for (const k of ['giftSet', 'refill', 'tester'] as const) {
    if (typeof fa[k] === 'boolean' && typeof fb[k] === 'boolean' && fa[k] !== fb[k]) conflicts.push(k);
  }
  const ca = coreTokens(a.title, a.brand);
  const cb = coreTokens(b.title, b.brand);
  const common = ca.filter((x) => cb.includes(x)).length;
  const titleSim = ca.length + cb.length - common > 0 ? common / (ca.length + cb.length - common) : 0;
  if (!opts.identifierEqual) {
    const ga = typeof fa.gender === 'string' ? fa.gender : null;
    const gb = typeof fb.gender === 'string' ? fb.gender : null;
    if (ga && gb && ga !== gb) conflicts.push(`gender ${ga}≠${gb}`);
    const onlyA = ca.filter((x) => !cb.includes(x));
    const onlyB = cb.filter((x) => !ca.includes(x));
    const flanker = [...onlyA, ...onlyB].find((w) => FLANKERS.has(w));
    if (flanker) conflicts.push(`flanker ${flanker}`);
    else if (onlyA.length > 0 && onlyB.length > 0) conflicts.push('title');
  }
  return { conflicts, titleSim };
}
