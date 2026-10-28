import { bucharestDay } from '../time';
import type { AssistedChannel, AssistedFetchRequest, AssistedFetchResponse, FetchErrorCode, FetchLogger, FetchPurpose } from '../types';
import type { AssistedLedger } from './ledger';
import { zytePricing } from './pricing';
import type { AssistedClient, AssistedClientResponse, AssistedShopSettings } from './types';

/**
 * The assisted channel as the fetch layer sees it (`FetcherDeps.assisted`): a vendor client plus
 * the cost ledger and the monthly hard cap (ADR-015). Politeness (robots.txt, interval, budgets,
 * windows, pauses) stays in the fetcher; this layer adds only what is about money and the vendor:
 *   - `check()` runs inside the fetcher's gate before any slot or budget is used: it refuses when
 *     the month's spend has reached the cap, or while the vendor refuses us (bad key, suspended
 *     account, a domain it will not serve);
 *   - `fetch()` asks the vendor and records the call in the ledger (billable or not), so the next
 *     `check()` sees it. At most the calls already in flight can pass the cap (one per shop host).
 */

export interface AssistedCheckContext {
  shopSlug?: string;
  host: string;
  purpose: FetchPurpose;
}

export interface AssistedRefusal {
  code: FetchErrorCode;
  detail: string;
}

export interface AssistedChannelOptions {
  client: AssistedClient;
  ledger: AssistedLedger;
  /** Hard monthly stop in EUR cents (`ASSISTED_MONTHLY_CAP_EUR` × 100). */
  monthlyCapCents: number;
  /** Prices and exit country per shop (registry `crawl_policy.assisted_*`). Default: dearest tier. */
  shopSettings?: (shopSlug: string) => AssistedShopSettings | Promise<AssistedShopSettings>;
  now?: () => number;
  logger?: FetchLogger;
  /** How long a refusal of our account (401/403) stops every call. Default 1 h. */
  accountRefusalPauseMs?: number;
  /** How long a refused domain (451) stops calls for that shop. Default 24 h. */
  domainRefusalPauseMs?: number;
  /** Month-to-date spend is re-read at most this often. Default 2 s. */
  spendCacheMs?: number;
}

export interface AssistedChannelHandle extends AssistedChannel {
  readonly vendor: string;
  readonly monthlyCapCents: number;
  check(ctx: AssistedCheckContext): Promise<AssistedRefusal | null>;
  /** Month-to-date spend in EUR cents, including calls the ledger failed to record. */
  monthToDateCents(): Promise<number>;
}

const HOUR = 3_600_000;
const NOOP: FetchLogger = { debug() {}, info() {}, warn() {}, error() {} };

