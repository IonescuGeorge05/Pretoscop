import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { products } from './catalog';
import { offers } from './offers';
import { shops } from './shops';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const id = () => bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();

export type CandidateGenerator = 'gtin' | 'brand_mpn' | 'title' | 'embedding' | 'alias';

export const matchCandidates = pgTable(
  'match_candidates',
  {
    id: id(),
    offerId: bigint('offer_id', { mode: 'number' })
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    score: real('score').notNull(),
    features: jsonb('features').$type<Record<string, unknown>>().notNull().default({}),
    generator: text('generator').$type<CandidateGenerator>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('match_candidates_offer_idx').on(t.offerId)],
);

export type MatchDecisionKind = 'accept' | 'reject' | 'new_product' | 'needs_review' | 'unmatched';

/** Append-only audit of every matching decision (rule, llm:<model>, human:<user_id>). */
export const matchDecisions = pgTable(
  'match_decisions',
  {
    id: id(),
    offerId: bigint('offer_id', { mode: 'number' })
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    productId: bigint('product_id', { mode: 'number' }).references(() => products.id, {
      onDelete: 'set null',
    }),
    decision: text('decision').$type<MatchDecisionKind>().notNull(),
    decidedBy: text('decided_by').notNull(),
    reason: text('reason'),
    score: real('score'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('match_decisions_offer_idx').on(t.offerId, t.createdAt),
    check(
      'match_decisions_decision_ck',
      sql`${t.decision} in ('accept','reject','new_product','needs_review','unmatched')`,
    ),
  ],
);

/** Sticky human decisions: survive re-ingestion and override every rule. */
export const offerAliases = pgTable(
  'offer_aliases',
  {
    shopId: bigint('shop_id', { mode: 'number' })
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    /** null = "never match this offer" (blacklisted by a human). */
    productId: bigint('product_id', { mode: 'number' }).references(() => products.id, {
      onDelete: 'cascade',
    }),
    decidedBy: text('decided_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.shopId, t.externalId] })],
);

/** Merge log: enables undo; the old slug 301-redirects to the target. */
export const productMerges = pgTable(
  'product_merges',
  {
    id: id(),
    fromProductId: bigint('from_product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id),
    intoProductId: bigint('into_product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id),
    movedOfferIds: bigint('moved_offer_ids', { mode: 'number' }).array(),
    actor: text('actor').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    undoneAt: ts('undone_at'),
  },
  (t) => [index('product_merges_from_idx').on(t.fromProductId)],
);
