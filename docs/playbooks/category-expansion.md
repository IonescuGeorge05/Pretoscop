# Playbook: adding a category (category expansion, M29)

How Pretoscop adds a product category beyond the launch taxonomy (electronics, IT, appliances), so
that the next one takes days, not a module. It is written as a procedure, then executed twice:
**books** (built, sources registered but off) and **beauty** (prepared, no live source: every
beauty shop blocks unknown bots). Architecture: ADR-028 in `docs/03-architecture.md` §14 (the lead
may renumber it at merge). Rules that never change: `CLAUDE.md` (identified crawler, kill switches,
licensed images only, never fabricated history) and `docs/12-blocked-shops-strategy.md`.

Status on 2026-11-09: the plan's acceptance (≥ 5,000 products with ≥ 2 offers in each new category)
is **not met**: 0 books and 0 beauty products are shown (`css:readiness` prints the live numbers).
What unlocks it is listed per category below; nothing in this module fakes it.

## The procedure

### 1. Decide the identity of a product in the category

Write down what one canonical product is (ADR-012: the sellable variant one GTIN identifies) and
which differences make two products. This drives every later step.

- Books: one **edition**, identified by its ISBN (GTIN-13 978/979). Hardcover and paperback,
  ebook and audiobook, two publishers, two editions, a box set and a single volume are different
  products. Genres are not identity (shops file the same book differently).
- Beauty: one **sellable size** of one product: Sauvage EDT 100 ml ≠ 60 ml ≠ EDP 100 ml ≠ tester
  ≠ gift set ≠ refill; two lipstick shades are two products; flankers of a line ("Sauvage" vs
  "Sauvage Elixir") are different products.

### 2. Taxonomy subtree (`packages/core/src/taxonomy.ts`)

- Add the subtree **after** the launch nodes (sort orders of existing categories stay as they are),
  with Romanian names in comma-below ș/ț, and mark every node with its `vertical`.
- Decide how offers find their node: a title noun (launch categories, beauty product types) or
  the shop's breadcrumb (books: titles never say "carte"). Mark audience/format nodes that must win
  over a genre (`audience`: "Cărți pentru copii > Literatură fantasy" is a children's book).
- Decide compatibility for matching: `looseChildren` on the root when subcategories are opinions
  (book genres), strict otherwise (a fragrance is never a shampoo). A vertical's root means
  "subcategory unknown" and is compatible with its children.
- Recognise the vertical **before** the launch rules (`packages/core/src/verticals.ts`) from evidence
  that never appears on a launch offer (ISBN, breadcrumb words, unambiguous nouns, a dictionary
  brand at the title start). Then run the check that proves it: no recorded launch offer may get
  the new vertical (`data/` scratch script over every offer of the dev database; M29: 0 of 40,935).
- The M22 category prompt v1 lists the launch taxonomy only (its fingerprint is pinned); a v2 of
  that prompt is needed before the LLM suggests nodes of the new subtrees.

### 3. Brand dictionary

The matcher compares brands, so the category needs its own dictionary with aliases, kept apart
from the launch dictionary so that names that are other makers elsewhere (Jaguar, Ferrari, Police)
never change an electronics brand. Test that no alias points to two brands.

- Books: the brand is the **publisher** (`packages/core/src/publishers-data.ts`): aliases and the
  publishing group (Arthur, Youngart and Paladin are imprints of Grupul Editorial Art); places and
  placeholders in the publisher field ("BUCUREȘTI") are no publisher. Different known groups
  conflict when no ISBN decides; an equal ISBN wins over any publisher spelling.
- Beauty: `packages/core/src/beauty-brands-data.ts` (100 fragrance and cosmetics brands, Romanian
  makers included) with distinctive product lines only (Sauvage → Dior), never generic line names.

### 4. Attribute extractors

Extract exactly the facts from step 1, from structured fields first (`RawOffer.specs`, JSON-LD
`Book`, spec tables, feed columns) and from the title second; stated facts conflict only when both
sides state them.

- Books (`books.ts`): authors (field, or Libris's "Titlu - Autor"), format (hardcover, paperback,
  ebook, audiobook), volume ("Vol. 3", "Cartea a doua", "Partea a III-a", "#4"), edition number
  ("Ediția a III-a", "2nd edition"), illustrated, language, box set, pages, year ("2.019").
- Beauty (`beauty.ts`): volume (ml), weight (g), concentration (extrait, parfum, EDP, EDT, EDC,
  body mist, after shave; a leading "Parfum" is the product noun), shade code, gender, gift set,
  refill, tester.

### 5. Identifiers

Check the category's identifier edge cases with tests, not assumptions. Books: ISBN-10 → ISBN-13,
an ISBN-10 that also passes the GS1 check (read as ISBN for ISBN fields), 979 ranges (979-10,
979-8, 979-0 ISMN), ISSN 977 is press, hyphenated ISBNs inside titles (extracted, removed from the
display title), publisher-coded MPN fields ("ART978-…", dropped: books have no MPN).

### 6. Sourcing, in this order

1. **Feeds** (affiliate networks, merchant feeds): identifiers and prices for the whole range,
   no crawling. Needs the network account and the programme's approval (C4, A6) and, for price
   history, the written clearance of 2Performant ToS §9.
2. **Merchant portal** (M20): the shop uploads or links its feed.
3. **Polite listings** of shops that serve PretoscopBot (`docs/12`): many offers per request; then
   product pages only for what listings lack (books: the ISBN).
   - Read robots.txt and the registry first; a `blocked` shop is never probed.
   - Record at most 3 pages per shop with `scripts/record-fixture.sh` and record the probe in the
     YAML. Scan every recorded page for third-party keys before committing (the repo is public;
     GitHub push protection rejects them): redact with a same-length placeholder and say so in the
     `.meta.json`. Never edit a fixture otherwise. On Windows, never run `sed -i` on a fixture: it
     rewrites CRLF line endings (happened once in M29, documented in the two meta files).
   - Write the parser JSON-LD first (`jsonld-product`); a shop parser only where structured data
     is missing or wrong, with the same external id as the product page.
   - Register sources with `enabled: false`, page caps under `max_pages_per_day`, schedules
     staggered away from 01:00–03:30 Bucharest (eMAG, then the M10 shops); the lead enables them
     after watching one run.
4. The assisted channel never (only founder-designated shops, ADR-015).

### 7. Matching rules and the evaluation gate

- Add the category's rules to `scorePair` (vertical-specific scorer; a pair across verticals is a
  hard conflict) and test them against real titles.
