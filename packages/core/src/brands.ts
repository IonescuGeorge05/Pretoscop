/**
 * Brand detection from a shop's brand field and the offer title. Pure.
 *
 * Rules (in order):
 * 1. A brand field that maps to a known brand (name, alias or product line, case/diacritic/
 *    punctuation-insensitive, legal suffixes like "SRL"/"Electronics"/"Romania" removed) wins:
 *    `via: 'field'`, confidence 1. If the title names a different known brand it is reported in
 *    `conflict`.
 * 2. Placeholder fields ("Generic", "OEM", "Fără brand", "N/A" …) count as no field.
 * 3. Title scan: brand names, aliases and product lines are matched as whole words, longest
 *    match first. Ignored: mentions after a compatibility marker ("Husă pentru iPhone 17",
 *    "compatibil cu Samsung"), except accessory makers ("Suport … pentru telefon Hoco"); device product lines on accessory titles ("Husă iPhone 17" is not
 *    Apple); platform lines on game titles ("Joc … PS5" is not Sony); weak brands (Intel, NVIDIA,
 *    Leica …) unless nothing else is named; Redmi/POCO only when no other brand is named;
 *    ambiguous words (Arctic, Sapphire, Ninja …) outside the first 8 words or before a colour
 *    ("Arctic Grey"); a short name right after a number ("2 HP"). The earliest remaining mention
 *    wins: Romanian titles put the brand right after the product noun.
 * 4. An unknown brand field is returned title-cased with lower confidence (0.5–0.6), unless the
 *    title names a known brand, which is then preferred.
 */
import { BRAND_SEEDS, type BrandSeed, type LineSeed } from './brands-data';
import { detectProductKind, type ProductKind } from './product-kind';
import { foldLower, normalizeText, slugify } from './text';

export interface Brand {
  name: string;
  slug: string;
  aliases: readonly string[];
  lines: readonly string[];
  weak: boolean;
  ambiguous: boolean;
  fieldOnly: boolean;
  /** Makes only accessories (Spigen, Hoco …). */
  accessoryMaker: boolean;
}

export type BrandVia = 'field' | 'title' | 'alias' | 'product_line';

export interface BrandMatch {
  name: string;
  slug: string;
  /** 1 = brand field mapped to a known brand; 0.9 title name; 0.85 alias; 0.8 line; ≤0.7 weaker. */
  confidence: number;
  via: BrandVia;
  /** True when the brand is in the dictionary (false for an unknown brand field, title-cased). */
  known: boolean;
  /** The product line that identified the brand ("PlayStation", "Redmi"), when one did. */
  line?: string;
  /** The text that matched (brand field or title words). */
  matched?: string;
  /** A different known brand named in the title when the brand field won. */
  conflict?: string;
}

interface LineRecord {
  name: string;
  next?: RegExp;
  platform: boolean;
  device: boolean;
  alone: boolean;
  /** The line's own words contain the brand name ("Apple Watch"): an explicit brand mention. */
  explicitBrand: boolean;
}

interface BrandRecord extends Brand {
  nameInTitle: boolean;
  requiresNext?: RegExp;
  featureNext?: RegExp;
}

interface Entry {
  brand: BrandRecord;
  tokens: readonly string[];
  kind: 'name' | 'alias' | 'line';
  line?: LineRecord;
}

