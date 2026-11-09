/**
 * Matching evaluation per category (M29): the labelled sets of the books and beauty verticals in
 * packages/core/src/matching-eval/categories/*.json, kept apart from the M07/M22 set.
 *
 *   pnpm --filter @pretoscop/worker match:eval:categories            # report + gate (exit 1 on failure)
 *   pnpm --filter @pretoscop/worker match:eval:categories --build    # rebuild the sets, then report
 *
 * Books are built from the recorded extractor fixtures only (no database, no network):
 *   - `fixture` positives: each Libris listing card against the same card spelled with diacritics
 *     (its cover's alt text), and the Harry Potter card against its product page (with the ISBN);
 *   - `family` hard negatives: other books of the same author or series on the Libris listing
 *     (Harry Potter 3/5/6/7, Narnia 5/6, Pisicile Războinice, Elementalii 1/2/3…), and the Elefant
 *     series named by its listing links (Tup, Jurnalul unui fotbalist de buzunar, Învățătorii de
 *     grijă…), including the Elefant product page against the other Tup volumes;
 *   - `synthetic` pairs: the two ISBN pages against the way the other shop writes them (same ISBN),
 *     and the same titles with another ISBN (other edition).
 * Beauty is synthetic (no beauty source records yet): base products × three shop title styles, with
 * generated GTINs, against sizes, concentrations, flankers, testers, gift sets, refills and shades.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  categorize,
  evaluateCategory,
  gtinCheckDigit,
  normalizeOffer,
  type EvalPair,
  type LabelSource,
  type MatchSide,
  type RawOffer,
} from '@pretoscop/core';
import { contentHash } from '@pretoscop/core/hash';
import { parsePageDetailed } from '@pretoscop/extractors';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '../../../../packages/core/src/matching-eval/categories');
const FIXTURES = join(here, '../../../../packages/extractors/fixtures');

function parseFixture(shop: string, parser: string, path: string): ReturnType<typeof parsePageDetailed> {
  const meta = JSON.parse(readFileSync(join(FIXTURES, `${path}.meta.json`), 'utf8')) as { url: string; final_url?: string; recorded_at: string };
  return parsePageDetailed(parser, readFileSync(join(FIXTURES, path), 'utf8'), { url: meta.final_url ?? meta.url, shopSlug: shop, observedAt: meta.recorded_at });
}

/** The match side of a raw offer, exactly as ingestion + matching would build it. */
function side(raw: RawOffer): MatchSide {
  const n = normalizeOffer(raw, { shop: { slug: raw.shopSlug }, observedAt: new Date(raw.observedAt), hash: contentHash });
  const brand = n.brandName && (n.brandKnown || (n.brandConfidence ?? 0) >= 0.7) ? n.brandName : null;
  return {
    title: n.titleClean,
    brand,
    mpnNorm: n.mpnNorm,
    gtin14: n.gtin14,
    category: categorize(n.titleClean, n.categoryRaw, { isAccessory: n.isAccessory, gtin14: n.gtin14 }),
    attributes: n.attributes as Record<string, unknown>,
    mpnFromTitle: n.mpnSource === 'title',
  };
}

const pair = (id: string, offer: MatchSide, product: MatchSide, same: boolean, source: LabelSource, note?: string): EvalPair => ({ id, offer, product, same, source, ...(note ? { note } : {}) });

/** A valid GTIN-13 (as GTIN-14) from a 12-digit body. */
const gtin = (body12: string) => `0${body12}${gtinCheckDigit(body12)}`;

