import type { Env } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import { mapAvailability, normalizeGtin, parsePrice, parseShippingCost, type RawOffer } from '@pretoscop/core';
import { type CanaryFieldStats, type CanaryStatus, type Db, extractorCanaries, isFlagEnabled, sql } from '@pretoscop/db';
import { hostOnDomain, PAGE_PARSERS, parsePageDetailed } from '@pretoscop/extractors';
import { checkGates } from '../recorder/gates';
import type { FetchLike, OpsAlert } from '../recorder/types';

/**
 * Extractor canary (M21; docs/03 §11 "Extractor canary (weekly: 5 live URLs per shop, field
 * presence and type) → alert"). Once a week, for every active shop crawled directly, up to five
 * live URLs the pipeline really parses (listing pages of its listing sources, then product pages
 * that answered 200 recently) are fetched through the polite fetcher and parsed with the shop's
 * parser. Field presence and validity are compared with the previous week; a field that
 * disappears, starts arriving unusable, or a page that yields no offers raises one ops alert per
 * shop and parser. Nothing is ingested: the canary only looks.
 *
 * Polite by construction: same fetcher (robots.txt, 5 s per host, budgets, block pauses), same
 * gates as source runs (kill switches, `crawl.enabled`, eMAG's ADR-013 flag), plus its own flag
 * `extractors.canary.enabled`. Assisted and feed-only shops are left out (their own monitoring).
 * Idempotent per ISO week: a redelivered job only checks the URLs not yet recorded this week.
 */

export const CANARY_URLS_PER_SHOP = 5;
const MAX_LISTING_TARGETS = 2;
export const CANARY_FLAG = 'extractors.canary.enabled';

/** Checked on every parsed offer; the first four must always be there. */
export const CANARY_FIELDS = [
  'externalId',
  'url',
  'title',
  'price',
  'oldPrice',
  'currency',
  'availability',
  'condition',
  'gtin',
  'mpn',
  'brand',
  'category',
  'sellerName',
  'shippingCost',
] as const;
export type CanaryField = (typeof CANARY_FIELDS)[number];
const CORE_FIELDS: readonly CanaryField[] = ['externalId', 'url', 'title', 'price'];

/** A field present in at least this share of offers last week… */
const PRESENT_BEFORE = 0.8;
/** …and in less than this share now has disappeared. */
const PRESENT_NOW = 0.5;
/** Unusable values above this share (when last week had at most `INVALID_BEFORE`) are drift. */
const INVALID_NOW = 0.2;
const INVALID_BEFORE = 0.05;

export interface CanaryTarget {
  shopId: number;
  shopSlug: string;
  shopDomain: string;
  sourceId: number | null;
  url: string;
  parserKey: string;
  purpose: 'listing' | 'product';
}

export interface CanaryDeps {
  db: Db;
  env: Env;
  fetcher: FetchLike;
  alert: OpsAlert;
  log: Logger;
  now?: () => Date;
}

export interface CanarySummary {
  runKey: string;
  ran: boolean;
  reason?: string;
  shops: number;
  checked: number;
  ok: number;
  drift: number;
  failed: number;
  skipped: number;
  alerts: number;
}

// ------------------------------------------------------------------ pure parts (unit-tested)

function present(v: unknown): boolean {
  return typeof v === 'string' ? v.trim() !== '' : v !== undefined && v !== null;
}

function valid(field: CanaryField, raw: RawOffer, domain: string): boolean {
  switch (field) {
    case 'externalId':
      return raw.externalId.trim().length <= 200;
    case 'url':
      return /^https?:\/\//i.test(raw.url) && hostOnDomain(raw.url, domain);
    case 'title': {
      const t = raw.title.trim();
      return t.length >= 3 && t.length <= 500 && !/[<>]|\{\{|\}\}/.test(t);
    }
    case 'price':
    case 'oldPrice': {
      const r = parsePrice(raw[field], { format: raw.priceFormat ?? null, currency: raw.currency ?? null });
      return r.ok && r.minor > 0;
    }
    case 'shippingCost':
      return parseShippingCost(raw.shippingCost, { format: raw.priceFormat ?? null, currency: raw.currency ?? null }).ok;
    case 'currency':
      return /^[A-Z]{3}$/.test((raw.currency ?? '').trim().toUpperCase());
    case 'availability':
      return mapAvailability(raw.availability) !== 'unknown';
    case 'gtin':
      return normalizeGtin(raw.gtin) !== null;
    default:
      return true;
  }
}

