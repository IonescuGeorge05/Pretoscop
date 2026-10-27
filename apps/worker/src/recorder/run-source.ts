import { gzipSync } from 'node:zlib';
import type { RawOffer } from '@pretoscop/core';
import { breakerTripped } from '@pretoscop/core';
import {
  deactivateOffersByUrl,
  offerBaselines,
  recordWithGuard,
  type OfferObservation,
  emptyStats,
  finishRun,
  lastDiscoveryAt,
  markCrawlUrlFetched,
  markMissingOffers,
  medianParsedLast7Days,
  pickCrawlUrls,
  shopSources,
  shops,
  startRun,
  upsertCrawlUrls,
  type RunStats,
  type RunStatus,
} from '@pretoscop/db';
import { parseFeed, parsePageDetailed, parseSitemap } from '@pretoscop/extractors';
import { eq, sql } from 'drizzle-orm';
import { checkGates } from './gates';
import type { RecorderDeps, ShopContext } from './types';

export interface RunOptions {
  trigger: 'schedule' | 'manual' | 'replay';
  /** Overrides for verification runs. */
  maxPages?: number;
  budget?: number;
}

export interface RunOutcome {
  runId: number | null;
  status: RunStatus | 'gated';
  stats: RunStats;
  reason?: string;
  /** Offers recorded in this run that need (re)matching. */
  touchedOffers?: number[];
}

interface Ctx {
  deps: RecorderDeps;
  runId: number;
  shop: ShopContext;
  sourceId: number;
  sourceTier: 1 | 2 | 3 | 4;
  stats: RunStats & { rejected: number; stale: number; newOffers: number; pages: number; discovered: number; quarantined: number };
  snapshot: string[];
  /** Offers that need (re)matching after this run (M07 consumes them). */
  touchedOffers: Set<number>;
  /** Set when the run-level breaker trips: nothing more is recorded. */
  held?: string;
  errors: string[];
  blockReason?: string;
  log: RecorderDeps['log'];
}

const SNAPSHOT_SAMPLE_REJECTS = 20;

