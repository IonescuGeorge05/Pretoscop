# Firefox Add-ons (AMO) listing (draft, M26)

For the AMO Developer Hub once the account exists (human task D1). The Firefox build is
`dist/firefox` (same code; `browser_specific_settings.gecko`: id `extensie@pretoscop.ro`, Firefox
140+, and Firefox's built-in data-collection declaration). Keep in step with the code and with
`/confidentialitate#extensie`.

## Listing

- **Name**: `Pretoscop – istoricul prețului`
- **Summary** (≤ 250): `Istoricul prețului observat de Pretoscop și cel mai mic preț total din alte magazine, direct pe paginile de produs eMAG, Altex, Flanco, PC Garage și evoMAG. Nu schimbă linkurile magazinelor și nu adaugă coduri de afiliere.`
- **Description**: the Chrome Web Store description (`chrome-web-store.md`), unchanged.
- **Categories**: Shopping. **Default locale**: Romanian. **Tags**: preturi, istoric pret, comparator.
- **Support**: https://pretoscop.ro/contact. **Privacy policy**: the text of `/confidentialitate#extensie`
  (AMO asks for the text itself, not only the link).

## Data collection (manifest `data_collection_permissions`)

Declared as required: `browsingActivity` (the address of the open product page, without query or
fragment) and `websiteContent` (GTIN, brand and part number read from that page). Firefox shows them
at install. Nothing optional; no technical or interaction data, no telemetry.

## Notes to reviewer

> The extension has no permissions and no remote code. Its content script runs only on five Romanian
> shops (emag.ro, altex.ro, flanco.ro, pcgarage.ro, evomag.ro), detects a product page and reads at
> most four values from it (page URL without query, GTIN, brand, manufacturer part number). The
> background script sends them to https://pretoscop.ro/api/ext/lookup (credentials omitted) and the
> content script renders the answer as text in a shadow-DOM panel (no innerHTML). Nothing is
> stored.
>
> The submitted files are not minified or obfuscated: `background.js` and `content.js` are esbuild
> bundles of the TypeScript sources (IIFE, no minification, no legal comments). To rebuild from the
> source package: Node 24, pnpm 10 (`corepack enable`), then `pnpm install --frozen-lockfile` and
> `pnpm --filter @pretoscop/extension build --target=firefox`; output in `apps/extension/dist/firefox`.

## Before submitting

Same as Chrome (`chrome-web-store.md`): release gate, version bump, build, zip the *contents* of
`dist/firefox`, run the checklist in Firefox (`about:debugging` → "Load Temporary Add-on").