function buildBooks(): EvalPair[] {
  const pairs: EvalPair[] = [];
  const listing = parseFixture('libris', 'libris-listing', 'libris/listing-carti-copii-fantasy_2026-11-09.html').offers;
  const hpPage = parseFixture('libris', 'jsonld-product', 'libris/product-harry-potter-printul-semisange_2026-11-09.html').offers[0]!;
  const tupPage = parseFixture('elefant', 'elefant-product', 'elefant/product-tup-imposibil-cartea-intai_2026-11-09.html').offers[0]!;
  const elefantUrls = parseFixture('elefant', 'elefant-listing', 'elefant/listing-carti-pentru-copii_2026-11-09.html').productUrls ?? [];

  // fixture positives: one card, two spellings of the same shop; the HP card and its product page.
  for (const card of listing) {
    const alt = card.raw.altTitle;
    if (typeof alt === 'string' && alt !== card.title) pairs.push(pair(`libris:alt:${card.externalId}`, side(card), side({ ...card, title: alt }), true, 'fixture', 'card title vs cover alt text'));
  }
  const hpCard = listing.find((o) => o.externalId === hpPage.externalId)!;
  pairs.push(pair(`libris:page:${hpPage.externalId}`, side(hpCard), side(hpPage), true, 'fixture', 'listing card (no ISBN) vs product page (ISBN)'));

  // family negatives: other books of the same author or series on one listing.
  const sides = listing.map((o) => ({ o, s: side(o) }));
  const authorOf = (s: MatchSide) => ((s.attributes.bookAuthors as string[] | undefined) ?? []).join('|').toLowerCase().replace(/[^a-z]/g, '');
  const head = (s: MatchSide) => s.title.toLowerCase().split(/[\s.:,]+/).slice(0, 2).join(' ');
  for (let i = 0; i < sides.length; i++) {
    for (let j = i + 1; j < sides.length; j++) {
      const a = sides[i]!;
      const b = sides[j]!;
      const sameAuthor = authorOf(a.s) !== '' && authorOf(a.s) === authorOf(b.s);
      if (sameAuthor || head(a.s) === head(b.s)) pairs.push(pair(`libris:series:${a.o.externalId}:${b.o.externalId}`, a.s, b.s, false, 'family', sameAuthor ? 'same author, other book' : 'same series, other book'));
    }
  }
  // Elefant: series named by the listing links (the slug is the shop's own title text).
  const slugTitle = (u: string) => decodeURIComponent(new URL(u).pathname.slice(1).replace(/_[0-9a-f-]{36}$/, '')).replace(/-/g, ' ');
  const slugSides = elefantUrls.map((u) => ({ id: u.slice(-36), s: side({ shopSlug: 'elefant', externalId: u.slice(-36), url: u, title: slugTitle(u), price: '1', priceFormat: 'decimal', category: 'Carti > Carte > Carti pentru copii', observedAt: tupPage.observedAt, raw: {} }) }));
  // Hard negatives: the same first word ("tup …", "jurnalul …"), the same "seria …" or "prima mea
  // lectura" collection, or the very same title (two products: other editions).
  const first = (t: string) => {
    const w = t.split(' ')[0] ?? '';
    return w.length >= 3 ? w : null;
  };
  const seriesOf = (t: string) => (/\bseria (\w+ \w+)/.exec(t)?.[1] ?? (t.includes('prima mea lectura') ? 'prima mea lectura' : null));
  for (let i = 0; i < slugSides.length; i++) {
    for (let j = i + 1; j < slugSides.length; j++) {
      const a = slugSides[i]!;
      const b = slugSides[j]!;
      const sameSeries = (first(a.s.title) !== null && first(a.s.title) === first(b.s.title)) || (seriesOf(a.s.title) !== null && seriesOf(a.s.title) === seriesOf(b.s.title));
      const sameTitle = a.s.title === b.s.title;
      if (sameSeries || sameTitle) pairs.push(pair(`elefant:series:${a.id}:${b.id}`, a.s, b.s, false, 'family', sameTitle ? 'same title, two products (other edition)' : 'same series, other volume'));
    }
  }
  const tup = side(tupPage);
  for (const x of slugSides.filter((x) => x.s.title.startsWith('tup ') && x.id !== tupPage.externalId)) pairs.push(pair(`elefant:tup:${x.id}`, x.s, tup, false, 'family', 'Tup volume vs the recorded Tup 1 page'));

  // synthetic: the other shop's way of writing the same ISBN, and another ISBN for the same title.
  const hp = side(hpPage);
  pairs.push(pair('synthetic:hp6:elefant-style', side({ ...hpPage, shopSlug: 'elefant', title: 'Harry Potter și Prințul Semisânge', brand: 'Arthur', category: 'Carti > Carte > Carti pentru copii > Literatura fantasy', specs: { author: 'J.K. Rowling', format: 'Cartonata', language: 'Romana' } }), hp, true, 'synthetic', 'same ISBN, Elefant style'));
  pairs.push(pair('synthetic:tup1:libris-style', side({ ...tupPage, shopSlug: 'libris', title: 'Tup. IMPOSIBIL e doar un cuvant. Cartea intai - Alex Donovici', brand: 'CURTEA VECHE', category: 'Librarie online/Carti/Carti Pentru Copii/Literatura Romana', specs: { publisher: 'CURTEA VECHE' } }), tup, true, 'synthetic', 'same ISBN, Libris style'));
  const isbn13 = (body12: string) => `${body12}${gtinCheckDigit(body12)}`;
  pairs.push(pair('synthetic:hp6:other-isbn', side({ ...hpPage, gtin: isbn13('978630321870'), specs: { ...hpPage.specs, isbn: undefined, format: 'https://schema.org/Paperback' } }), hp, false, 'synthetic', 'same title, other ISBN (paperback)'));
  pairs.push(pair('synthetic:tup1:other-edition', side({ ...tupPage, gtin: isbn13('978606440990'), title: 'Tup. Imposibil e doar un cuvant. Cartea intai. Editia a II-a', specs: { ...tupPage.specs, isbn: undefined } }), tup, false, 'synthetic', 'edition 2 vs edition 3'));
  return pairs;
}

