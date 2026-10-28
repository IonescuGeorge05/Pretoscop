import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { products } from './catalog';
import { offers } from './offers';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const nanos = (name: string) => bigint(name, { mode: 'number' });

/**
 * LLM cost ledger (M22, ADR-024): one row per Anthropic request (a synchronous call or one item of
 * a Message Batch). A row is inserted as a reservation at the request's worst-case cost before
 * anything is sent, under an advisory lock that checks the monthly cap (LLM_MONTHLY_CAP_EUR), then
 * settled at the billed cost ('billed'), released when the API did not process it ('released') or
 * kept at the reservation when the outcome is unknown ('estimated'). Costs are integer nano-units
 * (1 USD = 1e9 n$): a call costs fractions of a cent.
 */
export const llmUsage = pgTable(
  'llm_usage',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    createdAt: ts('created_at').notNull().defaultNow(),
    settledAt: ts('settled_at'),
    purpose: text('purpose').notNull(),
    model: text('model').notNull(),
    promptId: text('prompt_id').notNull(),
    promptVersion: text('prompt_version').notNull(),
    mode: text('mode').$type<'sync' | 'batch'>().notNull(),
    status: text('status').$type<'reserved' | 'billed' | 'released' | 'estimated'>().notNull().default('reserved'),
    /** Anthropic Message Batch id; `custom_id` is `u<id>`. */
    batchId: text('batch_id'),
    customId: text('custom_id'),
    /** sha256 of the request body (identical requests are answered once). */
    inputHash: text('input_hash').notNull(),
    /** What the call was about (offer and product ids); never personal data. */
    subject: jsonb('subject').$type<Record<string, unknown>>().notNull().default({}),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheWrite5mTokens: integer('cache_write_5m_tokens').notNull().default(0),
    cacheWrite1hTokens: integer('cache_write_1h_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    eurPerUsd: numeric('eur_per_usd', { precision: 10, scale: 6 }).notNull(),
    reservedUsdNanos: nanos('reserved_usd_nanos').notNull(),
    reservedEurNanos: nanos('reserved_eur_nanos').notNull(),
    costUsdNanos: nanos('cost_usd_nanos').notNull().default(0),
    costEurNanos: nanos('cost_eur_nanos').notNull().default(0),
    error: text('error'),
  },
  (t) => [
    index('llm_usage_created_idx').on(t.createdAt),
    index('llm_usage_reserved_idx').on(t.batchId).where(sql`${t.status} = 'reserved'`),
    index('llm_usage_input_hash_idx').on(t.inputHash),
    check('llm_usage_status_ck', sql`${t.status} in ('reserved','billed','released','estimated')`),
    check('llm_usage_mode_ck', sql`${t.mode} in ('sync','batch')`),
    check('llm_usage_purpose_ck', sql`${t.purpose} in ('match.verify','attributes.extract','category.suggest','eval')`),
  ],
);

/**
 * Answers of the LLM (M22), one per distinct request (`input_hash`): pair verdicts, extracted
 * attributes, category suggestions. Matching reads them instead of asking again; the review queue
 * shows them next to each candidate. `ok = false` keeps the error of an unusable answer; such a
 * request may be asked again until `attempts` reaches the limit.
 */
export const llmResults = pgTable(
  'llm_results',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    kind: text('kind').$type<'pair' | 'attributes' | 'category'>().notNull(),
    inputHash: text('input_hash').notNull(),
    promptId: text('prompt_id').notNull(),
    promptVersion: text('prompt_version').notNull(),
    model: text('model').notNull(),
    offerId: bigint('offer_id', { mode: 'number' }).references(() => offers.id, { onDelete: 'cascade' }),
    productId: bigint('product_id', { mode: 'number' }).references(() => products.id, { onDelete: 'cascade' }),
    /** Category suggestions: `<shop slug>|<breadcrumb>`. */
    subjectKey: text('subject_key'),
    ok: boolean('ok').notNull(),
    output: jsonb('output').$type<Record<string, unknown>>(),
    error: text('error'),
    attempts: smallint('attempts').notNull().default(1),
    usageId: bigint('usage_id', { mode: 'number' }).references(() => llmUsage.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('llm_results_input_hash_uq').on(t.inputHash),
    index('llm_results_offer_idx').on(t.offerId, t.productId),
    index('llm_results_subject_idx').on(t.kind, t.subjectKey),
    check('llm_results_kind_ck', sql`${t.kind} in ('pair','attributes','category')`),
  ],
);
