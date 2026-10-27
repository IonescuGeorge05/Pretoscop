# Matching v1 (M07)

How an offer becomes part of a canonical product (the sellable variant a GTIN identifies, ADR-012).
Code: `src/matching.ts` (pure scoring and routing), `src/taxonomy.ts` (categorizer),
`packages/db/src/queries/matching.ts` (candidates, writes, products, families, aliases, merges),
`apps/worker/src/jobs/matching.ts` (job `match.pending`).

## Pipeline

1. **Sticky alias first.** A human decision (`offer_aliases`, from the review queue, a split, an
   unlink) wins over every rule. Merged targets resolve to the surviving product.
2. **Hard exclusions.** Refurbished/used, bundles and accessories never join a new-product series
   (`unmatched` with the reason).
3. **Candidates** (top 5 kept in `match_candidates`): same GTIN-14 (`product_gtins`); same brand +
   normalized MPN, including regional suffix variants (`SMS741BZVD` ↔ `SMS741BZVDEUE`); trigram
   title search over `products.title_ascii` within the brand.
4. **Score** each candidate (`scorePair`), then **route** (`route`).
5. **Write** an append-only `match_decisions` row and the offer's link and status. An offer is
   re-matched only when its identity hash (title, GTIN-14, MPN, brand) changes.

## Hard conflicts (any one → score 0, never accepted)

| Conflict | Example |
|---|---|
| brand differs | Samsung vs Xiaomi |
| category differs | phone vs tablet |
| storage, RAM, washing capacity differ | 128 GB vs 256 GB |
| screen size differs by > 0.6″, volume by > 3 % | 55″ vs 65″ |
| colour differs (both known) | black vs blue |
| network generation differs | Galaxy A17 5G vs A17 4G |
| edition words differ | Pro vs Pro Max, S26 vs S26+ (plus), FE, Slim, Digital |
| model numbers differ (both titles carry them) | S25 vs S26, 14IPH11 Slim 5 vs Yoga 7 |
| different MPNs of the same brand (≥ 6 chars) | SMS741BZVDEUE vs SMS741BZKDEUE |

## Scores

| Evidence | Score |
|---|---|
| same GTIN-14, editions agree | 1.00 |
| same brand + MPN (at least one MPN from a product field) | 0.98 |
| same brand + MPN, both guessed from titles, titles agree | 0.97 |
| brand + regional MPN variant | 0.90 + 0.08 × title similarity (≤ 0.99) |
| title only | 0.55 × token Jaccard + 0.30 × model-token overlap + 0.15 brand bonus, capped at **0.96** |

## Decision table

| Situation | Decision | Offer status |
|---|---|---|
| sticky alias | accept (or no product) | `manual` / `rejected` |
| refurbished, used, bundle, accessory | unmatched | `unmatched` |
| best candidate ≥ 0.97, no conflict, one strong candidate | **accept** | `auto` |
| two strong title candidates | needs_review (duplicate products) | `pending` |
| best candidate in (0.30, 0.97) | **needs_review** | `pending` (review queue) |
| no acceptable candidate, brand + (GTIN or MPN) | **new_product** | `auto` |
| no candidate, trusted source (tier 1), brand + category + model token | new_product (provisional) | `auto` |
| otherwise | unmatched | `unmatched` |

Title-only evidence never auto-accepts in v1 (the cap is 0.96): those pairs wait in the review
queue until M22 adds LLM verification. Products created from one offer are **provisional**
(`noindex`) until they have ≥ 2 offers, Icecat specs or a human check.

## Families

Phones, tablets, laptops, smartwatches and consoles get a `product_families` row keyed by brand +
model tokens without storage, RAM and colour ("Samsung Galaxy S26 FE"); variants of one family
are different products shown in the variant selector.

## Evaluation

Labelled pairs live in `src/matching-eval/*.json`; the harness is `src/matching-eval.ts`.

```bash
pnpm --filter @pretoscop/worker match:eval:build   # auto.json from the database
pnpm --filter @pretoscop/worker match:label        # founders label pairs (human-<date>.json)
pnpm --filter @pretoscop/worker match:eval [--show] # precision / recall / review rate; exits 1 on failure
```

Label sources: `human`; `gtin` and `mpn` (two shops agree on a valid GTIN or a brand + field MPN);
`family` (hard negatives: variants of one model with different field MPNs, plus same-brand other
models); `synthetic` (real titles rewritten the way other shops write them — recall only, not proof
of precision). Each run reports both "as the matcher sees them" and "identifiers masked" (the
title scorer alone).

Acceptance (plan M07): precision on automatic accepts ≥ 98 % over real labels; zero accepts
across variants of one model; GTIN/MPN accepts ≥ 99 % on human labels (checked from 20 such
labels). Re-measure weekly on 200 random automatic matches (admin "Verificare aleatorie").

First run, 27 Oct 2026 (eMAG only, before any second shop was recorded): 375 pairs, 53 accepts,
precision 100 %, zero false accepts; family negatives all rejected; title-only recall 0 % by
design (every clear title match goes to review). The set found two rules that were missing (S26 vs
S26+, 4G vs 5G) — both are now hard conflicts with regression tests.
