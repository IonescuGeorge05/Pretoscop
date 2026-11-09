# @pretoscop/extension — browser extension (M26)

Shows Pretoscop's price history and the cheapest total price at other shops on the product pages of
eMAG, Altex, Flanco, PC Garage and evoMAG. Manifest V3; Chrome first, Firefox from the same source.
Built with esbuild (ADR-026), not WXT.

## What it does, and what it never does

- **Content script** (`src/content.ts`, only on the five shops' own hosts, top frame): decides whether
  the open page is a product page and reads, from that page only, the product's identifiers
  (`src/detect.ts`): JSON-LD `Product` first (never products inside an `ItemList`), then microdata,
  then shop fallbacks (Altex `__NEXT_DATA__` EAN codes for the product whose `url_key` is in the
  address, Flanco's GA4 `view_item` brand and part number), then the address (eMAG `/pd/<code>/`,
  Altex `/cpd/<code>/`) and the shop's canonical link. It sends the background worker four values
  at most: the page address without query or fragment, a GTIN with a valid check digit, brand +
  part number. Never titles, prices, reviews, the cart, the account, cookies or other pages.
- **Background worker** (`src/background.ts` → `src/service.ts`): accepts a message only from this
  extension's content script in the top frame of a supported shop tab, re-validates the identifiers
  against that tab's shop, and makes the extension's only request: `GET {API}/api/ext/lookup` without
  cookies or referrer. Answers stay in memory 10 minutes (30 for "switched off"); a 429 stops all
  lookups for its `Retry-After`. Nothing is written to disk; no telemetry.
- **Panel** (`src/overlay.ts`): one element appended to the page, everything inside its shadow root,
  built with DOM calls (`textContent`, never HTML from page or API data; ESLint forbids
  `innerHTML`/`outerHTML`/`insertAdjacentHTML`). Romanian text, prices `1.234,56 lei`: the cheapest
  total now and where, the verdict (M08; "Istoric insuficient" under 14 observed days), the M15
  badges, a sparkline of observed days only (gaps stay gaps), the 30-day low, all-time low and
  30-day median, up to five offers, and one plain link to `/p/{slug}` on Pretoscop. Escape (focus in
  the panel) or the × button closes it for that page view. It never changes the shop's page: no
  link is rewritten or added there, no affiliate parameter anywhere.
- **Permissions**: none. No `host_permissions` (the API answers with CORS `*`), no storage, tabs,
  web-accessible resources or external messaging. The page cannot talk to the extension.

## Build and load

```bash
pnpm --filter @pretoscop/extension build                      # dist/chrome and dist/firefox, API and links → https://pretoscop.ro
pnpm --filter @pretoscop/extension build --api=http://localhost:3000 --site=http://localhost:3000   # against a local web server
```

`--target=chrome|firefox` builds one (`--out=DIR` with a single target). The version comes from
`package.json`; bump it for every release (the stores update installed copies).

- **Chrome**: `chrome://extensions` → Developer mode → "Load unpacked" → `apps/extension/dist/chrome`.
- **Firefox** (140+): `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" →
  `apps/extension/dist/firefox/manifest.json`.

The lookup API answers only while the flag `extension.lookup.enabled` is on (`/admin/flaguri`); see
`apps/web/README.md` "Browser extension API" for the contract, rate limit and per-shop switches.

## Tests

- `pnpm --filter @pretoscop/extension test`: detectors on the recorded eMAG pages
  (`packages/extractors/fixtures/emag/`) and on the synthetic pages of the other shops
  (`fixtures/`, see its README: they are not recordings), identifier checks, the background
  service (message checks, cache, back-off), the strict answer parser, formatting, the sparkline,
  the manifest (no permissions, one manifest for both browsers) and the build output (no HTML
  parsing, eval, beacons or storage; one fetch).
- E2E with the built extension in Chromium: `apps/web/e2e/extension.spec.ts`.
- Release gate: `pnpm --filter @pretoscop/db ext:resolution emag altex`.

## Deferred

- **"Raportează acest preț"** (opt-in user price reports, docs/12 layer 3): needs a table, the
  plausibility band, two agreeing reports, abuse handling and the "trusted reporter" role; not built.
- **Safari** (Apple Developer Program), **store publication** (human task D1; texts in `store/`).
- **Telemetry**: none; if ever added, opt-in only.
