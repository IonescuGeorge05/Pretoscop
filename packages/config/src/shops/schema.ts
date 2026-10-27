import { CronExpressionParser } from 'cron-parser';
import { z } from 'zod';

/**
 * Shop registry schema (M04): one YAML file per shop in `packages/config/shops/`, validated here.
 * The YAML is the reviewed, versioned source of truth for what we may do with each shop; runtime
 * switches (per-source kill switch, feature flags) live in the database and are never overwritten
 * by `shops:sync`.
 */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM (24 h)');

const cron = z.string().refine(
  (expr) => {
    try {
      CronExpressionParser.parse(expr, { tz: 'Europe/Bucharest' });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'invalid cron expression (5 fields, Europe/Bucharest)' },
);

export const CrawlPolicySchema = z
  .object({
    min_interval_ms: z.number().int().min(1000).default(5000),
    max_concurrency: z.literal(1).default(1),
    allowed_hours: z.object({ start: hhmm, end: hhmm }).strict().nullable().default(null),
    max_pages_per_day: z.number().int().positive().nullable().default(null),
    respect_crawl_delay: z.boolean().default(true),
    freshness_slo_hours: z.number().int().positive().default(26),
    assisted_render: z.boolean().default(false),
  })
  .strict();

export const SourceSchema = z
  .object({
    /** Stable, unique key: `<shop>:<kind>[:<name>]`. Never rename (history is keyed on it). */
    key: z.string().regex(/^[a-z0-9-]+:[a-z0-9_-]+(:[a-z0-9_.-]+)*$/, 'expected shop:kind[:name]'),
    kind: z.enum(['feed', 'sitemap', 'listing', 'product_page', 'manual']),
    url: z.url(),
    format: z.string().optional(),
    parser_key: z.string().min(1),
    /** Cron in Europe/Bucharest; null = only on demand ("run now"). */
    schedule: cron.nullable().default(null),
    /** Configured to run. Default off for anything that touches a shop (CLAUDE.md). */
    enabled: z.boolean().default(false),
    /** `true` forces the database kill switch on; `false` leaves the database value alone. */
    kill_switch: z.boolean().default(false),
    freshness_slo_hours: z.number().int().positive().optional(),
    /** 1 crawl or merchant feed, 2 affiliate feed, 3 user report, 4 link-only. */
    source_tier: z.number().int().min(1).max(4).default(1),
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const AffiliateSchema = z
  .object({
    network: z.enum(['2performant', 'profitshare', 'awin', 'cj', 'tradedoubler', 'cityads', 'none']),
    program_external_id: z.string().nullable().default(null),
    commission_text: z.string().nullable().default(null),
    cookie_days: z.number().int().positive().nullable().default(null),
    comparator_policy: z.enum(['allowed', 'forbidden', 'unknown', 'written_ok']).default('unknown'),
    link_template: z.string().nullable().default(null),
    feed_available: z.boolean().default(false),
    status: z.enum(['none', 'to_apply', 'pending', 'approved', 'rejected', 'closed']).default('none'),
    notes: z.string().optional(),
  })
  .strict();

export const ProbeSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    vantage: z.string(),
    result: z.enum(['served', 'blocked', 'challenge', 'timeout', 'robots_disallow', 'error']),
    note: z.string().optional(),
  })
  .strict();

export const ShopSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    /** Registrable domain, e.g. `emag.ro`. */
    domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
    website_url: z.url(),
    /** Hosts we request (politeness applies per host); default `www.<domain>` and `<domain>`. */
    hosts: z.array(z.string()).optional(),
    kind: z.enum(['retail', 'marketplace_host']).default('retail'),
    status: z.enum(['active', 'paused', 'blocked', 'removed']),
    access_mode: z.enum(['direct', 'assisted', 'feed_only', 'off']),
    trust_tier: z.number().int().min(1).max(3).default(2),
    categories: z.array(z.string()).default([]),
    legal: z
      .object({
        basis_ref: z.string().nullable().default(null),
        terms_note: z.string().optional(),
        written_permission_ref: z.string().nullable().default(null),
        robots_note: z.string().optional(),
      })
      .strict(),
    shipping: z
      .object({
        free_over: z.number().nonnegative().nullable().default(null),
        flat: z.number().nonnegative().nullable().default(null),
        locker_flat: z.number().nonnegative().nullable().default(null),
        notes: z.string().optional(),
        verified: z.boolean().default(false),
      })
      .strict()
      .default({ free_over: null, flat: null, locker_flat: null, verified: false }),
    warranty_months_default: z.number().int().positive().nullable().default(24),
    vat_included_default: z.boolean().default(true),
    crawl_policy: CrawlPolicySchema.default(CrawlPolicySchema.parse({})),
    affiliate: AffiliateSchema.nullable().default(null),
    sources: z.array(SourceSchema).default([]),
    probes: z.array(ProbeSchema).default([]),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((shop, ctx) => {
    const keys = new Set<string>();
    shop.sources.forEach((s, i) => {
      if (!s.key.startsWith(`${shop.slug}:`)) {
        ctx.addIssue({ code: 'custom', path: ['sources', i, 'key'], message: `source key must start with "${shop.slug}:"` });
      }
      if (keys.has(s.key)) ctx.addIssue({ code: 'custom', path: ['sources', i, 'key'], message: `duplicate source key ${s.key}` });
      keys.add(s.key);
      if (s.enabled && shop.status !== 'active') {
        ctx.addIssue({ code: 'custom', path: ['sources', i, 'enabled'], message: `source enabled but shop status is ${shop.status}` });
      }
      if (s.enabled && shop.access_mode === 'off') {
        ctx.addIssue({ code: 'custom', path: ['sources', i, 'enabled'], message: 'source enabled but access_mode is off' });
      }
    });
    if (shop.access_mode === 'assisted' && !shop.legal.basis_ref) {
      ctx.addIssue({ code: 'custom', path: ['legal', 'basis_ref'], message: 'assisted access requires legal.basis_ref (ADR-015)' });
    }
  });

export type ShopConfig = z.infer<typeof ShopSchema>;
export type SourceConfig = z.infer<typeof SourceSchema>;
export type CrawlPolicyConfig = z.infer<typeof CrawlPolicySchema>;
export type AffiliateConfig = z.infer<typeof AffiliateSchema>;
