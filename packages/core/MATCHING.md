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

"Guessed" MPNs (`mpn_source = 'title'`) are title codes and eMAG URL slug tails: the slug tail is
stated nowhere and is as often a marketplace seller's SKU as a manufacturer code, so it never
counts as a product field (M06, `RawOffer.mpnHint`). Offers recorded before that rule are fixed by
`pnpm --filter @pretoscop/worker renormalize`.

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

## LLM verification of the gray zone (M22)

Code: `src/llm-policy.ts` (pure policy), `packages/llm` (client, prompts, ledger), `apps/worker/src/llm/matching.ts`
(job `llm.match`, every 15 minutes). Off until `ANTHROPIC_API_KEY` exists (A9) and the flag
`llm.matching.enabled` is on.

1. **Work list.** Review-queue items whose latest decision is the rules' `needs_review` (not "two
   strong candidates"), that no human has ever decided or sent back, with their candidates.
2. **Questions.** For each viable candidate (no hard conflict, score above 0.30, recomputed on
   current data) the pair prompt asks Claude Haiku 5.5 "is the offer exactly this product?"
   (`{same_product, confidence, conflicting_attributes, reason}`). Unsure, contradictory or unusable
   answers go to Claude Sonnet 5.5; pairs priced at or above 3,000 lei go to Sonnet directly. When
   the offer lacks a size attribute its candidate has (storage, screen, kg, litres), its title also
   goes to attribute extraction. Questions go out as one Message Batch; answers are stored by request
   hash and never asked twice.
3. **Policy** (`decideGrayZone`, thresholds `LLM_ACCEPT_CONFIDENCE` / `LLM_REJECT_CONFIDENCE`, 0.9):

| Answers for the viable candidates | Decision | Offer |
|---|---|---|
| exactly one "same" ≥ 0.9 without conflicting attributes (LLM-named or from extracted attributes), no other look-alike (same ≥ 0.5) | **accept**, `decided_by = llm:<model>` | `auto`, linked |
| every candidate "different" ≥ 0.9 (and `LLM_AUTO_REJECT`) | **reject** `llm:<model>`, then M07's no-candidate rule | new product (brand + GTIN/MPN, or trusted shop) or `unmatched` |
| anything else (unsure, two look-alikes, unusable answer) | none | stays in the review queue, the LLM's opinion shown per candidate |
| an answer still missing | wait | unchanged |

   M07's hard conflicts are never overridden (such a candidate is not viable). Every LLM decision is
   listed on `/admin/potriviri` ("Decizii LLM") with **Înapoi la verificare**: the offer returns to
   the human queue and the LLM never decides it again. LLM accepts are also in the weekly random
   sample of automatic matches.

### Evaluation with the LLM

```bash
pnpm --filter @pretoscop/worker match:eval:llm                 # gray-zone pairs → Haiku 5.5 (one batch), report + answers under data/reports/
pnpm --filter @pretoscop/worker match:eval:llm --mask          # GTIN/MPN hidden: real labels (MPN pairs, family negatives) reach the gray zone
pnpm --filter @pretoscop/worker match:eval:llm --model escalation   # the same with Sonnet 5.5
pnpm --filter @pretoscop/worker match:eval:llm --mock          # pipeline check against the local stand-in: NOT a measurement
```

Each run prints precision, recall, review rate and the share of the gray zone the LLM decides at
thresholds 0.80–0.98, for all labels and for real labels only, and the cost per 1,000 pairs from
the ledger and from the price table. It passes when precision on real labels at the chosen
threshold is ≥ 98 % with no accept across variants of one model; it is **inconclusive** while fewer
than 50 real-labelled pairs reach the LLM (label pairs with `match:label`). The eval set has 525 pairs
(28 Oct 2026, rebuilt from the multi-shop data: 150 MPN positives, 225 family/other negatives, 150
synthetic); with identifiers masked 98 real-labelled pairs (76 positives, 22 hard negatives) are in
the gray zone. **No real run exists yet** (no API key): the precision of the LLM is unmeasured.
Masked family negatives are stricter than production, where look-alike variants appear as several
candidates and stay with a human.
