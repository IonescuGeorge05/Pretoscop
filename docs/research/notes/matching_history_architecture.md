# Technical State of the Art for "Pretoscop" (Romanian Price Comparison + Price History): Matching, Catalog, History Storage, Search, Crawling, Stack, Hosting, Extension (as of 2026-10-27)

_Research notes compiled 2026-10-27. Prices are list prices read from vendor pages on that date unless stated otherwise (Hetzner in EUR excl. VAT; most SaaS in USD excl. tax). The shared web-search budget ran out partway through the research. After that, facts were gathered only by fetching known primary URLs, and anything not verified is listed under Gaps. Everything under "Inferences" is my design or arithmetic derived from the cited facts, not something a source states. Legal topics (Omnibus, GDPR, database rights, ToS) are covered in more depth in the sibling file `legal_and_regulatory.md` and are only touched on here where they shape a technical decision._

## 1. Product matching: how to resolve offers from many Romanian shops into canonical products (GTIN, MPN/brand, title/attributes, ML/LLM, workflow, industry practice, failure modes)

### Takeaway
Build a precision-first cascade with these steps in order. (1) Validated GTIN. (2) Brand plus normalized MPN. (3) Attribute-aware title and embedding blocking. (4) Feature scoring with hard attribute constraints. (5) Claude Haiku 5.5 verification of the gray zone via the Batch API, with Sonnet 5.5 for escalations. (6) A human review queue for whatever is still unsure. Never auto-merge on GTIN alone. Google's own feed rules tell merchants to put the main product's GTIN on merchant-created bundles and the single item's GTIN on multipacks, and restricted or coupon ranges, placeholders and check-digit errors are common. On the hardest public benchmark (WDC Products), zero-shot frontier LLMs reach about 88–90% F1, against about 85% for fine-tuned Ditto. At October 2026 prices, LLM verification costs about $0.02–0.13 per 1,000 pairs on Haiku 5.5 with the Batch API, and about $0.4–2.7 on Sonnet 5.5 with the Batch API. Cost is therefore not the constraint; precision guards are.

### Cited Findings