- Title-only evidence never auto-accepts (cap 0.96, MATCHING.md); only identifiers do.
- Build the category's eval set (`pnpm --filter @pretoscop/worker match:eval:categories --build`):
  real positives and hard negatives from the recorded fixtures, synthetic pairs labelled as such.
  Gate (also in the core tests): precision ≥ 98 % at the accept threshold with and without
  identifiers, no accepted hard negative. Replace synthetic labels with founders' labels once two
  shops of the category record.

### 8. Category landing pages, SEO and indexing

No new page type: M14's `/c/<root>/<child>` pages render the subtree from the `categories` table
(synced from the taxonomy by the worker at start). M16 rules apply unchanged: a product is
indexable when not provisional and with ≥ 2 live offers (or 14 days of history); a category page
publishes an `ItemList` of indexable products only and is `noindex` while it has none; the
sitemap lists a category only with an indexable product. Products the matcher creates from one
tier-2 offer are provisional until a second live offer (M07). E2E: `apps/web/e2e/categories.spec.ts`.

### 9. Launch checklist for a category

- [ ] Identity written down; taxonomy subtree, dictionary and extractors tested.
- [ ] Vertical detection proven harmless on the whole recorded catalogue.
- [ ] Sources registered off; fixtures recorded within the budget, scanned for keys.
- [ ] Eval gate green; founders labelled ≥ 50 real pairs of the category.
- [ ] Lead watched one run per source, then enabled them; three days of healthy runs (M10).
- [ ] Feeds requested (network accounts, programme approvals, ToS §9 clearance).
- [ ] `css:readiness` shows ≥ 5,000 products with ≥ 2 offers in the category before it is
  promoted (home page, menus, outreach).
- [ ] The search page's coverage sentence (`/cauta`, no results: "electronice, IT și
  electrocasnice") names the category once it has products.

## Executed: books (2026-11-09)

