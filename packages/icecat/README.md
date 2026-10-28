# @pretoscop/icecat

Open Icecat enrichment (M11): technical specs and licensed product images for the catalogue,
under Icecat's Open Content Licence. **Off by default**: the daily `icecat.sync` job runs only with
the database flag `icecat.enabled` and an Open Icecat account name in `ICECAT_USERNAME`
(setup B1, `docs/09-external-setup-checklist.md`). No account exists yet: everything here was
built against the documented API shape, synthetic fixtures and a local stand-in server; nothing in
this build has called Icecat.

## Licence obligations (what the code enforces, what other modules must do)

Sources: Open Content Licence and Fair Use Policy as summarized in
`docs/research/notes/gaps_affiliate_and_merchant_channels.md` §4 and `gaps2_technical.md` E3. The
licence text itself sits behind a bot wall (open item 40): **a founder reads and files it before the
flag is turned on.**

| Obligation | Where |
|---|---|
| "Specs Icecat" with a link to icecat.biz on every page showing Icecat content; database-right notice; AS IS disclaimer | `product_specs.attribution` and `product_images.license_note` carry the texts (`icecatAttribution`, `icecatImageLicense`); the product page shows `IcecatCredit` whenever its image or stored specs come from Icecat (`apps/web/src/components/product/icecat-credit.tsx`) |
| ≤ 1,000,000 datasheet downloads per month per language repository | every datasheet request is counted **before** it is sent (`IcecatUsageStore`, cap `ICECAT_MONTHLY_CAP`); the run stops at the cap |
| Obey Icecat's robots.txt | all requests go through `@pretoscop/fetch` (robots.txt of `live.icecat.biz` and `images.icecat.biz` fetched and obeyed; a refusal stops the run) |
| No AI training, no automated synthetic content from Icecat data | Icecat rows are marked `source = 'icecat'` (`isIcecatSource`); no LLM pipeline may read them (M22: exclude them) |
| No fee for the content, share-alike; keep it out of B2B products | Icecat data stays in `product_specs` / `product_images` only, never in `products`, `product_gtins` or exports; M28 and the public API must drop `source = 'icecat'` rows |
| Block AI and content-aggregation crawlers on our own site | **M16 (owns robots.txt)**: disallow `ICECAT_ROBOTS_DISALLOW_AGENTS` (GPTBot, ClaudeBot, CCBot, Google-Extended, …) at least on `/p/*` |
| Use the most recent datasheet | monthly refresh (30 days); images Icecat removed are deleted |
| Apple: brand-restricted; Sony, Xiaomi, Logitech, AMD: Full Icecat only | recorded as misses (`restricted`, `full_only`), retried monthly |

## Contract

```ts
createIcecatClient({ fetcher, shopname, baseUrl?, usage, monthlyCap?, now? }) → IcecatClient
  .lookup({ gtin } | { brand, mpn }, lang) → found | not_found | restricted | full_only | cap_reached | stop
  .image(url) → ok (bytes) | skip | stop
mapIcecatProduct(response, lang, { by: 'gtin' | 'brand_mpn', key }) → { specs: IcecatSpecsData, images: IcecatImageRef[] }   // pure
makeDerivatives(bytes) → { sha256, width, height, base, sizes: {120, 400, 800} }     // WebP (sharp)
icecatImageKeys(productId, sha256) → images/icecat/<id>/<sha16>.webp (+ _120/_400/_800)
startIcecatMock() → local stand-in (tests, demos)                                    // '@pretoscop/icecat/mock'
```

