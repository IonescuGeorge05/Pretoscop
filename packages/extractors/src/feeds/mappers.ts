import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import type { RawOffer } from '@pretoscop/core';
import type { FeedContext, FeedInput } from '../types';
import { canonicalUrl, isRecord, lenientJsonParse, priceFormatOf } from '../util';
import { flagTrue, pickFields, splitPriceCurrency } from './fields';
import { streamXmlItems, textChunks } from './stream';

function https(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith('//') ? `https:${url}` : url;
}

function baseOffer(ctx: FeedContext, f: Record<string, string>, raw: Record<string, unknown>): RawOffer | undefined {
  const title = f.title;
  const url = https(f.url) ?? https(f.affiliateUrl);
  const pc = splitPriceCurrency(f.salePrice ?? f.price);
  if (!title || !url || !pc.amount) return undefined;
  const oldPc = f.salePrice ? splitPriceCurrency(f.price) : splitPriceCurrency(f.oldPrice);
  return {
    shopSlug: ctx.shopSlug,
    externalId: f.externalId ?? canonicalUrl(url),
    url: canonicalUrl(url),
    title,
    price: pc.amount,
    priceFormat: priceFormatOf(pc.amount),
    oldPrice: oldPc.amount,
    currency: pc.currency ?? f.currency,
    availability: f.availability,
    condition: f.condition,
    gtin: f.gtin,
    mpn: f.mpn,
    brand: f.brand,
    category: f.category,
    imageUrl: https(f.imageUrl?.split(/[,|\s]+/)[0]),
    affiliateUrl: https(f.affiliateUrl),
    shippingCost: f.shippingCost,
    shippingNote: f.shippingNote,
    vatIncluded: f.vat !== undefined ? flagTrue(f.vat) : undefined,
    observedAt: ctx.observedAt,
    raw,
  };
}

/** Streams CSV rows as objects keyed by the header line. Delimiter auto-detected (, ; tab |). */
async function* csvRows(input: FeedInput): AsyncIterable<Record<string, string>> {
  const chunks = textChunks(input);
  const it = chunks[Symbol.asyncIterator]();
  const first = await it.next();
  if (first.done) return;
  const head = first.value;
  const headerLine = head.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t', '|'].map((d) => [d, headerLine.split(d).length] as const);
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',';
  const source = Readable.from(
    (async function* () {
      yield head;
      for (;;) {
        const n = await it.next();
        if (n.done) return;
        yield n.value;
      }
    })(),
  );
  const parser = source.pipe(
    parse({
      columns: true,
      delimiter,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }),
  );
  for await (const row of parser) yield row as Record<string, string>;
}

/**
 * 2Performant affiliate feed (CSV). Labels: Product title, Marketer Link, Sale price, Merchant
 * Program, Image URLs, Description, Merchant program ID, Old price, Category, Product ID,
 * Other data (JSON), Brand, Active, Added at, Merchant URL, Product URL, GTIN, Custom Field 1–4.
 * There is no stock or shipping field: availability comes from Active and Other data (JSON),
 * delivery from the shop's rules (docs/05 M05).
 */
export async function* parse2PerformantCsv(input: FeedInput, ctx: FeedContext): AsyncIterable<RawOffer> {
  for await (const row of csvRows(input)) {
    yield* map2PerformantRecord(row, ctx);
  }
}

function* map2PerformantRecord(row: Record<string, string>, ctx: FeedContext): Iterable<RawOffer> {
  const f = pickFields(row);
  const otherRaw = row['Other data (JSON)'] ?? row['Other data'] ?? row['other_data'] ?? row['Other data JSON'];
  const other = otherRaw ? lenientJsonParse(otherRaw) : undefined;
  const otherRec = isRecord(other) ? other : {};
  const active = flagTrue(row['Active'] ?? row['active'] ?? f.active);
  const otherAvail = ['availability', 'stock_status', 'in_stock', 'stock', 'disponibilitate']
    .map((k) => otherRec[k])
    .find((v) => v !== undefined && v !== null && v !== '');
  let availability: string | undefined;
  if (active === false) availability = 'out_of_stock';
  else if (otherAvail !== undefined) availability = String(otherAvail);
  else if (active === true) availability = 'in_stock';
  const offer = baseOffer(ctx, { ...f, availability: availability ?? f.availability ?? '' }, {
    network: '2performant',
    merchantProgram: row['Merchant Program'] ?? null,
    merchantProgramId: row['Merchant program ID'] ?? null,
    addedAt: row['Added at'] ?? null,
    merchantUrl: row['Merchant URL'] ?? null,
    active: active ?? null,
    otherData: Object.keys(otherRec).length > 0 ? otherRec : null,
    customFields: ['Custom Field 1', 'Custom Field 2', 'Custom Field 3', 'Custom Field 4']
      .map((k) => row[k])
      .filter((v) => v !== undefined && v !== ''),
  });
  if (offer) {
    if (!offer.availability) delete offer.availability;
    yield offer;
  }
}

