import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const id = () => bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();

export type ShopKind = 'retail' | 'marketplace_host';
export type ShopStatus = 'active' | 'paused' | 'blocked' | 'removed';
export type AccessModeDb = 'direct' | 'assisted' | 'feed_only' | 'off';

/** `shops.shipping_rules`: amounts in lei, VAT included. */
export interface ShippingRulesJson {
  free_over?: number | null;
  flat?: number | null;
  locker_flat?: number | null;
  notes?: string;
}

/** `shops.crawl_policy` (see @pretoscop/config DomainPolicy). */
export interface CrawlPolicyJson {
  min_interval_ms?: number;
  max_concurrency?: number;
  allowed_hours?: { start: string; end: string } | null;
  max_pages_per_day?: number | null;
  freshness_slo_hours?: number;
  respect_crawl_delay?: boolean;
  assisted_render?: boolean;
}

export const shops = pgTable(
  'shops',
  {
    id: id(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    domain: text('domain').notNull(),
    websiteUrl: text('website_url').notNull(),
    logoKey: text('logo_key'),
    kind: text('kind').$type<ShopKind>().notNull().default('retail'),
    status: text('status').$type<ShopStatus>().notNull().default('active'),
    accessMode: text('access_mode').$type<AccessModeDb>().notNull().default('direct'),
    legalBasisRef: text('legal_basis_ref'),
    trustTier: smallint('trust_tier').notNull().default(2),
    shippingRules: jsonb('shipping_rules').$type<ShippingRulesJson>().notNull().default({}),
    shippingVerified: boolean('shipping_verified').notNull().default(false),
    warrantyMonthsDefault: smallint('warranty_months_default'),
    crawlPolicy: jsonb('crawl_policy').$type<CrawlPolicyJson>().notNull().default({}),
    vatIncludedDefault: boolean('vat_included_default').notNull().default(true),
    legalNotes: text('legal_notes'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('shops_slug_uq').on(t.slug),
    check('shops_kind_ck', sql`${t.kind} in ('retail','marketplace_host')`),
    check('shops_status_ck', sql`${t.status} in ('active','paused','blocked','removed')`),
    check('shops_access_mode_ck', sql`${t.accessMode} in ('direct','assisted','feed_only','off')`),
    check('shops_trust_tier_ck', sql`${t.trustTier} between 1 and 3`),
  ],
);

export type ComparatorPolicy = 'allowed' | 'forbidden' | 'unknown' | 'written_ok';

export const affiliatePrograms = pgTable(
  'affiliate_programs',
  {
    id: id(),
    shopId: bigint('shop_id', { mode: 'number' })
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    network: text('network').notNull(),
    programExternalId: text('program_external_id'),
    commissionText: text('commission_text'),
    cookieDays: integer('cookie_days'),
    comparatorPolicy: text('comparator_policy').$type<ComparatorPolicy>().notNull().default('unknown'),
    linkTemplate: text('link_template'),
    feedAvailable: boolean('feed_available').notNull().default(false),
    status: text('status').notNull().default('none'),
    notes: text('notes'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('affiliate_programs_shop_network_uq').on(t.shopId, t.network),
    check(
      'affiliate_programs_policy_ck',
      sql`${t.comparatorPolicy} in ('allowed','forbidden','unknown','written_ok')`,
    ),
  ],
);

export type SourceKind = 'feed' | 'sitemap' | 'listing' | 'product_page' | 'manual';
export type SourceHealth = 'ok' | 'degraded' | 'failing' | 'blocked' | 'unknown';

export const shopSources = pgTable(
  'shop_sources',
  {
    id: id(),
    shopId: bigint('shop_id', { mode: 'number' })
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    /** Stable key from the registry YAML, e.g. `emag:listing:telefoane`. */
    key: text('key').notNull(),
    kind: text('kind').$type<SourceKind>().notNull(),
    url: text('url').notNull(),
    format: text('format'),
    parserKey: text('parser_key').notNull(),
    schedule: text('schedule'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    enabled: boolean('enabled').notNull().default(false),
    killSwitch: boolean('kill_switch').notNull().default(false),
    freshnessSloHours: integer('freshness_slo_hours').notNull().default(26),
    sourceTier: smallint('source_tier').notNull().default(1),
    lastRunAt: ts('last_run_at'),
    lastSuccessAt: ts('last_success_at'),
    nextRunAt: ts('next_run_at'),
    health: text('health').$type<SourceHealth>().notNull().default('unknown'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('shop_sources_key_uq').on(t.key),
    index('shop_sources_shop_idx').on(t.shopId),
    check(
      'shop_sources_kind_ck',
      sql`${t.kind} in ('feed','sitemap','listing','product_page','manual')`,
    ),
    check(
      'shop_sources_health_ck',
      sql`${t.health} in ('ok','degraded','failing','blocked','unknown')`,
    ),
    check('shop_sources_tier_ck', sql`${t.sourceTier} between 1 and 4`),
  ],
);

export type RunStatus = 'running' | 'success' | 'partial' | 'failed' | 'held' | 'skipped';
export type RunChannel = 'direct' | 'assisted' | 'feed';

/** `ingest_runs.stats` (interface contract of M05). */
export interface RunStats {
  fetched: number;
  parsed: number;
  upserted: number;
  changed: number;
  blocked: number;
  errors: number;
  durationMs: number;
  [extra: string]: unknown;
}

export const ingestRuns = pgTable(
  'ingest_runs',
  {
    id: id(),
    sourceId: bigint('source_id', { mode: 'number' })
      .notNull()
      .references(() => shopSources.id, { onDelete: 'cascade' }),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
    status: text('status').$type<RunStatus>().notNull().default('running'),
    stats: jsonb('stats').$type<Partial<RunStats>>().notNull().default({}),
    errorSample: text('error_sample'),
    snapshotKey: text('snapshot_key'),
    channel: text('channel').$type<RunChannel>().notNull().default('direct'),
    trigger: text('trigger').notNull().default('schedule'),
    replayOfRunId: bigint('replay_of_run_id', { mode: 'number' }),
  },
  (t) => [
    index('ingest_runs_source_started_idx').on(t.sourceId, t.startedAt),
    check(
      'ingest_runs_status_ck',
      sql`${t.status} in ('running','success','partial','failed','held','skipped')`,
    ),
    check('ingest_runs_channel_ck', sql`${t.channel} in ('direct','assisted','feed')`),
  ],
);

/** Assisted-access ledger (M05B, ADR-015); the monthly cap is enforced in packages/fetch. */
export const accessCosts = pgTable(
  'access_costs',
  {
    day: date('day', { mode: 'string' }).notNull(),
    shopId: bigint('shop_id', { mode: 'number' })
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    vendor: text('vendor').notNull(),
    requests: integer('requests').notNull().default(0),
    renderedRequests: integer('rendered_requests').notNull().default(0),
    successes: integer('successes').notNull().default(0),
    costCents: integer('cost_cents').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.shopId, t.vendor] })],
);