interface BeautyBase {
  key: string;
  brand: string;
  line: string;
  noun: 'parfum' | 'ruj' | 'crema';
  variants: Array<{ v: string; conc?: 'EDT' | 'EDP' | 'Parfum' | 'Elixir'; ml?: number; extra?: string; shade?: string }>;
}

const BEAUTY: BeautyBase[] = [
  { key: 'sauvage', brand: 'Dior', line: 'Sauvage', noun: 'parfum', variants: [{ v: 'edt60', conc: 'EDT', ml: 60 }, { v: 'edt100', conc: 'EDT', ml: 100 }, { v: 'edt200', conc: 'EDT', ml: 200 }, { v: 'edp100', conc: 'EDP', ml: 100 }, { v: 'parfum100', conc: 'Parfum', ml: 100 }, { v: 'elixir60', conc: 'Elixir', ml: 60 }, { v: 'edt100tester', conc: 'EDT', ml: 100, extra: 'Tester' }] },
  { key: 'coco', brand: 'Chanel', line: 'Coco Mademoiselle', noun: 'parfum', variants: [{ v: 'edp50', conc: 'EDP', ml: 50 }, { v: 'edp100', conc: 'EDP', ml: 100 }, { v: 'edt100', conc: 'EDT', ml: 100 }] },
  { key: 'million', brand: 'Rabanne', line: '1 Million', noun: 'parfum', variants: [{ v: 'edt50', conc: 'EDT', ml: 50 }, { v: 'edt100', conc: 'EDT', ml: 100 }, { v: 'set100', conc: 'EDT', ml: 100, extra: 'Set cadou + Deodorant 150 ml' }, { v: 'elixir100', conc: 'Elixir', ml: 100 }] },
  { key: 'viebelle', brand: 'Lancôme', line: 'La Vie Est Belle', noun: 'parfum', variants: [{ v: 'edp50', conc: 'EDP', ml: 50 }, { v: 'edp100', conc: 'EDP', ml: 100 }, { v: 'edp100refill', conc: 'EDP', ml: 100, extra: 'Refill' }, { v: 'intense50', conc: 'EDP', ml: 50, extra: 'Intense' }] },
  { key: 'bottled', brand: 'Hugo Boss', line: 'Boss Bottled', noun: 'parfum', variants: [{ v: 'edt100', conc: 'EDT', ml: 100 }, { v: 'edt200', conc: 'EDT', ml: 200 }, { v: 'edp100', conc: 'EDP', ml: 100 }] },
  { key: 'superstay', brand: 'Maybelline', line: 'SuperStay Matte Ink', noun: 'ruj', variants: [{ v: 's20', shade: '20' }, { v: 's65', shade: '65' }, { v: 's120', shade: '120' }] },
  { key: 'q10', brand: 'Nivea', line: 'Q10 Power', noun: 'crema', variants: [{ v: 'zi50', ml: 50, extra: 'de zi' }, { v: 'noapte50', ml: 50, extra: 'de noapte' }] },
];

/** Three ways Romanian shops write one beauty product. */
function beautyTitles(b: BeautyBase, x: BeautyBase['variants'][number]): string[] {
  const concRo = { EDT: 'Apă de toaletă', EDP: 'Apă de parfum', Parfum: 'Parfum', Elixir: 'Elixir' } as const;
  const concEn = { EDT: 'Eau de Toilette', EDP: 'Eau de Parfum', Parfum: 'Parfum', Elixir: 'Elixir' } as const;
  const extra = x.extra ? ` ${x.extra}` : '';
  if (b.noun === 'ruj') {
    return [`Ruj lichid ${b.brand} ${b.line}, nuanța ${x.shade}`, `${b.brand.toUpperCase()} ${b.line} ruj de buze mat nr. ${x.shade}`, `${b.brand} ${b.line} Liquid Lipstick shade ${x.shade}`];
  }
  if (b.noun === 'crema') {
    return [`Cremă ${x.extra} ${b.brand} ${b.line} pentru față, ${x.ml} ml`, `${b.brand} ${b.line} cremă ${x.extra} antirid ${x.ml}ml`, `Crema de fata ${x.extra} ${b.brand} ${b.line} ${x.ml} ml`];
  }
  const c = x.conc!;
  const flanker = c === 'Elixir' ? ' Elixir' : '';
  return [
    `${concRo[c] === 'Elixir' ? 'Parfum' : concRo[c]} ${b.brand} ${b.line}${flanker}${extra}, ${x.ml} ml`,
    `${b.brand} ${b.line}${flanker} ${concEn[c] === 'Elixir' ? 'Parfum' : concEn[c]}${extra} ${x.ml}ml`,
    `${b.brand.toUpperCase()} ${b.line}${flanker} ${c === 'EDT' ? 'EDT' : c === 'EDP' ? 'EDP' : 'Parfum'}${extra} ${x.ml} ml`,
  ];
}

