import { load } from 'cheerio';
import type { RawOffer } from '@pretoscop/core';
import { parseStructuredProductPage } from '../structured/generic';
import type { PageContext, PageParseResult } from '../types';
import { canonicalUrl, isRecord, lenientJsonParse, nonEmpty, str } from '../util';

/**
 * Flip product page (`/magazin/<brand>/<slug>/<modelId>/`, recorded 2026-10-27). Flip sells
 * refurbished phones with a warranty, in grades (Bun, Foarte bun, Excelent, Ca nou) selected with
 * `?shape=`; a page without `?shape=` shows its default grade. Its JSON-LD (one Offer, `sku` = the
 * grade/colour/storage SKU, our external id) is read by the generic parser, then corrected from
 * the Next.js page data (`__NEXT_DATA__`):
 *
 * - condition: refurbished (the JSON-LD says `UsedCondition`); the grade goes to `raw.grade` and
 *   is removed from the title, because "Ca nou" in a title reads as second hand to the normalizer;
 * - crossed price: Flip states that its previous (crossed) price is the lowest price of the last
 *   30 days before the promotion, so `previousPrice` above `price` is both `oldPrice` and
 *   `shopLowest30d` (as for eMAG); `retailPrice` is the new device's price, kept in raw only;
 * - stock from `product.stock`;
 * - delivery: the JSON-LD `shippingRate` 0 contradicts the page's own delivery prices
 *   (`shippingCosts`: courier 19,99 lei, locker 11,99 lei, free only for eMAG Genius members), so
 *   no delivery cost is taken from the offer; the shop's registry rules apply and the page's values
 *   are kept in raw;
 * - category: the JSON-LD breadcrumb is wrong (an iPhone under "laptop"), so the category is built
 *   from the page data's own naming ("Telefon mobil > Apple > iPhone 12");
 * - URL: the page that was fetched (its default grade is the one recorded), not the JSON-LD's
 *   `?shape=` variant, so the offer keeps the crawl frontier's URL (404 delisting matches it).
 */
export function parseFlipProduct(html: string, ctx: PageContext): PageParseResult {
  const base = parseStructuredProductPage(html, ctx);
  const $ = load(html);
  const data = lenientJsonParse($('script#__NEXT_DATA__').first().text());
  const props =
    isRecord(data) && isRecord(data.props) && isRecord(data.props.pageProps)
      ? data.props.pageProps
      : undefined;
  const product =
    props && isRecord(props.product) && isRecord(props.product.product)
      ? props.product.product
      : undefined;
  const shipping = props && isRecord(props.shippingCosts) ? props.shippingCosts : undefined;

  const offers: RawOffer[] = base.offers.map((o) => {
    const out: RawOffer = {
      ...o,
      url: canonicalUrl(ctx.url),
      condition: 'https://schema.org/RefurbishedCondition',
      shippingCost: undefined,
    };
    const raw: Record<string, unknown> = {
      ...o.raw,
      source: 'flip',
      jsonLdCondition: o.condition ?? null,
      jsonLdShippingCost: o.shippingCost ?? null,
      courierPrice: shipping?.courierPrice ?? null,
      lockerPrice: shipping?.lockerPrice ?? null,
    };
    if (product && str(product.legacySku) === o.externalId) {
      const naming = isRecord(product.naming) ? product.naming : {};
      const spec = isRecord(product.spec) ? product.spec : {};
      const grade = gradeLabel(str(spec.shape));
      const summary = nonEmpty(str(naming.configSummary));
      const withBrand = nonEmpty(str(naming.shortTitleWithBrand));
      const config = summary ? stripGrade(summary, grade) : undefined;
      if (withBrand && config) out.title = `${withBrand}, ${config}`;
      else if (o.title && grade) out.title = stripGrade(o.title, grade);
      const price = Number(product.price);
      const previous = Number(product.previousPrice);
      if (Number.isFinite(price) && Number.isFinite(previous) && previous > price) {
        out.oldPrice = String(previous);
        out.shopLowest30d = String(previous);
      }
      const stock = Number(product.stock);
      if (Number.isFinite(stock))
        out.availability =
          stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
      out.brand = nonEmpty(str(product.brandName)) ?? o.brand;
      const kind = nonEmpty(str(naming.categoryDisplayName));
      const model = nonEmpty(str(naming.modelDisplayName)) ?? nonEmpty(str(product.modelName));
      if (kind) out.category = [kind, out.brand, model].filter(Boolean).join(' > ');
      Object.assign(raw, {
        grade: grade ?? null,
        shape: str(spec.shape) ?? null,
        stock: Number.isFinite(stock) ? stock : null,
        retailPrice: product.retailPrice ?? null,
        modelId: product.legacyModelId ?? null,
        pdpUrl: str(product.pdpUrl) ?? null,
        jsonLdCategory: o.category ?? null,
      });
    }
    out.raw = raw;
    return out;
  });
  return { ...base, offers, meta: { ...base.meta, nextData: product !== undefined } };
}

const GRADES: Record<string, string> = {
  BUN: 'Bun',
  FOARTE_BUN: 'Foarte bun',
  EXCELENT: 'Excelent',
  CA_NOU: 'Ca nou',
};

function gradeLabel(shape: string | undefined): string | undefined {
  if (!shape) return undefined;
  return (
    GRADES[shape.toUpperCase()] ??
    shape
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase())
  );
}

/** "Black, 128 GB, Excelent" → "Black, 128 GB" (only a trailing grade is removed). */
function stripGrade(text: string, grade: string | undefined): string {
  if (!grade) return text;
  const parts = text.split(',').map((p) => p.trim());
  const last = parts[parts.length - 1];
  if (parts.length > 1 && last && last.toLowerCase() === grade.toLowerCase()) parts.pop();
  return parts.join(', ');
}
