import type { Cheerio, CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { nonEmpty } from '../util';
import type { SdOffer, SdProduct } from './jsonld';

function propValue($: CheerioAPI, el: Cheerio<Element>): string | undefined {
  const content = el.attr('content') ?? el.attr('value');
  if (content !== undefined) return nonEmpty(content);
  const href = el.attr('href') ?? el.attr('src');
  if (href !== undefined && (el.is('link') || el.is('a') || el.is('meta'))) return nonEmpty(href);
  const dt = el.attr('datetime');
  if (dt) return nonEmpty(dt);
  return nonEmpty(el.text());
}

/** Properties of one itemscope, excluding those that belong to nested itemscopes. */
function props($: CheerioAPI, scope: Cheerio<Element>): Map<string, Cheerio<Element>[]> {
  const map = new Map<string, Cheerio<Element>[]>();
  scope.find('[itemprop]').each((_, node) => {
    const el = $(node);
    // Skip properties of nested scopes (their closest itemscope ancestor is not `scope`).
    const owner = el.parent().closest('[itemscope]');
    if (owner.length > 0 && owner.get(0) !== scope.get(0)) return;
    for (const name of (el.attr('itemprop') ?? '').split(/\s+/).filter(Boolean)) {
      const list = map.get(name) ?? [];
      list.push(el);
      map.set(name, list);
    }
  });
  return map;
}

function first($: CheerioAPI, m: Map<string, Cheerio<Element>[]>, ...names: string[]): string | undefined {
  for (const n of names) {
    const el = m.get(n)?.[0];
    if (el && !el.is('[itemscope]')) {
      const v = propValue($, el);
      if (v) return v;
    }
  }
  return undefined;
}

/** schema.org Product in microdata (fallback when there is no JSON-LD). */
export function extractMicrodata($: CheerioAPI): SdProduct[] {
  const out: SdProduct[] = [];
  $('[itemscope][itemtype*="schema.org/Product"]').each((_, node) => {
    const scope = $(node);
    const m = props($, scope);
    const offers: SdOffer[] = [];
    for (const offerEl of m.get('offers') ?? []) {
      if (!offerEl.is('[itemscope]')) continue;
      const om = props($, offerEl);
      offers.push({
        price: first($, om, 'price', 'lowPrice'),
        priceCurrency: first($, om, 'priceCurrency'),
        availability: first($, om, 'availability'),
        itemCondition: first($, om, 'itemCondition'),
        sellerName: first($, om, 'seller'),
        url: first($, om, 'url'),
      });
    }
    const brandEl = m.get('brand')?.[0];
    const brand = brandEl
      ? brandEl.is('[itemscope]')
        ? first($, props($, brandEl), 'name')
        : propValue($, brandEl)
      : undefined;
    out.push({
      source: 'microdata',
      name: first($, m, 'name'),
      sku: first($, m, 'sku'),
      mpn: first($, m, 'mpn'),
      productId: first($, m, 'productID'),
      gtin: first($, m, 'gtin13', 'gtin', 'gtin14', 'gtin12', 'gtin8'),
      brand,
      category: first($, m, 'category'),
      url: first($, m, 'url'),
      itemCondition: first($, m, 'itemCondition'),
      offers,
    });
  });
  return out;
}
