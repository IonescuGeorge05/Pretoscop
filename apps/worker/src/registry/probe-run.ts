import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import { defaultDomainPolicy, type DomainPolicy } from '@pretoscop/config/policy';
import type { ShopConfig } from '@pretoscop/config/shops';
import { auditLog, type Db, isFlagEnabled, sql } from '@pretoscop/db';
import { hostOnDomain } from '@pretoscop/extractors';
import { CappedDispatcher, createFetcher, signerFromEnv, type DomainStateStore, type FetcherDeps, type RequestLogSink } from '@pretoscop/fetch';
import {
  PROBE_FLAG,
  PROBE_MAX_REQUESTS,
  PROBE_MIN_GAP_MS,
  probeRefusal,
  probeTargets,
  summarizeProbe,
  type ProbeFetch,
  type ProbeResult,
} from './probe';

export interface ProbeRunDeps {
  db: Db;
  env: Env;
  log: Logger;
  /** The transport (production: `createGuardedDispatcher`); wrapped in the probe's request cap. */
  dispatcher: NonNullable<FetcherDeps['dispatcher']>;
  /** Shared per-host state (production: the database's), so pauses and intervals are the recorder's. */
  stateStore: DomainStateStore;
  requestLog?: RequestLogSink & { flush?: () => Promise<void> };
  /** Tests only: a shorter gap between requests, and a sleep that does not wait for the per-host slot. */
  minGapMs?: number;
  sleep?: FetcherDeps['sleep'];
  now?: () => Date;
}

export type ProbeRunOutcome =
  | { status: 'refused'; reason: string; requests: 0 }
  | { status: 'probed'; result: ProbeResult; note: string; requests: number; fetches: ProbeFetch[]; date: string };

interface ShopRow extends Record<string, unknown> {
  id: string | number;
  slug: string;
  domain: string;
  status: string;
  access_mode: string;
  crawl_policy: {
    min_interval_ms?: number;
    allowed_hours?: { start: string; end: string } | null;
    max_pages_per_day?: number | null;
    respect_crawl_delay?: boolean;
  } | null;
}

/**
 * One probe of one shop (M21; `shops:probe`): the gates of `probeRefusal`, then at most
 * `PROBE_MAX_REQUESTS` requests through the polite fetcher (identified User-Agent, Web Bot Auth
 * when on, robots.txt, ≥ 5 s per host and between any two requests, the shop's allowed hours and
 * daily budget, pauses shared with the recorder, no retries), stopping at the first refusal. The
 * shop's runtime state (status, access mode, kill switches, policy) comes from the database; the
 * pages to try come from the registry YAML. Every probe leaves an audit row.
 */
export async function runProbe(deps: ProbeRunDeps, shop: ShopConfig, opts: { vantage: string; url?: string }): Promise<ProbeRunOutcome> {
  const { db, env, log } = deps;
  const row = (
    await db.execute<ShopRow>(sql`SELECT id, slug, domain, status, access_mode, crawl_policy FROM shops WHERE slug = ${shop.slug}`)
  ).rows[0];
  if (!row) return { status: 'refused', reason: `shop ${shop.slug} is not in the database (run shops:sync first)`, requests: 0 };

  const reason = probeRefusal(
    { slug: row.slug, status: row.status, accessMode: row.access_mode },
    {
      crawlEnv: env.CRAWL_ENABLED,
      crawlFlag: await isFlagEnabled(db, 'crawl.enabled'),
      probeFlag: await isFlagEnabled(db, PROBE_FLAG),
      emagFlag: await isFlagEnabled(db, 'source.emag.enabled'),
    },
  );
  if (reason) return { status: 'refused', reason, requests: 0 };
  if (opts.url !== undefined && (!/^https?:\/\//i.test(opts.url) || !hostOnDomain(opts.url, row.domain))) {
    return { status: 'refused', reason: `--url must be an http(s) page on ${row.domain}`, requests: 0 };
  }

  const killed = new Set(
    (await db.execute<{ key: string }>(sql`SELECT key FROM shop_sources WHERE shop_id = ${row.id} AND kill_switch`)).rows.map((r) => r.key),
  );
  const cp = row.crawl_policy ?? {};
  // The probe checks reachability whatever the access mode says (that is what it is for), with the
  // shop's politeness settings; hosts outside the shop's domain are off, and it never goes through
  // the assisted channel.
  const policyFor = (host: string): DomainPolicy =>
    hostOnDomain(`https://${host}/`, row.domain)
      ? defaultDomainPolicy(host, {
          shopSlug: row.slug,
          accessMode: 'direct',
          minIntervalMs: Math.max(5000, cp.min_interval_ms ?? 5000),
          allowedHours: cp.allowed_hours ?? null,
          maxPagesPerDay: cp.max_pages_per_day ?? null,
          respectCrawlDelay: cp.respect_crawl_delay ?? true,
        })
      : defaultDomainPolicy(host, { accessMode: 'off' });

  const capped = new CappedDispatcher(deps.dispatcher, { maxRequests: PROBE_MAX_REQUESTS, minGapMs: deps.minGapMs ?? PROBE_MIN_GAP_MS });
  const fetcher = createFetcher({
    dispatcher: capped,
    stateStore: deps.stateStore,
    requestLog: deps.requestLog,
    policyFor,
    crawlEnabled: env.CRAWL_ENABLED,
    botInfoUrl: env.BOT_INFO_URL,
    defaultTimeoutMs: env.FETCH_TIMEOUT_MS,
    defaultMaxBytes: env.FETCH_MAX_BODY_BYTES,
    retry: { maxRetries: 0 },
    logger: log,
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
    signer: signerFromEnv({ WEB_BOT_AUTH: String(env.WEB_BOT_AUTH), WEB_BOT_AUTH_PRIVATE_KEY: env.WEB_BOT_AUTH_PRIVATE_KEY, BOT_INFO_URL: env.BOT_INFO_URL }) ?? null,
  });

  const fetches: ProbeFetch[] = [];
  try {
    for (const t of probeTargets(shop, opts.url, killed)) {
      if (!hostOnDomain(t.url, row.domain)) {
        log.warn({ shop: row.slug, url: t.url }, 'probe target not on the shop domain: skipped');
        continue;
      }
      if (capped.requests >= PROBE_MAX_REQUESTS) break;
      const r = await fetcher.fetchPolite(t.url, { purpose: t.purpose, shopSlug: row.slug });
      fetches.push({
        url: t.url,
        status: r.status,
        ok: r.ok,
        blocked: r.blocked,
        blockReason: r.blockReason,
        skipped: r.skipped,
        errorCode: r.errorCode,
        error: r.error,
        contentType: r.contentType,
        bytes: r.bodyBytes?.length ?? r.body?.length,
      });
      if (r.blocked || r.skipped || r.errorCode === 'request_cap') break; // never push past a refusal
    }
  } finally {
    await fetcher.close();
    await deps.requestLog?.flush?.();
  }

  const { result, note } = summarizeProbe(fetches);
  // Nothing reached the shop (a pause from an earlier block, robots.txt from the cache, a budget, the
  // hours): no new observation, so nothing to record either.
  if (capped.requests === 0) return { status: 'refused', reason: `nothing sent: ${note || 'no public page to probe'}`, requests: 0 };
  const date = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
  await db.insert(auditLog).values({
    actor: 'cli:shops-probe',
    action: 'shops.probe',
    entity: 'shops',
    entityId: row.slug,
    before: null,
    after: { vantage: opts.vantage, result, note, requests: capped.requests },
  });
  return { status: 'probed', result, note, requests: capped.requests, fetches, date };
}
