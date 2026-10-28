# @pretoscop/llm

Anthropic client of Pretoscop (M22, ADR-011, ADR-024): versioned prompts, Message Batches with the
prompt prefix cached for an hour, a cost ledger and a hard monthly cap. It uses the official
`@anthropic-ai/sdk` (1.3.0, API version 2026-10-21) with the SDK's own retries off.

Nothing here runs without `ANTHROPIC_API_KEY` (setup A9); the worker job also needs the flag
`llm.matching.enabled` (off). Until the key exists, every test and demo runs against
`@pretoscop/llm/mock`, a local stand-in of the API.

## What it offers

| Export | Use |
|---|---|
| `LlmClient` | `call()` one synchronous Messages request; `submitBatch()` / `collectBatch()` / `cancelBatch()` for Message Batches |
| `verifyPair(llm, offer, product, route)` | `{same, confidence, reason, conflictingAttributes, cost}` (plan contract) |
| `extractAttributes(llm, {title}, route)` | storage, RAM, screen, colour, kg, litres, network, edition + bundle/accessory/refurbished flags |
| `suggestCategory(llm, {shop, path, titles}, route)` | a slug of our taxonomy (or null) for an unmapped shop category |
| `LlmBudget` (`llm.budget`) | `status()` and `assert()` (plan contract `llmBudget.assert()`) |
| `prepare(prompt, route, input)` | the only way to build a request (sanitized input, 1-hour cache on the system prompt, structured output) |
| `MemoryLlmLedger`, `LlmLedger` | ledger interface; the worker implements it on `llm_usage` (`apps/worker/src/llm/ledger.ts`) |
| `estimateCost(reqs)` | planning estimate from the price table (dry runs) |

## Models and routing

| Route | Model (env) | Effort | max_tokens | When |
|---|---|---|---|---|
| default | `claude-haiku-5-5` (`LLM_MODEL_DEFAULT`) | low | 2048 | every gray-zone pair, attribute extraction, category suggestions |
| escalation | `claude-sonnet-5-5` (`LLM_MODEL_ESCALATION`) | medium | 4096 | answers of the default model below the confidence threshold, contradictory or unusable; candidates or offers priced at or above `LLM_HIGH_VALUE_RON` (3,000 lei) directly |

Adaptive thinking stays on (the default of both models; Sonnet 5.5 refuses `disabled`). No sampling
parameters, no prefill, no forced tool choice (all rejected by these models); answers use structured
outputs (`output_config.format`, closed JSON schemas).

## Cost and the monthly cap

- Prices (`src/models.ts`, as of 2026-10-06): Haiku 5.5 $0.10 / $0.50 per million input / output
  tokens ($0.50 / $2.50 above 100K prompt tokens), Sonnet 5.5 $2 / $10; cache reads 0.1×, 5-minute
  cache writes 1.25×, 1-hour cache writes 2×; batches 50 % of everything. Integer nano-dollars.
- Every request is first **reserved** in `llm_usage` at its worst case (every prompt token as a
  1-hour cache write, `max_tokens` of output), inside one transaction under an advisory lock that
  checks `billed + estimated + reserved + new ≤ LLM_MONTHLY_CAP_EUR` for the Bucharest calendar
  month. Then it is **settled** at the billed usage, **released** when the API did not process it
  (429/5xx, batch item errored/expired/canceled) or kept as an **estimate** when the outcome is
  unknown (connection lost after sending). Concurrent jobs, CLIs, retries and batches in flight can
  therefore never pass the cap; at 100 % nothing is sent until next month.
- EUR per USD: the ECB reference rate stored by `fx.rates` (≤ 10 days old), else
  `LLM_EUR_PER_USD_FALLBACK` (1.0: never under-counts).
- 80 % warns and 100 % alerts through the hourly SLO check; the dashboard shows the month.

## Prompts (versioned)

`src/prompts/`: `pair_verify@1`, `attributes@1`, `category@1`. A test pins each version's
fingerprint (system text, schema, user layout): editing a prompt means a new version, because the
ledger, stored answers and eval reports are keyed by `id@version`. Keep old versions in the registry
while batches sent with them may still be collected. The system prompts are longer than the 512-token
minimum, so the shared prefix is cacheable; batch items are ordered by prefix (model, prompt, effort).

## What never reaches the API

`sanitizeSide` whitelists title, brand, MPN, GTIN, our category, our own parsed attributes, a price
hint and the shop's public name. It refuses inputs carrying Icecat data (`source: 'icecat'`, spec
fields: ADR-016) or seller, e-mail, phone, user or URL fields (marketplace sellers can be natural
persons), and redacts e-mail addresses and Romanian phone numbers inside titles. The worker selects
the prompt inputs column by column from `offers`/`products` only; an integration test plants a
seller name and Icecat specs and checks that neither appears in any request body. The API key is
passed only to the SDK (`logLevel: 'off'`) and never logged.

## Mock API

`MockAnthropicServer` serves `/v1/messages` and the batch endpoints with documented response
shapes (thinking block, then JSON text; `usage` with the cache breakdown), rejects what the real API
rejects, records every request and can fail on demand (429, 529, dropped connection).
`heuristicResponder` answers with our own rule-based code: it proves the pipeline, never the model.
The fixtures under `test/fixtures/` follow the documented shapes; replace them with real recordings
once a key exists.