/** Counts presence and validity of the canary fields over the offers of one page. */
export function fieldStats(offers: readonly RawOffer[], domain: string): CanaryFieldStats {
  const stats: CanaryFieldStats = { offers: offers.length, present: {}, invalid: {} };
  for (const raw of offers) {
    for (const f of CANARY_FIELDS) {
      if (!present(raw[f])) continue;
      stats.present[f] = (stats.present[f] ?? 0) + 1;
      if (!valid(f, raw, domain)) stats.invalid[f] = (stats.invalid[f] ?? 0) + 1;
    }
  }
  return stats;
}

export function mergeStats(list: readonly CanaryFieldStats[]): CanaryFieldStats {
  const out: CanaryFieldStats = { offers: 0, present: {}, invalid: {} };
  for (const s of list) {
    out.offers += s.offers;
    for (const [k, v] of Object.entries(s.present)) out.present[k] = (out.present[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.invalid)) out.invalid[k] = (out.invalid[k] ?? 0) + v;
  }
  return out;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Drift between this week's merged stats and last week's (null on the first run: then only the
 * absolute rules apply, i.e. core fields missing or unusable).
 */
export function evaluateDrift(current: CanaryFieldStats, baseline: CanaryFieldStats | null): string[] {
  const issues: string[] = [];
  const n = current.offers;
  if (n === 0) return issues;
  for (const f of CANARY_FIELDS) {
    const p = current.present[f] ?? 0;
    const bad = current.invalid[f] ?? 0;
    if (CORE_FIELDS.includes(f)) {
      if (p < n) issues.push(`${f}: present in ${p}/${n} offers`);
      if (bad > 0) issues.push(`${f}: ${bad}/${p} values unusable`);
      continue;
    }
    if (!baseline || baseline.offers === 0) continue;
    const before = (baseline.present[f] ?? 0) / baseline.offers;
    if (before >= PRESENT_BEFORE && p / n < PRESENT_NOW) issues.push(`${f}: present in ${pct(p / n)} of offers (last week ${pct(before)})`);
    const badBefore = (baseline.invalid[f] ?? 0) / Math.max(1, baseline.present[f] ?? 0);
    if (p > 0 && bad / p > INVALID_NOW && badBefore <= INVALID_BEFORE) {
      issues.push(`${f}: ${pct(bad / p)} of values unusable (last week ${pct(badBefore)})`);
    }
  }
  return issues;
}

/** ISO week of a Europe/Bucharest calendar day (`YYYY-MM-DD`): `2026-W44`. */
export function isoWeekKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function bucharestDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

// ------------------------------------------------------------------ targets

interface SourceRow extends Record<string, unknown> {
  shop_id: string | number;
  slug: string;
  domain: string;
  status: string;
  access_mode: string;
  source_id: string | number;
  kind: string;
  url: string;
  parser_key: string;
  config: Record<string, unknown> | null;
  enabled: boolean;
  kill_switch: boolean;
}

export interface ShopTargets {
  shop: { id: number; slug: string; domain: string; status: string; accessMode: string };
  /** Gate input: every source here is enabled and not killed. */
  source: { enabled: boolean; killSwitch: boolean };
  targets: CanaryTarget[];
}

/** Up to five URLs per active, directly crawled shop: listing pages first, then product pages that answered 200. */
export async function selectCanaryTargets(db: Db, opts: { shopSlugs?: string[] } = {}): Promise<ShopTargets[]> {
  const rows = (
    await db.execute<SourceRow>(sql`
      SELECT s.id AS shop_id, s.slug, s.domain, s.status, s.access_mode,
             src.id AS source_id, src.kind, src.url, src.parser_key, src.config, src.enabled, src.kill_switch
        FROM shops s JOIN shop_sources src ON src.shop_id = s.id
       WHERE s.status = 'active' AND s.access_mode = 'direct'
         AND src.kind IN ('listing', 'sitemap', 'product_page') AND src.enabled AND NOT src.kill_switch
       ORDER BY s.slug, src.last_success_at DESC NULLS LAST, src.id`)
  ).rows.filter((r) => !opts.shopSlugs || opts.shopSlugs.includes(r.slug));

  const byShop = new Map<number, SourceRow[]>();
  for (const r of rows) {
    const id = Number(r.shop_id);
    byShop.set(id, [...(byShop.get(id) ?? []), r]);
  }
  const out: ShopTargets[] = [];
  for (const [shopId, sources] of byShop) {
    const first = sources[0]!;
    const shop = { id: shopId, slug: first.slug, domain: first.domain, status: first.status, accessMode: first.access_mode };
    const targets: CanaryTarget[] = [];
    for (const s of sources) {
      if (s.kind !== 'listing' || !(s.parser_key in PAGE_PARSERS) || targets.length >= MAX_LISTING_TARGETS) continue;
      targets.push({ shopId, shopSlug: shop.slug, shopDomain: shop.domain, sourceId: Number(s.source_id), url: s.url, parserKey: s.parser_key, purpose: 'listing' });
    }
    // The parser product pages are read with: a product_page source's, else a sitemap source's `productParser`.
    const productSource =
      sources.find((s) => s.kind === 'product_page' && s.parser_key in PAGE_PARSERS) ??
      sources.find((s) => s.kind === 'sitemap' && String(s.config?.productParser ?? 'jsonld-product') in PAGE_PARSERS);
    if (productSource) {
      const parserKey = productSource.kind === 'product_page' ? productSource.parser_key : String(productSource.config?.productParser ?? 'jsonld-product');
      const urls = (
        await db.execute<{ url: string }>(sql`
          SELECT url FROM crawl_urls
           WHERE shop_id = ${shopId} AND kind = 'product' AND gone_at IS NULL AND last_status = 200
           ORDER BY last_fetched_at DESC NULLS LAST, id
           LIMIT ${CANARY_URLS_PER_SHOP - targets.length}`)
      ).rows;
      for (const u of urls) {
        targets.push({ shopId, shopSlug: shop.slug, shopDomain: shop.domain, sourceId: Number(productSource.source_id), url: u.url, parserKey, purpose: 'product' });
      }
    }
    if (targets.length > 0) out.push({ shop, source: { enabled: true, killSwitch: false }, targets });
  }
  return out;
}

// ------------------------------------------------------------------ the run

interface CheckedRow {
  status: CanaryStatus;
  httpStatus: number | null;
  offers: number;
  fields: CanaryFieldStats | null;
  detail: string | null;
  stop: boolean;
  /** The shop refused us (403, 429, challenge): the fetch layer paused the host. */
  blocked?: boolean;
}

async function checkTarget(deps: CanaryDeps, t: CanaryTarget): Promise<CheckedRow> {
  const res = await deps.fetcher.fetchPolite(t.url, { shopSlug: t.shopSlug, purpose: t.purpose });
  if (res.skipped) {
    // robots.txt changed, the host is paused, the budget is spent: nothing to compare, and no point going on (except robots).
    return { status: 'skipped', httpStatus: null, offers: 0, fields: null, detail: `skipped: ${res.skipped}`, stop: res.skipped !== 'robots_disallowed' };
  }
  if (res.blocked) {
    return { status: 'fetch_failed', httpStatus: res.status, offers: 0, fields: null, detail: `blocked: ${res.blockReason ?? 'blocked'}`, stop: true, blocked: true };
  }
  if (!res.ok || res.body === null) {
    return { status: 'fetch_failed', httpStatus: res.status, offers: 0, fields: null, detail: `HTTP ${res.status}${res.error ? ` (${res.error})` : ''}`, stop: false };
  }
  try {
    const observedAt = (deps.now?.() ?? new Date()).toISOString();
    const parsed = parsePageDetailed(t.parserKey, res.body, { url: res.finalUrl, shopSlug: t.shopSlug, observedAt });
    const fields = fieldStats(parsed.offers, t.shopDomain);
    return {
      status: parsed.offers.length === 0 ? 'drift' : 'ok',
      httpStatus: res.status,
      offers: parsed.offers.length,
      fields,
      detail: parsed.offers.length === 0 ? 'no offers parsed (layout change?)' : null,
      stop: false,
    };
  } catch (err) {
    return { status: 'drift', httpStatus: res.status, offers: 0, fields: null, detail: `parser error: ${(err as Error).message}`.slice(0, 500), stop: false };
  }
}

async function previousStats(db: Db, shopId: number, parserKey: string, runKey: string): Promise<CanaryFieldStats | null> {
  const prev = (
    await db.execute<{ run_key: string }>(sql`
      SELECT run_key FROM extractor_canaries
       WHERE shop_id = ${shopId} AND parser_key = ${parserKey} AND run_key < ${runKey} AND status IN ('ok', 'drift') AND fields IS NOT NULL
       ORDER BY run_key DESC LIMIT 1`)
  ).rows[0];
  if (!prev) return null;
  const rows = (
    await db.execute<{ fields: CanaryFieldStats }>(sql`
      SELECT fields FROM extractor_canaries
       WHERE shop_id = ${shopId} AND parser_key = ${parserKey} AND run_key = ${prev.run_key} AND fields IS NOT NULL`)
  ).rows;
  return mergeStats(rows.map((r) => r.fields));
}

/** Compares this week's rows of one shop with last week's, marks drift and alerts once per parser. */
async function evaluateShop(deps: CanaryDeps, shop: ShopTargets['shop'], runKey: string): Promise<{ drift: number; alerts: number }> {
  const rows = (
    await deps.db.execute<{ id: string | number; parser_key: string; status: CanaryStatus; fields: CanaryFieldStats | null; detail: string | null; url: string; issues: string[] }>(sql`
      SELECT id, parser_key, status, fields, detail, url, issues FROM extractor_canaries
       WHERE shop_id = ${shop.id} AND run_key = ${runKey}`)
  ).rows;
  let drift = 0;
  let alerts = 0;
  for (const parserKey of new Set(rows.map((r) => r.parser_key))) {
    const group = rows.filter((r) => r.parser_key === parserKey);
    const parsedRows = group.filter((r) => r.fields !== null);
    const issues = [
      ...group.filter((r) => r.status === 'drift' && r.detail).map((r) => `${r.url}: ${r.detail}`),
      ...evaluateDrift(mergeStats(parsedRows.map((r) => r.fields!)), await previousStats(deps.db, shop.id, parserKey, runKey)),
    ];
    if (issues.length === 0) continue;
    const alreadyAlerted = group.some((r) => Array.isArray(r.issues) && r.issues.length > 0);
    await deps.db.execute(sql`
      UPDATE extractor_canaries SET issues = ${JSON.stringify(issues)}::jsonb,
             status = CASE WHEN status = 'ok' THEN 'drift' ELSE status END
       WHERE shop_id = ${shop.id} AND run_key = ${runKey} AND parser_key = ${parserKey}`);
    drift += group.filter((r) => r.status === 'ok' || r.status === 'drift').length;
    if (!alreadyAlerted) {
      alerts++;
      await deps.alert(`Extractor drift: ${shop.slug} (${parserKey})`, { shop: shop.slug, parser: parserKey, run: runKey, issues: issues.slice(0, 10) });
    }
  }
  return { drift, alerts };
}

/** One weekly canary run (the job handler and `make verify M=21` call this). */
export async function runExtractorCanary(deps: CanaryDeps, opts: { shopSlugs?: string[]; runKey?: string } = {}): Promise<CanarySummary> {
  const now = deps.now?.() ?? new Date();
  const runKey = opts.runKey ?? isoWeekKey(bucharestDay(now));
  const summary: CanarySummary = { runKey, ran: false, shops: 0, checked: 0, ok: 0, drift: 0, failed: 0, skipped: 0, alerts: 0 };
  if (!(await isFlagEnabled(deps.db, CANARY_FLAG))) return { ...summary, reason: `flag ${CANARY_FLAG} is off` };

  const done = new Set(
    (await deps.db.execute<{ shop_id: string | number; url: string }>(sql`SELECT shop_id, url FROM extractor_canaries WHERE run_key = ${runKey}`)).rows.map(
      (r) => `${Number(r.shop_id)} ${r.url}`,
    ),
  );
  summary.ran = true;
  for (const entry of await selectCanaryTargets(deps.db, opts)) {
    const gate = await checkGates(deps.db, deps.env, { shop: entry.shop, source: entry.source });
    if (!gate.ok) {
      deps.log.info({ shop: entry.shop.slug, run_id: runKey, reason: gate.reason }, 'canary: shop gated off');
      continue;
    }
    summary.shops++;
    for (const t of entry.targets) {
      if (done.has(`${t.shopId} ${t.url}`)) continue;
      const r = await checkTarget(deps, t);
      await deps.db.insert(extractorCanaries).values({
        runKey,
        shopId: t.shopId,
        sourceId: t.sourceId,
        url: t.url,
        parserKey: t.parserKey,
        purpose: t.purpose,
        checkedAt: deps.now?.() ?? new Date(),
        status: r.status,
        httpStatus: r.httpStatus,
        offers: r.offers,
        fields: r.fields,
        detail: r.detail,
      });
      summary.checked++;
      if (r.status === 'fetch_failed') summary.failed++;
      if (r.status === 'skipped') summary.skipped++;
      if (r.blocked) {
        // Source runs treat an existing pause as already alerted, so the canary must say it caused one.
        summary.alerts++;
        await deps.alert(`Extractor canary blocked: ${t.shopSlug}`, { shop: t.shopSlug, url: t.url, run: runKey, detail: r.detail, status: r.httpStatus });
      }
      if (r.stop) break;
    }
    const e = await evaluateShop(deps, entry.shop, runKey);
    summary.alerts += e.alerts;
  }
  const counts = (
    await deps.db.execute<{ status: CanaryStatus; n: string }>(sql`SELECT status, count(*)::text AS n FROM extractor_canaries WHERE run_key = ${runKey} GROUP BY status`)
  ).rows;
  for (const c of counts) {
    if (c.status === 'ok') summary.ok = Number(c.n);
    if (c.status === 'drift') summary.drift = Number(c.n);
  }
  deps.log.info({ ...summary, run_id: runKey }, 'extractor canary done');
  return summary;
}
