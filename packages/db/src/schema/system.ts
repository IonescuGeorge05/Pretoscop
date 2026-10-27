import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** Feature flags; anything touching a shop, money or email defaults to off. */
export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  description: text('description'),
  updatedAt: ts('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Every admin mutation (M09) and every decision with legal weight writes a row here. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ts: ts('ts').notNull().defaultNow(),
  },
  (t) => [index('audit_log_entity_idx').on(t.entity, t.entityId), index('audit_log_ts_idx').on(t.ts)],
);

/** Fetch log written by packages/fetch (30-day retention, pruned by maintenance.request_log). */
export const requestLog = pgTable(
  'request_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    ts: ts('ts').notNull().defaultNow(),
    host: text('host').notNull(),
    url: text('url').notNull(),
    method: text('method').notNull().default('GET'),
    status: smallint('status'),
    durationMs: integer('duration_ms'),
    bytes: integer('bytes'),
    purpose: text('purpose'),
    shopSlug: text('shop_slug'),
    channel: text('channel').notNull().default('direct'),
    blocked: boolean('blocked').notNull().default(false),
    blockReason: text('block_reason'),
    skipped: text('skipped'),
    error: text('error'),
    robotsGroup: text('robots_group'),
    robotsIgnoredGroups: text('robots_ignored_groups').array(),
    runId: bigint('run_id', { mode: 'number' }),
    sourceId: bigint('source_id', { mode: 'number' }),
    waitMs: integer('wait_ms'),
    attempt: smallint('attempt'),
    hop: smallint('hop'),
    contentType: text('content_type'),
    notModified: boolean('not_modified'),
    errorCode: text('error_code'),
    blockDetail: text('block_detail'),
  },
  (t) => [index('request_log_ts_brin').using('brin', t.ts), index('request_log_host_ts_idx').on(t.host, t.ts)],
);

/**
 * Per-host crawl state shared by every worker process (M02 `DomainStateStore`, PostgreSQL
 * implementation in apps/worker): slot reservation (politeness interval), pauses after blocks and
 * consecutive failures. Daily budgets and the robots.txt cache have their own tables.
 */
export const fetchDomainState = pgTable('fetch_domain_state', {
  host: text('host').primaryKey(),
  nextSlotAt: ts('next_slot_at').notNull().default(sql`'-infinity'`),
  pausedUntil: ts('paused_until'),
  pauseReason: text('pause_reason'),
  pauseSetAt: ts('pause_set_at'),
  pauseSource: text('pause_source'),
  pauseBlockReason: text('pause_block_reason'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
});

export const fetchDomainDaily = pgTable(
  'fetch_domain_daily',
  {
    host: text('host').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    requests: integer('requests').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.host, t.day] })],
);

export const fetchRobotsCache = pgTable('fetch_robots_cache', {
  origin: text('origin').primaryKey(),
  fetchedAt: ts('fetched_at').notNull(),
  expiresAt: ts('expires_at').notNull(),
  status: integer('status').notNull(),
  outcome: text('outcome').notNull(),
  body: text('body'),
  etag: text('etag'),
  lastModified: text('last_modified'),
  finalUrl: text('final_url'),
  truncated: boolean('truncated').notNull().default(false),
  htmlBody: boolean('html_body').notNull().default(false),
  blockReason: text('block_reason'),
  detail: text('detail'),
  channel: text('channel'),
});