| Step | Done |
|---|---|
| Identity | One edition = one ISBN; different ISBNs never match (`compareBooks`) |
| Taxonomy | `carti` with 15 genres (`looseChildren`); audience nodes: children's, young adult, comics/manga, textbooks/dictionaries, foreign-language books |
| Vertical | ISBN 978/979, or a books breadcrumb ("Cărți", "Carte", "Librărie online", "Beletristică", "Romane …"); 0 of 40,935 launch offers affected |
| Publishers | 67 Romanian and international publishers with imprints and groups |
| Attributes | authors, format, volume, edition, illustrated, language, box set, pages, year |
| Fixtures | Libris: category sitemap (5,272 categories), `/carti/carti-pentru-copii/literatura-fantasy` (40 of 290 books), one product page (JSON-LD Product+Book). Elefant: `/list/carti/carte/carti-pentru-copii` (59 links), one product page |
| Parsers | `libris-listing`; Libris product pages through `jsonld-product` (now with `Book` facts); `elefant-listing` (discovery only); `elefant-product` |
| Sources (off) | Libris: 8 listings + `libris:product:isbn` (300 product pages a day; worst case 413 requests). Elefant: 5 discovery listings + `elefant:product:carti` (300 a day; worst case 326) |
| Eval | 116 pairs: 2 accepts (both ISBN), precision 100 %, 74 of 76 series/author negatives rejected by hard conflicts, 2 left to review (a subtitle-only difference; two editions of "Odiseea"), no accept with identifiers masked |
| Pages | `/c/carti`, `/c/carti/<gen>`: render; e2e covers the indexable and the provisional case |

What the shops allow and what it means:

- **Libris** serves the identified bot. Listings carry prices for 40 books per request, but no
  ISBN; the product page adds it. One product-page visit per book is enough (the offer keeps its
  ISBN, `gtin14` is never overwritten by a listing), so the ISBN pass costs one request per book
  once, and listings refresh prices afterwards. Libris's 2Performant programme allows comparators
  (and Google CSS only with approval): its feed (A6) would bring every ISBN at once.
- **Elefant** serves the identified bot, but listing tiles load from
  `/INTERSHOP/web/WFS/…/ViewProductTileAsync`, which robots.txt disallows: listings are discovery
  only and prices come from product pages, one book per request. With 1,000 requests a day, at
  most ≈ 3,000 books stay within Elefant's 72-hour freshness SLO. A feed or the shop's permission
  for the tile endpoint would lift that; Elefant's affiliate status is unknown (Profitshare
  inactive, "No Feed"; 2Performant to verify) and its terms ban Google CSS promotion.
- **Cărturești** answers robots.txt with a Cloudflare challenge: not in the registry; it joins
  only through its 2Performant feed (A6).
- So books reach ≥ 5,000 products with ≥ 2 offers only with a feed: Libris's feed plus
  Elefant's crawl (≤ 3,000 fresh books) is still short; Libris + Cărturești feeds, or any feed
  plus Libris's crawl, would pass it.
- Known risk to watch after enabling Libris: listing runs observe offers without an ISBN while the
  stored offer has one, so the identity hash flips and the offer is re-matched after every run
  (same decision, an extra `match_decisions` row). Proposed fix for the recorder (M05/M07 code,
  not changed here): compute the identity from the stored GTIN when the observation has none.
- Founder check once both shops have run: search "harry potter piatra filozofala" and open a
  result with offers from both shops.

## Prepared: beauty (2026-11-09)

| Step | Done |
|---|---|
| Identity | One sellable size; size, concentration, shade, tester, gift set, refill and flanker conflicts (`compareBeauty`) |
| Taxonomy | `frumusete`: parfumuri, machiaj, îngrijirea tenului, părului, corpului (strict); fragrance nouns tried last ("Gel de duș Dior Sauvage" is body care) |
| Vertical | beauty breadcrumbs (never the bare "Îngrijire personală" of electronics shops), fragrance/cosmetics nouns, or a dictionary brand at the title start with a volume or beauty word; 0 launch offers affected |
| Brands | 100 fragrance and cosmetics brands, distinctive lines, start-only names for ambiguous ones (MAC, Essence, Jaguar) |
| Eval | 95 synthetic pairs (7 base products × 3 shop title styles): 52 of 52 same-GTIN positives accepted, 43 of 43 hard negatives rejected, none accepted with identifiers masked. Synthetic: proves the rules, not precision on real data |
| Pages | `/c/frumusete/...` render the empty state, noindex |
| Sources | none: Notino (Cloudflare), Douglas and Sephora (Akamai) are `blocked`; they join through feeds only |

Feed mappers on `daniel`: `feed-2performant-csv/-xml`, `feed-google-shopping` (also what Awin
exports as a Google Shopping feed), `feed-compari-xml`, `feed-csv-generic`. There is no Awin, CJ or
Tradedoubler mapper: M21 deferred them until real sample feeds exist (C4). Write them then, with a
recorded sample feed, in M21's place, not as M29 work. Beauty shops: Douglas via Awin, Notino via
CJ (the registry notes), Sephora has no programme (allowlisting only).

Founder check once a beauty feed records: search "parfum dior sauvage 100ml" and see the offers of
the shops that sell the 100 ml EDT on one product, and the EDP and 60 ml as other products.
