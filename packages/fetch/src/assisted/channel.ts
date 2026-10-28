import { FetchError } from '../errors';
import { hostKey } from '../site';
import { bucharestDay } from '../time';
import type { AssistedChannel, AssistedFetchRequest, AssistedFetchResponse, FetchErrorCode, FetchLogger, FetchPurpose } from '../types';
import type { AssistedLedger, AssistedLedgerEntry } from './ledger';
import { zytePricing } from './pricing';
import { assistedScopeRefusal } from './scope';
import type { AssistedClient, AssistedClientResponse, AssistedPricing, AssistedShopSettings } from './types';

/**
 * The assisted channel as the fetch layer sees it (`FetcherDeps.assisted`): a vendor client plus
 * the cost ledger and the monthly hard cap (ADR-015, ADR-022). Politeness (robots.txt, interval,
 * budgets, windows, pauses) stays in the fetcher; this layer adds what is about scope, money and
 * the vendor:
 *   - `check()` runs inside the fetcher's gate before any slot or budget is used: it refuses a shop
 *     the founders did not designate (eMAG never), anything but public robots.txt, sitemap,
 *     listing and product pages on the shop's own web host, a call that would not fit under the
 *     month's cap at its highest price, and calls while the vendor refuses us (bad key, suspended
 *     account, a domain it will not serve);
 *   - `fetch()` checks again, books the call in the ledger (atomically against the cap: a call that
 *     does not fit is never sent), asks the vendor, and gives the booking back when the vendor does
 *     not bill the call. So concurrent requests, retries and several processes can never spend
 *     more than the cap.
 */

export interface AssistedCheckContext {
  shopSlug?: string;
  host: string;
  purpose: FetchPurpose;
  /** The request URL (the fetcher always passes it). */
  url?: string;
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
  /**
   * Prices, exit country and web hosts per shop (registry `domain`, `crawl_policy.assisted_*`).
   * Default: the dearest tier, no host check. When it fails, no call is made.
   */
  shopSettings?: (shopSlug: string) => AssistedShopSettings | Promise<AssistedShopSettings>;
  now?: () => number;
  logger?: FetchLogger;
  /** How long a refusal of our account (401/403) stops every call. Default 1 h. */
  accountRefusalPauseMs?: number;
  /** How long a refused domain (451) stops calls for that shop. Default 24 h. */
  domainRefusalPauseMs?: number;
  /** Month-to-date spend is re-read at most this often by `check()`. Default 2 s (`fetch()` books atomically anyway). */
  spendCacheMs?: number;
}

