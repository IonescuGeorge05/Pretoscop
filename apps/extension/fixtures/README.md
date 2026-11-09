# Extension fixtures (M26)

Pages the extension's detectors are tested on (`test/detect.test.ts`) and that the overlay e2e
(`apps/web/e2e/extension.spec.ts`) serves through Playwright's `page.route`.

| Shop | Pages | Kind |
|---|---|---|
| eMAG | `packages/extractors/fixtures/emag/product_2026-10-27.html`, `listing_2026-10-27.html`, `listing-vendor-emag_2026-10-27.html` | **Recorded** by PretoscopBot on 27 Oct 2026 (M03); used in place, not copied. Third-party browser keys in them were redacted before the repository was published (docs/HANDOFF.md §1). |
| Altex | `altex/product_synthetic.html`, `altex/listing_synthetic.html` | **Synthetic** |
| Flanco | `flanco/product_synthetic.html`, `flanco/category_synthetic.html` | **Synthetic** |
| PC Garage | `pcgarage/product_synthetic.html`, `pcgarage/listing_synthetic.html` | **Synthetic** |
| evoMAG | `evomag/product_synthetic.html`, `evomag/listing_synthetic.html` | **Synthetic** |

**The `_synthetic` pages are not recordings.** Altex, Flanco, PC Garage and evoMAG block our crawler,
and CLAUDE.md forbids working around a block, so no page of theirs was fetched. Each synthetic page
was written by hand after the markup documented in `docs/research/notes/gaps2_retailers.md` §3
(archived category pages: Altex's Next.js `__NEXT_DATA__` with `ean_codes`/`brand_name`/`url_key`,
Flanco's Magento 2 GA4 `items` with the part number in `item_variant`, PC Garage's JSON-LD
`ItemList` of `Product` with `brand`/`mpn`, evoMAG's Yii pages) and `gaps2_technical.md` F2 (Web
Data Commons: Flanco `brand`/`mpn`/`sku` and no GTIN, evoMAG `mpn`/`brand`; no Product markup
seen on altex.ro or pcgarage.ro). Product-page details the notes do not document (where Altex
keeps the product object on a product page, PC Garage's product-page JSON-LD) are assumptions,
named as such in each file's header comment.

They must be replaced by real pages before the detectors are trusted on those shops: open the shop
in a normal browser, save the product page ("Save page as… → HTML only"), strip anything personal
(account, cart, cookies banner state) and third-party keys, name it `product_<date>.html` and keep
the synthetic file's expectations in the test. Never fetch these shops with the crawler.

Never use the synthetic pages for crawler extractors (`packages/extractors`): they live here so
they cannot be mistaken for recordings.