/** Tokenization shared by the index and the scan: folded, `&`→and, `+`→plus, no apostrophes. */
export function brandTokens(input: string | null | undefined): string[] {
  let s = foldLower(input);
  s = s.replace(/&/g, ' and ').replace(/\+/g, ' plus ');
  s = s.replace(/['`]/g, '');
  s = s.replace(/([a-z])\.(?=[a-z])/g, '$1');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();
  return s === '' ? [] : s.split(' ');
}

const LEGAL_SUFFIXES = new Set([
  'electronics',
  'electronic',
  'international',
  'intl',
  'romania',
  'europe',
  'gmbh',
  'inc',
  'ltd',
  'llc',
  'sa',
  'srl',
  'co',
  'corp',
  'corporation',
  'company',
  'ag',
  'bv',
  'spa',
  'plc',
  'limited',
  'technologies',
  'technology',
  'group',
  'holding',
  'holdings',
  'industries',
  'sas',
  'kg',
  'oy',
  'ab',
  'nv',
  'pte',
  'pty',
  'official',
  'store',
  'shop',
]);

const GENERIC_FIELDS = new Set([
  'generic',
  'generica',
  'generice',
  'oem',
  'no brand',
  'nobrand',
  'noname',
  'no name',
  'fara brand',
  'fara marca',
  'nespecificat',
  'nespecificata',
  'n a',
  'na',
  'diverse',
  'altele',
  'alta',
  'other',
  'others',
  'unbranded',
  'unknown',
  'necunoscut',
  'necunoscuta',
  'universal',
  'compatibil',
  'compatible',
  'neutral',
  'brand',
  'marca',
  'producator',
  'import',
  'china',
  'nou',
  'none',
  'null',
  'undefined',
  'default',
  'test',
]);

/** Words that, right after an ambiguous brand word, make it a colour ("Arctic Grey"). */
const COLOUR_FOLLOWERS = new Set([
  'grey',
  'gray',
  'white',
  'silver',
  'black',
  'blue',
  'green',
  'red',
  'gold',
  'pink',
  'cool',
  'breeze',
  'ice',
  'frost',
  'alb',
  'alba',
  'negru',
  'neagra',
  'gri',
  'argintiu',
  'albastru',
  'verde',
  'rosu',
  'crem',
  'night',
  'storm',
  'sky',
  'mist',
]);

/** After a compatibility marker, these nouns mean "for a <device>": mentions after it are ignored. */
const DEVICE_NOUNS = new Set([
  'telefon',
  'telefoane',
  'smartphone',
  'smartphoneuri',
  'laptop',
  'laptopuri',
  'notebook',
  'tableta',
  'tablete',
  'consola',
  'console',
  'ceas',
  'ceasuri',
  'smartwatch',
  'televizor',
  'televizoare',
  'tv',
  'monitor',
  'monitoare',
  'imprimanta',
  'imprimante',
  'aspirator',
  'aspiratoare',
  'masina',
  'masini',
  'frigider',
  'camera',
  'drona',
  'router',
  'pc',
  'calculator',
  'casti',
  'boxa',
  'trotineta',
  'trotinete',
  'bicicleta',
  'auto',
  'autoturism',
  'espressor',
  'espressoare',
  'robot',
  'periuta',
  'aparat',
  'modelele',
  'modelul',
  'seria',
  'gama',
  'phone',
  'phones',
  'tablet',
  'tablets',
  'devices',
  'dispozitive',
  'dispozitiv',
]);
/** Devices whose maker is never a component brand (Intel, AMD, NVIDIA, Snapdragon …). */
const WEAK_HOST_KINDS: ReadonlySet<ProductKind> = new Set<ProductKind>([
  'laptop',
  'desktop',
  'phone',
  'tablet',
  'tv',
  'monitor',
  'console',
  'smartwatch',
  'ereader',
]);
const COMPAT_MARKERS = new Set([
  'pentru',
  'compatibil',
  'compatibila',
  'compatibile',
  'compatibili',
  'for',
  'fits',
]);

function buildRecords(seeds: readonly BrandSeed[]): BrandRecord[] {
  return seeds.map((seed) => {
    const rec: BrandRecord = {
      name: seed.name,
      slug: seed.slug ?? slugify(seed.name),
      aliases: seed.aliases ?? [],
      lines: (seed.lines ?? []).map((l) => (typeof l === 'string' ? l : l.name)),
      weak: seed.weak ?? false,
      ambiguous: seed.ambiguous ?? false,
      fieldOnly: seed.fieldOnly ?? false,
      accessoryMaker: seed.accessoryMaker ?? false,
      nameInTitle: seed.nameInTitle ?? true,
    };
    if (seed.requiresNext) rec.requiresNext = seed.requiresNext;
    if (seed.featureNext) rec.featureNext = seed.featureNext;
    return rec;
  });
}

const RECORDS = buildRecords(BRAND_SEEDS);
const SEED_BY_NAME = new Map(BRAND_SEEDS.map((s) => [s.name, s] as const));

interface Indexes {
  title: Map<string, Entry[]>;
  field: Map<string, { brand: BrandRecord; line?: string }>;
  conflicts: string[];
}

function lineRecord(brand: BrandRecord, seed: string | LineSeed): LineRecord {
  const s: LineSeed = typeof seed === 'string' ? { name: seed } : seed;
  const own = brandTokens(brand.name);
  const lineTokens = brandTokens(s.name);
  const rec: LineRecord = {
    name: s.name,
    platform: s.platform ?? false,
    device: s.device ?? false,
    alone: s.alone ?? false,
    explicitBrand: own.length > 0 && own.every((t, i) => lineTokens[i] === t),
  };
  if (s.next) rec.next = s.next;
  return rec;
}

function buildIndexes(records: readonly BrandRecord[]): Indexes {
  const title = new Map<string, Entry[]>();
  const field = new Map<string, { brand: BrandRecord; line?: string }>();
  const conflicts: string[] = [];
  const addTitle = (entry: Entry): void => {
    const first = entry.tokens[0];
    if (!first) return;
    const list = title.get(first) ?? [];
    list.push(entry);
    title.set(first, list);
  };
  const addField = (key: string, brand: BrandRecord, line?: string): void => {
    if (key === '') return;
    const existing = field.get(key);
    if (existing && existing.brand.slug !== brand.slug) {
      conflicts.push(`"${key}" → ${existing.brand.name} and ${brand.name}`);
      return;
    }
    if (!existing) field.set(key, line ? { brand, line } : { brand });
  };
  for (const brand of records) {
    const seed = SEED_BY_NAME.get(brand.name);
    const names: Array<[string, Entry['kind']]> = [
      [brand.name, 'name'],
      ...brand.aliases.map((a): [string, Entry['kind']] => [a, 'alias']),
    ];
    for (const [text, kind] of names) {
      const tokens = brandTokens(text);
      addField(tokens.join(''), brand);
      addTitle({ brand, tokens, kind });
      if (tokens.length > 1) addTitle({ brand, tokens: [tokens.join('')], kind });
    }
    for (const lineSeed of seed?.lines ?? []) {
      const line = lineRecord(brand, lineSeed);
      const lineNames = [
        line.name,
        ...(typeof lineSeed === 'string' ? [] : (lineSeed.aliases ?? [])),
      ];
      for (const text of lineNames) {
        const tokens = brandTokens(text);
        addField(tokens.join(''), brand, line.name);
        addTitle({ brand, tokens, kind: 'line', line });
        if (tokens.length > 1) addTitle({ brand, tokens: [tokens.join('')], kind: 'line', line });
      }
    }
  }
  for (const list of title.values()) list.sort((a, b) => b.tokens.length - a.tokens.length);
  return { title, field, conflicts };
}

const INDEXES = buildIndexes(RECORDS);

/** Every brand of the dictionary (canonical casing). */
export const BRANDS: readonly Brand[] = RECORDS;

/** Alias collisions in the dictionary (an alias pointing to two brands); must stay empty. */
export function brandDictionaryIssues(): readonly string[] {
  return INDEXES.conflicts;
}

/** Finds a known brand by name, alias or product line ("WD" → Western Digital, "iPhone" → Apple). */
export function findBrand(nameOrAlias: string | null | undefined): Brand | null {
  return lookupKnown(nameOrAlias)?.brand ?? null;
}

function lookupKnown(raw: string | null | undefined): { brand: BrandRecord; line?: string } | null {
  let tokens = brandTokens(raw);
  while (tokens.length > 0) {
    const hit = INDEXES.field.get(tokens.join(''));
    if (hit) return hit;
    const last = tokens[tokens.length - 1];
    if (tokens.length > 1 && last !== undefined && LEGAL_SUFFIXES.has(last))
      tokens = tokens.slice(0, -1);
    else break;
  }
  return null;
}

/** True for brand-field values that mean "no brand" (Generic, OEM, Fără brand, N/A …). */
export function isPlaceholderBrand(raw: string | null | undefined): boolean {
  const key = brandTokens(raw).join(' ');
  return key === '' || GENERIC_FIELDS.has(key);
}

function titleCaseBrand(raw: string): string {
  return normalizeText(raw)
    .split(' ')
    .map((w) => {
      if (/^[A-Z0-9&.+-]{2,4}$/.test(w)) return w;
      if (/[a-z][A-Z]/.test(w)) return w;
      return w.charAt(0).toLocaleUpperCase('ro') + w.slice(1).toLocaleLowerCase('ro');
    })
    .join(' ');
}

interface Mention {
  entry: Entry;
  start: number;
  end: number;
}

function acceptable(entry: Entry, tokens: readonly string[], i: number): boolean {
  const { brand } = entry;
  if (brand.fieldOnly) return false;
  if (entry.kind === 'name' && !brand.nameInTitle) return false;
  const prev = tokens[i - 1];
  const next = tokens[i + entry.tokens.length];
  const text = entry.tokens.join('');
  if (prev !== undefined && /^\d+$/.test(prev) && text.length <= 3) return false;
  if (
    entry.kind === 'name' &&
    brand.requiresNext &&
    !(next !== undefined && brand.requiresNext.test(next))
  ) {
    return false;
  }
  if (
    entry.kind === 'line' &&
    entry.line?.next &&
    !(next !== undefined && entry.line.next.test(next))
  ) {
    return false;
  }
  if (
    entry.kind === 'name' &&
    brand.featureNext &&
    next !== undefined &&
    brand.featureNext.test(next)
  ) {
    return false;
  }
  if (brand.ambiguous && entry.kind !== 'line') {
    if (i > 7) return false;
    if (next !== undefined && COLOUR_FOLLOWERS.has(next)) return false;
  }
  return true;
}

function scan(tokens: readonly string[]): Mention[] {
  const mentions: Mention[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i] as string;
    let found: Mention | null = null;
    for (const entry of INDEXES.title.get(token) ?? []) {
      const n = entry.tokens.length;
      let same = true;
      for (let k = 0; k < n; k++) {
        if (tokens[i + k] !== entry.tokens[k]) {
          same = false;
          break;
        }
      }
      if (!same || !acceptable(entry, tokens, i)) continue;
      found = { entry, start: i, end: i + n };
      break;
    }
    if (found) {
      mentions.push(found);
      i = found.end;
    } else {
      i++;
    }
  }
  return mentions;
}

function compatCut(tokens: readonly string[], mentions: readonly Mention[]): number {
  for (let p = 0; p < tokens.length; p++) {
    if (!COMPAT_MARKERS.has(tokens[p] as string)) continue;
    let q = p + 1;
    if (tokens[q] === 'cu' || tokens[q] === 'with') q++;
    const noun = tokens[q];
    if (noun !== undefined && DEVICE_NOUNS.has(noun)) return p;
    if (mentions.some((m) => m.start === q)) return p;
  }
  return tokens.length;
}

function confidenceOf(m: Mention): number {
  if (m.entry.brand.weak) return 0.6;
  if (m.entry.brand.ambiguous) return 0.7;
  if (m.entry.kind === 'line') return m.entry.line?.explicitBrand ? 0.9 : 0.8;
  return m.entry.kind === 'alias' ? 0.85 : 0.9;
}

function viaOf(m: Mention): BrandVia {
  if (m.entry.kind === 'line') return m.entry.line?.explicitBrand ? 'title' : 'product_line';
  return m.entry.kind === 'alias' ? 'alias' : 'title';
}

/** Brand named in a title (no brand field), or null. See the module comment for the rules. */
export function detectBrandInTitle(
  title: string | null | undefined,
  categoryHint?: string | null,
): BrandMatch | null {
  const tokens = brandTokens(title);
  if (tokens.length === 0) return null;
  const kind = detectProductKind(title, categoryHint);
  const mentions = scan(tokens);
  const cut = compatCut(tokens, mentions);
  const usable = mentions.filter((m) => {
    if (m.start >= cut && !m.entry.brand.accessoryMaker) return false;
    const line = m.entry.line;
    if (!line) return true;
    if (kind === 'accessory' && line.device && !line.explicitBrand) return false;
    if (kind === 'game' && line.platform) return false;
    return true;
  });
  const strong = usable.filter((m) => !m.entry.brand.weak && !m.entry.line?.alone);
  const alone = usable.filter((m) => m.entry.line?.alone);
  const weak = usable.filter((m) => m.entry.brand.weak);
  // A component brand alone does not name the maker of a laptop, phone or TV.
  const pick = strong[0] ?? alone[0] ?? (WEAK_HOST_KINDS.has(kind) ? undefined : weak[0]);
  if (!pick) return null;
  const result: BrandMatch = {
    name: pick.entry.brand.name,
    slug: pick.entry.brand.slug,
    confidence: confidenceOf(pick),
    via: viaOf(pick),
    known: true,
    matched: tokens.slice(pick.start, pick.end).join(' '),
  };
  if (pick.entry.line) result.line = pick.entry.line.name;
  return result;
}

/**
 * Detects the brand of an offer from its title and the shop's brand field. See the module
 * comment for the precedence rules. Returns null when neither names a brand.
 */
export function detectBrand(
  title: string | null | undefined,
  brandField?: string | null,
  categoryHint?: string | null,
): BrandMatch | null {
  const fromTitle = detectBrandInTitle(title, categoryHint);
  const fieldText = normalizeText(brandField);
  if (fieldText === '' || isPlaceholderBrand(fieldText)) return fromTitle;
  const known = lookupKnown(fieldText);
  if (known) {
    const result: BrandMatch = {
      name: known.brand.name,
      slug: known.brand.slug,
      confidence: 1,
      via: 'field',
      known: true,
      matched: fieldText,
    };
    if (known.line) result.line = known.line;
    if (fromTitle && fromTitle.slug !== known.brand.slug) result.conflict = fromTitle.name;
    return result;
  }
  if (fromTitle) return { ...fromTitle, confidence: Math.max(0.5, fromTitle.confidence - 0.05) };
  const name = titleCaseBrand(fieldText);
  const fieldTokens = brandTokens(fieldText);
  const titleTokens = brandTokens(title).join(' ');
  const inTitle =
    fieldTokens.length > 0 && ` ${titleTokens} `.includes(` ${fieldTokens.join(' ')} `);
  return {
    name,
    slug: slugify(name),
    confidence: inTitle ? 0.6 : 0.5,
    via: 'field',
    known: false,
    matched: fieldText,
  };
}