export interface AssistedChannelHandle extends AssistedChannel {
  readonly vendor: string;
  readonly monthlyCapCents: number;
  check(ctx: AssistedCheckContext): Promise<AssistedRefusal | null>;
  /** Month-to-date spend in EUR cents, booked calls included. */
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

/** The most one more billable call can add to a ledger row (row costs are rounded up to a cent). */
export function maxCallCents(pricing: AssistedPricing, rendered: boolean): number {
  return Math.ceil(Math.max(0, rendered ? Math.max(pricing.renderCentsPer1k, pricing.httpCentsPer1k) : pricing.httpCentsPer1k) / 1000);
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
  let spendCache: { at: number; month: string; cents: number } | null = null;

  const monthStart = () => `${bucharestDay(now()).slice(0, 8)}01`;

  async function settingsFor(shopSlug: string): Promise<AssistedShopSettings> {
    if (opts.shopSettings) return opts.shopSettings(shopSlug);
    return { pricing: zytePricing() };
  }

  async function monthToDateCents(): Promise<number> {
    const month = monthStart();
    if (!spendCache || spendCache.month !== month || now() - spendCache.at > spendCacheMs) {
      spendCache = { at: now(), month, cents: await opts.ledger.monthToDateCents(month) };
    }
    return spendCache.cents;
  }

  /** Scope and vendor state: everything but money. */
  async function scopeRefusal(ctx: AssistedCheckContext): Promise<{ refusal: AssistedRefusal } | { settings: AssistedShopSettings }> {
    const t = now();
    if (t < accountRefusedUntil) {
      return { refusal: { code: 'assisted_refused', detail: `${accountRefusal} (no assisted requests until ${new Date(accountRefusedUntil).toISOString()})` } };
    }
    const shop = ctx.shopSlug ? shopRefusedUntil.get(ctx.shopSlug) : undefined;
    if (shop && t < shop.until) {
      return { refusal: { code: 'assisted_refused', detail: `${shop.detail} (until ${new Date(shop.until).toISOString()})` } };
    }
    // Designation and page scope first, without any I/O.
    const early = assistedScopeRefusal({ shopSlug: ctx.shopSlug, host: ctx.host, purpose: ctx.purpose, url: ctx.url });
    if (early) return { refusal: { code: 'assisted_refused', detail: early } };
    let settings: AssistedShopSettings;
    try {
      settings = await settingsFor(ctx.shopSlug as string);
    } catch (err) {
      return { refusal: { code: 'assisted_refused', detail: `shop settings unavailable (${String(err)}); assisted requests stopped` } };
    }
    const hostRefusal = assistedScopeRefusal({ shopSlug: ctx.shopSlug, host: ctx.host, purpose: ctx.purpose, hosts: settings.hosts });
    if (hostRefusal) return { refusal: { code: 'assisted_refused', detail: hostRefusal } };
    return { settings };
  }

  async function check(ctx: AssistedCheckContext): Promise<AssistedRefusal | null> {
    const scoped = await scopeRefusal(ctx);
    if ('refusal' in scoped) return scoped.refusal;
    let spent: number;
    try {
      spent = await monthToDateCents();
    } catch (err) {
      // No ledger, no spending: fail closed.
      return { code: 'assisted_cap', detail: `cost ledger unavailable (${String(err)}); assisted requests stopped` };
    }
    // The dearest this call can be (the fetcher decides the tier later): never start one that cannot fit.
    const worst = maxCallCents(scoped.settings.pricing, renderablePurpose(ctx.purpose));
    if (spent + worst > capCents) {
      return { code: 'assisted_cap', detail: `monthly cap reached: ${euros(spent)} spent of ${euros(capCents)} (ASSISTED_MONTHLY_CAP_EUR)` };
    }
    return null;
  }

  async function release(entry: AssistedLedgerEntry): Promise<void> {
    try {
      await opts.ledger.release(entry);
    } catch (err) {
      // The booking stays: the ledger then counts a call the vendor did not bill (the safe side).
      log.error({ err: String(err), shop: entry.shopSlug }, 'assisted channel: could not give back the booking of an unbilled call');
    } finally {
      spendCache = null;
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
    /**
     * Throws `FetchError('assisted_refused' | 'assisted_cap')` when the call is not sent (out of
     * scope, vendor refusing us, the booking does not fit under the cap, the ledger unwritable):
     * the fetcher turns that into `skipped: 'assisted_unavailable'`, never a shop failure.
     */
    async fetch(url: string, req: AssistedFetchRequest): Promise<AssistedFetchResponse> {
      const host = hostKey(new URL(url));
      const scoped = await scopeRefusal({ shopSlug: req.shopSlug, host, purpose: req.purpose, url });
      if ('refusal' in scoped) throw new FetchError(scoped.refusal.code, scoped.refusal.detail);
      const { settings } = scoped;
      const shopSlug = req.shopSlug as string;
      // The browser tier is for HTML pages only: robots.txt and sitemaps are plain files (a browser
      // would wrap them in HTML) and cost a tenth on the HTTP tier.
      const render = req.render && renderablePurpose(req.purpose);
      const entry: AssistedLedgerEntry = { day: bucharestDay(now()), shopSlug, vendor, rendered: render, pricing: settings.pricing };
      let booked: boolean;
      try {
        booked = await opts.ledger.reserve(entry, monthStart(), capCents);
      } catch (err) {
        throw new FetchError('assisted_cap', `cost ledger unavailable (${String(err)}); the call was not sent`);
      } finally {
        spendCache = null;
      }
      if (!booked) {
        throw new FetchError('assisted_cap', `monthly cap reached: this call would pass ${euros(capCents)} (ASSISTED_MONTHLY_CAP_EUR); not sent`);
      }
      // If this throws (the caller aborted after the call left), we cannot know whether it was
      // billed: the booking stays (the cap errs on the safe side).
      const res = await opts.client.fetch(url, { render, country: settings.country, timeoutMs: req.timeoutMs, signal: req.signal });
      if (!res.billable) await release(entry);
      noteRefusal(res, shopSlug);
      if (res.outcome !== 'success') {
        log.warn({ shop: shopSlug, url, outcome: res.outcome, vendorStatus: res.vendorStatus, vendorError: res.vendorError }, 'assisted request failed at the vendor');
      }
      return res;
    },
  };
}