function buildBeauty(): EvalPair[] {
  const pairs: EvalPair[] = [];
  const raw = (title: string, g: string, n: number): RawOffer => ({ shopSlug: `shop${n}`, externalId: `${g}-${n}`, url: `https://shop${n}.example/${g}`, title, price: '199.99', priceFormat: 'decimal', gtin: g.slice(1), observedAt: '2026-11-09T08:00:00Z', raw: {} });
  let seq = 0;
  for (const b of BEAUTY) {
    // Generated GTIN-13s in the Romanian GS1 range (594): synthetic, never a real product's code.
    const variants = b.variants.map((x) => ({ x, g: gtin(`594${String(100000000 + 7919 * ++seq).slice(-9)}`), titles: beautyTitles(b, x) }));
    for (const v of variants) {
      // Positives: the same product (same GTIN) written by two other shops.
      pairs.push(pair(`beauty:${b.key}:${v.x.v}:0-1`, side(raw(v.titles[0]!, v.g, 0)), side(raw(v.titles[1]!, v.g, 1)), true, 'synthetic'));
      pairs.push(pair(`beauty:${b.key}:${v.x.v}:0-2`, side(raw(v.titles[0]!, v.g, 0)), side(raw(v.titles[2]!, v.g, 2)), true, 'synthetic'));
    }
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) {
        const a = variants[i]!;
        const c = variants[j]!;
        // Hard negatives: other sizes, concentrations, flankers, testers, sets, refills, shades.
        pairs.push(pair(`beauty:${b.key}:${a.x.v}~${c.x.v}`, side(raw(a.titles[0]!, a.g, 0)), side(raw(c.titles[1]!, c.g, 1)), false, 'family'));
      }
    }
  }
  return pairs;
}

const files = (prefix: string) => readdirSync(OUT_DIR).filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
if (process.argv.includes('--build')) {
  writeFileSync(join(OUT_DIR, 'books-fixtures-2026-11-09.json'), `${JSON.stringify(buildBooks(), null, 1)}\n`);
  writeFileSync(join(OUT_DIR, 'beauty-synthetic.json'), `${JSON.stringify(buildBeauty(), null, 1)}\n`);
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(7);
const failures: string[] = [];
for (const category of ['books', 'beauty']) {
  const pairs = files(`${category}-`).flatMap((f) => JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8')) as EvalPair[]);
  const r = evaluateCategory(category, pairs);
  console.log(`\n== ${category}: ${pairs.length} pairs (${files(`${category}-`).join(', ')})`);
  for (const [label, rep] of [['as seen', r.report], ['identifiers masked', r.masked]] as const) {
    console.log(`  ${label.padEnd(20)} ${String(rep.pairs).padStart(4)} pairs  ${String(rep.positives).padStart(4)} positives  ${String(rep.accepts).padStart(4)} accepts  precision ${pct(rep.precision)}  recall ${pct(rep.recall)}  review ${pct(rep.reviewRate)}  false accepts ${rep.falseAccepts.length}`);
    for (const [src, s] of Object.entries(rep.bySource)) {
      console.log(`    ${src.padEnd(18)} ${String(s.pairs).padStart(4)} pairs  ${String(s.accepts).padStart(4)} accepts  precision ${pct(s.precision)}  recall ${pct(s.recall)}  review ${pct(s.reviewRate)}  rejected ${s.pairs - s.accepts - Math.round(s.reviewRate * s.pairs)}`);
    }
  }
  console.log(`  accepts on real (non-synthetic) labels: ${r.realAccepts}`);
  failures.push(...r.failures);
}
if (failures.length) {
  console.error(`\nFAIL: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('\nPASS (precision ≥ 98% at the accept threshold, no accepted hard negative, per category)');
