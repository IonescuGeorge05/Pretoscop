/**
 * Founder demo: shows what the normalization rules make of a title.
 *
 *   pnpm --filter @pretoscop/core demo "Consola PlayStation 5 Slim Digital Edition, 1TB + joc EA FC 26"
 *   pnpm --filter @pretoscop/core demo "<title>" --price "2.499 lei" --old-price "2.999 lei" \
 *        --brand Sony --gtin 0711719577034 --mpn CFI-2016 --category "Console" --json
 */
import { contentHash } from '../hash';
import {
  type Attributes,
  detectAccessory,
  detectBrand,
  detectBundle,
  detectCondition,
  detectProductKind,
  extractAttributes,
  extractMpnCandidates,
  cleanTitleDetailed,
  formatLei,
  normalizeOffer,
  slugify,
  titleForMatch,
} from '../index';

interface Args {
  title: string;
  price?: string;
  oldPrice?: string;
  brand?: string;
  gtin?: string;
  mpn?: string;
  category?: string;
  condition?: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args | null {
  const out: Partial<Args> & { json: boolean } = { json: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const next = (): string => argv[++i] ?? '';
    if (a === '--json') out.json = true;
    else if (a === '--price') out.price = next();
    else if (a === '--old-price') out.oldPrice = next();
    else if (a === '--brand') out.brand = next();
    else if (a === '--gtin') out.gtin = next();
    else if (a === '--mpn') out.mpn = next();
    else if (a === '--category') out.category = next();
    else if (a === '--condition') out.condition = next();
    else if (a !== '--') rest.push(a);
  }
  const title = rest.join(' ').trim();
  return title === '' ? null : { ...out, title };
}

function size(gb: number): string {
  return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024}TB` : `${gb}GB`;
}

function capitalize(word: string): string {
  return word.length <= 2 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1);
}

/** "{storage: 1TB, edition: Slim Digital}" style summary for humans. */
function describeAttributes(a: Attributes): string {
  const parts: string[] = [];
  if (a.storageGb !== undefined) parts.push(`storage: ${size(a.storageGb)}`);
  if (a.ramGb !== undefined) parts.push(`ram: ${size(a.ramGb)}`);
  if (a.vramGb !== undefined) parts.push(`vram: ${size(a.vramGb)}`);
  if (a.screenInches !== undefined) parts.push(`screen: ${a.screenInches}"`);
  if (a.resolution) parts.push(`resolution: ${a.resolution}`);
  if (a.color) parts.push(`color: ${a.color} (${a.colorRo ?? ''})`);
  if (a.edition) parts.push(`edition: ${a.edition.map(capitalize).join(' ')}`);
  if (a.generation) parts.push(`generation: ${a.generation}`);
  if (a.year !== undefined) parts.push(`year: ${a.year}`);
  if (a.connectivity) parts.push(`connectivity: ${a.connectivity.join(' ')}`);
  if (a.energyClass) parts.push(`energy: ${a.energyClass}`);
  if (a.capacityL !== undefined) parts.push(`capacity: ${a.capacityL} l`);
  if (a.capacityKg !== undefined) parts.push(`load: ${a.capacityKg} kg`);
  if (a.powerW !== undefined) parts.push(`power: ${a.powerW} W`);
  if (a.caseSizeMm !== undefined) parts.push(`case: ${a.caseSizeMm} mm`);
  if (a.packCount !== undefined) parts.push(`pack: ${a.packCount}`);
  return `{${parts.join(', ')}}`;
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error(
      'usage: pnpm --filter @pretoscop/core demo "<title>" [--price "1.234 lei"] [--json]',
    );
    return 2;
  }
  const cleaned = cleanTitleDetailed(args.title);
  const brand = detectBrand(cleaned.title, args.brand ?? null, args.category ?? null);
  const kind = detectProductKind(cleaned.title, args.category ?? null);
  const attributes = extractAttributes(cleaned.title, {
    categoryHint: args.category ?? null,
    brand: brand?.name ?? null,
    kind,
  });
  const mpn = extractMpnCandidates(cleaned.title, {
    brand: brand?.name ?? null,
    productCode: cleaned.productCode,
  });
  const bundle = detectBundle(cleaned.title, args.category ?? null);
  const accessory = detectAccessory(cleaned.title, args.category ?? null);
  const condition = detectCondition(cleaned.title, args.condition ?? null);

  const offer = args.price
    ? normalizeOffer(
        {
          shopSlug: 'demo',
          externalId: 'demo',
          url: 'https://example.invalid/demo',
          title: args.title,
          price: args.price,
          ...(args.oldPrice ? { oldPrice: args.oldPrice } : {}),
          ...(args.brand ? { brand: args.brand } : {}),
          ...(args.gtin ? { gtin: args.gtin } : {}),
          ...(args.mpn ? { mpn: args.mpn } : {}),
          ...(args.category ? { category: args.category } : {}),
          ...(args.condition ? { condition: args.condition } : {}),
          observedAt: new Date().toISOString(),
          raw: {},
        },
        { shop: { slug: 'demo' }, observedAt: new Date(), hash: contentHash },
      )
    : null;

  if (args.json) {
    console.log(
      JSON.stringify(
        offer ?? {
          titleClean: cleaned.title,
          brand,
          kind,
          attributes,
          mpnCandidates: mpn.map((c) => c.norm),
          isBundle: bundle.isBundle,
          bundleReason: bundle.reason,
          isAccessory: accessory.isAccessory,
          condition,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const rows: Array<[string, string]> = [
    ['title', args.title],
    ['titleClean', cleaned.title],
    ['kind', kind],
    [
      'brand',
      brand
        ? `${brand.name}  (via ${brand.via}${brand.line ? ` "${brand.line}"` : ''}, confidence ${brand.confidence})`
        : '–',
    ],
    ['attributes', describeAttributes(attributes)],
    ['mpn', mpn.length > 0 ? mpn.map((c) => c.norm).join(', ') : '–'],
    ['isBundle', `${bundle.isBundle}${bundle.reason ? `  (${bundle.reason})` : ''}`],
    ['isAccessory', `${accessory.isAccessory}${accessory.reason ? `  (${accessory.reason})` : ''}`],
    [
      'condition',
      `${condition.condition}${condition.detail ? ` / ${condition.detail}` : ''}  (${condition.reason})`,
    ],
    ['titleMatch', titleForMatch(cleaned.title)],
    ['slug', slugify(cleaned.title)],
  ];
  if (offer) {
    if (offer.ok) {
      rows.push(['price', formatLei(offer.priceBani)]);
      if (offer.oldPriceBani !== null) rows.push(['oldPrice', formatLei(offer.oldPriceBani)]);
      rows.push(['total', `${formatLei(offer.totalBani)}  (delivery: ${offer.shippingBasis})`]);
      rows.push(['gtin', `${offer.gtin14 ?? '–'}  (${offer.gtinQuality})`]);
      rows.push(['contentHash', offer.contentHash]);
    } else {
      rows.push(['rejected', offer.rejects.join(', ')]);
    }
    if (offer.warnings.length > 0) rows.push(['warnings', offer.warnings.join(', ')]);
  }
  for (const [k, v] of rows) console.log(`${k.padEnd(12)} ${v}`);
  return 0;
}

process.exitCode = main();