#### GTIN formats, validation, restricted and coupon ranges
- Google Merchant Center (GMC) accepts GTINs of 8, 12, 13 or 14 digits. "Spaces and dashes are accepted, but ignored", and up to 10 GTIN values are allowed per product. Merchants should convert 8-digit UPC-E codes to 12-digit codes and ISBN-10 to ISBN-13. The check digit must be present and correct (GS1 calculator) — [Google Merchant Center Help: GTIN](https://support.google.com/merchants/answer/6324461)
- GMC rejects GTINs in restricted ranges (prefixes **02, 04, or 2**) and in coupon ranges (prefixes **05, 98, 99**) — [GMC: GTIN](https://support.google.com/merchants/answer/6324461)
- GS1 assigns prefixes **02 and 20–29** to Restricted Circulation Numbers (RCNs) within a geographic region, and **04** to RCNs within a single company. RCNs may only appear in EAN-8, EAN-13, UPC-A or UPC-E symbols. Variable-measure numbers (VMN-13) are RCNs used for variable-measure items at point of sale — [GS1 GSCN 23-243 clarifications (via search summary)](https://www.gs1.org/docs/barcodes/GSCN-23-243-clarifications.pdf); [biip RCN reference](https://biip.readthedocs.io/stable/reference/rcn/). The biip library notes that "some companies use the variable measure check digit for other purposes", so it lets that check be disabled.
- GS1 prefix meanings per Wikipedia's list:
  - 020–029 and 200–299: regional RCNs; 040–049: company-internal RCNs.
  - 050–059: "GS1 US reserved for future use".
  - 030–039: US drugs (NDC).
  - 950: GS1 Global Office; 951: EPC General Identifier; **952: demonstrations and examples**.
  - 977: ISSN (serials); 978–979: ISBN (979-0 is ISMN).
  - **980: refund receipts**; **981–983: coupons for common currency areas**; **990–999: coupons**.
  - **594: Romania**; 960–969: GTIN-8 allocations.
  - Source: [Wikipedia: List of GS1 country codes](https://en.wikipedia.org/wiki/List_of_GS1_country_codes). _Conflicts:_ GMC treats 05 as a coupon prefix, while the Wikipedia list says GS1 US reserved it. The Wikipedia list gives the coupon range as 981–983, not 981–984.
- The labels of the WDC Products benchmark come from clustering web offers by their schema.org GTIN/MPN identifiers. A manual check of 600 test pairs estimated label noise at **4.00% and 4.17%** (two annotators, Cohen's kappa 0.91). So identifier-based clustering is not perfectly clean even after filtering — [WDC Products](https://webdatacommons.org/largescaleproductcorpus/wdc-products/)
- Heureka's seller-side "unpaired products" helper proposes pairings "based on EAN codes, which are not entirely precise in all the categories" — [Heureka Group: unpaired products report](https://heureka.group/sk-en/data-reviews/unpaired-products-report)

#### Bundles, multipacks, variants and condition, as defined by the dominant feed spec
- GMC bundle and multipack rules:
  - Manufacturer-created bundle or multipack: submit the bundle's own GTIN/MPN/brand, "and not the individual products".
  - **Merchant-created bundle: submit the GTIN of the main product.**
  - **Merchant-created multipack: submit the GTIN of the individual product.**
  - Each variant (colour or size) has its own GTIN, and the same GTIN must not be submitted for multiple products with the same variant values.
  - "When in doubt don't provide a GTIN (… don't guess or make up a value)".
  - Custom or store-brand items should carry no GTIN.
  - Used items should carry the manufacturer GTIN plus condition = used.
  - Source: [GMC: GTIN](https://support.google.com/merchants/answer/6324461)
- GMC product data specification:
  - `is_bundle`: "a merchant-defined custom group of different products featuring one main product".
  - `multipack`: "the number of identical products sold within a merchant-defined multipack".
  - `condition`: `new` ("Brand new, original, unopened packaging"), `refurbished` ("Professionally restored to working order") or `used`.
  - `identifier_exists`: yes/no.
  - `item_group_id`: ID for a group of variants.
  - `mpn`: up to 70 characters, required only when there is no manufacturer GTIN.
  - `availability`: in_stock / out_of_stock / preorder / backorder.
  - Source: [GMC product data specification](https://support.google.com/merchants/answer/7052112)

#### Benchmarks: classical, PLM-based and LLM-based matchers
- **WDC Products** (2020 schema.org offers): 11,715 offers describing 2,162 products from 3,259 shops. It comes in 27 variants: corner-case share 80/50/20%, unseen-entity share 0/50/100%, and small/medium/large development sets. Pairwise test sets have 4,500 pairs. Source: [WDC Products](https://webdatacommons.org/largescaleproductcorpus/wdc-products/)
  - Baseline F1 at 80% corner cases on seen products (small/medium/large dev set): Word co-occurrence 43.73/52.66/56.67; Magellan 31.15/30.55/31.96; RoBERTa 65.45/72.18/78.15; **Ditto 60.71/73.93/79.12**; HierGAT 59.65/71.40/75.42; R-SupCon 77.48/79.99/82.15.
  - "All methods significantly drop" on unseen products; for example, R-SupCon falls to 51.91 (small dev set).
- **Peeters, Steiner & Bizer, "Entity Matching using Large Language Models"** (EDBT 2025; arXiv v4 18 Oct 2024). Sources: [arXiv HTML v4](https://arxiv.org/html/2310.11244v4); [abstract](https://arxiv.org/abs/2310.11244)
  - Zero-shot F1, best prompt per model, on WDC Products: GPT-4 (0613) **89.61**; GPT-4o **87.64**; GPT-4o-mini 81.15; Llama 3.1 83.67; Mixtral 53.37.
  - Fine-tuned baselines on the same setup: RoBERTa 77.53, **Ditto 84.90**.
  - Abt-Buy: GPT-4 95.78 vs Ditto 91.31. Amazon-Google: GPT-4 76.38 vs Ditto 80.07.
  - The WDC numbers here are not directly comparable with the WDC baseline table above because the two use different benchmark variants and training setups.
- Same paper, further findings:
  - Fine-tuned GPT-4o-mini reaches 88.89 on WDC, but transfer across domains suffers. For example, the model fine-tuned on DBLP-ACM scores 31.54 on WDC.
  - The best LLMs "require no or only a few training examples to perform comparably to PLMs that were fine-tuned using thousands of examples", and are more robust on unseen entities. "There is no single best prompt."
  - Prompt style: a domain-specific prompt ("Do the two product descriptions match?") with forced Yes/No answers. Free-form answers made runs much slower.
  - Cost (Aug 2024 prices): zero-shot prompts were about 76–93 tokens; 10-shot prompts were about 942–1,009 tokens. Cost per zero-shot prompt was 0.006¢ (GPT-4o-mini), 0.024¢ (GPT-4o) and 0.474¢ (GPT-4). In-context and rule-based prompts cost "1.5 to 470 times" as much as zero-shot GPT-4o-mini.
- **Steiner, Peeters & Bizer, "Fine-tuning LLMs for Entity Matching"** (ICDEW/DAIS 2025): fine-tuning clearly helps small models, while results for large models are mixed. It improves in-domain performance but tends to hurt cross-domain transfer. Structured explanations in the training data helped 3 of 4 LLMs — [arXiv 2409.08185v2](https://arxiv.org/html/2409.08185v2)
- **Blocking groups as LLM batches**: CE-RAG4EM reuses blocking groups as batches, so one prompt covers several candidate pairs. Shared input overhead falls by about the average batch size — [arXiv 2602.05708](https://arxiv.org/pdf/2602.05708)
- **Cost-aware routing between cheap and expensive LLMs** for multi-candidate matching: CaRL-EM — [ACL 2026 long paper](https://aclanthology.org/2026.acl-long.1258.pdf)
- Single-author practitioner anecdote, unreplicated, on Abt-Buy: embedding blocking alone gave 35.5% precision and 59.4% recall. Adding a GPT-4o-mini judge raised precision to 95.4% but cut recall to 50.9%, for about $0.04 in total — [Towards AI](https://pub.towardsai.net/using-gpt-4o-mini-as-an-entity-resolution-judge-95-precision-for-0-04-b216d44a7f20)
- The ACM SIGMOD 2022 programming contest on product blocking was won by Mannheim's WBSG. Their solution embedded product names with a small transformer trained with contrastive learning — [Uni Mannheim news](https://www.uni-mannheim.de/dws/news/wbsg-wins-sigmod-programming-contest-2022/)
- Older, pre-transformer literature reported product-matching F-measures of only about 30–70% — [Köpcke et al., EDBT 2012 (Leipzig)](https://old.dbs.uni-leipzig.de/file/edbt2012_final.pdf) (via search summary).

#### Embeddings and vector search
- Qwen3-Embedding (June 2025) was evaluated on MMTEB (over 500 tasks, over 250 languages). In the MTEB-multilingual table (leaderboard snapshot of 24 May 2025): Qwen3-Embedding-8B 70.58, multilingual-e5-large-instruct 63.22, BGE-M3 59.56 — [Qwen3 Embedding paper](https://arxiv.org/pdf/2506.05176). Secondary sources disagree on Qwen3-Embedding's licence; check the Hugging Face model card.
- **pgvector 0.8.7**:
  - Index types: HNSW (better speed/recall trade-off, slower to build) and IVFFlat.
  - Indexable dimensions: `vector` up to 2,000; `halfvec` up to 4,000; `bit` up to 64,000.
  - Iterative index scans (since 0.8.0) keep scanning until enough rows pass the filter, which fixes filtered ANN queries returning too few rows.
  - Source: [pgvector README](https://github.com/pgvector/pgvector)

#### Claude API pricing and model behaviour relevant to pair verification (read 2026-10-27)
- Per MTok (base input / 5-minute cache write / 1-hour cache write / cache hit / output). Source: [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing)
  - **Claude Haiku 5.5**, prompts up to 100k tokens: **$0.10 / $0.125 / $0.20 / $0.01 / $0.50**. Prompts over 100k tokens: $0.50 / $0.625 / $1 / $0.05 / $2.50.
  - **Claude Sonnet 5.5**: **$2 / $2.50 / $4 / $0.10 / $10**.
  - **Claude Opus 5.5**: **$4 / $5 / $8 / $0.20 / $20**.
  - Haiku 4.5, for reference: $1 / $1.25 / $2 / $0.10 / $5.
- **Batch API: 50% discount on input and output.** Batch prices: Opus 5.5 $2 / $10; Sonnet 5.5 $1 / $5; Haiku 5.5 $0.05 / $0.25 (prompts up to 100k tokens). Caching multipliers "stack with other pricing modifiers, including the Batch API discount". Cache hits cost 0.1× base input in general, but 0.05× on Opus 5.5 and Sonnet 5.5. US-only `inference_geo` adds a 1.1× multiplier — [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing); [Batch processing docs](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
  - _Conflict:_ the Claude API reference bundled with Claude Code (cached 2026-10-06) lists Sonnet 5.5 cache reads at $0.20/MTok. The live pricing page shows **$0.10**; use the live figure.
- Model behaviour, per the Claude API reference bundled with Claude Code (cached 2026-10-06; verify at [models overview](https://platform.claude.com/docs/en/about-claude/models/overview)):
  - Haiku 5.5 runs adaptive thinking by default; `thinking: {type: "disabled"}` is accepted only at effort `high` or below, and the default effort is `medium`.
  - Haiku 5.5's newer tokenizer counts the same text as about 30% more tokens than Haiku 4.5.
  - Haiku 5.5 refusals have no server-side fallback.
  - On Sonnet 5.5, thinking is turned off with `{type: "between_tools"}`; `disabled` returns a 400.
  - On Opus 5.5, thinking cannot be disabled; effort is the only control.
  - The minimum cacheable prefix on the 5.5 models is 512 tokens.
  - Batch results arrive in any order and must be keyed by `custom_id`.

#### How large comparison and e-commerce players describe matching
- **idealo** (PyCon DE 2022, "Transformer based clustering: identifying product clusters for e-commerce"): Sentence-Transformers embeddings, Faiss k-nearest-neighbour search, and siamese/triplet architectures with an additive angular margin loss, benchmarked against probabilistic record linkage and TF-IDF baselines — [PyCon DE 2022 archive](https://pycon.de/archive/2022/talks/transformer-based-clustering-identifying-product-clusters-for-e-commerce/). An older secondary description (a wiki mirror) says offers were matched "using a fuzzy logic automated matching system", with large human teams doing quality control — [wiki mirror](https://ipfs.aleph.im/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco/wiki/Idealo.html)
- **Heureka Group**: a "One Matching" team "connects offers from thousands of shops to the right products in our catalogue" across its marketplaces, using classic ML and LLMs — [Heureka ML engineer job posting](https://join.heureka.group/cs/jobs/machine-learning-engineer)
- **Skroutz** published a matching/clustering dataset on OpenML with product titles, vendor IDs and cluster IDs; most titles are in English or Greeklish. No engineering write-up was found — [OpenML dataset 45715](https://api.openml.org/d/45715)
- **PriceRunner/Klarna**: Klarna's 2023 image-recognition shopping tool was trained on PriceRunner data. No matching write-up was found — [CNBC, 2023-10-11](https://www.cnbc.com/2023/10/11/klarna-launches-ai-image-recognition-tool-for-shopping.html)
- **Databricks** item-matching reference pattern: the highest- and lowest-probability predictions are largely accepted automatically, while experts review the middle band — [Databricks blog, 2021](https://www.databricks.com/blog/2021/05/24/machine-learning-based-item-matching-for-retailers-and-brands.html)
- **Shopify** catalog clustering: tighter thresholds raise precision but miss valid matches; looser thresholds raise recall but group unrelated items — [Shopify Engineering](https://shopify.engineering/catalog-clustering)

### Inferences

#### A. Resolver cascade (recommended)
1. **Normalize** every offer: title (NFC, then cedilla→comma-below, lowercase plus a diacritic-folded copy), brand (alias table), GTIN (algorithm B), MPN (algorithm C), and attributes (D), plus flags for condition, bundle, multipack and accessory.
2. **Deterministic links** (first match wins):
   1. A trusted GTIN-14 that is already linked to a product.
   2. Brand + `mpn_base` that is already linked.
   3. A hard-constraint check (D) on either link. If it fails, demote to candidate.
3. **Candidate generation** (E): an inverted index on brand + model tokens, plus pgvector HNSW kNN on a "title + key attributes" embedding filtered by category or brand, top k = 10.
4. **Feature scoring** (F), which outputs a calibrated probability.
5. **Routing**:
   - p ≥ 0.97 with no hard conflict: auto-match.
   - p ≤ 0.30: auto-reject.
   - Otherwise: LLM verification (G), with Haiku 5.5 first and escalation to Sonnet 5.5 on low confidence or disagreement with the rules.
   - Still unresolved: **human review queue**.
6. **No acceptable candidate**: create a *provisional* canonical product. It stays out of SEO indexing until it has 2 or more offers, or Icecat enrichment, or human verification.
7. Record every decision in `match_audit`. Human decisions lock the mapping until the offer's identity fields change.

#### B. GTIN normalization and trust (algorithm sketch, TypeScript-like)
```ts
type GtinStatus = 'ok'|'book'|'restricted'|'coupon'|'demo'|'bad_check'|'placeholder'|'malformed';

function normalizeGtin(raw: string): { gtin14?: string; status: GtinStatus } {
  let s = String(raw ?? '').trim();
  if (/\d[.,]\d+e\+?\d+/i.test(s)) return { status: 'malformed' };   // Excel scientific notation, e.g. "5.94E+12"
  s = s.replace(/[\s\-.]/g, '');                                       // GMC: spaces/dashes ignored
  if (!/^\d{8,14}$/.test(s)) return { status: 'malformed' };
  // Leading zeros lost in CSV/Excel: left-pad to 14 and let the check digit arbitrate.
  const g = s.padStart(14, '0');
  if (!checkDigitOk(g)) return { status: 'bad_check' };   // optionally try UPC-E -> UPC-A expansion for 8-digit inputs
  const body = g.slice(0, 13);
  if (/^(\d)\1+$/.test(body.slice(1)) || /0123456789|1234567890|9876543210/.test(body)) return { gtin14: g, status: 'placeholder' };
  const ind = g[0];                         // 0 = consumer unit; 1-8 = packaging level (case/inner pack); 9 = variable measure
  if (ind === '9') return { gtin14: g, status: 'restricted' };
  const g13 = g.slice(1);                   // GTIN-13 view (GTIN-12 => leading '0')
  if (g.startsWith('000000')) {             // GTIN-8: EAN-8 ranges differ (RCN-8 rules must be checked separately)
    return { gtin14: g, status: 'ok' };
  }
  if (/^(02|04|2)/.test(g13)) return { gtin14: g, status: 'restricted' };     // GMC + GS1 RCN ranges
  if (/^(05|98|99)/.test(g13)) return { gtin14: g, status: 'coupon' };        // GMC coupon ranges (980 = refund receipts)
  if (g13.startsWith('952')) return { gtin14: g, status: 'demo' };            // GS1 demo/example numbers
  if (/^97[789]/.test(g13)) return { gtin14: g, status: 'book' };             // ISSN/ISBN/ISMN: valid, category-specific
  return { gtin14: g, status: 'ok' };
}

// GS1 mod-10: weights 3,1,3,1... applied left-to-right over the first 13 digits of the GTIN-14 form
function checkDigitOk(g14: string): boolean {
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(g14[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(g14[13]);
}
```
- Store `gtin14` as `char(14)`. That is the one canonical key for GTIN-8/12/13/14, and the check-digit test settles any leading zeros a spreadsheet dropped.
- **GTIN trust levels**, kept in `product_gtin.status`: `verified` (a human confirmed it, or 2 or more independent shops agree and their attributes agree), `auto`, `suspect`, `blacklisted`.
- Mark a GTIN suspect or blacklisted per shop or globally when:
  - (a) the same GTIN appears on 3 or more offers in one shop whose model tokens or attributes conflict, meaning the shop reuses codes;
  - (b) the same GTIN maps to different brands across shops (a collision);
  - (c) a shop's check-digit failure rate or placeholder rate goes above a threshold, which lowers that shop's GTIN trust score;
  - (d) the GTIN is an RCN, coupon or demo code.
- A GS1 country prefix shows which GS1 member organisation issued the company prefix. It does not show where the product was made. A global brand's product carrying a 594 (Romania) prefix is therefore a hint that a local distributor or retailer assigned the code. This is an inference that should be verified on real feeds.
- **Bundle and multipack collisions are designed into the rules** (see GMC above). A GTIN match never overrides a bundle, multipack or condition flag: the offer attaches to the product with `offer_kind = bundle|multipack`, or to a separate bundle product.

#### C. MPN and brand normalization
- `mpn_norm = upper(regexp_replace(mpn, '[^A-Za-z0-9]', '', 'g'))`. Also derive `mpn_base` with brand-specific suffix rules stored in a `brand_mpn_rule(brand_id, regex, replacement, note)` table.
  - Illustrative patterns to verify per brand: Apple part numbers carry region suffixes such as `…ZD/A` / `…LL/A`. Samsung TV and phone model codes append region, colour or year codes after the core model.
  - Learn rules from data: when two MPNs share a long common prefix and their offers agree on GTIN or attributes, propose a rule for human approval.
- **Brand dictionary**:
  - `brand(id, name, slug, parent_brand_id)` plus `brand_alias(alias_norm → brand_id)`.
  - Seed it from Icecat's brand list (if licensed) and from shop feeds.
  - Normalize aliases by lowercasing, folding diacritics, stripping punctuation and legal suffixes (inc, ltd, gmbh, s.a., s.r.l., co, corporation), and collapsing whitespace.
  - Map sub-brands to a parent, for example Redmi/POCO → Xiaomi, but keep the sub-brand for display.
  - Map "generic/OEM/fără brand/no brand" to NULL.
  - When the brand field is missing, extract the brand from the title by longest-prefix match against the alias trie.
- **Model-number candidates**: tokens of 4 or more characters that mix letters and digits (`/\b(?=[a-z0-9-]*\d)(?=[a-z0-9-]*[a-z])[a-z0-9][a-z0-9-]{3,}\b/i`).
  - Exclude unit and spec tokens: `\d+(gb|tb|mb|mah|w|hz|mp|cm|mm|kg|l|v)`, 4k/8k, 5g/4g, wifi6/6e/7, usb3, hdmi2.1.
  - Also store `model_compact` (hyphens and spaces removed) for exact search and blocking.

#### D. Title tokenization and attribute extraction (Romanian + English patterns, to be tuned on real feeds)
```text
STORAGE   (\d{2,4})\s?(gb|tb)\b  + context {stocare, memorie internă, rom, ssd, hdd}; not followed by "ram"
RAM       (\d{1,3})\s?gb\s?(ram|lpddr\d+x?|ddr\d)  |  ram\s?(\d{1,3})\s?gb  |  (\d{1,2})\s?/\s?(\d{2,4})\s?gb  => ram/storage
SCREEN    (\d{1,3}(?:[.,]\d{1,2})?)\s?(?:"|''|”|inch|inci|in\b)   |  TVs: (\d{2,3})\s?cm  (convert cm/2.54)
COLOR     dictionary RO/EN: negru|black|midnight, alb|white|starlight, argintiu|silver, gri|grey|gray|graphite,
          albastru|blue, roșu|red, verde|green, auriu|gold, roz|pink, mov|violet|purple|lavender, "titan natural"...
YEAR/GEN  \b(20[12]\d)\b ; gen(?:era[țt]ia)?\s?(\d) ; (\d)(st|nd|rd|th)\s?gen
EDITION   digital|disc|cu unitate optică|slim|pro|max|plus|ultra|lite|mini|fe|se|5g|lte|wi-?fi|cellular|dual sim|esim
BUNDLE    \s\+\s | pachet | bundle | \bset\b | \bkit\b | cu (joc|controller|husă|încărcător) | include | cadou
MULTIPACK (\d+)\s?(x|buc(ăți|ati)?|pcs|pack)\b | set (de )?(\d+)
CONDITION resigilat\w* | refurbished | reconditionat\w* | recondiționat\w* | renewed | second[- ]?hand | \bsh\b |
          folosit\w* | open[- ]?box | ambalaj deteriorat | expus | demo | grad [abc]
ACCESSORY hus[aă] | carcas[aă] | folie | sticl[aă] securizat[aă] | [îi]nc[aă]rc[aă]tor | cablu | adaptor | suport |
          stand | curea | br[aă][țt]ar[aă] | compatibil\w* | "pentru <model>" | "for <model>"
REGION    versiune (eu|interna[țt]ional[aă]|global) | \b(eu|cn|us|uk)\b version | tastatur[aă] (ro|us|uk|de)  (laptops)
NUMBERS   Romanian prices: "1.299,99 lei" => thousands '.', decimal ',' (a classic 1000x parsing bug source)
```
- **Hard constraints** (any conflict means "not the same product"; at most the same family):

| Category | Hard-constraint attributes (must be equal if both present) | Soft attributes |
|---|---|---|
| Smartphones/tablets | storage, RAM (if stated), edition (Pro/Max/Plus/Ultra/FE/Lite), connectivity (Wi-Fi vs Cellular/5G), generation/year | colour (variant axis), dual-SIM |
| Consoles | edition (Digital vs Disc), model (Slim/Pro/original), storage | bundle content (=> bundle flag) |
| Laptops | CPU model, RAM, SSD, GPU, screen size, keyboard layout (RO/US) | colour |
| TVs/monitors | diagonal (cm/in), panel tech, model-year code | — |
| Appliances | capacity (kg/l), width (cm), energy class, model code | colour |

- Condition, bundle, multipack and accessory flags never merge silently. Condition ≠ new still links to the same product but is shown and ranked separately; bundle/multipack attaches as described in B; an accessory signal means reject or route to an accessory category.
- An **LLM extraction fallback** is worth it for the long tail. Haiku 5.5 with structured outputs, about 400 input and 150 output tokens per offer, costs ≈ $0.06 per 1,000 offers at batch prices. Cache the result by `title_hash`.

#### E. Candidate generation (blocking)
- Blocks, run in parallel:
  - (1) `gtin14`.
  - (2) `brand_id + mpn_base`.
  - (3) `brand_id + model_compact` prefix and trigram (pg_trgm) on `model_compact`.
  - (4) pgvector HNSW on `halfvec` embeddings of "brand | model tokens | key attributes | category", filtered by category and/or brand, top k = 10, with iterative scans on.
  - (5) Same brand + same extracted attributes within the category, for titles without model numbers.
- Embedding model: start with an off-the-shelf multilingual model (multilingual-e5-base/large or Qwen3-Embedding-0.6B) served from a Python sidecar. Once about 5–10k labeled pairs exist, fine-tune a small model contrastively, which is the approach idealo and the SIGMOD 2022 winner describe.

#### F. Scoring, thresholds, routing
- **Features**:
  - GTIN equal (weighted by trust).
  - MPN equal or `mpn_base` equal.
  - Model-token Jaccard.
  - An attribute-agreement vector (equal / conflict / missing per attribute).
  - Embedding cosine.
  - Price ratio to the product's current median, flagged if outside [0.5, 1.8].
  - Image perceptual-hash distance.
  - Category agreement.
  - Shop trust score.
- **Model**: hand-weighted rules on day 1. When 2–5k labeled pairs exist, logistic regression or LightGBM in the Python sidecar, calibrated with isotonic regression.
- **Thresholds**: set them for a target precision of ≥99.5% on auto-matches, measured on a stratified held-out set. Re-measure weekly by auditing 200 random auto-matches.
- **Label sources**:
  - Positives: GTIN-agreeing offers across shops with identical attributes.
  - Hard negatives: same brand and series but a conflicting hard attribute.
  - Review-queue outcomes.
  - LLM verdicts, kept separate from human labels.

#### G. LLM verification design and cost per 1,000 pairs (Claude, prices of 2026-10-27)
- **Prompt**:
  - Cached system prompt of about 2,000 tokens. It holds the label definitions SAME_PRODUCT / SAME_FAMILY_OTHER_VARIANT / ACCESSORY_OR_PART / BUNDLE_OR_MULTIPACK / DIFFERENT / UNSURE, the Romanian and English condition, bundle and accessory vocabulary, the hard-constraint rules, and 8–12 worked examples (PS5 Slim Digital vs Disc, iPhone 256GB vs 512GB, "+ joc", "Resigilat", "Husă pentru …").
  - The user message carries the canonical product plus 1 to 10 candidate offers.
  - Output is a JSON array via structured outputs (`output_config.format`): label, confidence, conflicting_attributes.
  - Thinking off where the model allows it: Haiku `disabled`, Sonnet `between_tools`.
  - Use the Message Batches API for backfills and hourly micro-batches.
- **Assumptions for the table**: pairwise mode has about 350 variable input tokens and 60 output tokens per pair. Listwise mode is 1 anchor + 10 candidates, about 1,650 variable input tokens and 400 output tokens per request. Opus 5.5 cannot disable thinking; about 150 thinking tokens per pair are assumed at low effort. Token counts must be re-measured with `count_tokens`, because Romanian text and the newer tokenizers change them.

| Model (mode) | Pairwise, cached prefix | Pairwise, no caching | Listwise (10/request), cached prefix |
|---|---|---|---|
| Haiku 5.5 standard | **$0.085** | $0.265 | $0.039 |
| Haiku 5.5 **Batch** | **$0.043** | $0.133 | **$0.019** |
| Sonnet 5.5 standard | $1.50 | $5.30 | $0.75 |
| Sonnet 5.5 **Batch** | **$0.75** | $2.65 | **$0.375** |
| Opus 5.5 standard (+~$3.00 thinking) | $3.00 | $10.60 | $1.50 |
| Opus 5.5 Batch (+~$1.50 thinking) | $1.50 | $5.30 | $0.75 |

  Arithmetic example for Haiku 5.5 standard, pairwise with caching: 350 × $0.10/M + 2,000 × $0.01/M + 60 × $0.50/M = $0.000085 per pair. For comparison, Peeters et al.'s Aug-2024 zero-shot figures (much shorter prompts, no few-shot examples) work out to about $0.06 per 1k pairs on GPT-4o-mini and about $4.74 per 1k on GPT-4.
- **Volume assumptions** (to replace with measured values): 1% of active offers are new or identity-changed per day; 40% of those need title-based resolution; 5 candidates each go to the LLM; 10% of pairs escalate to Sonnet.

| Scale | Pairs per month | Ongoing LLM cost per month | One-time backfill |
|---|---|---|---|
| 50k offers | 30k | ≈ $4–12 | ≈ $12–40 |
| 500k offers | 300k | ≈ $36–120 | ≈ $120–400 |
| 2M offers | 1.2M | ≈ $140–480 | ≈ $480–1,600 |

  Listwise prompting cuts these figures by roughly 2–7×.
- **Model choice**: Haiku 5.5 for volume; Sonnet 5.5 for escalations and attribute extraction on hard categories; Opus 5.5 only for building and adjudicating the evaluation set. On WDC-style corner cases, the evidence is that frontier models clearly beat small ones (GPT-4 89.6 vs GPT-4o-mini 81.2). An internal Romanian eval of at least 1,000 pairs should decide whether Haiku 5.5 is precise enough on its own, or whether more traffic should route to Sonnet.

#### H. Workflow: canonical product creation, merge/split, audit, review queue (data-model sketch)
```sql
CREATE TABLE match_candidate (
  offer_id bigint, product_id bigint, source text,          -- 'gtin'|'mpn'|'model'|'embed'|'attr'
  features jsonb, score real, llm_label text, llm_confidence real, llm_model text, prompt_version text,
  decided_at timestamptz, PRIMARY KEY (offer_id, product_id));
CREATE TABLE match_audit (                                   -- append-only, never updated
  id bigserial PRIMARY KEY, at timestamptz DEFAULT now(), actor text,   -- 'rules:v7' | 'llm:claude-haiku-5-5' | 'user:42'
  action text,      -- 'match'|'unmatch'|'merge'|'split'|'lock'|'unlock'|'create_product'|'gtin_blacklist'
  offer_id bigint, from_product_id bigint, to_product_id bigint, score real, reason text, payload jsonb);
CREATE TABLE review_task (
  id bigserial PRIMARY KEY, kind text, offer_id bigint, candidate_ids bigint[], priority real,
  status text DEFAULT 'open', assigned_to bigint, created_at timestamptz DEFAULT now(), resolved_at timestamptz, resolution jsonb);
CREATE TABLE product_redirect (from_product_id bigint PRIMARY KEY, to_product_id bigint NOT NULL, reason text, at timestamptz DEFAULT now());
```
- **Merge(src → dst)** runs in one transaction:
  - Move offers, GTINs and aliases.
  - Set `src.status='merged', merged_into=dst`.
  - Insert `product_redirect` (the URL 301).
  - Recompute aggregates.
  - Re-index search.
  - Write the audit row, with a payload listing the moved IDs so the merge can be undone.
- **Split**: create a new product, move the selected offers, and audit it.
- **Locking**: `offer.match_status ∈ {unmatched, auto, llm, human, locked}`. Locked or human mappings survive re-matching until `identity_hash(title_norm, gtin14, mpn_norm, brand_id)` changes.
- **Review queue priority** = expected traffic × uncertainty, so popular products are reviewed first. A keyboard-driven UI showing side-by-side attributes and images is the main human-productivity lever.
- **Review load estimate** (if about 1–3% of new offers end up with humans): roughly 5–15 tasks/day at 50k offers, 50–150 at 500k, and 200–600 at 2M. Above that, Sonnet escalation thresholds need tuning.

#### I. Known failure modes and the guard for each
| Failure mode | Guard |
|---|---|
| Variant merges (storage, RAM, colour, screen) | Hard-constraint attributes; variant axes in families |
| Edition/model confusion (PS5 Digital vs Disc, Slim vs original) | Edition tokens are hard constraints |
| Same name, different generation or year (TV model years, iPad generations) | Year/generation extraction; MPN base; price-ratio feature |
| Merchant bundles reusing the base GTIN ("+ joc", "pachet") | Bundle detector overrides GTIN; `offer_kind` |
| Multipacks ("2x", "set 3 buc") | Multipack extraction; per-unit price shown |
| Accessories pulled in ("Husă iPhone 16 Pro") | Accessory lexicon + "pentru/for" + price < 0.3× median |
| Condition mixing (resigilat/refurbished/used) | Condition flag; separate ranking; never "lowest price" against new unless the user opts in |
| Regional versions (EU vs international, RO vs US keyboard) | Region/keyboard attributes |
| Fake, reused or RCN GTINs | GTIN status and trust; per-shop statistics |
| Brand aliases and sub-brands | Alias table + parent brand |
| Encoding and number formats (ş/ș, "1.299,99") | Normalizer + anomaly filter (Section 3) |
| Drift (shops edit titles, GTINs, URLs) | `identity_hash` re-match triggers; locks |
| Unseen new products (benchmark drop on unseen entities) | LLM verification + provisional products |

#### J. Achievable quality (expectation, to be verified on Pretoscop's own eval set)
- Electronics, IT and appliance titles usually contain model numbers. Their difficulty is probably closer to Abt-Buy (GPT-4 zero-shot F1 95.8) than to WDC's 80%-corner-case setting (89.6).
- With trusted GTINs, MPN rules, hard constraints and LLM verification of the gray zone, auto-decision precision of ≥99.5% looks achievable with automatic coverage around 90–97%. The remaining 3–10% would go to provisional products or human review.
- These numbers are design targets, not measured results.

### Gaps
- No published statistics were found on EAN/GTIN coverage in Romanian affiliate feeds, or on coverage in electronics versus fashion. Measure it per shop in week 1.
- No engineering write-ups were found from Geizhals or PriceRunner on matching, and Skroutz's engineering blog was not indexed. idealo's evidence is a 2022 talk; Heureka's is a job posting.
- No prevalence data was found on retailer-specific fake or placeholder EANs in Romania, or on how often retailers issue codes under the 594 prefix.
- There is no public Romanian-language product-matching benchmark. Build an internal labeled set of at least 2,000 pairs, stratified by category and difficulty.
- EAN-8 restricted-range rules (RCN-8) and the exact current GS1 General Specifications wording were not verified; the GS1 prefix page returned 403.
- Prompt-cache hit behaviour inside Message Batches (best-effort or guaranteed) was not verified. The table shows both cached and uncached costs.
- Licences of the embedding models (multilingual-e5, BGE-M3, Qwen3-Embedding) were not verified.

## 2. Catalog and taxonomy: which taxonomy, which spec source, how to handle images, URLs/slugs and variant families

### Takeaway
Use the Google Product Taxonomy as the backbone and mapping target. It has an official Romanian (ro-RO) file, but that file is frozen at version 2021-09-21. Extend it with deeper Pretoscop nodes and per-category attribute schemas for electronics, IT and appliances. Enrich canonical products from Open Icecat by GTIN or brand+MPN; it is free for sponsoring brands and covers 60+ languages. Model variants as *families → variant products*, with one indexable page per variant carrying `AggregateOffer`. Use stable `/p/{slug}-{id}` URLs with 301s on merges. Store image derivatives yourself in R2 instead of hotlinking.

### Cited Findings
- Google publishes a Romanian taxonomy file with an ID per node and Romanian names, headed `# Google_Product_Taxonomy_Version: 2021-09-21` (about 610k characters) — [taxonomy-with-ids.ro-RO.txt](https://www.google.com/basepages/producttype/taxonomy-with-ids.ro-RO.txt)
- GMC `google_product_category` accepts either the numeric ID or the full path, and the ID is recommended. `product_type` is the merchant's own category (≤750 characters) — [GMC product data specification](https://support.google.com/merchants/answer/7052112)
- Open Icecat:
  - Sponsoring brands named include HP, LEGO, L'Oréal, Sony, Hotpoint, Signify, Microsoft, Tefal, Whirlpool, Intel and Oral-B, "and hundreds of others".
  - Content covers "more than 60 popular languages and locales".
  - Data-sheets can include GTIN or brand product code, images and videos, localized marketing texts, leaflets and manuals, feature and sustainability logos, and logistics data.
  - Content is "syndicated under an open content license", and brands use a DRM module to control which partners get which assets.
  - Source: [Iceclog: Open Icecat sponsor article (c. 2020/21)](https://iceclog.com/gain-access-to-the-global-e-commerce-market-as-open-icecat-sponsor/amp/)
- Icecat scale claims conflict. A channel-partner page says "more than half a million datasheets" and over 500 sponsoring brands, while other Icecat pages say "millions". Full Icecat (paid small/standard/unlimited plans) covers "up to 40k brands" — [Icecat channel partners (RO site)](https://icecat.ro/no/menu/channelpartners); [Icecat subscription plans 2025](https://iceclog.com/icecat-subscription-plans/). Icecat's own site was behind an Anubis bot-check during this research, so first-party terms could not be read.
- Google Search product snippets:
  - `AggregateOffer` is "a kind of Offer representing an aggregation of other offers" for "a product that is being sold by multiple merchants".
  - `lowPrice` and `priceCurrency` are required; `highPrice` and `offerCount` are recommended.
  - **Don't use AggregateOffer for product variants.**
  - The price-drop enhancement requires `Offer`, not `AggregateOffer`.
  - Product rich results only support pages focused on a single product.
  - Search Console's "Product snippets" report covers "product reviews and aggregator sites", while the "Merchant listings" report covers pages where products can be bought.
  - Source: [Google Search Central: Product snippet structured data](https://developers.google.com/search/docs/appearance/structured-data/product-snippet)
- GMC `item_group_id` is the "ID for a group of products that come in different versions (variants)" — [GMC spec](https://support.google.com/merchants/answer/7052112)
- idealo's `imagededup` (Apache-2.0, Python 3.9+) finds exact and near-duplicate images with PHash/DHash/WHash/AHash and a CNN mode. The CNN is best for near-duplicates; DHash is fastest for exact duplicates — [idealo/imagededup](https://github.com/idealo/imagededup)
- Cloudflare R2: $0.015/GB-month (Standard), Class A operations $4.50/M, Class B $0.36/M, **no egress charges**, and a free tier of 10 GB-month, 1M Class A and 10M Class B operations — [R2 pricing](https://developers.cloudflare.com/r2/pricing/). Cloudflare Images: first 5,000 unique transformations per month included, then **$0.50 per 1,000**; storage $5 per 100k images; delivery $1 per 100k images — [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/)

### Inferences
- **Taxonomy plan**:
  - Pretoscop category tree v1 = the relevant ro-RO Google nodes (electronics, computers, phones, home appliances), plus custom leaf nodes where Google's 2021 tree is shallow.
  - Every node stores `google_taxonomy_id`, which is useful for future Google CSS/Shopping exports, and optionally `icecat_category_id`.
  - Map each shop's `product_type` path to a node in this order: (1) a curated `shop_category_map`; (2) the feed's `google_product_category` when present; (3) an embedding-kNN classifier over already-mapped products; (4) an LLM for the long tail; (5) a human check for high-volume paths.
  - **UNSPSC** is a procurement taxonomy and not consumer-facing. Skipping it was not researched further.
- **Canonical product composition** (field-level precedence): human edits > Icecat (manufacturer-approved) > majority vote across offers > best single offer. Keep `field_provenance jsonb` so every value is traceable.
- **Attribute schemas** are per-category JSON Schema documents (typed enum, number+unit, boolean). The hard-constraint attributes from Section 1-D double as variant axes and as search facets.
- **Families and variants**:
  - `product_family` (e.g. "Samsung Galaxy S25 Ultra") → `product` (one per price-relevant axis combination: storage, RAM, edition, connectivity, and colour where colour has its own GTINs).
  - Each variant page carries its own `AggregateOffer`. Per Google guidance, don't aggregate across variants.
  - The family page lists variants (ItemList) without a cross-variant AggregateOffer.
  - Google's ProductGroup/variant markup was not verified in this research and should be checked before implementation.
  - Option B, if pages per colour are too thin: keep colour at offer level and filterable on a storage-level page. The cost is fuzzier GTIN-to-page identity.
- **URL design**:
  - Products: `/p/{brand}-{model}-{variant-attrs}-{shortid}`, e.g. `/p/apple-iphone-16-pro-256gb-titan-natural-k3f9x`. ASCII-folded, lowercase, hyphenated, ≤80 characters; the trailing base36 ID is authoritative.
  - A wrong or old slug gets a 301 to the canonical one, and `product_redirect` 301s merged IDs.
  - Hubs: `/c/{category-path}`, `/b/{brand}`, `/f/{family}-{id}`.
  - Search (`/cauta?q=`) and arbitrary facet combinations are `noindex,follow`. Only curated combinations (brand × category) become indexable landing pages.
  - Provisional products (fewer than 2 offers, unverified) are `noindex` to avoid thin pages.
- **Images**:
  - Download the original once, respecting robots.txt and rate limits, and store it privately in R2 keyed by sha256.
  - Generate AVIF/WebP derivatives (e.g. 160/400/800 px) with sharp/libvips in workers, and serve them from an R2 custom domain behind the Cloudflare cache.
  - Compute a pHash as a matching feature and for de-duplication.
  - Prefer manufacturer or Icecat images when available.
  - Keep `source_url` and `source_shop` for attribution and takedown handling.
  - Don't hotlink retailer CDNs. Their URLs rot, may be hotlink-protected, and leak user requests to retailers.
  - Cost at 1M products × 3 derivatives × about 40 KB ≈ 120 GB: R2 ≈ $1.8/month storage plus about $13.5 in one-time Class A writes. The same 3M derivatives as Cloudflare Images unique transformations would be about $1,500, so pre-generating wins at scale.

### Gaps
- Icecat first-party terms were not readable (bot protection): the Open Icecat licence text, attribution requirements, Romanian-locale coverage for IT/electronics, API rate limits, and how many datasheets match Romanian electronics GTINs. Test by sampling 1,000 GTINs from the first feeds.
- Image licensing in Romanian affiliate networks' terms (whether feed images may be cached or re-hosted) was not researched; see `legal_and_regulatory.md`.
- Whether Google has published any taxonomy version after 2021-09-21 was not checked beyond the ro-RO file's header.

## 3. Price history: observation model, storage engine, volumes, compaction, serving, derived metrics, fake-discount and anomaly detection, VAT/currency/shipping/warranty

### Takeaway
Use change-only offer price events (append-only, written only when the observed state changes), daily product-level rollups, and current state on the offer row. All of it lives in PostgreSQL 18 with monthly declarative partitions, BRIN on time, and a B-tree primary key `(offer_id, observed_at)`. Raw per-crawl observations go to object storage as Parquet/NDJSON for 30–90 days. Measured online price-change frequencies are 1.3–2.6% of products per day (Cavallo). At 2M offers that gives roughly 15–75M change rows a year, against 730M rows for full daily snapshots, which is easily handled by one Postgres node. TimescaleDB is optional: its Community features are free when self-managed, but Supabase deprecated it on PG17. ClickHouse is premature. Romania enforces the Omnibus 30-day reference price; ANPC fined eMAG over it. That makes "lowest price in the last 30 days" both a compliance check and a product feature.

### Cited Findings
- Daily scraped online prices, from supermarket-type retailers in Cavallo's sample (Table 6):

| Country | Daily frequency of price change | Implied price duration |
|---|---|---|
| USA | **0.024** | 42 days |
| Brazil | 0.026 | 38 days |
| Colombia | 0.022 | 45 days |
| Argentina | 0.015 | 64 days |
| Chile | 0.013 | 75 days |

  In the US, increases and decreases are roughly balanced (52% vs 48%) — [Cavallo, "Scraped Data and Sticky Prices", NBER WP 21490](https://www.nber.org/papers/w21490)
- eMAG's CEO said in 2018 that some products' prices change many times a day ("comerțul online este dinamic") — [HotNews, 2018](https://hotnews.ro/black-friday-2018-emag-promite-reduceri-medii-de-35-pe-16-noiembrie-iulian-stanciu-despre-variatiile-de-preturi-din-aceste-zile-comertul-online-este-dinamic-la-unele-produse-pretul-se-schimba-de-350574)
- **TimescaleDB editions**: Source: [Tiger Data docs: TimescaleDB editions](https://www.tigerdata.com/docs/about/latest/timescaledb-editions)
  - The Apache-2 edition has the core hypertable functions (`create_hypertable`, `drop_chunks`, …).
  - The Community edition (Timescale License, TSL) additionally has columnstore/Hypercore compression, **continuous aggregates**, **retention policies** and the job scheduler (`add_job`).
  - TSL terms: "You cannot sell TimescaleDB Community Edition as a service", and Community is "completely free if you manage your own service".
  - The only hosted Community edition named is Tiger Cloud.
- **TimescaleDB 2.31.0** (2026-10-20) adds columnstore DML vectorization and granular continuous-aggregate refresh. 2.29.0 (2026-07-28) supports PostgreSQL 16, 17 and 18 and removed PG15 — [TimescaleDB releases](https://github.com/timescale/timescaledb/releases)
- **Supabase**: the `timescaledb` extension is deprecated on Postgres 17 and must be dropped before upgrading; Supabase suggests native partitioning with `pg_partman` instead — [Supabase docs: timescaledb](https://supabase.com/docs/guides/database/extensions/timescaledb); [Supabase PG17 notes](https://supabase.com/changelog/35851-forthcoming-postgres-17-release-notes). Supabase ended PG14 support on 2026-07-01 — [Supabase changelog](https://supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026)
- **Neon** lists TimescaleDB among the extensions on all plans; the edition is not stated — [Neon pricing](https://neon.com/pricing)
- **PostgreSQL BRIN**: "designed for handling very large tables in which certain columns have some natural correlation with their physical location". minmax summaries are kept per block range, and `autosummarize` is off by default. `minmax-multi` handles outliers (`values_per_range` 8–256, default 32) — [PostgreSQL docs: BRIN](https://www.postgresql.org/docs/current/brin.html)
- **PostgreSQL versions**: the "current" documentation is **PostgreSQL 18.6** — [PG docs (current)](https://www.postgresql.org/docs/current/textsearch-psql.html). PG19 was still pre-GA in the sources found: beta 1 on 2026-06-04, beta 2 on 2026-07-16, a release candidate planned for early October, and a release-notes page with date "2026-??-??" — [PG19 beta 2](https://postgresql.org/about/news/postgresql-19-beta-2-released-3350); [PG19 release notes](https://postgresql.org/docs/release/19.0)
- **ClickHouse**:
  - ReplacingMergeTree: "Data deduplication occurs only during a merge", merges happen "at an unknown time", and correct answers need query-time deduplication with `FINAL` — [ClickHouse docs: ReplacingMergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/replacingmergetree)
  - ClickHouse Cloud: usage-based with no monthly minimum, scale-to-zero compute, and $300 of trial credits for 30 days. Enterprise in AWS eu-central-1 is $0.46974 per compute unit-hour (8 GiB RAM, 2 vCPU) and $26.95 per TB-month. Basic is limited to 8–12 GiB memory and up to 1 TB — [ClickHouse pricing](https://clickhouse.com/pricing)
- **Romanian enforcement and context**:
  - Romania transposed the Omnibus Directive with OUG 58/2022, in force from 28 May 2022 — [CMS Law-Now](https://cms.law/en/int/blogs/law-now-blog/romania-transposes-omnibus-directive-into-national-law)
  - ANPC fined eMAG **50,000 lei** for Black Friday irregularities, reportedly including not indicating the period used for the 30-day lowest reference price. This comes from the search-result summary; direct fetch returned 403 — [TVR Info](https://tvrinfo.ro/anpc-a-amendat-emag-cu-50-000-de-lei-pentru-nereguli-in-timpul-black-friday-emag-aspectele-sesizate-au-fost-rezolvate_894691/)
  - Romanian press has long debated "inflated before Black Friday" claims. One comparison found prices at worst unchanged — [Capital.ro](https://www.capital.ro/au-fost-reduceri-de-black-friday-sau-nu.html). eMAG claimed 71% of its 2023 Black Friday offers were at the year's lowest price — [Profit.ro](https://profit.ro/stiri/emag-anunta-ce-pregateste-de-black-friday-21373604)
- **Feed fields that matter for final price**:
  - `sale_price` and `sale_price_effective_date`.
  - `shipping` with sub-attributes country, region, postal_code, service, price ("including VAT if required"), and min/max handling and transit times.
  - `free_shipping_threshold` (country, `price_threshold`: "Order cost above which shipping is free").
  - `shipping_weight` and dimensions, and `minimum_order_value`.
  - Source: [GMC product data specification](https://support.google.com/merchants/answer/7052112)

### Inferences

#### A. Observation model (recommended)
- **Current state lives on `offer`**:
  - Price, old price, shipping, final price, availability, currency, warranty, seller.
  - `state_hash` = hash of those fields.
  - `last_seen_at` is updated on every observation; `last_changed_at` only on change.
- **`price_event`** is append-only and change-only:
  - A row is inserted only when `state_hash` changes.
  - It records `source` (feed / crawl / extension-verified) and `run_id`.
  - A run that sees no change writes nothing to history. "Still the same at time t" is implied by `last_seen_at` and the run logs.
- **`product_day`**: one row per product per day with min/median/max *final* price among in-stock new-condition offers, `offers_in_stock`, and `cheapest_offer_id`.
  - The current day's row is updated incrementally by a debounced job.
  - A nightly close writes rows for all active products, so charts are continuous.
- **Raw observations**: every parsed row of every run, written as Parquet or NDJSON.gz to object storage and kept 30–90 days, for debugging, replays and backfills. Ad-hoc analytics run on it with DuckDB.
- **Collect from day 0**: start crawls and feeds weeks or months before public launch, because history cannot be backfilled honestly.

```sql
-- prices in bani (integer minor units of RON); currency kept as observed
CREATE TABLE offer (
  id bigserial PRIMARY KEY, shop_id bigint NOT NULL, seller_id bigint, shop_sku text NOT NULL, url text NOT NULL,
  title_raw text, title_norm text, brand_id bigint, gtin14 char(14), gtin_status text, mpn_norm text,
  condition text CHECK (condition IN ('new','resigilat','refurbished','used')) DEFAULT 'new',
  offer_kind text CHECK (offer_kind IN ('single','bundle','multipack','accessory')) DEFAULT 'single', multipack int,
  attrs jsonb, shop_category_path text, image_key text, embedding halfvec(768),
  product_id bigint, match_status text DEFAULT 'unmatched', match_score real, identity_hash bytea,
  price_bani int, old_price_bani int, currency char(3) DEFAULT 'RON', shipping_bani int, final_price_bani int,
  availability text, warranty_months smallint, state_hash bytea,
  first_seen_at timestamptz, last_seen_at timestamptz, last_changed_at timestamptz, active boolean DEFAULT true,
  UNIQUE (shop_id, shop_sku));

CREATE TABLE price_event (
  offer_id bigint NOT NULL, observed_at timestamptz NOT NULL,
  price_bani int, old_price_bani int, shipping_bani int, final_price_bani int,
  availability smallint, currency char(3), source smallint, run_id bigint, flags smallint DEFAULT 0, -- anomaly/quarantine bits
  PRIMARY KEY (offer_id, observed_at)) PARTITION BY RANGE (observed_at);   -- monthly partitions (pg_partman or cron)
CREATE INDEX ON price_event USING brin (observed_at) WITH (autosummarize = on);

CREATE TABLE product_day (
  product_id bigint NOT NULL, day date NOT NULL,
  min_final_bani int, median_final_bani int, max_final_bani int, offers_in_stock smallint, cheapest_offer_id bigint,
  PRIMARY KEY (product_id, day)) PARTITION BY RANGE (day);

-- serving fields denormalized on product: best_final_bani, best_offer_id, offers_in_stock,
-- low_30d_bani, low_90d_bani, low_all_time_bani, low_all_time_at, median_30d_bani, last_price_change_at
```
- **Idempotent write**:
  - Start with `UPDATE offer SET … , state_hash=$h, last_seen_at=$t WHERE id=$id RETURNING (old.state_hash IS DISTINCT FROM $h)`. In PG 18, `RETURNING` can reference `OLD`/`NEW` (verify the syntax); otherwise read with `SELECT … FOR UPDATE` first.
  - If the state changed, `INSERT INTO price_event … ON CONFLICT DO NOTHING`, and enqueue `product.recompute(product_id)` with a singleton key so repeated triggers collapse into one job.

#### B. Volume and storage estimates
These are planning figures. They assume about 100–110 bytes per row including the PK index, and products ≈ offers / 3.

| Scale | Daily-snapshot rows/yr | Change-only rows/yr at 2.4%/day (Cavallo US) | at 10%/day (electronics + stock changes) | `product_day` rows/yr |
|---|---|---|---|---|
| 50k offers | 18.3M (≈2 GB) | 0.44M (≈0.05 GB) | 1.8M (≈0.2 GB) | 6.1M (≈0.6 GB) |
| 500k offers | 182.5M (≈19 GB) | 4.4M (≈0.5 GB) | 18.3M (≈2 GB) | 61M (≈6 GB) |
| 2M offers | **730M (≈77 GB)** | 17.5M (≈1.9 GB) | 73M (≈7.7 GB) | 243M (≈25 GB) |

- Even the daily-snapshot design fits one NVMe server. Change-only is chosen for semantic clarity (each row is a real change) and low write amplification, not because the snapshot volume would be impossible.
- **Compaction and tiering**:
  - `price_event` is kept forever because it is small.
  - `product_day` stays hot for 25 months. Older months are rolled into `product_week` (min/median), the daily partition is exported to Parquet in R2 or Hetzner Object Storage, then detached and dropped.
  - Raw observations are kept for 90 days.
- **TimescaleDB as an optional later upgrade**, self-hosted only. Hypertables plus continuous aggregates for `product_day`/`product_week`, plus columnstore on `price_event`, would replace the hand-rolled jobs. The Community licence permits this when self-managed. Avoid it if a later move to Supabase is likely.
- **ClickHouse**: only if the product starts publishing market-wide analytics (category price indices, retailer comparisons) over billions of raw observations. Then dual-write raw observations to ClickHouse, with ReplacingMergeTree and `FINAL`, or argMax-style queries.

#### C. Serving queries and derived metrics
- **Chart API**: `GET /v1/products/{id}/history?range=90d|1y|all&series=min,median,shops`.
  - Reads `product_day` (with `product_week` for ranges over 2 years): at most 730 points, so no downsampling algorithm is needed.
  - Per-shop lines come from `price_event` as a step function for the top 5 offers, carrying forward the last value from before the range start.
  - CDN-cached for 1 hour and purged on significant price change.
- **Cached metrics on `product`**, updated on change and nightly:
  - `low_30d` = `min(min_final_bani)` over the last 30 days.
  - `low_90d`.
  - `low_all_time` with date.
  - `median_30d`.
  - `pct_vs_median_30d`.
- **Badges**: "Cel mai mic preț din ultimele 30/90 zile", "Minim istoric", "Scădere de preț" (current best is at least 5% and at least X lei below yesterday's best).
- **Alerts**: the event `product_best_price_changed` triggers evaluation of all active alerts for that product (target price or % drop). Debounce 24 h per alert; channels are email, web push and Telegram.

#### D. Fake-discount heuristics (aligned with the Omnibus 30-day rule; labels must be factual, not accusatory)
1. **Reference not supported**: the shop's displayed old price is more than 2% above the *lowest price Pretoscop observed at that same shop* in the 30 days before the discount started. Show "Prețul de referință nu corespunde istoricului nostru (minim 30 zile: X lei)".
2. **Raise-then-cut**: the maximum price over [t−30d, t−3d] is at least 15% above the median over [t−60d, t−31d], and the current "discounted" price is at least 97% of that earlier median. Label it "Reducere aparentă".
3. **Phantom old price**: the old price was never an actual observed selling price in the last 90 days.
4. **Market-irrelevant discount**: the claimed discount is over 30%, yet the price is at or above the cross-shop median.
- Only compute these heuristics when Pretoscop's history for that offer covers the window, so not during the first 30 days after an offer appears. Keep a screenshot or raw-observation evidence trail. Have the wording reviewed (see `legal_and_regulatory.md`).

#### E. Anomaly filtering (quarantine, then confirm with a re-crawl, then publish)
- **Reject outright**: price ≤ 1 RON; 0 or placeholder prices (e.g. 9,999,999); missing currency with an out-of-range magnitude.
- **Quarantine**: price ratio versus the offer's 14-day median above 3 or below 0.33. Re-crawl within 1–2 h, and publish only if 2 consecutive observations agree. Ratios of about 10, 100 or 1000 (or their reciprocals) usually mean a decimal or thousands-separator bug: "1.299" read as 1.299 instead of 1,299, a common Romanian formatting trap.
- **Cross-shop check**: an offer below 0.3 × the product's cross-shop median is probably a mis-match (accessory or variant). Send it back to the matcher before showing it as the "cheapest".
- **Run-level circuit breaker**: if more than 20% of a shop's offers change by more than 50% in one run, hold the entire run and alert. This is probably a parser or currency bug.

#### F. Currency, VAT, shipping, warranty
- **Currency**:
  - Store the observed currency. Convert EUR to RON with the National Bank of Romania's (BNR) daily reference rate (endpoint not verified in this research), store `fx_rate` and the date on the event, and show the original amount.
  - Flag offers whose magnitude suggests the wrong currency (≈ median / 5).
- **VAT**: compare B2C VAT-inclusive prices. Detect "fără TVA" / "exclusiv TVA" labels (B2B IT shops) and either convert at the current standard rate or exclude the offer from "best price".
- **Shipping**: a per-shop rules document, with an offer-level or seller-level override for marketplace sellers:
  `{"methods":[{"code":"courier","fee_bani":1999,"free_over_bani":25000},{"code":"locker","fee_bani":999,"free_over_bani":15000}],"bulky":{"fee_bani":4999,"categories":[...]}}`.
  - Fill it from the feed's `shipping` / `free_shipping_threshold` when present, then from crawled "Transport gratuit" badges, then from curated rules.
  - **Final price** = price + the cheapest *home-delivery* method by default, with a UI toggle for locker delivery.
  - Always show "preț + transport = preț final", and the date the shipping rule was last verified.
- **Warranty**: store `warranty_months` when stated, show it, and keep it out of ranking by default. Never rank refurbished, resigilat or used offers as "cel mai mic preț" against new unless the user opts in.

### Gaps
- The text of Article 6a (Directive 98/6/EC as amended by 2019/2161) could not be fetched from EUR-Lex (empty render), and the exact Romanian provision was not verified. The 30-day rule here rests on the ANPC enforcement report; see `legal_and_regulatory.md`.
- Romania's current standard VAT rate (believed to be 21% since August 2025) was not verified in this session.
- No electronics-specific daily price-change frequencies were found; Cavallo's figures are for supermarket-type goods. Measure Pretoscop's own distribution in the first month and refine the storage estimate.
- TimescaleDB compression ratios, which TimescaleDB edition Neon runs, and AWS RDS/Azure availability were not verified.
- The BNR exchange-rate feed URL and format were not verified.

## 4. Search: which engine for Romanian product search (diacritics, ș/ş problem, stemming, typo tolerance, facets, popularity ranking, autocomplete), and at what cost and operational burden

### Takeaway
Self-host **Meilisearch Community Edition** (MIT licence, v1.56.0 released 2026-10-26) for public search and autocomplete. Its Latin pipeline decomposes characters, lowercases them and removes nonspacing marks, so "televizoare samsung" finds "Televizoare Samsung" written with ă/â/î/ș/ț or with the legacy cedilla forms ş/ţ. The docs don't mention stemming, so handle Romanian plurals with synonyms and alias fields. Normalize ş→ș and ţ→ț at ingest anyway, since legacy Windows-1250 data uses the cedilla forms. Keep PostgreSQL FTS (`romanian_stem` + unaccent + pg_trgm) for back-office search and matching. Typesense 30.x is the nearest alternative; Elasticsearch/OpenSearch only if requirements outgrow both.

### Cited Findings
- **Meilisearch language handling**: the Latin-script row ("English, French, Spanish, Italian, Portuguese, etc.") lists normalization as "Decomposition, lowercase, nonspacing-marks removal", and "Any language that uses whitespace to separate words benefits from the default Latin pipeline". Romanian is not named, and the page does not mention stemming — [Meilisearch docs: language](https://www.meilisearch.com/docs/learn/what_is_meilisearch/language)
- **Meilisearch releases**: Source: [Meilisearch releases](https://github.com/meilisearch/meilisearch/releases)
  - **v1.56.0** (2026-10-26): `sampledCount` facet sorting and faster search.
  - v1.55.0 (2026-10-12): dynamic search-rule previews (Enterprise and experimental) and facet timing details.
  - v1.54.x: an experimental `/mcp` endpoint.
  - v1.53.x: updated charabia tokenizer.
- **Meilisearch licensing**: Source: [Meilisearch README](https://github.com/meilisearch/meilisearch)
  - The Community Edition is "Fully open source under the MIT license".
  - The Enterprise Edition is under a commercial licence or BUSL-1.1, and is "Not allowed in production without a commercial agreement".
  - Enterprise-only features: sharding, S3-streaming snapshots, search-rule previews.
- **Meilisearch Cloud** pricing is reported only by third parties: usage-based from about $30/month, and resource-based tiers reported at $14.88 or $23/month (the sources conflict) — [Toolradar](https://toolradar.com/tools/meilisearch); [PricingSaaS](https://pricingsaas.com/companies/meilisearch)
- **Typesense diacritics**:
  - For default (English) fields, "diacritics (accent marks) are automatically removed from European accented characters".
  - For non-English locales, "diacritics are preserved due to ICU … tokenization". An exact accented match is prioritised; failing that, typo tolerance matches non-accented versions.
  - Source: [Typesense locale guide](https://typesense.org/docs/guide/locale.html)
- **Typesense stemming**: Snowball stemming via `"stem": true`, with the language taken from the field's `locale`. A custom `stem_dictionary` takes precedence. Stemming "may cause side effects with brand names" — [Typesense 30.2 stemming](https://typesense.org/docs/30.2/api/stemming.html)
- **Typesense Cloud** billing: a fixed hourly cluster fee for the chosen RAM/CPU, plus bandwidth, plus optional support. The fee is charged even with no traffic — [Typesense Cloud help](https://cloud-help.typesense.org/article/billing-process). A third party lists about $0.03/hr for a 0.5 GB node (≈$21/month) — [markaicode](https://markaicode.com/pricing/typesense-pricing)
- **Snowball Romanian stemmer**: the current version "normalises the old forms as a first step", mapping ş→ș and ţ→ț. The original version recognised only the cedilla forms — [Snowball: Romanian stemmer](https://snowballstem.org/algorithms/romanian/stemmer.html). A 2023 discussion noted that comma-below forms are far more common on Romanian Wikipedia — [snowball-discuss, Feb 2023](https://lists.tartarus.org/pipermail/snowball-discuss/2023-February/001744.html)
- **The ș/ş problem**:
  - U+015F (ş, cedilla) was the code point in Windows-1250 and Mac Romanian, so "there is probably a *lot* of Romanian data using this" — [Unicode mailing list](https://unicode.org/mail-arch/unicode-ml/y2002-m02/0426.html)
  - Unicode 6 (2010) states the preferred Romanian representation is U+0219 ș (comma below) — [Unicode L2/13-225](https://www.unicode.org/L2/L2013/13225-commas.html)
- **PostgreSQL 18** ships a `romanian_stem` Snowball dictionary ("snowball stemmer for romanian language") — [PG 18 docs: psql text search support](https://www.postgresql.org/docs/current/textsearch-psql.html)
- **Elasticsearch/Kibana** added AGPL as a licence option alongside ELv2 and SSPL, announced 2024-08-29 — [Elastic blog](https://www.elastic.co/blog/elasticsearch-is-open-source-again)

### Inferences
- **Normalization in shared TypeScript code**, used for indexing, queries and matching:
  ```ts
  const CEDILLA: Record<string,string> = { 'ş':'ș', 'Ş':'Ș', 'ţ':'ț', 'Ţ':'Ț' };
  export const normalizeRo = (s: string) => s.normalize('NFC').replace(/[şŞţŢ]/g, c => CEDILLA[c]);   // store/display
  export const foldRo = (s: string) => normalizeRo(s).normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase(); // keys
  ```
  NFD turns ș into s + U+0326 (combining comma below) and ş into s + U+0327 (combining cedilla). Both are nonspacing marks, so Meilisearch's mark removal should fold both to "s". Test this on a live instance.
- **Index design**: an index of canonical products only, not offers.
  - Fields: `id, title, brand, family, model_compact, gtins[], category_ids[], category_names, attrs (storage_gb, ram_gb, screen_in, color, …), price_min, offers_in_stock, shop_ids[], discount_pct, popularity, image, slug, aliases[]`.
  - Settings sketch, to verify against the current API:
    ```json
    {
      "searchableAttributes": ["title","brand","model_compact","family","category_names","aliases"],
      "filterableAttributes": ["brand","category_ids","price_min","offers_in_stock","shop_ids","storage_gb","ram_gb","screen_in","color"],
      "sortableAttributes": ["price_min","popularity","discount_pct"],
      "rankingRules": ["words","typo","proximity","attribute","sort","exactness","popularity:desc"],
      "typoTolerance": {"disableOnAttributes": ["model_compact"]},
      "synonyms": {"televizor":["televizoare","tv"],"laptop":["laptopuri","notebook"],"telefon":["telefoane","smartphone"],"frigider":["frigidere","combina frigorifica"]}
    }
    ```
- **Romanian morphology without a stemmer**:
  - About 200–500 curated synonym entries for category nouns (singular/plural/definite forms: televizor/televizoare/televizorul).
  - Plus an `aliases` field per product, generated offline with the Snowball Romanian stems from PostgreSQL (`to_tsvector('romanian', …)`), common abbreviations (e.g. "s25u"), and model-number variants.
  - Product search depends mainly on brand and model tokens, so this is enough.
- **Typo tolerance**:
  - Disable it on model numbers and GTINs. "s928b" should not match "s921b"; that is a different product.
  - GTIN queries (13–14 digits) take a direct filter path, which the extension and shop tooling also use.
- **Popularity ranking**: `popularity` = a decayed sum of clicks to retailers (affiliate exits), page views, alert subscriptions and offer count, recomputed nightly.
- **Autocomplete**: Meilisearch multi-search over three small indexes (products, categories, brands), using prefix search on the last word.
- **Sync**: a debounced `search.sync` job sends only changed products (price, stock, title) in batches every 30–60 s. A full re-index runs nightly as a safety net, since Postgres is the source of truth.
- **Sizing and ops**:
  - A single node is enough up to about 1M product documents (inference; sharding is Enterprise-only and should not be needed).
  - Co-locate it with the app on the 50k and 500k configurations, and give it its own server at 2M.
  - Back up with nightly dumps uploaded to object storage (S3-streaming snapshots are Enterprise-only). The index can be rebuilt from Postgres in any case.
- **Rejected alternatives**:
  - **Typesense**: very capable. But with `locale: "ro"` diacritics are preserved (accent-exact ranking with typo fallback), while the default locale strips diacritics but stems with English rules. That is a trade-off to tune, and Typesense's licence was not verified here.
  - **Elasticsearch/OpenSearch**: richest linguistic control, but JVM operations and RAM cost are too much for 2 people.
  - **PostgreSQL FTS + pg_trgm**: good for the admin back-office, for "did you mean" via trigram similarity, and as a fallback. Weaker typo tolerance and facet-count performance at public-search scale.
  - **Meilisearch Cloud and Typesense Cloud**: fine if self-hosting becomes a burden; roughly $20–300/month at these sizes, per unverified third-party data.

### Gaps
- Romanian analyzer behaviour in OpenSearch and Elasticsearch was not verified in this session.
- Typesense's licence, Meilisearch RAM and disk needs at 1M documents, and first-party Meilisearch/Typesense Cloud price lists were not verified.
- Whether Meilisearch's `localizedAttributes` would change behaviour for Romanian was not checked.
- ParadeDB / `pg_search` (BM25 inside Postgres) was not evaluated.

## 5. Crawl and feed orchestration: job system choice, per-domain politeness, ingestion pipeline, idempotency, backfills, monitoring, extractor registry and testing

### Takeaway
For a 2-person team, run **TypeScript workers on pg-boss 12.x**. It is Postgres-backed, so it needs no extra datastore, and it provides cron schedules, singleton and idempotency keys, dead-letter queues and OpenTelemetry. Use **Crawlee 3.18.x** (the stable line; 4.0 is still a release candidate) for HTML and JSON-LD crawling, with robots.txt and sitemap support. Move to BullMQ 6.x on Valkey/Redis only if queue throughput outgrows Postgres. Temporal, Airflow and Prefect add infrastructure and a second mental model without enough benefit at this size. Every stage should be idempotent and replayable from raw files kept in object storage.

### Cited Findings
- **BullMQ**: latest **v6.5.0** (2026-10-26). v6.4.0 (2026-10-21) added reliable realtime messaging, and v6.3.19 made deduplication checks faster. There are Python, Elixir, PHP and Rust ports — [BullMQ releases](https://github.com/taskforcesh/bullmq/releases)
- **pg-boss**: Source: [pg-boss releases](https://github.com/timgit/pg-boss/releases)
  - Latest **12.38.0** (13 Oct; the year isn't shown, but it is adjacent to companion releases on 15 Oct): batched maintenance and expiry, and a 1,000-row default page size for list reads.
  - 12.37.0: concurrent `upsert()` calls with the same `singletonKey` no longer duplicate jobs on `standard`, `singleton` and `key_strict_fifo` queues.
  - **12.36.0 adds OpenTelemetry tracing and metrics.**
  - Dead-letter queues support redrive, and `flow()` parents block children.
- **Crawlee**: Source: [Crawlee releases](https://github.com/apify/crawlee/releases)
  - Latest stable **v3.18.2** (2026-09-29). **v4.0.0-rc.1** (2026-10-06) is a pre-release with a DomCrawler and `@crawlee/otel`, and treats a robots.txt 404 as allow-all.
  - `respectRobotsTxtFile` supports a custom userAgent (3.15.3).
  - Sitemap tooling: `discoverValidSitemaps` (3.16.0), `sitemapFilter` (3.17.0), and sitemap indexes as input (3.18.0).
  - `AdaptivePlaywrightCrawler` falls back to a browser only when needed.
- **RFC 9309 (robots.txt)**: Source: [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html)
  - Crawlers "SHOULD NOT use the cached version for more than 24 hours".
  - The parse limit "MUST be at least 500 kibibytes".
  - On a 4xx response the crawler "MAY access any resources". On a 5xx it "MUST assume complete disallow".
  - Crawlers should follow at least 5 redirects.
  - User-agent matching is case-insensitive, with fallback to `*`.
  - **crawl-delay is not part of the standard**; crawlers "MAY interpret other records".
- **extruct** (BSD-3-Clause) extracts JSON-LD, microdata, RDFa (experimental), OpenGraph, microformats and Dublin Core; `uniform=True` normalizes the output — [scrapinghub/extruct](https://github.com/scrapinghub/extruct)
- **changedetection.io**'s restock/price mode reads JSON-LD, microdata and OpenGraph first, then falls back to text heuristics ("Sold Out") — [changedetection.io restock & price docs](https://www.mintlify.com/dgtlmoon/changedetection.io/features/restock-price-monitoring)

### Inferences
- **Choice matrix**:

| Option (Oct 2026) | Extra infra | Fit for Pretoscop |
|---|---|---|
| **pg-boss 12.38** | none (Postgres) | **Default.** Enqueue in the same transaction as data changes (outbox-free), cron, singleton keys for debouncing per product, DLQ, OTel |
| BullMQ 6.5 | Redis/Valkey | Upgrade path for high-throughput fan-out (100s of jobs/s sustained) or Redis-based rate limiting |
| Temporal | Temporal cluster + DB, or Temporal Cloud | Overkill. Durable multi-day workflows aren't needed; heavy learning curve |
| Celery / RQ | Redis/RabbitMQ + Python | Only if the backend were Python |
| Airflow / Prefect | scheduler + metadata DB (+ UI) | Batch DAG schedulers. Feeds are simple cron + fan-out; extra runtime |

- **Queues and jobs**:
  - `feed.fetch` (cron per feed, 1–4×/day).
  - `feed.parse` (per downloaded file, key = content sha256).
  - `offers.normalize` (1k-row chunks).
  - `match.offer` (batched).
  - `llm.batch.submit` / `llm.batch.poll`.
  - `crawl.page` (per URL, under per-domain limits).
  - `price.product_recompute` (singletonKey = product_id, debounced).
  - `alerts.evaluate`.
  - `search.sync` (batched every 30–60 s).
  - `images.process`.
  - `maintenance.*` (partitions, nightly rollups, Parquet exports, Icecat refresh).
- **Feed pipeline**:
  1. Download with conditional GET (ETag/Last-Modified), stream to object storage (`raw/{shop}/{yyyy}/{mm}/{dd}/{sha256}.xml.gz`), and skip if the sha256 was already seen.
  2. Stream-parse XML (sax-style) or CSV (streaming CSV parser), never loading the whole file into memory.
  3. Normalize (Sections 1 and 3).
  4. Upsert offers `ON CONFLICT (shop_id, shop_sku)`.
  5. Write change events only.
  6. Match new or identity-changed offers.
  7. Recompute product aggregates.
  8. Evaluate alerts.
  9. Sync search.
  10. Write `ingest_run` statistics.
- **Deactivation rule**: an offer missing from 2 consecutive *successful, full-size* feed runs becomes inactive. If the feed row count drops more than 30% against its 7-day median, hold the run instead of deactivating.
- **Idempotency keys**:
  - `feed.fetch:{feed_id}:{yyyymmddhh}`
  - `feed.parse:{sha256}`
  - `price_event` primary key `(offer_id, observed_at)` + `ON CONFLICT DO NOTHING`
  - LLM batch `custom_id = sha1(offer_id|product_id|prompt_version)`
  - alert notifications keyed by `(alert_id, yyyy-mm-dd)`
- **Backfills and replays**: re-run normalize, match and history from the stored raw files with `replay=true`, which suppresses alerts and notifications and uses `observed_at` from the original run.
- **Per-domain politeness**: a `crawl_domain` table with:
  - `max_concurrency` (default 1), `min_interval_ms` (3–10 s), a nightly window for full crawls (01:00–07:00 Europe/Bucharest), and a daily request budget.
  - robots.txt cached for at most 24 h per RFC 9309. A robots 5xx means pause the domain.
  - Honour `Retry-After`, exponential backoff on 429/503, and a circuit breaker after N consecutive failures.
  - A descriptive user agent with a contact URL (`PretoscopBot/1.0 (+https://pretoscop.ro/bot)`).
  - Prefer feeds, then sitemaps, then link discovery.
  - Implement this with one Crawlee crawler per domain group, using its concurrency and rate settings (verify the exact option names: `maxConcurrency`, `maxRequestsPerMinute`), with pg-boss keeping the global schedule.
- **Extractor registry**:
  - `packages/extractors/{shop}/` holds `meta.json` (domains, URL patterns, version, owner, last verified) and `extract.ts`.
  - A generic JSON-LD/microdata extractor is the default. Shop overrides are only for missing fields such as shipping, old price or marketplace seller.
  - Version the extractors and record `extractor_version` on each `ingest_run`.
- **Testing with recorded fixtures**:
  - `__fixtures__/{shop}/{case}.html` with `{case}.expected.json`, run as Vitest snapshot tests in CI.
  - A weekly canary job fetches 5 live URLs per shop and compares *field presence and type* (not values) with expectations, raising an alert on drift.
- **Monitoring and SLOs**:
  - Per-shop freshness: at least 95% of active offers observed within 26 h, and the top 10% most-viewed products within 6 h.
  - Feed success rate and parse-reject rate (alert above 2%).
  - Price-change spike breaker (Section 3-E).
  - Match backlog and LLM batch latency.
  - Review-queue size.
  - Errors go to Sentry, traces to OTel. Ops alerts go to a private Telegram channel.
- **Proxies**: none by default. If a shop blocks polite crawling and has no feed, approach it for a feed or affiliate programme rather than escalating to residential proxies. Proxies are $3–15/GB on pay-as-you-go plans (Section 7), and legal and ToS questions are covered in `legal_and_regulatory.md`.

### Gaps
- Current versions, licences and hosted pricing for Temporal, Apache Airflow, Prefect and Celery were not verified; the web-search budget was exhausted.
- Romanian affiliate feed formats (2Performant, Profitshare and others) were not covered in this file.
- The exact names of Crawlee's per-domain concurrency and rate options were not re-verified in the v3.18 docs.
- How many Romanian retailers expose complete schema.org `Product`/`Offer` JSON-LD was not measured (e.g. gtin13, priceCurrency, availability, shipping details). This needs a sampling crawl.

## 6. Application stack: framework, SEO rendering, ORM, API, auth, email/push, image CDN, cache, observability, CI/CD, IaC, backups, plus the recommended default stack and rejected alternatives

### Takeaway
The default is a **TypeScript monorepo**:
- Next.js 16.3.x App Router, self-hosted in Docker behind Cloudflare
- PostgreSQL 18 with Drizzle ORM (or Prisma 7)
- pg-boss and Crawlee workers
- Meilisearch
- Better Auth
- Amazon SES (with Resend optional)
- Web Push plus a Telegram bot
- Image derivatives in Cloudflare R2
- Sentry plus OpenTelemetry
- GitHub Actions deploying Docker images to Hetzner

A small Python sidecar handles only embeddings and ML. The reasoning is one language across web, workers, extension and bot, with the best-documented, most AI-agent-familiar tools, plus SSR that lets CDN-cached product pages scale to millions of URLs without per-request platform fees.

### Cited Findings
- **Next.js**: Sources: [Next.js 16.2](https://nextjs.org/blog/next-16-2); [Next.js blog index](https://nextjs.org/blog?page=1)
  - 16.2 (2026-03-18): faster `next dev` startup, more than 200 Turbopack fixes, and agent-related improvements.
  - **16.3** shipped 2026-08-03, followed by a security release for 16.3 and 15.5 (2026-08-26).
- **Auth**:
  - Auth.js (NextAuth) is now maintained by the Better Auth team (2025-09-22). New projects are recommended to use Better Auth, except for stateless sessions without a database — [Better Auth: Auth.js joins Better Auth](https://www.better-auth.com/blog/authjs-joins-better-auth)
  - Better Auth joined Vercel (2026-07-07) and says Vercel "shares our commitment to keeping auth open source, framework and platform agnostic" — [Better Auth joins Vercel](https://better-auth.com/blog/better-auth-joins-vercel)
- **Prisma ORM 7** (2025-11-19): Rust-free TypeScript client, ESM, a `prisma.config.ts` file, a reported 3× faster query execution and 90% smaller bundles — [Prisma blog](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- **Drizzle ORM 1.0** is still at release candidate (up to 1.0.0-rc.4). A CVE in identifier escaping is fixed in 0.45.2 and 1.0.0-beta.20 — [releasealert: drizzle-orm](https://releasealert.dev/npmjs/_/drizzle-orm); [Drizzle latest releases](https://orm.drizzle.team/docs/latest-releases)
- **Redis 8** has been available under the OSI-approved AGPLv3 since 2025-05-01, in addition to RSALv2 and SSPL — [Redis blog](https://redis.io/blog/agplv3/)
- **Email**:
  - Resend: Free is 3,000 emails/month (100/day). Pro is $20 for 50k or $35 for 100k. Scale runs from $90 for 100k to $650 for 1M and $1,150 for 2.5M. Overage is $0.90–0.46 per 1k — [Resend pricing](https://resend.com/pricing)
  - Amazon SES: **$0.10 per 1,000 emails** à la carte, and a standard dedicated IP is $24.95/month — [SES pricing](https://aws.amazon.com/ses/pricing/)
- **Sentry**: Developer is free (1 user, 5k errors). Team is $29/month ($26 billed annually). Business is $89/month ($80 billed annually) — [Sentry pricing](https://sentry.io/pricing/)
- **Cloudflare Workers Paid**: $5/month including 10M requests and 30M CPU-ms, then $0.30 per M requests and $0.02 per M CPU-ms. KV and D1 are also priced on the same page — [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- **Vercel Pro**: $20/month with $20 of included credit. Fast Data Transfer is $0.15/GB after 1 TB, CDN requests $2/M after 10M, function invocations $0.60/M, ISR reads $0.40/M, **ISR writes $4/M**, and image transformations $0.05 per 1k — [Vercel pricing](https://vercel.com/pricing)
- **iOS/iPadOS 16.4** added Web Push for web apps added to the Home Screen. Permission prompts require user interaction, and it uses the Push API, the Notifications API and Service Workers — [WebKit blog (2023-02-16)](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- **OTel support**: pg-boss added OpenTelemetry in 12.36.0 — [pg-boss releases](https://github.com/timgit/pg-boss/releases). Crawlee 4.0 RC adds `@crawlee/otel` — [Crawlee releases](https://github.com/apify/crawlee/releases)

### Inferences

#### Recommended default stack (versions as of 2026-10-27; pin in lockfiles and re-check patch versions at implementation time)
| Layer | Default | Why | Rejected alternative (reason) |
|---|---|---|---|
| Language | TypeScript (Node.js current LTS; verify version); Python 3.12+ sidecar for ML only | One language for web, workers, extension and bot. ML libraries are Python-first | Python-only backend (SSR/SEO ecosystem weaker and the frontend still needs TS); split-language core |
| Web/SSR | **Next.js 16.3.x App Router**, `next start` in Docker | SSR + streaming, largest docs and agent familiarity, route handlers for the API | Remix/React Router 7, SvelteKit, Astro (viable, smaller ecosystem for this use; not researched in depth); Vercel hosting (cost/lock-in at millions of pages, see below) |
| DB | **PostgreSQL 18.x** + pg_trgm + unaccent + **pgvector 0.8.7** + pg_partman | One store for catalog, history, queue and vectors | TimescaleDB (optional later, self-hosted); ClickHouse (premature); PG19 (not GA in sources) |
| ORM / migrations | **Drizzle ORM** (stable 0.45.x until 1.0 GA) + hand-written SQL migrations for partitions, BRIN and functions | SQL-first, typed, easy raw SQL for partitioned tables | **Prisma 7** (good alternative: Rust-free, well documented); SQLAlchemy (Python) |
| Jobs | **pg-boss 12.x** | No Redis; cron, singleton keys, DLQ, OTel | BullMQ 6.x (later); Temporal, Airflow, Prefect (ops overhead) |
| Crawling | **Crawlee 3.18.x** (Cheerio first, Playwright only when needed) | robots.txt, sitemaps, sessions, adaptive browser fallback | Scrapy (Python); raw fetch scripts |
| Structured data | Own TS JSON-LD parser; extruct in the Python sidecar for microdata/RDFa edge cases | Most needed fields are in JSON-LD (verify per shop) | — |
| Search | **Meilisearch CE 1.56.x** self-hosted | Typo tolerance, facets, diacritic folding, MIT licence | Typesense, Elasticsearch/OpenSearch, PG FTS (Section 4) |
| Embeddings | multilingual-e5 or Qwen3-Embedding-0.6B in the Python sidecar (e.g. a sentence-transformers or TEI container); vectors in pgvector `halfvec` | Multilingual, CPU-servable | Hosted embedding APIs (not costed here) |
| LLM | **claude-haiku-5-5** (Batch) for verification and extraction; **claude-sonnet-5-5** for escalations | Cheapest capable option; 50% batch discount | claude-opus-5-5 only for building and adjudicating the eval set |
| Auth | **Better Auth** (email magic link + Google) | Successor path for Auth.js; framework-agnostic; sessions in Postgres | Clerk (paid SaaS, lock-in; pricing not researched); Supabase Auth (ties to Supabase); Auth.js (maintenance mode) |
| Email | **Amazon SES** for alerts, Resend optional for DX | $0.10/1k at volume | Postmark (not researched) |
| Push / bot | Web Push (VAPID, standard APIs) + Telegram Bot API | Free channels | OneSignal (not researched) |
| Images | sharp/libvips derivatives → **R2** + Cloudflare CDN | Zero egress, cents per month | Cloudflare Images (~$1.5k for 3M unique transformations); Vercel image optimization ($0.05/1k) |
| Edge | **Cloudflare** (DNS, CDN cache rules for HTML, WAF, bot management basics) | Absorbs crawler and user traffic in front of one origin | Vercel CDN |
| Cache | None at MVP (Postgres + edge cache + in-process LRU); Valkey or Redis 8 later for rate limits and sessions | Fewer moving parts | Redis from day 1 |
| Observability | **Sentry** (errors) + **OpenTelemetry** traces (pg-boss, Crawlee, Next.js) → Grafana stack (self-hosted, or a cloud free tier; verify) | Mainstream | Datadog, New Relic (cost) |
| CI/CD | **GitHub Actions**: typecheck, tests (incl. extractor fixtures), Docker build → GHCR → deploy over SSH (or Kamal) with gated migrations | Mainstream, well documented | — |
| IaC | OpenTofu/Terraform for Cloudflare and Hetzner Cloud resources; Ansible or cloud-init for dedicated servers | Reproducible rebuilds | Click-ops |
| Backups | **pgBackRest or WAL-G**: continuous WAL archiving + base backups to Hetzner Object Storage (other location) + monthly copy to R2 (other provider); monthly restore test; nightly Meilisearch dump | Point-in-time recovery | Provider snapshots only |

#### Repository layout
```
apps/web          Next.js (public site + /admin + /api/v1 REST)
apps/worker       pg-boss consumers, Crawlee crawlers, feed parsers, matching orchestration
apps/extension    MV3 extension (Chrome/Edge/Firefox builds)
apps/bot          Telegram bot (webhook)
packages/db       Drizzle schema + SQL migrations (partitions, BRIN, functions)
packages/core     normalizers (RO text, GTIN, MPN, price parsing), matching rules, shipping calculator
packages/extractors  per-shop extractors + fixtures
services/ml       Python FastAPI: embeddings, classifier scoring, (optional) extruct
```

#### SEO rendering at millions of URLs
- Product pages are server-rendered on demand and cached at Cloudflare. Use `Cache-Control: public, s-maxage=900, stale-while-revalidate=86400` for anonymous traffic, with a Cloudflare cache rule so HTML is cached (verify the rule type).
- Purge by URL through the Cloudflare API when a product's best price or stock changes materially. Otherwise let the TTL expire.
- Sitemaps are sharded per category and per product-ID range (sitemap index + gzip, staying under Google's per-file URL limit; verify the current limit). Products in `noindex` state stay out of sitemaps.
- **Vercel ISR cost check at 2M offers** (~670k products), using the cited prices, gives roughly **$300–600/month** before database, workers and search. Items: 1 ISR write per product per day ≈ 20M writes ≈ $80; about 10M page and bot views → CDN requests ≈ $80; about 1.5 TB transfer ≈ $75; plus function CPU (unknown). At 500k offers it would be about $20–80 on top of the $20 plan. Vercel is not prohibitive, but the self-hosted Node server behind Cloudflare costs nothing extra on servers that are needed anyway, and it avoids bot-traffic billing risk.

#### API design
- REST/JSON under `/api/v1`, documented with OpenAPI:
  - `GET /lookup?domain=&sku=&gtin=&url=` for the extension
  - `GET /products/{id}`
  - `GET /products/{id}/offers`
  - `GET /products/{id}/history`
  - `POST /alerts`
- GET endpoints carry CDN cache headers. Use tRPC only for internal admin calls, or skip it; REST is cacheable and works for the extension, bot and PWA alike.

#### Python vs TypeScript trade-off
- Python is better for Splink, sentence-transformers, LightGBM and extruct. TypeScript is better for Next.js SSR/SEO, the extension, Crawlee and keeping a single codebase.
- Hence TypeScript for the core, plus one stateless Python service with no database ownership. The coding agent then works in one main language, and the ML service has a narrow HTTP contract.

### Gaps
- Not verified in this session: the Node.js LTS line in Oct 2026, the Better Auth version, the Drizzle 1.0 GA date, and the Next.js release after 16.3.
- Not researched: pricing for Clerk, OneSignal, Postmark, imgproxy, Grafana Cloud and GitHub Actions.
- Not verified: Cloudflare HTML cache-rule configuration and the plan level required, and Google's sitemap URL-per-file limit.

## 7. Hosting and cost: options and monthly estimates at 50k, 500k and 2M offers (prices as of 2026-10-27)

### Takeaway
Hetzner repriced twice in 2026. On 1 April the whole portfolio went up, existing customers included. On 15 June, prices for new orders of dedicated-vCPU cloud servers rose about 2–2.7×, and as of 1 October the cheap CX/CAX cloud lines were listed as "currently not available". After that, **Hetzner dedicated servers** are the best value: AX41/EX44-LTD about €57, AX42 about €79–97, AX102 about €159–257 per month.

Estimated all-in monthly cost for the self-hosted default:

| Scale | Estimated monthly cost |
|---|---|
| 50k offers | **≈ €70–100** |
| 500k offers | **≈ €230–385** |
| 2M offers | **≈ €760–1,630** |

Managed PaaS equivalents run about 2–3× higher. The largest swing items at the top end are LLM matching, email volume and any proxy spend.

### Cited Findings
- **Hetzner 2026 price rounds**:
  - 1 April 2026: an adjustment across cloud, dedicated, storage and add-ons, applying to existing customers too; the cloud increase is reported at about 30–37% — [heise](https://heise.de/-11185981); [igor'sLAB](https://www.igorslab.de/en/hetzner-to-significantly-increase-prices-for-cloud-and-dedicated-servers-from-april-2026/)
  - 15 June 2026: aimed at the performance and dedicated-vCPU cloud lines; it applies only to new orders and rescales, and setup fees for most dedicated servers dropped — [heise (second round)](https://heise.de/-11333037); [WZ-IT](https://wz-it.com/en/blog/hetzner-price-increase-june-2026-cpx-ccx-alternatives/)
- **Official new prices from 15 June 2026** (Germany/Finland, €/month excl. VAT and IPv4; old → new):
  - **CX23** 3.99→5.49; CX33 6.49→8.49; CX43 11.99→15.99; CX53 22.49→29.49.
  - **CAX11** 4.49→5.99; CAX21 7.99→10.49; CAX31 15.99→20.99; CAX41 31.49→40.99.
  - **CPX22** 7.99→19.49; CPX32 13.99→35.49; CPX42 25.49→69.49; CPX52 36.49→100.49; CPX62 50.49→129.99.
  - **CCX13** 15.99→42.99; CCX23 31.49→85.99; CCX33 62.49→138.49; CCX43 124.99→275.99; CCX53 249.99→533.49; CCX63 374.49→853.49.
  - **Dedicated**: AX42-1 €97.30; AX102-1 €257.30; EX63-1 €147.30; AX41-1-LTD €57.30; EX44-1-LTD €57.30.
  - Source: [Hetzner docs: price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
- **Hetzner Cloud page** (2026-10-27): Cost-Optimized from €5.99, shown under a "currently not available" heading; Regular Performance from €6.49; General Purpose (dedicated vCPU) from €43.49 — [Hetzner Cloud](https://www.hetzner.com/cloud). CX and CAX were "Currently not available" as of 1 Oct 2026 — [WZ-IT](https://wz-it.com/en/blog/hetzner-price-increase-june-2026-cpx-ccx-alternatives/)
- **Hetzner AX matrix page**: AX41 (Ryzen 5 3600, 64 GB) from €59.00 with €0 setup; **AX42** (Ryzen 7 PRO 8700GE, 64 GB DDR5 ECC) from €79.00 to €99.00 with €49 setup; **AX102** (Ryzen 9 7950X3D, 128 GB) €159–259 with €129 setup; AX162 (EPYC 9454P) €319–614 with €304 setup — [Hetzner AX matrix](https://www.hetzner.com/dedicated-rootserver/matrix-ax/). _Conflict:_ the price-adjustment page lists AX42-1 at €97.30, so the price depends on configuration (disk options) and the page; budget the higher figure.
- **Hetzner Object Storage**: €6.49/month including 1 TB of storage and 1 TB of egress; €1/TB of extra egress; ingress and S3 API calls free; locations FSN1, HEL1, NBG1 — [Hetzner Object Storage](https://www.hetzner.com/storage/object-storage/)
- **Fly.io**: Source: [Fly.io pricing](https://docs.fly.io/about/pricing)
  - Machines: shared-cpu-1x 1 GB $6.70/month; shared-cpu-2x 2 GB $13.39; performance-1x 2 GB $33; performance-2x 4 GB $66 (US regions; other regions vary).
  - Volumes $0.15/GB-month; egress $0.02/GB in North America and Europe.
  - Managed Postgres $38–1,922/month.
- **Railway**: Hobby $5 and Pro $20, each with matching included usage; **$20 per vCPU-month and $10 per GB-RAM-month**; volumes $0.15/GB-month; egress $0.05/GB — [Railway pricing](https://railway.com/pricing)
- **Supabase**: Pro from $25 including $10 of compute credit; compute Micro $10, Small $15, Medium $60, Large $110 (2 dedicated vCPU, 8 GB), **XL $210 (4 vCPU, 16 GB)**, 2XL $410 (8 vCPU, 32 GB); disk $0.125/GB; 250 GB egress included, then $0.09/GB — [Supabase pricing](https://supabase.com/pricing)
- **Neon**: Launch **$0.106 per CU-hour**, Scale $0.222 per CU-hour; storage $0.35/GB-month; 500 GB egress then $0.10/GB; Launch autoscales up to 16 CU (64 GB RAM) — [Neon pricing](https://neon.com/pricing)
- **Other services** (Vercel, Cloudflare R2/Images/Workers, ClickHouse Cloud, Claude API, Resend, SES, Sentry): figures in Sections 1, 2, 3 and 6.
- **Proxies** (aggregator and vendor sources, which conflict): residential about $3–15/GB on pay-as-you-go, falling to about $0.50–4/GB at enterprise volumes; datacenter about $0.50–2 per IP per month — [AIMultiple](https://aimultiple.com/proxy-pricing); [Databay](https://databay.com/blog/how-much-do-residential-proxies-cost)

### Inferences

#### Workload assumptions
These are mine, to be replaced with measurements:
- Products ≈ offers / 3.
- Feeds refreshed 1–4× per day; non-feed shops crawled daily, with the top 10% of products 4× per day.
- Page views per month: about 50k (S), about 1M (M) and 5–10M (L), with bots on top.
- Alert emails per month: 5k / 100k / 500k.
- LLM volumes as in Section 1-G.
- Hetzner prices are new-order prices from the June 2026 table, excluding VAT and IPv4 (the IPv4 fee is not included).
- No EUR/USD rate was sourced; totals assume roughly 1 EUR ≈ 1.1–1.2 USD.

#### Self-hosted default (recommended)
| Line item | **S: 50k offers** | **M: 500k offers** | **L: 2M offers** |
|---|---|---|---|
| Servers (Hetzner dedicated, Falkenstein/Nuremberg/Helsinki) | 1× AX41-1-LTD or EX44-1-LTD **€57.30** (all-in-one: PG, Meilisearch, web, workers) | AX42-1 €97.30 (PG + web) + AX41-1-LTD €57.30 (workers, crawl, ML, Meilisearch) = **€154.60** | AX102-1 €257.30 (PG primary) + AX42-1 €97.30 (PG replica + Meilisearch) + 2× AX41-1-LTD €114.60 (web/API + workers/ML) = **€469.20** |
| One-time setup fees (AX matrix) | €0–49 | ≈ €49 | ≈ €180–260 |
| Object storage (backups, raw feeds, Parquet) | €6.49 | €6.49 | €6.49–15 |
| Cloudflare (Free plan + optional Workers Paid) + R2 images | $0–6 | $5–11 | $12–35 |
| Email (SES; Resend as alternative) | ≈ $0.5 (Resend Free/Pro $0–20) | ≈ $10 (Resend $35) | ≈ $50 (Resend $350) |
| Errors (Sentry) | $0 (Developer) | $29 (Team) | $89 (Business) |
| LLM matching (Claude Batch, ongoing) | $4–12 | $36–120 | $140–480 |
| Proxies | $0 | $0–50 | $50–300 |
| Domain and miscellaneous | ≈ $2 | ≈ $2 | ≈ $2 |
| **Monthly total (approx.)** | **€64 + $7–40 ≈ €70–100** | **€161 + $82–247 ≈ €230–385** | **€476–484 + $343–1,256 ≈ €760–1,630** |
| One-time LLM backfill | ≈ $12–40 | ≈ $120–400 | ≈ $480–1,600 |

- **MVP (200k offers)** sits between S and M. Start on S hardware with one AX42 instead of the LTD box if it is available, then split out the workers server at around 300–500k offers.
- **Cloud-only fallback**: if dedicated LTD servers are sold out, CPX32 (€35.49) + CPX22 (€19.49) ≈ €55 gives far less RAM and CPU than one AX41 at the same price. That is a direct consequence of the June 2026 repricing.
- **Ops caveats of dedicated servers**:
  - Disk failures: RAID1 NVMe plus pgBackRest PITR.
  - Rebuild time: keep Ansible or cloud-init so a server can be rebuilt in under 2 h.
  - No managed failover: at M and L, keep a streaming replica and a documented promotion runbook.
  - If operations become the bottleneck, the first thing to move to managed is Postgres (Supabase or Neon). Note TimescaleDB's limits there.

#### Managed/PaaS comparison at 500k offers (illustrative, list prices)
| Component | Option | ≈ Monthly |
|---|---|---|
| Web | Vercel Pro $20 + overages (Section 6) | $20–100 |
| Postgres | Supabase Pro + XL compute ($25 + $210 − $10 credit) + 100 GB disk | ≈ $236 |
| …or | Neon Launch (4 CU always-on: 4 × 730 h × $0.106) + 100 GB storage | ≈ $345 |
| Workers | Railway (4 vCPU + 8 GB: $80 + $80) or Fly performance-2x ×2 ($132) | $130–180 |
| Search | Meilisearch Cloud or Typesense Cloud (third-party price data) | $30–300 |
| Plus | Email, Sentry, LLM, R2 (as above) | $80–190 |
| **Total** | | **≈ $500–1,100** vs ≈ €230–385 self-hosted |

#### Latency and location
Serve anonymous HTML and API GETs from the Cloudflare edge, so origin location mostly affects cache misses, logged-in pages and admin. A German or Finnish origin is acceptable for a Romanian audience. Measuring RTT from Bucharest ISPs before launch is still worthwhile (see Gaps).

### Gaps
- Hetzner IPv4 add-on price and current stock of AX41/EX44-LTD.
- Network latency between Falkenstein/Nuremberg/Helsinki and Romanian ISPs, and prices of Romanian hosting providers (e.g. Bucharest datacenters), were not researched; the search budget was exhausted.
- Cloudflare paid plan prices (Pro/Business) and whether HTML caching rules need a paid plan were not verified.
- First-party Meilisearch Cloud and Typesense Cloud price lists were not readable; the figures above come from third parties.
- No exchange rate was sourced; EUR and USD totals are combined with an assumed rate.

## 8. Browser extension ("istoric preț" overlay on emag.ro, altex.ro, etc.) and cheaper channels (Telegram bot, PWA): MV3 architecture, store policies, crowd-sourced reporting, ports

### Takeaway
Build a Manifest V3 extension:
- Host access is limited to the supported Romanian retailer domains and the Pretoscop API.
- A per-domain content script extracts the product identity (JSON-LD `gtin13`/`sku`/`mpn`, canonical URL) and renders a Shadow-DOM overlay with the price history and the best offers.
- Data comes from a CDN-cacheable REST lookup routed through the service worker.

Constraints:
- **Do not inject or rewrite affiliate links or codes on retailer pages.** Chrome policy requires a related user action and a direct user benefit, and its listed violations include affiliate links "when no discount, cashback, or donation is offered". Send users to Pretoscop pages instead, where affiliate links are disclosed.
- Crowd price reporting should be opt-in, minimal, and used only to trigger verification crawls.

Ports and cheaper channels:
- Firefox (background scripts instead of a service worker) comes next.
- Safari ($99/yr Apple Developer Program, Xcode wrapper) comes later.
- A Telegram bot and a PWA with Web Push (iOS 16.4+ once the app is added to the Home Screen) are nearly free channels.

### Cited Findings
- **Chrome Web Store affiliate ads policy** (last updated 2025-03-11). Source: [Chrome Web Store: Affiliate Ads policy](https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads)
  - Affiliate programmes must be "described prominently" in the store listing, in the user interface, and before installation.
  - "It is not permitted to inject affiliate links without related user action"; "Related user action is required before the inclusion of each affiliate code, link, or cookie".
  - Listed violations: inserting affiliate links when no discount, cashback or donation is offered; continuous background injection; silently updating shopping cookies; adding or replacing affiliate codes or promo codes without the user's explicit knowledge.
- **Limited Use and data policies**. Sources: [Chrome Web Store: Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use); [Chrome Web Store: Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
  - Extensions may only collect data "necessary for the extension's disclosed single purpose".
  - "Collection and use of web browsing activity is prohibited, except to the extent required for a user-facing feature" that is prominently described.
  - Developers need an accurate privacy policy, must request "the narrowest permissions necessary", and must publish an affirmative Limited Use statement on a website.
  - The requirements also cover aggregated, anonymized or derived data.
- **Developer registration** requires a one-time registration fee (the amount isn't shown on the page) and a developer email that cannot be changed later. Only supported countries can register, and contact-email verification is required — [Chrome: Register](https://developer.chrome.com/docs/webstore/register); [Chrome: Set up account](https://developer.chrome.com/docs/webstore/set-up-account)
- **Firefox** does not support `background.service_worker`; it runs `background.scripts` or `background.page`. Since Firefox 121 the background page starts even when a `service_worker` key is present. Safari accepts both forms — [MDN: manifest.json background](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- **Safari** porting uses `xcrun safari-web-extension-converter`, which developers report produces noisy "unsupported key" warnings. `importScripts` in service workers can behave differently from Chrome — [Apple Developer Forums 712328](https://developer.apple.com/forums/thread/712328); [Apple Developer Forums 710164](https://developer.apple.com/forums/thread/710164). The **Apple Developer Program costs 99 USD/year**, and organizations need a D-U-N-S number — [Apple: Enrollment](https://developer.apple.com/support/enrollment/)
- **Telegram Bot API limits**: about 1 message per second per chat; 20 messages per minute per group; broadcasts of about **30 messages per second**. Paid broadcasts allow up to 1,000 per second at 0.1 Stars per message above 30/s, and require 100k Stars and 100k MAU — [Telegram Bot FAQ](https://core.telegram.org/bots/faq)
- **Web Push on iOS/iPadOS 16.4+** works for Home Screen web apps; the permission request must follow direct user interaction — [WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- **Precedent**: changedetection.io offers an optional Chrome extension alongside its server — [changedetection.io](https://github.com/dgtlmoon/changedetection.io)

### Inferences
- **Architecture**:
  1. The content script (`matches` limited to supported shop domains, `run_at: document_idle`) detects a product page via a JSON-LD `Product` node or a URL regex per shop. It extracts `{domain, canonical_url, sku, gtin, mpn, title, price}`.
  2. It messages the background service worker.
  3. The service worker calls `GET https://api.pretoscop.ro/v1/lookup?d={domain}&sku=…&gtin=…`, with no cookies and a cache key on the query. Making the fetch from the service worker, with host permission for the API, avoids page-origin CORS limits on content-script fetches (verify current Chrome behaviour).
  4. The response contains `{product_id, slug, low_30d, low_all_time, median_30d, best_offers[≤5], history[≤180 points], updated_at}`.
  5. The content script renders a **Shadow DOM** card with a sparkline, a "minim 30 zile" badge and the top offers, plus a link to `pretoscop.ro/p/...`.
  6. A local cache (`chrome.storage.session` or an in-memory LRU) avoids repeat lookups.
- **Manifest essentials**:
  - `manifest_version: 3`
  - `permissions: ["storage"]`
  - `host_permissions: ["https://api.pretoscop.ro/*"]`
  - content scripts limited to the retailer domains
  - `optional_host_permissions` for opting into new shops
  - no `tabs`, `history` or `<all_urls>`
  - Build per-browser manifests (Chrome/Edge: `service_worker`; Firefox: `scripts`) with a cross-browser build tool. Candidates such as WXT or Plasmo were not verified in this session.
- **Single purpose statement**: "Afișează istoricul prețului și cele mai bune oferte din magazinele românești pe pagina produsului." Everything else (alerts, login) must clearly serve that purpose.
- **Crowd-sourced reporting** (opt-in, Keepa-like only in spirit):
  - Send `{domain, sku/gtin, price, currency, availability, observed_at}` only for supported product pages. No full URL with query string, no cookies, no user ID by default.
  - On the server, accept a report only if it maps to a known offer and lies within a plausibility band. Treat it as a *signal* that schedules a verification crawl, and never write it directly into the authoritative history. This keeps the history reproducible and limits poisoning.
  - Disclose it in the listing, the UI and the privacy policy, with the Limited Use statement on the website.
  - Rate-limit per install, and give each install an anonymous random ID used for abuse control only.
- **Affiliate approach**:
  - No affiliate parameters in links that point at retailer sites from inside the extension, unless a clear user benefit (cashback or discount) exists and is disclosed per the policy.
  - Default: the overlay links to the Pretoscop product page, where the normal site's disclosed affiliate links apply.
  - Have this reviewed against the policy text and the legal notes (`legal_and_regulatory.md`).
- **Release plan**:
  - Chrome and Edge first (same package; Edge Add-ons store not verified here).
  - Firefox AMO next.
  - Safari only after traction ($99/yr, Xcode wrapper, App Store review).
  - Ship the extension after the website has enough coverage (at least 70% of top eMAG/Altex electronics SKUs matched), because "no data" overlays generate uninstalls.
- **Telegram bot**:
  - Commands `/urmareste <link sau EAN>`, `/alerte`, `/sterge`, plus an inline search.
  - Notifications fan out through a queue at ≤25 messages/s, under Telegram's ~30/s broadcast limit, so 100k alerts take about 70 minutes. Use webhook mode on the web server.
  - Free, and well suited to Romanian deal-hunter communities.
- **PWA**: installable site manifest + service worker + Web Push (VAPID keys) for price alerts. Show an "Adaugă pe ecranul principal" (Add to Home Screen) prompt to iOS users before asking for push permission.

### Gaps
- Not verified: Keepa's or other price trackers' crowd-sourcing practices; the exact Chrome Web Store registration fee in 2026; whether Chrome accepts both `service_worker` and `scripts` keys in one manifest; Firefox's MV2 end-of-life timeline; Apple's current rules on Safari extension distribution (only secondary sources were seen).
- Not researched here: existing Romanian price-history extensions and how they handle overlays and affiliates (competitive scan), and the legal exposure of overlaying third-party retailer pages. See `legal_and_regulatory.md` and the competitor notes.

## 9. Reference implementations and reusable open source

### Takeaway
No open-source project covers Pretoscop's full scope (multi-shop catalog matching plus price history plus SEO site). The useful assets are components and patterns:
- Crawlee (crawling)
- extruct, or a small TS JSON-LD parser (structured data)
- changedetection.io, PriceGhost and PriceBuddy (per-site extraction, restock detection, alerting UX)
- Ditto and Splink (matching baselines and probabilistic linkage)
- idealo's imagededup (image near-duplicates)
- pgvector (ANN inside Postgres)
- Snowball's Romanian stemmer
- the WDC Products and Skroutz datasets (evaluation sanity checks)

### Cited Findings
- **changedetection.io**: Apache-2.0, about 35.3k stars. Features: "Re-stock & Price detection for single product pages", price thresholds and %-change triggers, `json:`/`jq:` filters for JSON-LD, Browser Steps (Playwright), notifications through Apprise (email, Discord, Slack, Telegram, webhooks), a REST API, Docker — [GitHub: dgtlmoon/changedetection.io](https://github.com/dgtlmoon/changedetection.io)
- **PriceBuddy**: self-hosted on Docker, with a separate scraper service and MySQL. Tracks price, availability and unit cost, alerts by email/Telegram/Discord, and has optional AI-assisted scraping (OpenAI, Anthropic, Gemini, Ollama). GPL-3.0, listed as updated 2026-10-05 — [selfhostedworld: PriceBuddy](https://selfhostedworld.com/software/pricebuddy) (repo: github.com/jez500/pricebuddy)
- **Discount Bandit**: a multi-user, self-hosted tracker ("Amazon, Aliexpress, ebay and many more along with custom stores") on PHP/Composer/MySQL (SQLite default), tagged laravel and filamentphp. The page states no licence — [GitHub: Cybrarist/Discount-Bandit](https://github.com/Cybrarist/Discount-Bandit)
- **PriceGhost**: combines JSON-LD, site-specific scrapers, CSS selectors and optional AI extraction, with restock and price-drop alerts — [GitHub: clucraft/PriceGhost](https://github.com/clucraft/PriceGhost) (via search summary)
- **extruct**: BSD-3-Clause; JSON-LD, microdata, RDFa, OpenGraph, microformats, Dublin Core; `uniform=True` — [GitHub: scrapinghub/extruct](https://github.com/scrapinghub/extruct)
- **Ditto**: Apache-2.0. Treats entity matching as sentence-pair classification on BERT/DistilBERT/ALBERT, with domain-knowledge injection (a "product" mode), TF-IDF summarization and MixDA augmentation — [GitHub: megagonlabs/ditto](https://github.com/megagonlabs/ditto); paper [arXiv 2004.00584](https://arxiv.org/abs/2004.00584)
- **Splink 5**: Fellegi–Sunter probabilistic linkage on DuckDB, Spark (and Postgres, per its navigation). "Capable of linking a million records on a laptop in approximately one minute", with clustering and deduplication — [Splink docs](https://moj-analytical-services.github.io/splink/index.html)
- **imagededup** (idealo, Apache-2.0) — [GitHub](https://github.com/idealo/imagededup); **pgvector 0.8.7** — [GitHub](https://github.com/pgvector/pgvector); **Crawlee 3.18.2 / 4.0.0-rc.1** — [GitHub releases](https://github.com/apify/crawlee/releases); **Snowball Romanian** — [snowballstem.org](https://snowballstem.org/algorithms/romanian/stemmer.html)
- **Datasets**: WDC Products — [webdatacommons.org](https://webdatacommons.org/largescaleproductcorpus/wdc-products/); Skroutz matching dataset on OpenML — [OpenML 45715](https://api.openml.org/d/45715)

### Inferences
- **Reuse map**:

| Need | Reuse | How |
|---|---|---|
| Crawling, robots.txt, sitemaps, browser fallback | Crawlee (library) | Direct dependency |
| JSON-LD/microdata extraction | Own TS parser; extruct in Python sidecar for edge cases | Library |
| Restock and price detection heuristics, alert UX, Apprise-style channels | changedetection.io, PriceGhost, PriceBuddy | Read the code for patterns; do not fork (licences and architecture differ, e.g. PriceBuddy is GPL-3.0) |
| Matching baseline / research | Ditto, Splink | Offline experiments in the Python sidecar; Splink-style m/u weighting can inform the hand-tuned rule weights |
| Image duplicates | imagededup | Library (Python) or a TS pHash equivalent |
| ANN | pgvector | Extension |
| Romanian stemming | Snowball, via PostgreSQL `romanian_stem` | Generate search aliases |
| Evaluation | WDC Products, Skroutz OpenML + own RO labeled set | Benchmarks |

- **Bootstrapping labeled data** in week 1–4:
  - Positives: GTIN-agreeing cross-shop pairs with attribute agreement.
  - Hard negatives: same brand and series with a conflicting storage, edition or colour.
  - Human review outcomes.
  - Opus 5.5-adjudicated pairs for a gold set of at least 1,000.
  - Track precision and recall per category on every rules or prompt change; this is a CI job.

### Gaps
- Not verified after the search budget ran out: Romanian-specific open-source scrapers for eMAG, Altex and similar shops, and the other names in the brief ("pricewatch", Shopsys, "Pricemonitor", "web-auto-extract", Keepa clones, Google Shopping XML feed parser libraries). Search GitHub manually before implementation.
- PriceBuddy's licence comes from a third-party directory, not the repository; Discount Bandit's licence is unstated.
