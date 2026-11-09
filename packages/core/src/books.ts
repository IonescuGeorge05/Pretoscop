/**
 * Books (M29): ISBN handling, book facts read from titles and structured fields, the publisher
 * dictionary lookup and the matching rules for two books. Pure and deterministic.
 *
 * Identity: a book product is one edition, identified by its ISBN (GTIN-13 978/979, ADR-012).
 * Different ISBNs are different products (hardcover and paperback, two publishers, two editions),
 * so two books with different ISBNs never match; without an ISBN on one side only the title rules
 * apply, and title-only evidence is never accepted automatically (MATCHING.md, cap 0.96).
 */
import { type GtinResult, validateGtin } from './gtin';
import { NOT_PUBLISHERS, PUBLISHER_SEEDS } from './publishers-data';
import type { OfferSpecs } from './raw-offer';
import { foldText, isBooklandGtin } from './verticals';

// ---------------------------------------------------------------------------------------------
// ISBN

function isbn10Valid(code: string): boolean {
  if (!/^\d{9}[\dX]$/i.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = code[i]!;
    sum += (c === 'X' || c === 'x' ? 10 : Number(c)) * (10 - i);
  }
  return sum % 11 === 0;
}

/**
 * Validates an ISBN as written on a book page or feed: ISBN-13 (978/979, hyphens and spaces
 * allowed) or ISBN-10 (check character X allowed). A 10-character code is read as an ISBN-10
 * first: `validateGtin` would also accept one whose digits happen to pass the GS1 check as a
 * 12-digit UPC with lost leading zeros, which is never right for a field labelled ISBN. A
 * "ISBN"/"ISBN-13:" label is ignored. ISBN-13 codes outside 978/979 are returned as GTINs
 * (`validateGtin`) without the bookland mark.
 */
