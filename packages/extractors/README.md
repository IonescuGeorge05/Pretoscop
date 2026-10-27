# @pretoscop/extractors

Turns pages and feeds into `RawOffer` records. **No I/O** (ESLint forbids network, filesystem and
database imports in `src/`; the CLI in `src/cli/` is the only exception).

## Contract

```ts
parsePage(parserKey, html, url, { shopSlug?, observedAt? }) → RawOffer[]
parsePageDetailed(parserKey, html, { url, shopSlug, observedAt })
  → { offers: RawOffer[], productUrls?: string[], nextPageUrl?: string | null, meta?: {...} }
parseFeed(parserKey, input, { shopSlug, observedAt, feedUrl? }) → AsyncIterable<RawOffer>
parseSitemap(xml) → { urls: { loc, lastmod? }[], children: string[] }
isKnownParserKey(key) / allParserKeys()          // used by the shop registry (M04) validation
```

`RawOffer` is defined in `@pretoscop/core` (`packages/core/src/raw-offer.ts`) and re-exported here:
`shopSlug, externalId, url, title, price (string as seen), priceFormat ('ro' | 'decimal' | undefined),
oldPrice?, currency?, vatIncluded?, availability?, condition?, gtin?, mpn?, brand?, category?,
sellerName?, sellerId?, isMarketplaceSeller?, imageUrl?, affiliateUrl?, shippingCost?, shippingNote?,
shopLowest30d?, observedAt, raw`. Values stay "as seen"; normalization is M06's job.

Feed inputs may be a string, a `Uint8Array` or an async iterable of chunks; gzip is detected by its
magic bytes and inflated. XML feeds stream through `sax`, CSV through `csv-parse` (delimiter
auto-detected): memory stays flat (a 100k-row CSV is a test).

## Parser keys

| Key | Input | Notes |
|---|---|---|
| `jsonld-product` | any product page | JSON-LD (`Product`, `ProductGroup.hasVariant`, `@graph`, `ItemList`, `Offer`, `AggregateOffer` only when it collapses to one price, `priceSpecification` incl. `StrikethroughPrice` as old price) → microdata → OpenGraph `product:*` tags. Breadcrumb from `BreadcrumbList`. |
| `emag-listing` | eMAG category page (`/…/c`, `/…/pN/c`, `/…/vendor/emag/c`) | 60 cards; offer id = `data-offer-id` (buy-box offer, seller not shown → `raw.sellerUnknown`); price from `.product-new-price` (`ro` format); crossed `<s>` price = eMAG's lowest price of the last 30 days → `oldPrice` and `shopLowest30d`; "PRP" (manufacturer's recommended price) → `raw.rrp` only; availability from `text-availability-<code>`; MPN recovered from the URL slug (`…-blueberry-sm-s741bzvdeue` → `SM-S741BZVDEUE`); rating and review count in `raw` (Tier A popularity). |
| `emag-product` | eMAG product page (`/…/pd/PNK/`) | One RawOffer per seller: `EM.offer` (main), `EM.multiple_offers`, `EM.used_offers` (resigilate, condition `resigilat`), plus the analytics `secondary_offers` (sellers' names and prices; availability left unknown, never assumed). Seller = `vendor.name`; `vendor.id === 1` is eMAG itself, anything else `isMarketplaceSeller`. MPN/brand/category from JSON-LD and the breadcrumb. |
| `feed-2performant-csv` / `-xml` | 2Performant affiliate feed | Labels: Product title, Marketer Link (→ `affiliateUrl`, `https:` added), Sale price, Merchant Program, Image URLs, Description, Merchant program ID, Old price, Category, Product ID, Other data (JSON), Brand, Active, Added at, Merchant URL, Product URL, GTIN, Custom Field 1–4. No stock or shipping fields: availability from `Active` (0 → out of stock) and `Other data` (`availability`, `stock_status`, …); delivery comes from the shop's rules. |
| `feed-google-shopping` | Google Merchant RSS/Atom | `g:` fields; `g:sale_price` becomes the price and `g:price` the old price; `g:shipping/g:price` → shipping cost. |
| `feed-compari-xml` | compari.ro (Heureka) XML | Identifier, Manufacturer, Name, Category, ProductUrl, Price, ProductNumber, EanCode, DeliveryCost (`FREE` → 0), DeliveryTime (`NO` → out of stock); older `Delivery_cost`/`Delivery_time`/`EAN`; `<Attributes>` pairs in `raw.attributes`. |
| `feed-csv-generic` | any CSV export | Header aliases in `src/feeds/fields.ts` (Romanian and English; `;`, `,`, tab or `|`). A header that maps to two fields fails loudly at load time. |
| `sitemap` | sitemap index / urlset | Discovery only: the recorder fetches the URLs with `config.productParser`. |

## Fixtures

`fixtures/<shop>/<page>_<YYYY-MM-DD>.<ext>` plus a `.meta.json` (URL, status, UA, time). Pages are
recorded with `scripts/record-fixture.sh <shop> <name> <url>` (PretoscopBot UA, ≥5 s per host,
robots.txt checked by hand first, at most three pages per shop). **Never edit a fixture by hand;
re-record it.** `fixtures/feeds/` holds synthetic, specification-accurate feed samples until the
first affiliate program is approved (see its README).

## Adapter checklist (M10: adding a shop)

1. Read the shop's robots.txt and terms; record the decision in its registry YAML (`legal_notes`).
2. Inspect at most 5 pages politely; record ≤3 fixtures (listing, product, sitemap) with the script.
3. Try `jsonld-product` first (`pnpm demo fixtures/<shop>/product_<date>.html`). Only write a shop
   parser when structured data is missing or wrong; register it in `src/registry.ts`.
4. Note quirks in the YAML: VAT (incl./excl.), currency, marketplace sellers, delivery rules,
   crossed-price meaning (eMAG: lowest 30 days; elsewhere: the shop's reference).
5. Add a test with exact expectations for 1–2 offers plus a snapshot; run `pnpm --filter @pretoscop/extractors test`.
6. Enable the source in the YAML, `make shops:sync`, watch three days of healthy runs in the admin.