function cfgNum(config: Record<string, unknown>, key: string, def: number): number {
  const v = config[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : def;
}

function cfgList(config: Record<string, unknown>, key: string): string[] {
  const v = config[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

async function ingest(ctx: Ctx, offers: RawOffer[], observedAt: Date): Promise<void> {
  if (ctx.held) return;
  const ready: OfferObservation[] = [];
  for (const raw of offers) {
    ctx.stats.parsed++;
    ctx.snapshot.push(JSON.stringify(raw));
    const n = ctx.deps.normalize(raw, {
      shop: ctx.shop,
      sourceId: ctx.sourceId,
      sourceTier: ctx.sourceTier,
      runId: ctx.runId,
      observedAt,
    });
    if (!n.observation) {
      ctx.stats.rejected++;
      if (ctx.errors.length < SNAPSHOT_SAMPLE_REJECTS) ctx.errors.push(`reject ${raw.externalId}: ${n.rejectReason}`);
      continue;
    }
    ready.push(n.observation);
  }
  if (ready.length === 0) return;

  // Run-level breaker (docs/03 §6.4): > 20% of the batch moving > 50% means a parsing or
  // currency bug, not a sale. Nothing from the batch is recorded; the run is held.
  const baselines = await offerBaselines(ctx.deps.db, ctx.shop.id, [...new Set(ready.map((o) => o.externalId))]);
  const breaker = breakerTripped(ready.map((o) => ({ previousBani: baselines.get(o.externalId)?.currentBani ?? null, newBani: o.priceBani })));
  if (breaker.tripped) {
    ctx.held = `breaker: ${breaker.moved} of ${breaker.compared} offers moved > 50%`;
    ctx.errors.push(ctx.held);
    return;
  }

  for (const o of ready) {
    try {
      const g = await recordWithGuard(ctx.deps.db, o, baselines.get(o.externalId));
      if (g.action === 'quarantined') {
        ctx.stats.quarantined++;
        if (ctx.errors.length < SNAPSHOT_SAMPLE_REJECTS) ctx.errors.push(`quarantine ${o.externalId}: ${g.reason}`);
        continue;
      }
      const r = g.result;
      if (r.stale) {
        ctx.stats.stale++;
        continue;
      }
      ctx.stats.upserted++;
      if (r.eventKind) ctx.stats.changed++;
      if (r.inserted) ctx.stats.newOffers++;
      if (r.needsMatch && r.offerId !== null) ctx.touchedOffers.add(r.offerId);
    } catch (err) {
      ctx.stats.errors++;
      if (ctx.errors.length < SNAPSHOT_SAMPLE_REJECTS) ctx.errors.push(`record ${o.externalId}: ${(err as Error).message}`);
    }
  }
}

/** Records the fetch outcome; returns false when the run must stop (block, pause, budget). */
function fetchOutcome(ctx: Ctx, res: Awaited<ReturnType<RecorderDeps['fetcher']['fetchPolite']>>): 'ok' | 'stop' | 'skip' {
  if (res.skipped) {
    if (res.skipped === 'paused' || res.blocked) {
      ctx.stats.blocked++;
      ctx.blockReason = res.blockReason ?? res.skipped;
      return 'stop';
    }
    if (res.skipped === 'robots_disallowed') {
      ctx.errors.push(`robots.txt disallows ${res.finalUrl}`);
      return 'skip';
    }
    ctx.errors.push(`skipped: ${res.skipped}`);
    return 'stop';
  }
  ctx.stats.fetched++;
  if (res.blocked) {
    ctx.stats.blocked++;
    ctx.blockReason = res.blockReason ?? 'blocked';
    return 'stop';
  }
  if (!res.ok || res.body === null) {
    ctx.stats.errors++;
    ctx.errors.push(`HTTP ${res.status} ${res.finalUrl}${res.error ? ` (${res.error})` : ''}`);
    return 'skip';
  }
  return 'ok';
}

async function runListing(ctx: Ctx, source: { url: string; parserKey: string; config: Record<string, unknown> }, opts: RunOptions): Promise<{ complete: boolean }> {
  const maxPages = opts.maxPages ?? cfgNum(source.config, 'max_pages', 1);
  let url: string | null = source.url;
  let complete = false;
  while (url && ctx.stats.pages < maxPages && !ctx.held) {
    ctx.stats.pages++;
    const res = await ctx.deps.fetcher.fetchPolite(url, { shopSlug: ctx.shop.slug, purpose: 'listing', runId: ctx.runId });
    const outcome = fetchOutcome(ctx, res);
    if (outcome !== 'ok') break;
    const observedAt = ctx.deps.now?.() ?? new Date();
    const parsed = parsePageDetailed(source.parserKey, res.body!, {
      url: res.finalUrl,
      shopSlug: ctx.shop.slug,
      observedAt: observedAt.toISOString(),
    });
    if (parsed.offers.length === 0) {
      if (ctx.stats.pages === 1) {
        ctx.stats.errors++;
        ctx.errors.push(`no offers parsed on the first page ${res.finalUrl} (layout change?)`);
      } else complete = true;
      break;
    }
    await ingest(ctx, parsed.offers, observedAt);
    const urls = parsed.offers.map((o) => ({
      url: o.url,
      externalHint: typeof o.raw.pnk === 'string' ? o.raw.pnk : null,
      priority: typeof o.raw.reviews === 'number' ? o.raw.reviews : 0,
    }));
    const unique = [...new Map(urls.map((u) => [u.url, u])).values()];
    ctx.stats.discovered += await upsertCrawlUrls(ctx.deps.db, ctx.shop.id, ctx.sourceId, unique);
    url = parsed.nextPageUrl ?? null;
    if (!url) complete = true;
  }
  return { complete };
}

function matches(url: string, include: string[], exclude: string[]): boolean {
  if (include.length > 0 && !include.some((p) => url.includes(p))) return false;
  return !exclude.some((p) => url.includes(p));
}

async function discoverSitemap(ctx: Ctx, source: { url: string; config: Record<string, unknown> }): Promise<void> {
  const include = cfgList(source.config, 'include');
  const exclude = cfgList(source.config, 'exclude');
  const maxSitemaps = cfgNum(source.config, 'maxSitemaps', 50);
  const queue = [source.url];
  let fetched = 0;
  while (queue.length > 0 && fetched < maxSitemaps) {
    const url = queue.shift()!;
    fetched++;
    const res = await ctx.deps.fetcher.fetchPolite(url, { shopSlug: ctx.shop.slug, purpose: 'sitemap', runId: ctx.runId });
    const outcome = fetchOutcome(ctx, res);
    if (outcome === 'stop') return;
    if (outcome === 'skip') continue;
    const sm = parseSitemap(res.body!);
    for (const child of sm.children) if (matches(child, include, exclude)) queue.push(child);
    const urls = sm.urls.map((u) => ({ url: u.loc }));
    if (urls.length > 0) ctx.stats.discovered += await upsertCrawlUrls(ctx.deps.db, ctx.shop.id, ctx.sourceId, urls);
  }
}

async function fetchProductPages(ctx: Ctx, picks: { id: number; url: string }[], parserKey: string): Promise<void> {
  for (const p of picks) {
    if (ctx.held) break;
    ctx.stats.pages++;
    const res = await ctx.deps.fetcher.fetchPolite(p.url, { shopSlug: ctx.shop.slug, purpose: 'product', runId: ctx.runId });
    if (res.skipped && res.skipped !== 'robots_disallowed') {
      fetchOutcome(ctx, res);
      break;
    }
    if (res.skipped === 'robots_disallowed') {
      await markCrawlUrlFetched(ctx.deps.db, p.id, 0, false);
      continue;
    }
    ctx.stats.fetched++;
    await markCrawlUrlFetched(ctx.deps.db, p.id, res.status, res.ok);
    if (res.blocked) {
      ctx.stats.blocked++;
      ctx.blockReason = res.blockReason ?? 'blocked';
      break;
    }
    if (res.status === 404 || res.status === 410) {
      await deactivateOffersByUrl(ctx.deps.db, ctx.shop.id, p.url);
      continue;
    }
    if (!res.ok || res.body === null) {
      ctx.stats.errors++;
      if (ctx.errors.length < SNAPSHOT_SAMPLE_REJECTS) ctx.errors.push(`HTTP ${res.status} ${p.url}`);
      continue;
    }
    const observedAt = ctx.deps.now?.() ?? new Date();
    try {
      const parsed = parsePageDetailed(parserKey, res.body, { url: res.finalUrl, shopSlug: ctx.shop.slug, observedAt: observedAt.toISOString() });
      if (parsed.offers.length === 0) {
        ctx.stats.errors++;
        if (ctx.errors.length < SNAPSHOT_SAMPLE_REJECTS) ctx.errors.push(`no offer parsed on ${p.url}`);
        continue;
      }
      await ingest(ctx, parsed.offers, observedAt);
    } catch (err) {
      ctx.stats.errors++;
      ctx.errors.push(`parse ${p.url}: ${(err as Error).message}`);
    }
  }
}

async function runFeed(ctx: Ctx, source: { url: string; parserKey: string }): Promise<{ complete: boolean }> {
  ctx.stats.pages++;
  const res = await ctx.deps.fetcher.fetchPolite(source.url, { shopSlug: ctx.shop.slug, purpose: 'feed', runId: ctx.runId });
  if (fetchOutcome(ctx, res) !== 'ok') return { complete: false };
  const observedAt = ctx.deps.now?.() ?? new Date();
  const batch: RawOffer[] = [];
  for await (const raw of parseFeed(source.parserKey, res.body!, { shopSlug: ctx.shop.slug, observedAt: observedAt.toISOString(), feedUrl: source.url })) {
    batch.push(raw);
    if (batch.length >= 500) await ingest(ctx, batch.splice(0), observedAt);
  }
  await ingest(ctx, batch, observedAt);
  return { complete: true };
}

/**
 * `source.run`: fetch → parse → normalize → record (offers + change-only events) → raw snapshot →
 * ingest_runs stats → source health. Idempotent per observation; safe to retry.
 */
export async function runSource(deps: RecorderDeps, sourceId: number, opts: RunOptions): Promise<RunOutcome> {
  const { db } = deps;
  const [row] = await db
    .select({ source: shopSources, shop: shops })
    .from(shopSources)
    .innerJoin(shops, eq(shops.id, shopSources.shopId))
    .where(eq(shopSources.id, sourceId));
  if (!row) throw new Error(`source ${sourceId} not found`);
  const { source, shop } = row;

  const gate = await checkGates(db, deps.env, { shop, source });
  if (!gate.ok) {
    deps.log.info({ source_id: sourceId, shop: shop.slug, reason: gate.reason }, 'source run gated');
    return { runId: null, status: 'gated', stats: emptyStats(), reason: gate.reason };
  }
  // A host the fetch layer already paused (403/429/challenge) is not a new failure: no run, no
  // request, no alert, until the pause ends (the block that set it was alerted when it happened).
  const host = new URL(source.url).host;
  const pause = await db.execute<{ until: string; reason: string | null }>(sql`
    SELECT paused_until::text AS until, pause_reason AS reason FROM fetch_domain_state WHERE host = ${host} AND paused_until > now()`);
  if (pause.rows[0]) {
    const reason = `host ${host} paused until ${pause.rows[0].until}${pause.rows[0].reason ? ` (${pause.rows[0].reason})` : ''}`;
    deps.log.info({ source_id: sourceId, shop: shop.slug, reason }, 'source run gated');
    return { runId: null, status: 'gated', stats: emptyStats(), reason };
  }

  const channel = source.kind === 'feed' ? 'feed' : shop.accessMode === 'assisted' ? 'assisted' : 'direct';
  const run = await startRun(db, { sourceId, channel, trigger: opts.trigger });
  const started = Date.now();
  const log = deps.log.child({ source_id: sourceId, run_id: run.id, shop: shop.slug });
  const ctx: Ctx = {
    deps,
    runId: run.id,
    shop: { id: shop.id, slug: shop.slug, shippingRules: shop.shippingRules, vatIncludedDefault: shop.vatIncludedDefault },
    sourceId,
    sourceTier: (source.sourceTier as 1 | 2 | 3 | 4) ?? 1,
    stats: { ...emptyStats(), rejected: 0, stale: 0, newOffers: 0, pages: 0, discovered: 0, quarantined: 0 },
    snapshot: [],
    touchedOffers: new Set<number>(),
    errors: [],
    log,
  };
  log.info({ key: source.key, kind: source.kind, trigger: opts.trigger }, 'source run started');

  let complete = false;
  let failure: unknown;
  try {
    const config = source.config ?? {};
    if (source.kind === 'listing') {
      complete = (await runListing(ctx, { url: source.url, parserKey: source.parserKey, config }, opts)).complete;
    } else if (source.kind === 'sitemap') {
      const everyHours = cfgNum(config, 'discoveryEveryHours', 20);
      const last = await lastDiscoveryAt(db, sourceId);
      if (!last || Date.now() - last.getTime() > everyHours * 3600_000) await discoverSitemap(ctx, { url: source.url, config });
      if (!ctx.blockReason) {
        const budget = opts.budget ?? cfgNum(config, 'dailyBudget', 500);
        const picks = await pickCrawlUrls(db, shop.id, budget, 'oldest', { sourceId, notFetchedWithinHours: 20 });
        const parser = typeof config.productParser === 'string' ? config.productParser : 'jsonld-product';
        await fetchProductPages(ctx, picks, parser);
      }
    } else if (source.kind === 'product_page') {
      const limit = opts.budget ?? cfgNum(config, 'limit', 500);
      const picks = await pickCrawlUrls(db, shop.id, limit, 'priority', { notFetchedWithinHours: 20 });
      await fetchProductPages(ctx, picks, source.parserKey);
    } else if (source.kind === 'feed') {
      complete = (await runFeed(ctx, { url: source.url, parserKey: source.parserKey })).complete;
    } else {
      ctx.errors.push(`kind ${source.kind} has no runner`);
    }
  } catch (err) {
    failure = err;
    ctx.stats.errors++;
    ctx.errors.push(`run aborted: ${(err as Error).message}`);
    log.error({ err }, 'source run aborted');
  }

  // Raw snapshot (audit trail and replay input).
  let snapshotKey: string | null = null;
  if (ctx.snapshot.length > 0) {
    snapshotKey = `snapshots/${shop.slug}/${sourceId}/${run.id}.jsonl.gz`;
    try {
      await deps.blob.put(snapshotKey, gzipSync(Buffer.from(`${ctx.snapshot.join('\n')}\n`)), 'application/gzip');
    } catch (err) {
      log.error({ err }, 'snapshot write failed');
      snapshotKey = null;
    }
  }

  // Deactivation only after a complete, full-size run (docs/03 §6.1).
  let status: RunStatus;
  if (ctx.held) {
    status = 'held';
    await deps.alert(`Run held by the breaker: ${source.key}`, { reason: ctx.held, run_id: run.id });
  } else if (ctx.blockReason) status = 'failed';
  else if (failure || (ctx.stats.parsed === 0 && ctx.stats.errors > 0)) status = 'failed';
  else if (ctx.stats.errors > 0) status = 'partial';
  else status = 'success';

  if (status === 'success' && complete) {
    const median = await medianParsedLast7Days(db, sourceId);
    if (median !== null && ctx.stats.parsed < 0.7 * median) {
      status = 'held';
      ctx.errors.push(`held: parsed ${ctx.stats.parsed} < 70% of the 7-day median ${median}`);
      await deps.alert(`Run held for review: ${source.key}`, { parsed: ctx.stats.parsed, median });
    } else {
      const m = await markMissingOffers(db, sourceId, run.startedAt);
      (ctx.stats as Record<string, unknown>).deactivated = m.deactivated;
    }
  }

  ctx.stats.durationMs = Date.now() - started;
  await finishRun(db, run.id, {
    status,
    stats: ctx.stats,
    errorSample: ctx.blockReason ? `blocked: ${ctx.blockReason}\n${ctx.errors.join('\n')}` : ctx.errors.join('\n') || null,
    snapshotKey,
  });

  // Source health and two-consecutive-failures alert.
  const failed = status === 'failed';
  const res = await db.execute<{ consecutive_failures: number }>(sql`
    UPDATE shop_sources SET
      last_run_at = now(),
      last_success_at = CASE WHEN ${!failed} THEN now() ELSE last_success_at END,
      consecutive_failures = CASE WHEN ${failed} THEN consecutive_failures + 1 ELSE 0 END,
      health = CASE
        WHEN ${ctx.blockReason !== undefined} THEN 'blocked'
        WHEN ${failed} AND consecutive_failures + 1 >= 2 THEN 'failing'
        WHEN ${failed} OR ${status === 'partial'} OR ${status === 'held'} THEN 'degraded'
        ELSE 'ok' END,
      updated_at = now()
    WHERE id = ${sourceId}
    RETURNING consecutive_failures
  `);
  const consecutive = Number(res.rows[0]?.consecutive_failures ?? 0);
  if (failed && consecutive >= 2 && opts.trigger !== 'replay') {
    await deps.alert(`Source failing twice in a row: ${source.key}`, {
      reason: ctx.blockReason ?? ctx.errors[0] ?? 'unknown',
      run_id: run.id,
    });
  }

  log.info({ status, stats: ctx.stats, snapshot: snapshotKey }, 'source run finished');
  return { runId: run.id, status, stats: ctx.stats, touchedOffers: [...ctx.touchedOffers] };
}