/** 2Performant affiliate feed (XML): same fields as the CSV, one element per product. */
export async function* parse2PerformantXml(input: FeedInput, ctx: FeedContext): AsyncIterable<RawOffer> {
  for await (const { record } of streamXmlItems(input, ['product', 'item'])) {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(record)) row[k.replace(/_/g, ' ')] = v;
    // XML element names are snake_case variants of the CSV labels.
    if (row['other data'] !== undefined) row['Other data (JSON)'] = row['other data'];
    if (row['active'] !== undefined) row['Active'] = row['active'];
    if (row['merchant program'] !== undefined) row['Merchant Program'] = row['merchant program'];
    if (row['merchant program id'] !== undefined) row['Merchant program ID'] = row['merchant program id'];
    yield* map2PerformantRecord(row, ctx);
  }
}

/** Google Merchant feed: RSS 2.0 `<item>` or Atom `<entry>` with the `g:` namespace. */
export async function* parseGoogleShopping(input: FeedInput, ctx: FeedContext): AsyncIterable<RawOffer> {
  for await (const { record } of streamXmlItems(input, ['item', 'entry'])) {
    const r: Record<string, string> = {};
    for (const [k, v] of Object.entries(record)) {
      // Prefer g: fields; plain RSS title/link are fallbacks.
      const key = k.startsWith('g:') ? k : k;
      r[key] = v;
    }
    const shipping = r['g:shipping/g:price'] ?? r['g:shipping_price'];
    const f = pickFields({
      'g:id': r['g:id'] ?? r['id'],
      'g:title': r['g:title'] ?? r['title'],
      'g:link': r['g:link'] ?? r['link'] ?? r['@href'],
      'g:price': r['g:price'],
      'g:sale_price': r['g:sale_price'],
      'g:availability': r['g:availability'],
      'g:condition': r['g:condition'],
      'g:brand': r['g:brand'],
      'g:gtin': r['g:gtin'],
      'g:mpn': r['g:mpn'],
      'g:product_type': r['g:product_type'] ?? r['g:google_product_category'],
      'g:image_link': r['g:image_link'],
    });
    if (shipping) f.shippingCost = shipping;
    const offer = baseOffer(ctx, f, { network: 'google', itemGroupId: r['g:item_group_id'] ?? null });
    if (offer) yield offer;
  }
}

/**
 * compari.ro feed (Heureka spec): `<Products><Product>` with Identifier, Manufacturer, Name,
 * Category, ProductUrl, Price, ProductNumber, EanCode, DeliveryCost ("FREE" / "30 RON"),
 * DeliveryTime ("2 zile"; "NO" = not orderable), ImageUrl, ShoppingDisabled; older feeds use
 * Delivery_cost, Delivery_time, EAN. Extra specs come as `<Attributes><Attribute>` name/value pairs.
 */
export async function* parseCompariXml(input: FeedInput, ctx: FeedContext): AsyncIterable<RawOffer> {
  for await (const { record, pairs } of streamXmlItems(input, ['Product', 'product', 'item'])) {
    const f = pickFields(record);
    if (!f.mpn && record['ProductNumber']) f.mpn = record['ProductNumber'];
    const deliveryTime = record['DeliveryTime'] ?? record['Delivery_time'] ?? record['delivery_time'];
    const deliveryCost = record['DeliveryCost'] ?? record['Delivery_cost'] ?? record['delivery_cost'];
    const disabled = flagTrue(record['ShoppingDisabled']);
    if (deliveryCost) f.shippingCost = /^free$/i.test(deliveryCost.trim()) ? '0' : deliveryCost;
    if (deliveryTime) f.shippingNote = deliveryTime;
    f.availability = f.availability ?? (deliveryTime && /^no$/i.test(deliveryTime.trim()) ? 'out_of_stock' : 'in_stock');
    const offer = baseOffer(ctx, f, {
      network: 'compari',
      groupId: record['GroupId'] ?? null,
      shoppingDisabled: disabled ?? null,
      attributes: pairs.length > 0 ? Object.fromEntries(pairs) : null,
    });
    if (offer) yield offer;
  }
}

/** Generic CSV export with any of the headers in FIELD_ALIASES. */
export async function* parseGenericCsv(input: FeedInput, ctx: FeedContext): AsyncIterable<RawOffer> {
  for await (const row of csvRows(input)) {
    const f = pickFields(row);
    const active = flagTrue(f.active);
    if (active === false) f.availability = 'out_of_stock';
    const offer = baseOffer(ctx, f, { network: 'csv' });
    if (offer) yield offer;
  }
}