`product_specs.data` for `source = 'icecat'` (interface contract):
`{ locale, features: [{ group, name, value, unit, raw?, type? }], summary, shortSummary,
marketingText, bulletPoints, title, brand, productName, mpn, gtins, category, icecatId, quality,
releaseDate, matchedBy: 'gtin' | 'brand_mpn', matchedKey, demoAccount, source: 'open-icecat' }`.
Texts are stored exactly as Icecat sends them (the licence asks for changes to be marked; display
fixes such as cedilla → comma-below belong to the page). `product_images.source = 'icecat'`,
`storage_key` = the base key, derivatives next to it (the web's `ProductImage` convention).

### Client behaviour

Requests: `GET <ICECAT_BASE_URL>?lang=RO&shopname=<account>&GTIN=<printed GTIN>` or
`&Brand=<brand>&ProductCode=<code>` through `fetchPolite` (`purpose: 'feed'`, so the User-Agent is
`PretoscopBot-Feed/1.0`; JSON ≤ 8 MiB, images ≤ 12 MiB). Open Icecat needs no token
(`ICECAT_API_TOKEN` / `ICECAT_CONTENT_TOKEN` are for Full Icecat and unused). Answers:

| Icecat answers | Result | Effect on the run |
|---|---|---|
| 200 with `data.GeneralInfo` | `found` | stored |
| 404 "not present in the Icecat database" (or 400) | `not_found` | next key, then a miss |
| 404 "brand restrictions or access is limited" | `restricted` | next key, then a miss |
| bare 403 ("este necesar un app_key") | `full_only` | the fetch layer's automatic 24 h pause of the host is lifted (a per-product answer, not a block); next key |
| 403 with a CDN/WAF signature, challenge, 429, transport block, robots.txt refusal, 5xx | `stop` | run ends, ops alert |
| monthly cap reached | `cap_reached` | run ends before the request, ops alert |

The worker gives the client its own fetcher (`apps/worker/src/icecat/client.ts`): in-memory pause
state (Icecat's answers never pause a shop's host and are not shared with the crawler), only the
API host and `*.icecat.biz` reachable, `ICECAT_MIN_INTERVAL_MS` (default 1 s; Icecat allows up to
100 requests per second) between requests per host, request log in `request_log` (`shop_slug =
'icecat'`).

## `icecat.sync` (apps/worker)

Daily at 05:30 Europe/Bucharest (singleton queue), `ICECAT_DAILY_BATCH` products per run (default
2,000): never looked-up products first (most offers and popularity first), then datasheets or
misses older than 30 days. Per product: each GTIN (in printed form: EAN-13, UPC-12, EAN-8), then
brand + MPN, in the first language of `ICECAT_LANGS` (default `RO,EN`); the next language only when
the first has no features and no summary. Found: `product_specs` upsert (attribution), up to 6
public gallery pictures (main first) copied with derivatives to the blob store (`images/icecat/…`),
`product_images` rows with the licence note, the first one made primary when the product has no
primary image from another licensed source, and a provisional product confirmed when a GTIN found
it (docs/03 §6.3). Misses: a `product_specs` row with `source = 'icecat-miss'` (`{status, detail,
tried}`), retried after 30 days. Idempotent (images deduplicated by sha256).

CLIs (`apps/worker`): `pnpm icecat:lookup <gtin> [--brand --mpn] [--lang] [--save dir]` (live with an
account; `--mock` offline), `pnpm icecat:coverage` (per brand, read-only), `pnpm --filter
@pretoscop/worker icecat:sync [--limit]` (one pass now; `--mock` only against a scratch database),
`pnpm --filter @pretoscop/worker icecat:demo` (throwaway database + mock: the whole flow offline).

## Interim storage (no migration in this module)

- Monthly counters: rows of `fetch_domain_daily` with `host = 'icecat:<LANG>'` (one per day; the
  month is their sum). Proposed table: `icecat_usage(month date, lang text, downloads int,
  PRIMARY KEY (month, lang))`.
- Misses: `product_specs` rows with `source = 'icecat-miss'`. Proposed table:
  `icecat_lookups(product_id bigint PK → products, status text, detail text, tried text[],
  looked_up_at timestamptz)`. Readers of `product_specs` must filter `source = 'icecat'`.

## Fixtures and tests

`fixtures/` holds **synthetic** responses (see its README); replace them with recorded ones once the
account exists (`icecat:lookup … --save packages/icecat/fixtures`). `pnpm --filter
@pretoscop/icecat test`: mapping, licence texts, the client over the real polite fetcher against the
mock (robots.txt, identity, every answer class, cap, lifted pause), derivatives. End to end on a
throwaway database: `apps/worker/test/icecat-sync.test.ts`.