function euros(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

/** Only HTML pages may use the vendor's browser tier. */
export function renderablePurpose(purpose: FetchPurpose): boolean {
  return purpose === 'listing' || purpose === 'product' || purpose === 'probe';
}

export function createAssistedChannel(opts: AssistedChannelOptions): AssistedChannelHandle {
  const now = opts.now ?? Date.now;
  const log = opts.logger ?? NOOP;
  const capCents = Math.max(0, Math.floor(opts.monthlyCapCents));
  const accountPause = opts.accountRefusalPauseMs ?? HOUR;
  const domainPause = opts.domainRefusalPauseMs ?? 24 * HOUR;
  const spendCacheMs = opts.spendCacheMs ?? 2000;
  const vendor = opts.client.vendor;

  let accountRefusedUntil = 0;
  let accountRefusal = '';
  const shopRefusedUntil = new Map<string, { until: number; detail: string }>();
  // Vendor spend the ledger failed to record (database down): counted until this process exits.
  let unrecordedMilliCents = 0;
  let spendCache: { at: number; month: string; cents: number } | null = null;

  const monthStart = () => `${bucharestDay(now()).slice(0, 8)}01`;

  async function settingsFor(shopSlug: string): Promise<AssistedShopSettings> {
    try {
      if (opts.shopSettings) return await opts.shopSettings(shopSlug);
    } catch (err) {
      log.error({ err: String(err), shop: shopSlug }, 'assisted channel: shop settings unavailable; using the dearest tier');
    }
    return { pricing: zytePricing() };
  }

  async function monthToDateCents(): Promise<number> {
    const month = monthStart();
    if (!spendCache || spendCache.month !== month || now() - spendCache.at > spendCacheMs) {
      spendCache = { at: now(), month, cents: await opts.ledger.monthToDateCents(month) };
    }
    return spendCache.cents + Math.ceil(unrecordedMilliCents / 1000);
  }

  async function check(ctx: AssistedCheckContext): Promise<AssistedRefusal | null> {
    const t = now();
    if (t < accountRefusedUntil) {
      return { code: 'assisted_refused', detail: `${accountRefusal} (no assisted requests until ${new Date(accountRefusedUntil).toISOString()})` };
    }
    const shop = ctx.shopSlug ? shopRefusedUntil.get(ctx.shopSlug) : undefined;
    if (shop && t < shop.until) {
      return { code: 'assisted_refused', detail: `${shop.detail} (until ${new Date(shop.until).toISOString()})` };
    }
    let spent: number;
    try {
      spent = await monthToDateCents();
    } catch (err) {
      // No ledger, no spending: fail closed.
      return { code: 'assisted_cap', detail: `cost ledger unavailable (${String(err)}); assisted requests stopped` };
    }
    if (spent >= capCents) {
      return { code: 'assisted_cap', detail: `monthly cap reached: ${euros(spent)} spent of ${euros(capCents)} (ASSISTED_MONTHLY_CAP_EUR)` };
    }
    return null;
  }

  async function record(shopSlug: string, rendered: boolean, billable: boolean, settings: AssistedShopSettings): Promise<void> {
    try {
      await opts.ledger.record({ day: bucharestDay(now()), shopSlug, vendor, rendered, billable, pricing: settings.pricing });
      spendCache = null;
    } catch (err) {
      if (billable) unrecordedMilliCents += rendered ? settings.pricing.renderCentsPer1k : settings.pricing.httpCentsPer1k;
      log.error({ err: String(err), shop: shopSlug }, 'assisted channel: cost ledger write failed; spend kept in memory');
    }
  }

  function noteRefusal(res: AssistedClientResponse, shopSlug: string): void {
    if (res.outcome !== 'refused') return;
    if (res.vendorStatus === 451) {
      shopRefusedUntil.set(shopSlug, { until: now() + domainPause, detail: `${vendor} refuses this shop's domain: ${res.error ?? ''}`.trim() });
    } else {
      accountRefusedUntil = now() + accountPause;
      accountRefusal = `${vendor} refuses our account: ${res.error ?? `HTTP ${res.vendorStatus}`}`;
    }
    log.error({ shop: shopSlug, vendorStatus: res.vendorStatus, vendorError: res.vendorError }, 'assisted vendor refused the request');
  }

  return {
    vendor,
    monthlyCapCents: capCents,
    check,
    monthToDateCents,
    async fetch(url: string, req: AssistedFetchRequest): Promise<AssistedFetchResponse> {
      const shopSlug = req.shopSlug ?? 'unknown';
      if (!req.shopSlug) log.error({ url }, 'assisted request without a shop: its cost is recorded under "unknown"');
      // The fetcher checked moments ago; checking again closes most of the race at the cap.
      const refusal = await check({ shopSlug, host: new URL(url).host, purpose: req.purpose });
      if (refusal) return { status: 0, body: null, error: refusal.detail };
      const settings = await settingsFor(shopSlug);
      // The browser tier is for HTML pages only: robots.txt, sitemaps and feeds are plain files
      // (a browser would wrap them in HTML) and cost a tenth on the HTTP tier.
      const render = req.render && renderablePurpose(req.purpose);
      let res: AssistedClientResponse;
      try {
        res = await opts.client.fetch(url, { render, country: settings.country, timeoutMs: req.timeoutMs, signal: req.signal });
      } catch (error) {
        // An abort by the caller after the call left: we cannot know whether it was billed;
        // record it as billable (the cap errs on the safe side).
        await record(shopSlug, render, true, settings);
        throw error;
      }
      await record(shopSlug, render, res.billable, settings);
      noteRefusal(res, shopSlug);
      if (res.outcome !== 'success') {
        log.warn({ shop: shopSlug, url, outcome: res.outcome, vendorStatus: res.vendorStatus, vendorError: res.vendorError }, 'assisted request failed at the vendor');
      }
      return res;
    },
  };
}
