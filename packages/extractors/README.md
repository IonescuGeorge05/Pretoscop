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
| `jsonld-product` | any product page; listing pages that publish a JSON-LD `ItemList` | JSON-LD (`Product`, `ProductGroup.hasVariant`, `@graph`, `ItemList`, `Offer`, `AggregateOffer` only when it collapses to one price, `priceSpecification` incl. `StrikethroughPrice` as old price, `shippingDetails` rate as the offer's delivery cost) → microdata → OpenGraph `product:*` tags. Breadcrumb from `BreadcrumbList`. Relative URLs are resolved on the page URL, stray HTML entities in names decoded (`32&quot;` → `32"`). On a listing (more than one product) it also returns `productUrls` and `nextPageUrl` from `<link rel="next">` (forit: 60 products per page). |
| `emag-listing` | eMAG category page (`/…/c`, `/…/pN/c`, `/…/vendor/emag/c`) | 60 cards; offer id = `data-offer-id` (buy-box offer, seller not shown → `raw.sellerUnknown`); price from `.product-new-price` (`ro` format); crossed `<s>` price = eMAG's lowest price of the last 30 days → `oldPrice` and `shopLowest30d`; "PRP" (manufacturer's recommended price) → `raw.rrp` only; availability from `text-availability-<code>`; MPN recovered from the URL slug (`…-blueberry-sm-s741bzvdeue` → `SM-S741BZVDEUE`); rating and review count in `raw` (Tier A popularity). |
| `emag-product` | eMAG product page (`/…/pd/PNK/`) | One RawOffer per seller: `EM.offer` (main), `EM.multiple_offers`, `EM.used_offers` (resigilate, condition `resigilat`), plus the analytics `secondary_offers` (sellers' names and prices; availability left unknown, never assumed). Seller = `vendor.name`; `vendor.id === 1` is eMAG itself, anything else `isMarketplaceSeller`. MPN/brand/category from JSON-LD and the breadcrumb. |
| `feed-2performant-csv` / `-xml` | 2Performant affiliate feed | Labels: Product title, Marketer Link (→ `affiliateUrl`, `https:` added), Sale price, Merchant Program, Image URLs, Description, Merchant program ID, Old price, Category, Product ID, Other data (JSON), Brand, Active, Added at, Merchant URL, Product URL, GTIN, Custom Field 1–4. No stock or shipping fields: availability from `Active` (0 → out of stock) and `Other data` (`availability`, `stock_status`, …); delivery comes from the shop's rules. |
| `feed-google-shopping` | Google Merchant RSS/Atom | `g:` fields; `g:sale_price` becomes the price and `g:price` the old price; `g:shipping/g:price` → shipping cost. |
| `feed-compari-xml` | compari.ro (Heureka) XML | Identifier, Manufacturer, Name, Category, ProductUrl, Price, ProductNumber, EanCode, DeliveryCost (`FREE` → 0), DeliveryTime (`NO` → out of stock); older `Delivery_cost`/`Delivery_time`/`EAN`; `<Attributes>` pairs in `raw.attributes`. |
| `feed-csv-generic` | any CSV export | Header aliases in `src/feeds/fields.ts` (Romanian and English; `;`, `,`, tab or `|`). A header that maps to two fields fails loudly at load time. |
| `itgalaxy-listing` | IT Galaxy category page (`/televizoare/`, `/televizoare/pagina2/`) | 36 product boxes: id (= product-page JSON-LD `sku`, URL tail), title, price and crossed price as displayed (`ro` format), stock text, EAN from the card's "Cod EAN" line, breadcrumb, `rel="next"`. |
| `dedeman-listing` | Dedeman category page (`/ro/frigidere/c/1147`, `?page=2`) | Up to 72 Magento cards: product code (`data-product-sku` = `/p/<code>`), `data-price-amount` (decimal; the special price when there is one, the crossed price only then), stock line as worded, HTML breadcrumb, next page from "Pagina X din Y". Cards priced per m²/kg are skipped. |
| `carrefour-listing` | Carrefour category page (`?p=2`) | 24 cards: article code from the add-to-cart button (= JSON-LD `sku`, URL tail), `meta[itemprop=price]`, crossed price rebuilt from its spans, brand and availability from the button. The wishlist link (it carries another product's data) is never read. |
| `vtex-listing` | VTEX IO pages (Auchan category `…/c`, `?page=2`; product `/<slug>/p`) | The page's embedded Apollo state (`__STATE__`): product id, name, link, category path, per SKU the EAN and the default seller's `Price`/`ListPrice`/`AvailableQuantity`. Unavailable products (price 0) are skipped and counted in `meta.unpriced`; next page built as `?page=N` (the site's own links use `?map=`, which robots.txt disallows). No API call. |
| `bonami-listing` | Bonami category page (`/c/<slug>`, `?p=1`) | `__NEXT_DATA__` product list (48 per page): exact money amounts, crossed `retailPrice`, stock, brand, `/p/<slug>`. Colour variants without a price are not emitted. |
| `flip-product` | Flip product page | Generic JSON-LD offer corrected from `__NEXT_DATA__`: condition refurbished (JSON-LD says used), grade moved from the title to `raw.grade`, previous price = Flip's stated 30-day minimum (`oldPrice` and `shopLowest30d`), stock, category from the page's naming (its JSON-LD breadcrumb is wrong), no delivery cost from JSON-LD (its 0 contradicts the page's courier fee). |
| `sitemap` | sitemap index / urlset | Discovery only: the recorder fetches the URLs with `config.productParser`. |

## Fixtures

`fixtures/<shop>/<page>_<YYYY-MM-DD>.<ext>` plus a `.meta.json` (URL, final URL after redirects,
status, UA, time, robots.txt group). Pages are recorded with `scripts/record-fixture.sh <shop> <name>
<url> [ext] [--purpose listing]`, which since M10 goes through `@pretoscop/fetch` (`pnpm --filter
@pretoscop/fetch record`): PretoscopBot identity, robots.txt fetched and obeyed, the shop's registry
interval (≥ 5 s, shared with the fetch demo's state file), block detection (a challenge writes
nothing and exits 2), and shops that are not `active` with `access_mode: direct` are refused before
any request. **Never edit a fixture by hand; re-record it.** Tests parse a fixture with its
`final_url` when it was redirected. `fixtures/feeds/` holds synthetic, specification-accurate feed
samples until the first affiliate program is approved (see its README).

## Adapter checklist (M10: adding a shop)

1. Check the registry first: a shop with `status: blocked` is never probed or crawled directly
   (docs/12: feeds, merchant onboarding, allowlisting or the assisted channel). For the others, read
   robots.txt and terms; record the decision in the YAML (`legal`).
2. Inspect at most 5 pages politely (`scripts/record-fixture.sh … --out-dir <scratch>` for probes);
   record ≤ 3 fixtures (listing, product, sitemap). Record every probe in the YAML `probes` list.
3. Prefer a **listing page** that shows many offers with prices (freshness: one request refreshes
   24–72 offers; a sitemap → product-page sweep refreshes one). Try `jsonld-product` first (it reads
   JSON-LD `ItemList` listings and product pages); write a shop parser only when the structured data
   is missing or wrong, and keep the external id identical to the one product pages would give.
4. Note quirks in the YAML: VAT, currency, marketplace sellers, crossed-price meaning (eMAG and Flip:
   lowest price of the last 30 days, stated by the shop; elsewhere: the shop's reference), stock
   wording, delivery rules **only as stated on the shop's own delivery page** (URL and date in
   `shipping.notes`; amounts left empty when the page states none).
5. Add a test with exact expectations for 1–2 offers plus a snapshot, and a `source.run` case in
   `apps/worker/test/m10-adapters.test.ts`; run `pnpm --filter @pretoscop/extractors test`.
6. Listing sources: one per category, `config.max_pages` bounded so the worst case stays under the
   shop's `max_pages_per_day`, staggered off-peak schedules, `freshness_slo_hours: 26`.
7. Enable the sources in the YAML; the worker syncs the registry on start; watch three days of
   healthy runs in the admin.

## Shop notes (M10, observed 2026-10-27 from a home connection, PretoscopBot UA)

| Shop | Parser | Offers per request | Identifiers | Crossed price | Stock | Notes |
|---|---|---|---|---|---|---|
| IT Galaxy | `itgalaxy-listing` | 36 | id; EAN on ~1 card in 4 | shop reference | text (`in stoc limitat`, `in stoc depozit/furnizor`) | Prices in Romanian format on the card |
| forit | `jsonld-product` (ItemList) | 60 | sku = manufacturer code (also `mpn`) | — | schema.org | Each offer states its delivery cost (21,99 / 0 lei) |
| Dedeman | `dedeman-listing` | ≤ 72 | product code; MPN in titles | shop reference ("Super Preț") | "Disponibil online" / locality-dependent ("Verifică disponibilitatea online" → unknown) | Per-piece prices only |
| Carrefour | `carrefour-listing` | 24 | article code; model codes in titles | shop reference | button `data-dimension10` / schema.org | Wishlist link data belongs to another product |
| Auchan | `vtex-listing` | 24 (few priced) | product id; EAN on every SKU | `ListPrice` > `Price` | `AvailableQuantity` | Brand field unreliable ("AEC" for TCL); 4.4 MB pages |
| Bonami | `bonami-listing` | 48 | numeric id (GTIN only on product pages) | `retailPrice` (shop reference) | `available` | Small appliances only |
| Flip | `flip-product` (sitemap) | 1 | sku per grade/colour/storage | previous price = stated 30-day minimum | `stock` | Refurbished; default grade only |
