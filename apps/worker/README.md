# @pretoscop/worker

pg-boss workers: ingest, crawl, match, rollup, alerts, index, maintenance.

- `pnpm --filter @pretoscop/worker dev` runs in watch mode; `start` runs once.
- Jobs are declared with `defineJob()` in `src/jobs/*` and listed in `src/jobs/index.ts`;
  `registerJobs()` creates the queue, attaches the handler and applies the cron schedule
  (Europe/Bucharest). Handlers must be idempotent.
- `system.heartbeat` logs `heartbeat` every minute (and once at start).

## Re-normalization after a rule change

`pnpm --filter @pretoscop/worker renormalize [--shop emag] [--dry-run] [--limit N] [--samples 20]`
rebuilds each stored offer's RawOffer from its raw columns, normalizes it with the current
`@pretoscop/core` rules and rewrites the normalized columns (title forms, brand, MPN value, raw field
and source, GTIN-14, attributes — replaced, not merged —, bundle and accessory flags, identity
hash). MPN fields that were really eMAG slug tails become URL hints (guesses). Products the
matcher created from an offer follow it (never human-made or human-edited products): a
single-offer product takes the offer's new MPN, brand and attributes (family cleared when the brand
changes); a multi-offer product whose field MPN was the slug tail takes the new MPN. Offers whose
identity changed go back to `pending` for the matcher unless a human decided them (alias,
`manual`, `rejected`, blacklisted) or their link still holds (the product followed them, or they
still clear the accept bar against it), so re-matching never duplicates a product. Prices and
price events are never touched; an offer updated by the recorder meanwhile is skipped (`raced`).
It prints a before/after summary; run `--dry-run` first, then `match:run` (or wait for
`match.pending`) to re-match the re-queued offers.
