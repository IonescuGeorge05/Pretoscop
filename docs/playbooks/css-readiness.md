# Google CSS programme: readiness and application checklist (M29)

What it takes for Pretoscop to become a Comparison Shopping Service (CSS) for Romania, what we can
already check ourselves, and what the founders must do. Sources: `docs/research/notes/affiliate_networks_and_feeds.md`
§5 (Google's CSS programme requirements and CSS Center pages, read 2026-10-27) and
`docs/13-open-items.md` (G19–G21, 57, 58). Human task: **D4** in `docs/09-external-setup-checklist.md`.
Apply only when the report below says ELIGIBLE (≥ 50 merchant domains), as the plan decided.

## What a CSS gets in Romania

- Romania is a CSS country for Shopping ads and free listings; it is **not** one of the countries
  with "CSS product pages", so Google does not show our comparison pages through the programme:
  Shopping ads and free listings lead to the merchants' pages.
- Merchants must work with at least one CSS to appear in Shopping; a CSS + affiliate model is a
  known pattern in Romania (Flanco 2023; Libris allows CSS promotion only with prior approval).
- Not verified (open items G19, G20, 58, never treat them as settled): the margin advantage of a
  non-Google CSS, CSS fee models, how many CSSs serve Romania.

## Requirements and where we stand (2026-11-09)

Run `pnpm --filter @pretoscop/worker css:readiness` (read-only; `--json` for a machine-readable
report) for the measured lines.

| # | Requirement (Google CSS programme) | Status | How it is checked |
|---|---|---|---|
| 1 | Business registered in a CSS country, matching address on the site | ☐ waits for the SRL (B4) and the legal pages (M17, B5) | founders |
| 2 | Users can search and compare products, price and selling conditions for the same product | ✅ search, product pages with every shop's total price (price + delivery), M13/M14 | e2e (M13, M14) |
| 3 | Products from **≥ 50 distinct merchant domains** for the country, which ship there | ❌ **7 of 50** on the dev data of 9 Nov 2026 (forit, eMAG, IT Galaxy, Dedeman, Carrefour, Auchan, Bonami) | `css:readiness` (shops with live offers, by domain) |
| 4 | Shows products and leads users to a page where they can buy them | ✅ click-out to the shop's product page (`/out`, M13) | e2e (M13) |
| 5 | Own search box and own automated search (not licensed from Google) | ✅ Meilisearch, our index (M14) | code |
| 6 | Sort or filter by price plus at least one other dimension (brand, merchant, shipping) | ✅ search sorts by price (ascending, descending) and by number of shops; filters by category, brand, shop, stock and price range (M14) | e2e (M14) |
| 7 | Accessible to everyone without sign-up | ✅ no account needed except for alerts and notification channels (M19, M27) | code |
| 8 | Not a marketplace with transactions on our domain | ✅ **no on-site checkout**: no cart, checkout or payment route in the web app; merchant billing (M25) charges shops, never shoppers | `css:readiness` scans `apps/web/src/app` |
| 9 | Name and logo not shared with a business selling physical goods on the site | ✅ Pretoscop sells nothing | founders confirm at application |
| 10 | A prominent filter must not restrict results to fewer than 3 merchants on most queries | ❌ few products have 3 shops yet (28 TV/audio products on the dev data) | `css:readiness` (products with ≥ 3 shops) |
| 11 | Structured product lists for Google (not a programme rule, but part of readiness) | ✅ category pages publish a schema.org `ItemList` of their indexable products (M16) | `css:readiness`, e2e (M16, M29) |

The merchant count grows through feeds and the merchant portal (M20), not crawling: every
affiliate-feed merchant and every merchant that uploads its feed is a domain we show.

## Per-merchant permission (separate from eligibility)

A merchant we show counts towards the 50 domains whatever its affiliate terms say; running
Shopping ads **for** a merchant needs its permission. The registry records the programme's stance
in `affiliate.css_policy` (`css:readiness` prints it per shop):

| Shop | CSS promotion | Source |
|---|---|---|
| Libris | approval (prior written approval, one account, Libris feeds only) | 2Performant programme terms |
| Elefant | forbidden ("Google ADS și Google CSS nu este permisă") | Profitshare programme terms |
| IT Galaxy, forit | forbidden | Profitshare briefs (open item G8) |
| others | unknown | ask with the programme application (A6, C4) |

## Application checklist (D4, founders)

1. [ ] `css:readiness` says ELIGIBLE (≥ 50 merchant domains) and row 10 holds for most queries.
2. [ ] SRL registered (B4); its name and address on the contact and legal pages (M17, B5).
3. [ ] Create a **new** Merchant Center account for the CSS (not a merchant account): display
   name of 10–15 characters ("Pretoscop"), address, support contacts.
4. [ ] Verify and claim `pretoscop.ro` (Search Console if the domain already ran Shopping ads).
5. [ ] Submit Google's CSS sign-up form to turn it into a CSS multi-client account. **Upload no
   offers to this account.**
6. [ ] In CSS Center, open the "CSS Requirements report" for Romania; upload the list of extra
   merchants (domains) if some are missing. Export the domain list with `css:readiness --json`.
7. [ ] Record the outcome and date in the decisions log of `docs/progress.md`; Google reviews CSS
   sites periodically and can suspend them, so re-run `css:readiness` monthly.
8. [ ] Only then: per-merchant sub-accounts and Shopping campaigns, for merchants whose
   `css_policy` allows it in writing.