export function validateIsbn(raw: unknown): GtinResult {
  if (raw == null) return { gtin14: null, quality: 'missing', reason: 'empty' };
  const text = String(raw)
    .trim()
    .replace(/^isbn(?:[- ]?1[03])?\s*[:#]?\s*/i, '');
  const compact = text.replace(/[\s.-]/g, '');
  if (compact.length === 10 && isbn10Valid(compact)) return { ...validateGtin(isbn10To13(compact)), convertedFrom: 'isbn10' };
  return validateGtin(text);
}

/** ISBN-10 → ISBN-13: prefix 978, the first nine digits, a new GS1 check digit. */
function isbn10To13(code: string): string {
  const body = `978${code.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export interface IsbnMention {
  /** GTIN-14 of the ISBN (always a valid bookland code). */
  gtin14: string;
  /** The text as written ("ISBN 978-606-44-0233-2"). */
  text: string;
  index: number;
}

const ISBN13_RE = /(?:\bISBN(?:[- ]?13)?\s*[:#]?\s*)?(?<![\d-])(97[89](?:[-\s]?\d){10})(?![\d-])/gi;
const ISBN10_RE = /\bISBN(?:[- ]?10)?\s*[:#]?\s*((?:\d[-\s]?){9}[\dXx])(?![\d-])/gi;

/**
 * ISBNs written inside a text (titles: "Ion - Liviu Rebreanu, ISBN 978-973-46-1234-5"). ISBN-13
 * codes count with or without the "ISBN" label; an ISBN-10 only with it (a bare 10-digit number
 * is as likely a phone number or an internal code). Only valid bookland codes are returned.
 */
export function isbnsInText(text: string | null | undefined): IsbnMention[] {
  if (!text) return [];
  const out: IsbnMention[] = [];
  const seen = new Set<string>();
  const push = (raw: string, whole: string, index: number) => {
    const r = validateIsbn(raw);
    if (r.quality === 'valid' && r.gtin14 && isBooklandGtin(r.gtin14) && !seen.has(r.gtin14)) {
      seen.add(r.gtin14);
      out.push({ gtin14: r.gtin14, text: whole.trim(), index });
    }
  };
  for (const m of text.matchAll(ISBN13_RE)) push(m[1]!, m[0], m.index ?? 0);
  for (const m of text.matchAll(ISBN10_RE)) push(m[1]!, m[0], m.index ?? 0);
  return out.sort((a, b) => a.index - b.index);
}

/** The title without its ISBN mentions (and the separator before them). */
export function stripIsbnMentions(title: string): string {
  let s = title;
  for (const m of isbnsInText(title).reverse()) {
    // The separator written before the ISBN goes with it (", ISBN …", " - ISBN …", " | …").
    const before = s.slice(0, m.index).replace(/(?:\s*[,;|]|\s+[-–—])\s*$/, '');
    s = `${before} ${s.slice(m.index + m.text.length)}`;
  }
  return s
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,;|)])/g, '$1')
    .replace(/[\s,;|–—-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------------------------
// Book facts

export type BookFormat = 'hardcover' | 'paperback' | 'ebook' | 'audiobook';

export interface BookAttributes {
  kind: 'book';
  bookFormat?: BookFormat;
  /** Authors as written (display), at most 5. */
  bookAuthors?: string[];
  /** Volume number in a series ("Vol. 3", "Cartea a doua", "Partea I"). */
  bookVolume?: number;
  /** Edition number ("Ediția a III-a" → 3). */
  bookEdition?: number;
  /** "Ediție ilustrată", "Ed. Ilustrată". */
  bookIllustrated?: true;
  /** ISO 639-1 code from a language field or the shop's foreign-books category. */
  bookLanguage?: string;
  /** A box set or a pack of several books ("Set 7 cărți", "Pachet", "Colecția completă"). */
  bookSet: boolean;
  bookPages?: number;
  bookYear?: number;
  /** Publisher as written (the brand is its dictionary form). */
  bookPublisher?: string;
}

/** Structured facts a shop states for a book (JSON-LD `Book`, a spec table, a feed). */
export type BookSpecs = OfferSpecs;

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20 };
const ORDINAL: Record<string, number> = {
  intai: 1, prima: 1, primul: 1, unu: 1, una: 1, doua: 2, doilea: 2, treia: 3, treilea: 3, patra: 4, patrulea: 4,
  cincea: 5, cincilea: 5, sasea: 6, saselea: 6, saptea: 7, saptelea: 7, opta: 8, optulea: 8, noua: 9, noualea: 9,
  zecea: 10, zecelea: 10, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
};

/** "3", "III", "a III-a", "a 3-a", "a treia", "întâi" → number. */
function ordinalValue(raw: string): number | undefined {
  const s = foldText(raw).replace(/^a\s+/, '').replace(/\s+a$/, '').trim();
  if (/^\d{1,3}$/.test(s)) return Number(s);
  const m = /^(\d{1,3})\s*(?:lea|a)?$/.exec(s);
  if (m) return Number(m[1]);
  if (ROMAN[s] !== undefined) return ROMAN[s];
  if (ORDINAL[s] !== undefined) return ORDINAL[s];
  return undefined;
}

const ORD_WORD = String.raw`(?:\d{1,3}|[ivx]{1,5}|a\s+(?:\d{1,3}|[ivx]{1,5})\s*-?\s*a|a\s+(?:doua|treia|patra|cincea|sasea|saptea|opta|noua|zecea)|intai|prima|primul|unu|doua|treia)`;
const VOLUME_RE = new RegExp(String.raw`\b(?:vol(?:umul|ume)?|cartea|partea|tomul|tom|book|part|nr)\s*\.?\s*(${ORD_WORD})\b`, 'i');
const VOLUME_HASH_RE = /#\s?(\d{1,3})\b/;
const EDITION_RE = new RegExp(String.raw`\b(?:editia|editie|ed)\s*\.?\s*(${ORD_WORD})\b`, 'i');
const EDITION_EN_RE = /\b(\d{1,2})(?:st|nd|rd|th)\s+edition\b/i;
const ILLUSTRATED_RE = /\b(?:editie|editia|ed)\s*\.?\s*ilustrata\b|\bilustrata\b|\billustrated\b/;
const SET_RE = /^(?:set|pachet|box ?set|caseta|colectia completa|seria completa)\b|\b(?:set|pachet) (?:de )?\d+ (?:carti|volume|vol)\b|\b\d+ (?:carti|volume)\b|\bbox ?set\b|\bvolumele \d+\s*-\s*\d+\b|\bvol(?:umele)?\s*\.?\s*\d+\s*-\s*\d+\b/;

const FORMAT_WORDS: Array<[BookFormat, RegExp]> = [
  ['audiobook', /\b(?:audiobook|audio ?book|carte audio|audio cd|mp3|audible)\b/],
  ['ebook', /\b(?:e ?book|epub|ebook|kindle edition|carte electronica|pdf)\b/],
  ['hardcover', /\b(?:hardcover|hardback|hard cover|coperta (?:tare|cartonata)|cartonata|legata|hc)\b/],
  ['paperback', /\b(?:paperback|softcover|soft cover|coperta (?:moale|brosata)|brosata|brosura|necartonata|pb)\b/],
];

/** Format from a structured field (schema.org URL, "Cartonata", "Paperback") or a title. */
export function bookFormatOf(text: string | null | undefined): BookFormat | undefined {
  if (!text) return undefined;
  const t = foldText(text.replace(/https?:\/\/schema\.org\//i, ''));
  if (/^(?:hardcover|hard cover)$/.test(t)) return 'hardcover';
  if (/^(?:paperback|mass market paperback)$/.test(t)) return 'paperback';
  if (/^(?:ebook|e book)$/.test(t)) return 'ebook';
  if (/^(?:audiobook|audio book)$/.test(t)) return 'audiobook';
  for (const [f, re] of FORMAT_WORDS) if (re.test(t)) return f;
  return undefined;
}

const LANGUAGES: Array<[string, RegExp]> = [
  ['ro', /^(?:ro|ron|rum|romana|limba romana|romanian)$/],
  ['en', /^(?:en|eng|engleza|limba engleza|english)$/],
  ['fr', /^(?:fr|fre|fra|franceza|limba franceza|french)$/],
  ['de', /^(?:de|ger|deu|germana|limba germana|german)$/],
  ['hu', /^(?:hu|hun|maghiara|limba maghiara|hungarian)$/],
  ['es', /^(?:es|spa|spaniola|limba spaniola|spanish)$/],
  ['it', /^(?:it|ita|italiana|limba italiana|italian)$/],
];

export function bookLanguageOf(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const t = foldText(text);
  for (const [code, re] of LANGUAGES) if (re.test(t)) return code;
  return undefined;
}

/** "Harry Potter si Printul Semisange - J.K. Rowling" → title and author (Libris style). */
export function splitAuthorSuffix(title: string): { title: string; author: string | null } {
  // The author part may hold hyphenated names ("Arthur Lazar-Abdulvoap"), never " - " itself.
  const m = /^(.{3,}?)\s+[-–—]\s+((?:(?!\s[-–—]\s).){3,80})$/.exec(title.trim());
  if (!m) return { title: title.trim(), author: null };
  const author = m[2]!.trim();
  // A person's name: 1–6 words, capitalised or initials, no digits, no format/edition words.
  const words = author.split(/\s+/);
  const personLike =
    words.length <= 8 &&
    !/\d/.test(author) &&
    !/\b(?:vol|editia|editie|ed\.|cartea|partea|seria|set|pachet|carte|roman|ilustrata|cartonata|paperback|hardcover)\b/i.test(foldText(author)) &&
    words.every((w) => /^(?:[\p{Lu}][\p{L}'’.-]*|[\p{Lu}]\.|de|van|von|da|di|la|le|du|des|del|y|si|și|and|&|,)$/u.test(w));
  return personLike ? { title: m[1]!.trim(), author } : { title: title.trim(), author: null };
}

/** Authors from a field: "J.K. Rowling", ["A", "B"], "A, B", "A; B", "A și B". */
export function authorList(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap((r) => r.split(/\s*(?:;|\||\s+si\s+|\s+și\s+|\s+and\s+|\s+&\s+)\s*/i))
    .flatMap((r) => (/^[^,]+,\s*[^,]+,/.test(r) ? r.split(/\s*,\s*/) : [r]))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 2);
  return [...new Set(parts)].slice(0, 5);
}

/**
 * Surnames for author comparison: the last word of each name ("J. K. Rowling" → "rowling"), the
 * first one when written "Rowling, J.K.". Initials and particles are ignored.
 */
export function authorKeys(authors: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const a of authors) {
    const comma = a.includes(',') && !/,\s*\S+\s*,/.test(a);
    const words = foldText(comma ? a.split(',')[0]! : a)
      .split(' ')
      .filter((w) => w.length >= 3 && !['van', 'von', 'del', 'des', 'and'].includes(w));
    const key = words.at(-1);
    if (key) out.add(key);
  }
  return out;
}

const BOOK_STOP = new Set(
  'si sau de la din in pe cu un o al ale a ai lui unei unui cel cea cei cele care ce nu the and of an to for on with by vol volumul cartea partea editia editie ed seria serie roman romanul carte carti noua nou ilustrata illustrated edition paperback hardcover cartonata brosata coperta moale tare'.split(' '),
);

/**
 * The core of a book title for comparison: folded tokens without the author suffix, volume and
 * edition markers, format words and stopwords. "Harry Potter și piatra filozofală. Ediție
 * ilustrată - J.K. Rowling" → [harry, potter, piatra, filozofala].
 */
export function bookTitleCore(title: string, authors: readonly string[] = []): string[] {
  let t = stripIsbnMentions(splitAuthorSuffix(title).title);
  for (const a of authors) {
    const fa = foldText(a);
    if (fa.length >= 4) t = foldText(t).replace(new RegExp(String.raw`\b${fa.replace(/\s+/g, '\\s+')}\b`, 'g'), ' ');
  }
  let f = foldText(t);
  f = f
    .replace(new RegExp(VOLUME_RE.source, 'gi'), ' ')
    .replace(new RegExp(EDITION_RE.source, 'gi'), ' ')
    .replace(/#\s?\d{1,3}\b/g, ' ');
  for (const [, re] of FORMAT_WORDS) f = f.replace(new RegExp(re.source, 'g'), ' ');
  return [...new Set(f.split(' ').filter((w) => (w.length >= 2 || /\d/.test(w)) && !BOOK_STOP.has(w)))];
}

/** Book facts from the title, the structured specs and the category path. */
export function extractBookAttributes(title: string, specs: BookSpecs = {}, categoryRaw?: string | null): BookAttributes {
  const split = splitAuthorSuffix(title);
  const f = foldText(split.title);
  const out: BookAttributes = { kind: 'book', bookSet: SET_RE.test(f) };
  const authors = authorList(specs.author).length ? authorList(specs.author) : split.author ? authorList(split.author) : [];
  if (authors.length) out.bookAuthors = authors;
  const format = bookFormatOf(specs.format) ?? bookFormatOf(split.title);
  if (format) out.bookFormat = format;
  const vol = VOLUME_RE.exec(f) ?? null;
  const volume = vol ? ordinalValue(vol[1]!) : (VOLUME_HASH_RE.exec(split.title) ? Number(VOLUME_HASH_RE.exec(split.title)![1]) : undefined);
  if (volume !== undefined && volume > 0 && volume < 200) out.bookVolume = volume;
  const ed = EDITION_RE.exec(f);
  const edition = (ed ? ordinalValue(ed[1]!) : undefined) ?? (EDITION_EN_RE.exec(split.title) ? Number(EDITION_EN_RE.exec(split.title)![1]) : undefined) ?? (specs.edition ? ordinalValue(specs.edition.replace(/^(?:editia|editie|ed)\.?\s*/i, '')) : undefined);
  if (edition !== undefined && edition > 0 && edition < 100) out.bookEdition = edition;
  if (ILLUSTRATED_RE.test(f) || (specs.edition && ILLUSTRATED_RE.test(foldText(specs.edition)))) out.bookIllustrated = true;
  const lang = bookLanguageOf(specs.language) ?? (categoryRaw && /carti in (?:limba )?engleza|english books|books in english|carte straina engleza/.test(foldText(categoryRaw)) ? 'en' : undefined);
  if (lang) out.bookLanguage = lang;
  const pages = Number(String(specs.pages ?? '').replace(/\D/g, ''));
  if (Number.isInteger(pages) && pages > 0 && pages < 20000) out.bookPages = pages;
  // "2.019" (Elefant writes years with a thousands separator) → 2019.
  const year = Number(String(specs.year ?? '').replace(/[.\s]/g, '').slice(0, 4));
  if (Number.isInteger(year) && year >= 1450 && year <= 2100) out.bookYear = year;
  if (specs.publisher && specs.publisher.trim()) out.bookPublisher = specs.publisher.trim();
  return out;
}

// ---------------------------------------------------------------------------------------------
// Publishers

export interface PublisherMatch {
  name: string;
  slug: string;
  group: string;
  known: boolean;
}

const PUBLISHER_NOISE =
  /\b(?:editura|editurii|grupul editorial|grup editorial|grupul|editorial|publishing house|publishing|publishers|publisher|books|book|edition|editions|s ?r ?l|s ?a|ltd|inc|co)\b/g;

function publisherKey(raw: string): string {
  return foldText(raw).replace(PUBLISHER_NOISE, ' ').replace(/\s+/g, ' ').trim();
}

const PUBLISHER_INDEX: Map<string, { name: string; group: string }> = (() => {
  const m = new Map<string, { name: string; group: string }>();
  for (const p of PUBLISHER_SEEDS) {
    const rec = { name: p.name, group: p.group ?? p.name };
    for (const k of [p.name, ...(p.aliases ?? [])]) {
      const key = publisherKey(k) || foldText(k);
      if (key) m.set(key, rec);
    }
  }
  return m;
})();

/** Aliases that point to two publishers (a dictionary error; tested). */
export function publisherDictionaryIssues(): string[] {
  const seen = new Map<string, string>();
  const issues: string[] = [];
  for (const p of PUBLISHER_SEEDS) {
    for (const k of [p.name, ...(p.aliases ?? [])]) {
      const key = publisherKey(k) || foldText(k);
      const prev = seen.get(key);
      if (prev && prev !== p.name) issues.push(`${key}: ${prev} / ${p.name}`);
      seen.set(key, p.name);
    }
  }
  return issues;
}

function slugOf(s: string): string {
  return foldText(s).replace(/\s+/g, '-').slice(0, 80);
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * The publisher of a book from a shop's publisher (or brand) field: the dictionary entry when it
 * is known, else the field title-cased; null for places and placeholders ("BUCUREȘTI", "Diverse").
 */
export function findPublisher(raw: string | null | undefined): PublisherMatch | null {
  if (!raw || !raw.trim()) return null;
  const folded = foldText(raw);
  if (NOT_PUBLISHERS.includes(folded)) return null;
  const key = publisherKey(raw) || folded;
  const hit = PUBLISHER_INDEX.get(key) ?? PUBLISHER_INDEX.get(folded);
  if (hit) return { name: hit.name, slug: slugOf(hit.name), group: hit.group, known: true };
  const name = titleCase(raw.trim().replace(/\s+/g, ' '));
  return { name, slug: slugOf(name), group: name, known: false };
}

// ---------------------------------------------------------------------------------------------
// Matching two books

export interface BookSide {
  title: string;
  publisher: string | null;
  gtin14: string | null;
  attributes: Record<string, unknown>;
}

function attrNum(a: Record<string, unknown>, k: string): number | null {
  const v = a[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function attrStr(a: Record<string, unknown>, k: string): string | null {
  const v = a[k];
  return typeof v === 'string' && v !== '' ? v : null;
}

function attrList(a: Record<string, unknown>, k: string): string[] {
  const v = a[k];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Two tokens are the same word when equal or, for words of 6+ letters, one edit apart ("filozofala"/"filosofala"). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function unmatched(a: readonly string[], b: readonly string[]): string[] {
  return a.filter((x) => !b.some((y) => sameWord(x, y)));
}

/** Share of title-core words the two books have in common (fuzzy, Jaccard-like). */
export function bookTitleSimilarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const common = a.length - unmatched(a, b).length;
  return common / (a.length + b.length - common);
}

export interface BookComparison {
  conflicts: string[];
  /** Fuzzy share of common title-core words. */
  titleSim: number;
  authorsAgree: boolean | null;
  publishersAgree: boolean | null;
  gtinEqual: boolean;
}

/**
 * Hard conflicts between two books (any one: never the same product):
 * - different valid ISBNs (each identifies one edition);
 * - format, volume, edition number, language or box-set flag both known and different;
 * - no common author surname (both known);
 * - title cores that disagree: each side has a word the other lacks (another book of the series,
 *   "Harry Potter și piatra filozofală" vs "… camera secretelor"); with equal ISBNs only a title
 *   without any common word conflicts (a shop's data error), since one shop may add a subtitle;
 * - publishers of two different known groups, when no ISBN decides.
 */
export function compareBooks(a: BookSide, b: BookSide): BookComparison {
  const conflicts: string[] = [];
  const gtinEqual = !!a.gtin14 && a.gtin14 === b.gtin14;
  if (a.gtin14 && b.gtin14 && a.gtin14 !== b.gtin14 && isBooklandGtin(a.gtin14) && isBooklandGtin(b.gtin14)) conflicts.push('isbn');
  const fa = a.attributes;
  const fb = b.attributes;
  for (const k of ['bookFormat', 'bookLanguage'] as const) {
    const x = attrStr(fa, k);
    const y = attrStr(fb, k);
    if (x && y && x !== y) conflicts.push(`${k} ${x}≠${y}`);
  }
  for (const k of ['bookVolume', 'bookEdition'] as const) {
    const x = attrNum(fa, k);
    const y = attrNum(fb, k);
    if (x !== null && y !== null && x !== y) conflicts.push(`${k} ${x}≠${y}`);
  }
  if (typeof fa.bookSet === 'boolean' && typeof fb.bookSet === 'boolean' && fa.bookSet !== fb.bookSet) conflicts.push('bookSet');
  const authorsA = attrList(fa, 'bookAuthors');
  const authorsB = attrList(fb, 'bookAuthors');
  let authorsAgree: boolean | null = null;
  if (authorsA.length && authorsB.length) {
    const ka = authorKeys(authorsA);
    const kb = authorKeys(authorsB);
    authorsAgree = [...ka].some((x) => [...kb].some((y) => sameWord(x, y)));
    if (ka.size && kb.size && !authorsAgree) conflicts.push('author');
  }
  const ca = bookTitleCore(a.title, authorsA);
  const cb = bookTitleCore(b.title, authorsB);
  const titleSim = bookTitleSimilarity(ca, cb);
  if (ca.length && cb.length) {
    const onlyA = unmatched(ca, cb);
    const onlyB = unmatched(cb, ca);
    if (gtinEqual ? titleSim === 0 : onlyA.length > 0 && onlyB.length > 0) conflicts.push('title');
  }
  let publishersAgree: boolean | null = null;
  const pa = findPublisher(a.publisher);
  const pb = findPublisher(b.publisher);
  if (pa && pb) {
    publishersAgree = pa.group === pb.group || pa.slug === pb.slug;
    if (!gtinEqual && pa.known && pb.known && !publishersAgree) conflicts.push('publisher');
  }
  return { conflicts, titleSim, authorsAgree, publishersAgree, gtinEqual };
}
