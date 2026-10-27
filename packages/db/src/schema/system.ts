import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
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
    runId: bigint('run_id', { mode: 'number' }),
  },
  (t) => [index('request_log_ts_brin').using('brin', t.ts), index('request_log_host_ts_idx').on(t.host, t.ts)],
);

/**
 * Per-host crawl state shared by every worker process: slot reservation (politeness interval),
 * pauses after blocks, consecutive failures, daily request budget and the robots.txt cache.
 */
export const crawlDomainState = pgTable('crawl_domain_state', {
  host: text('host').primaryKey(),
  nextAllowedAt: ts('next_allowed_at'),
  pausedUntil: ts('paused_until'),
  pauseReason: text('pause_reason'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  day: date('day', { mode: 'string' }),
  dayCount: integer('day_count').notNull().default(0),
  robotsTxt: text('robots_txt'),
  robotsStatus: integer('robots_status'),
  robotsFetchedAt: ts('robots_fetched_at'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});
