import { setTimeout as sleepTimer } from 'node:timers/promises';
import { DEFAULT_MIN_INTERVAL_MS, defaultDomainPolicy, type DomainPolicy } from '@pretoscop/config/policy';
import { Agent, type Dispatcher } from 'undici';
import { decodeText, gunzipFile, isGzipMagic, isTextualContentType, looksLikeText } from './decode';
import { detectBlock, detectChallengeRedirect, looksLikeHtml, type BlockDetection } from './detect';
import { FetchError, fetchCodeOf } from './errors';
import {
  BOT_PRODUCT_TOKEN,
  USER_AGENT_FORMAT,
  buildRequestHeaders,
  buildUserAgent,
  isValidBotInfoUrl,
  resolveBotInfoUrl,
  robotsTokensFor,
} from './identity';
import { processHostLocks } from './mutex';
import {
  ROBOTS_PARSE_LIMIT_BYTES,
  evaluateRobots,
  findIgnoredGroups,
  parseRobotsTxt,
  robotsPathOf,
  selectRobotsGroups,
  type ParsedRobots,
} from './robots';
import { canonicalUrl, hostKey, normalizeHost, sameSite, toOrigin } from './site';
import type { DomainPause, DomainStateStore, RobotsCacheEntry } from './state/types';
import { bucharestDay, isWithinAllowedHours } from './time';
import { httpGet } from './transport';
import { signerFromEnv, type RequestSigner } from './signing';
import type {
  AssistedChannel,
  AssistedFetchResponse,
  BlockReason,
  Channel,
  FetchErrorCode,
  FetchLogger,
  FetchPoliteOptions,
  FetchPurpose,
  FetchResult,
  Fetcher,
  FetcherDeps,
  RequestLogEntry,
  RequestLogSink,
  RobotsDecisionInfo,
  SkipReason,
} from './types';

const HOUR = 60 * 60 * 1000;

/** Pause after 403, challenge, CAPTCHA redirect or transport block. */
export const PAUSE_BLOCK_MS = 24 * HOUR;
/** Minimum pause after 429/503 (longer when `Retry-After` asks for it). */
export const PAUSE_RATE_LIMIT_MIN_MS = HOUR;
/** `Retry-After` values beyond this are capped (a pause can always be lifted by hand). */
export const PAUSE_RETRY_AFTER_MAX_MS = 7 * 24 * HOUR;
/** Consecutive non-block failures before the host is paused. */
export const FAILURE_PAUSE_THRESHOLD = 3;
export const FAILURE_PAUSE_BASE_MS = HOUR;
export const FAILURE_PAUSE_MAX_MS = 24 * HOUR;
export const MAX_REDIRECTS = 5;
export const ROBOTS_TTL_MS = 24 * HOUR;
/** robots.txt failures (5xx, network, blocks) are retried after an hour, not 24 h. */
export const ROBOTS_FAILURE_TTL_MS = HOUR;
export const ROBOTS_MAX_BYTES = ROBOTS_PARSE_LIMIT_BYTES;
/** Crawl-delay values above this are capped (logged). */
export const MAX_CRAWL_DELAY_SEC = 3600;
/** Extra random delay on top of the interval: 0–10 %. */
export const JITTER_RATIO = 0.1;
/**
 * Added to every slot so that differences in state-store latency between two callers (the wait
 * is computed when the store answers, not when the caller starts sleeping) cannot eat into the
 * interval.
 */
export const SLOT_SAFETY_MARGIN_MS = 100;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_RETRY_BASE_MS = 10_000;
/** How far past its own timeout a failed request must surface to count as a local suspension. */
export const LOCAL_SUSPEND_SLACK_MS = 30_000;

/** The assisted client gets `timeoutMs`; the fetch layer gives up `min(timeoutMs, 2 s)` later. */
export const ASSISTED_TIMEOUT_GRACE_MS = 2000;

const PURPOSES: ReadonlySet<string> = new Set<FetchPurpose>(['robots', 'sitemap', 'listing', 'product', 'feed', 'probe']);

const NOOP_LOGGER: FetchLogger = { debug() {}, info() {}, warn() {}, error() {} };

interface CallContext {
  purpose: FetchPurpose;
  opts: FetchPoliteOptions;
  shopSlug?: string;
  log: FetchLogger;
  timeoutMs: number;
  maxBytes: number;
  /** The bulk-crawl window (`allowedHours`) applies: everything except robots.txt. */
  checkHours: boolean;
  /**
   * Channel of the request chain, fixed when it starts and never switched mid-chain: an assisted
   * chain stays on the vendor for every hop (and the robots.txt it needs); a direct chain never
   * follows onto a host that may only be read through the assisted channel.
   */
  chainChannel?: Channel;
  /** `assistedRender` of the policy that started an assisted chain. */
  chainRender?: boolean;
}

interface ChainFlags {
  /** robots.txt: RFC 9309 follows redirects across hosts. */
  followAnyHost: boolean;
  /** Pages: robots.txt is checked again for every redirect target. */
  checkRobots: boolean;
  /** Keep the first `maxBytes` instead of failing (robots.txt). */
  truncate: boolean;
  robotsGroup?: string;
  robotsIgnored?: string[];
}

/** Why no request may be made right now. */
interface Denial {
  skipped: SkipReason;
  blocked?: boolean;
  blockReason?: BlockReason;
  blockDetail?: string;
  error?: string;
  errorCode?: FetchErrorCode;
}

interface HopResponse {
  kind: 'response';
  url: URL;
  channel: Channel;
  status: number;
  headers: Record<string, string>;
  bytes: Buffer;
  text: string | null;
  contentType: string | null;
  wireBytes: number;
  truncated: boolean;
  durationMs: number;
  waitMs: number;
  startedAt: number;
  vendorBlock?: { reason: string; detail: string };
  vendorError?: string;
}

interface HopError {
  kind: 'error';
  url: URL;
  channel: Channel;
  error: unknown;
  /** The caller aborted while the request was on the wire. */
  aborted: boolean;
  durationMs: number;
  waitMs: number;
  startedAt: number;
}

interface HopSkip extends Denial {
  kind: 'skip';
  url: URL;
  channel: Channel;
  waitMs: number;
}

type HopOutcome = HopResponse | HopError | HopSkip;

/** A hop returned with its host lock still held, so the outcome is classified (and any pause or
 * failure written) before the next queued request for that host can start. */
type LockedHop = HopOutcome & { release: () => void };

interface ExecOutcome {
  result: FetchResult;
  truncated: boolean;
  retryable: boolean;
  waitedMs: number;
  /** At least one request of this attempt reached the network. */
  sent: boolean;
}

interface RobotsState {
  origin: string;
  entry: RobotsCacheEntry | null;
  parsed: ParsedRobots | null;
  source: 'cache' | 'network' | 'none';
  /** Set when robots.txt could not be fetched (host paused, access off, budget). */
  unavailable?: { skipped?: SkipReason; blocked: boolean; blockReason?: BlockReason; detail: string };
  fetchResult?: FetchResult;
}

interface RobotsVerdict {
  allowed: boolean;
  group: string;
  ignored?: string[];
  blocked?: boolean;
  blockReason?: BlockReason;
  blockDetail?: string;
  error?: string;
  errorCode?: FetchErrorCode;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isAbort(error: unknown): boolean {
  const e = error as { name?: unknown; code?: unknown } | null;
  return fetchCodeOf(error) === 'aborted' || e?.name === 'AbortError' || e?.code === 'ABORT_ERR';
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function envFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function describePause(pause: DomainPause): string {
  return `${pause.reason} (paused until ${new Date(pause.until).toISOString()})`;
}

function emptyResult(url: string, channel: Channel): FetchResult {
  return {
    url,
    finalUrl: url,
    status: 0,
    ok: false,
    blocked: false,
    notModified: false,
    body: null,
    bodyBytes: null,
    contentType: null,
    headers: {},
    durationMs: 0,
    waitedMs: 0,
    channel,
    attempts: 0,
  };
}

function channelOf(policy: DomainPolicy): Channel {
  return policy.accessMode === 'assisted' ? 'assisted' : 'direct';
}

function minIntervalOf(policy: DomainPolicy): number {
  return Number.isFinite(policy.minIntervalMs) && policy.minIntervalMs >= 0 ? policy.minIntervalMs : DEFAULT_MIN_INTERVAL_MS;
}

/**
 * Rejects as soon as `signal` aborts, even if `promise` never settles (a hung vendor call, a shared
 * robots.txt fetch). `reason` replaces the signal's own reason when given.
 */
function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal, reason?: () => unknown): Promise<T> {
  const why = () => (reason ? reason() : signal.reason);
  if (signal.aborted) return Promise.reject(why());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(why());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

class PoliteFetcher implements Fetcher {
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly random: () => number;
  private readonly store: DomainStateStore;
  private readonly policyFor: (host: string) => DomainPolicy | Promise<DomainPolicy>;
  private readonly crawlEnabled: boolean;
  private readonly logger: FetchLogger;
  private readonly requestLog: RequestLogSink | undefined;
  private readonly assisted: AssistedChannel | undefined;
  private readonly dispatcher: Dispatcher;
  private readonly ownDispatcher: Agent | null;
  private readonly pageUserAgent: string;
  private readonly feedUserAgent: string;
  /** Web Bot Auth (M21): adds Signature-Agent, Signature-Input and Signature to direct requests. */
  private readonly signer: RequestSigner | undefined;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxBytes: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly robotsInflight = new Map<string, Promise<RobotsState>>();
  private readonly robotsMemo = new Map<string, { fetchedAt: number; parsed: ParsedRobots }>();

  constructor(deps: FetcherDeps) {
    if (!deps.stateStore) throw new Error('createFetcher: stateStore is required');
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms, signal) => sleepTimer(ms, undefined, signal ? { signal } : undefined));
    this.random = deps.random ?? Math.random;
    this.store = deps.stateStore;
    this.policyFor = deps.policyFor ?? ((host) => defaultDomainPolicy(host));
    // Fail closed, like @pretoscop/config: crawling happens only when explicitly switched on.
    this.crawlEnabled = deps.crawlEnabled ?? envFlag(process.env.CRAWL_ENABLED, false);
    this.logger = deps.logger ?? NOOP_LOGGER;
    this.requestLog = deps.requestLog;
    this.assisted = deps.assisted;
    this.defaultTimeoutMs = positive(deps.defaultTimeoutMs, DEFAULT_TIMEOUT_MS);
    this.defaultMaxBytes = positive(deps.defaultMaxBytes, DEFAULT_MAX_BYTES);
    this.maxRetries = Math.max(0, Math.floor(deps.retry?.maxRetries ?? DEFAULT_MAX_RETRIES));
    this.retryBaseMs = Math.max(0, deps.retry?.baseDelayMs ?? DEFAULT_RETRY_BASE_MS);

    if (deps.botInfoUrl !== undefined && !isValidBotInfoUrl(deps.botInfoUrl)) {
      throw new Error(`createFetcher: invalid botInfoUrl "${deps.botInfoUrl}"`);
    }
    const infoUrl = resolveBotInfoUrl(deps.botInfoUrl ?? process.env.BOT_INFO_URL);
    if (deps.userAgent !== undefined) {
      // Test hook only. Even then it must be our exact UA shape: only version and URL may differ.
      if (!USER_AGENT_FORMAT.test(deps.userAgent)) {
        throw new Error(`createFetcher: userAgent override must look like "${buildUserAgent('page', infoUrl)}"`);
      }
      this.pageUserAgent = deps.userAgent;
      this.feedUserAgent = deps.userAgent;
    } else {
      this.pageUserAgent = buildUserAgent('page', infoUrl);
      this.feedUserAgent = buildUserAgent('feed', infoUrl);
    }
    this.signer = deps.signer === undefined ? signerFromEnv(process.env, infoUrl) : (deps.signer ?? undefined);

    if (deps.dispatcher) {
      this.dispatcher = deps.dispatcher;
      this.ownDispatcher = null;
    } else {
      this.ownDispatcher = new Agent({
        connect: { timeout: positive(deps.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS) },
        headersTimeout: this.defaultTimeoutMs,
        bodyTimeout: this.defaultTimeoutMs,
      });
      this.dispatcher = this.ownDispatcher;
    }
  }

  // ---------------------------------------------------------------- public API

  async fetchPolite(rawUrl: string, opts: FetchPoliteOptions): Promise<FetchResult> {
    if (!PURPOSES.has(opts?.purpose)) {
      throw new TypeError(`fetchPolite: unknown purpose "${String(opts?.purpose)}"`);
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return this.invalidUrl(rawUrl, opts, 'invalid_url', `not a valid absolute URL: ${rawUrl}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return this.invalidUrl(rawUrl, opts, 'unsupported_scheme', `only http(s) URLs are fetched: ${parsed.protocol}`);
    }
    const url = canonicalUrl(parsed);
    // 'robots' is a property of the URL, not a caller's choice: it skips the robots check and the
    // crawl window, so it is accepted for /robots.txt only.
    if (opts.purpose === 'robots' && url.pathname !== '/robots.txt') {
      throw new TypeError(`fetchPolite: purpose 'robots' is only for /robots.txt, not ${url.pathname}`);
    }
    const host = hostKey(url);
    const policy = await this.policy(host);
    const ctx = this.context(opts, policy);
    try {
      const gate = await this.gate(ctx, url, host, policy);
      if (gate) return gate;

      if (opts.purpose === 'robots') {
        const state = await this.loadRobots(url.origin, ctx, policy, true);
        return state.fetchResult ?? this.skipResult(ctx, url, host, channelOf(policy), { skipped: 'paused' });
      }

      const verdict = await this.robotsVerdict(url, policy, ctx);
      if (!verdict.allowed) {
        return this.skipResult(ctx, url, host, channelOf(policy), { skipped: 'robots_disallowed', ...verdict }, {
          robotsGroup: verdict.group,
          robotsIgnored: verdict.ignored,
        });
      }
      const flags: ChainFlags = {
        followAnyHost: false,
        checkRobots: true,
        truncate: false,
        robotsGroup: verdict.group,
        robotsIgnored: verdict.ignored,
      };
      return (await this.execute(url, policy, ctx, flags)).result;
    } catch (error) {
      if (!isAbort(error)) throw error;
      // Aborted before a request of this call was on the wire (host lock, slot wait, back-off).
      const channel = channelOf(policy);
      await this.writeLog(ctx, {
        ts: new Date(this.now()),
        host,
        url: url.href,
        status: 0,
        durationMs: 0,
        bytes: 0,
        waitMs: 0,
        channel,
        attempt: 0,
        hop: 0,
        blocked: false,
        error: 'request aborted by caller',
        errorCode: 'aborted',
      });
      return { ...emptyResult(url.href, channel), error: 'request aborted by caller', errorCode: 'aborted' };
    }
  }

  async isAllowedByRobots(rawUrl: string): Promise<boolean> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const url = canonicalUrl(parsed);
    const policy = await this.policy(hostKey(url));
    const ctx = this.context({ purpose: 'product' }, policy);
    return (await this.robotsVerdict(url, policy, ctx)).allowed;
  }

  async robotsFor(hostOrUrl: string): Promise<RobotsDecisionInfo> {
    const origin = toOrigin(hostOrUrl);
    const host = hostKey(new URL(origin));
    const policy = await this.policy(host);
    const ctx = this.context({ purpose: 'robots' }, policy);
    const state = await this.loadRobots(origin, ctx, policy, false);
    return this.describeRobots(state, host, policy);
  }

  async pauseDomain(hostOrUrl: string, hours: number, reason: string): Promise<void> {
    if (!Number.isFinite(hours) || hours <= 0) throw new RangeError('pauseDomain: hours must be a positive number');
    const host = normalizeHost(hostOrUrl);
    const now = this.now();
    const pause = await this.store.setPause(
      host,
      { until: now + hours * HOUR, reason: reason || 'manual pause', setAt: now, source: 'manual' },
      'replace',
    );
    this.logger.info({ host, pausedUntil: new Date(pause.until).toISOString(), reason }, 'host paused by hand');
  }

  async unpauseDomain(hostOrUrl: string): Promise<void> {
    const host = normalizeHost(hostOrUrl);
    await this.store.clearPause(host);
    await this.store.resetFailures(host);
    // A robots.txt result cached while the host was blocked must not outlive the pause.
    const now = this.now();
    for (const scheme of ['https', 'http']) {
      const origin = `${scheme}://${host}`;
      const entry = await this.store.getRobots(origin);
      if (entry && entry.outcome !== 'parsed' && entry.outcome !== 'not_found' && entry.expiresAt > now) {
        await this.store.setRobots(origin, { ...entry, expiresAt: now });
      }
    }
    this.logger.info({ host }, 'host unpaused by hand');
  }

  async close(): Promise<void> {
    await this.ownDispatcher?.close();
  }

  // ---------------------------------------------------------------- context, gates, results

  private async policy(host: string): Promise<DomainPolicy> {
    return this.policyFor(host);
  }

  private context(opts: FetchPoliteOptions, policy: DomainPolicy): CallContext {
    const shopSlug = opts.shopSlug ?? policy.shopSlug;
    const bindings: Record<string, unknown> = {};
    if (shopSlug) bindings.shop = shopSlug;
    if (opts.sourceId !== undefined) bindings.source_id = opts.sourceId;
    if (opts.runId !== undefined) bindings.run_id = opts.runId;
    const log = Object.keys(bindings).length > 0 && this.logger.child ? this.logger.child(bindings) : this.logger;
    return {
      purpose: opts.purpose,
      opts,
      shopSlug,
      log,
      timeoutMs: positive(opts.timeoutMs, this.defaultTimeoutMs),
      maxBytes: positive(opts.maxBytes, this.defaultMaxBytes),
      checkHours: opts.purpose !== 'robots',
    };
  }

  private accessSkip(policy: DomainPolicy, purpose: FetchPurpose): SkipReason | null {
    switch (policy.accessMode) {
      case 'direct':
        return null;
      case 'assisted':
        return this.assisted ? null : 'assisted_unavailable';
      case 'feed_only':
        return purpose === 'feed' || purpose === 'robots' ? null : 'feed_only';
      default:
        return 'access_off'; // 'off' and anything unknown
    }
  }

  /**
   * Everything that forbids a request without making one: global switch, access mode, pause,
   * crawl window, daily budget (peeked, not consumed). Checked when a call starts and again for
   * every request, under the host lock, before and after the slot wait.
   */
  private async denial(ctx: CallContext, host: string, policy: DomainPolicy, peekBudget: boolean): Promise<Denial | null> {
    if (!this.crawlEnabled) {
      return { skipped: 'access_off', error: 'crawling is disabled (CRAWL_ENABLED=false)', errorCode: 'crawl_disabled' };
    }
    const access = this.accessSkip(policy, ctx.purpose);
    if (access) return { skipped: access };
    const pause = await this.store.getPause(host);
    if (pause) return { skipped: 'paused', blocked: true, blockReason: 'paused', blockDetail: describePause(pause) };
    if (ctx.checkHours) {
      const within = isWithinAllowedHours(policy.allowedHours, this.now());
      if (within === 'invalid') {
        return {
          skipped: 'outside_allowed_hours',
          error: `invalid allowedHours ${JSON.stringify(policy.allowedHours)}`,
          errorCode: 'invalid_policy',
        };
      }
      if (!within) return { skipped: 'outside_allowed_hours' };
    }
    if (peekBudget && policy.maxPagesPerDay !== null && policy.maxPagesPerDay !== undefined) {
      const count = await this.store.getDailyCount(host, bucharestDay(this.now()));
      if (count >= policy.maxPagesPerDay) return { skipped: 'budget_exhausted' };
    }
    return null;
  }

  private async gate(ctx: CallContext, url: URL, host: string, policy: DomainPolicy): Promise<FetchResult | null> {
    const denial = await this.denial(ctx, host, policy, true);
    return denial ? this.skipResult(ctx, url, host, channelOf(policy), denial) : null;
  }

  private async skipResult(
    ctx: CallContext,
    url: URL,
    host: string,
    channel: Channel,
    denial: Denial,
    log: { robotsGroup?: string; robotsIgnored?: string[]; hop?: number; waitMs?: number } = {},
  ): Promise<FetchResult> {
    const result: FetchResult = {
      ...emptyResult(url.href, channel),
      skipped: denial.skipped,
      blocked: denial.blocked ?? false,
    };
    if (denial.blockReason) result.blockReason = denial.blockReason;
    if (denial.blockDetail) result.blockDetail = denial.blockDetail;
    if (denial.error) result.error = denial.error;
    if (denial.errorCode) result.errorCode = denial.errorCode;
    await this.writeLog(ctx, {
      ts: new Date(this.now()),
      host,
      url: url.href,
      status: 0,
      durationMs: 0,
      bytes: 0,
      waitMs: log.waitMs ?? 0,
      channel,
      // attempt 0 always means "no request was sent" (the hop says where in a redirect chain).
      attempt: 0,
      hop: log.hop ?? 0,
      blocked: result.blocked,
      blockReason: result.blockReason,
      blockDetail: result.blockDetail,
      skipped: denial.skipped,
      error: result.error,
      errorCode: result.errorCode,
      robotsGroup: log.robotsGroup,
      robotsIgnoredGroups: log.robotsIgnored,
    });
    ctx.log.debug(
      { host, url: url.href, purpose: ctx.purpose, skipped: denial.skipped, detail: result.blockDetail ?? result.error },
      'request skipped',
    );
    return result;
  }

  private async invalidUrl(rawUrl: string, opts: FetchPoliteOptions, code: FetchErrorCode, message: string): Promise<FetchResult> {
    const ctx = this.context(opts, defaultDomainPolicy('invalid'));
    await this.writeLog(ctx, {
      ts: new Date(this.now()),
      host: '',
      url: rawUrl,
      status: 0,
      durationMs: 0,
      bytes: 0,
      waitMs: 0,
      channel: 'direct',
      attempt: 0,
      hop: 0,
      blocked: false,
      error: message,
      errorCode: code,
    });
    return { ...emptyResult(rawUrl, 'direct'), error: message, errorCode: code };
  }

  private async writeLog(
    ctx: CallContext,
    entry: Omit<RequestLogEntry, 'method' | 'purpose' | 'shopSlug' | 'runId' | 'sourceId'>,
  ): Promise<void> {
    if (!this.requestLog) return;
    const withContext: RequestLogEntry = {
      ...entry,
      method: 'GET',
      purpose: ctx.purpose,
      shopSlug: ctx.shopSlug,
      runId: ctx.opts.runId,
      sourceId: ctx.opts.sourceId,
    };
    // Optional fields that are not set are left out of the entry (cleaner rows and JSON lines).
    const full = Object.fromEntries(
      Object.entries(withContext).filter(([, value]) => value !== undefined),
    ) as unknown as RequestLogEntry;
    try {
      await this.requestLog.write(full);
    } catch (error) {
      ctx.log.warn({ err: String(error) }, 'request log write failed');
    }
  }

  // ---------------------------------------------------------------- requests

  /** Crawl-delay (seconds) of the cached robots.txt for this URL's origin and purpose, if any. */
  private crawlDelayFor(url: URL, policy: DomainPolicy, purpose: FetchPurpose): number | null {
    if (policy.respectCrawlDelay === false) return null;
    const memo = this.robotsMemo.get(url.origin);
    return memo ? selectRobotsGroups(memo.parsed, robotsTokensFor(purpose)).crawlDelaySec : null;
  }

  /** The policy interval, or the robots.txt Crawl-delay when longer (no jitter, no margin). */
  private baseIntervalFor(url: URL, policy: DomainPolicy, purpose: FetchPurpose, log?: FetchLogger): number {
    const interval = minIntervalOf(policy);
    const delaySec = this.crawlDelayFor(url, policy, purpose);
    if (delaySec === null || delaySec * 1000 <= interval) return interval;
    if (delaySec > MAX_CRAWL_DELAY_SEC) {
      log?.warn({ host: hostKey(url), crawlDelaySec: delaySec }, 'robots.txt Crawl-delay capped at 3600 s');
    }
    return Math.min(delaySec, MAX_CRAWL_DELAY_SEC) * 1000;
  }

  private intervalFor(url: URL, policy: DomainPolicy, ctx: CallContext): number {
    const interval = this.baseIntervalFor(url, policy, ctx.purpose, ctx.log);
    const r = Math.min(Math.max(this.random(), 0), 0.999_999);
    return interval + Math.floor(interval * JITTER_RATIO * r) + SLOT_SAFETY_MARGIN_MS;
  }

  /** The channel this request uses: the chain's when it started assisted, else the host's own. */
  private hopChannel(ctx: CallContext, policy: DomainPolicy): Channel {
    return ctx.chainChannel === 'assisted' ? 'assisted' : channelOf(policy);
  }

  /** A direct chain never reaches a host that may only be read through the assisted channel. */
  private channelDenial(ctx: CallContext, policy: DomainPolicy): Denial | null {
    if (ctx.chainChannel === 'direct' && channelOf(policy) === 'assisted') {
      return {
        skipped: 'access_off',
        error: 'this host is read only through the assisted channel; the request chain started on the direct one',
        errorCode: 'channel_change',
      };
    }
    return null;
  }

  /**
   * One network request, returned with its host lock STILL HELD: the caller classifies the outcome
   * and writes any pause or failure before releasing it, so a request queued behind a refusal can
   * never start before the pause is in the store.
   */
  private async performHop(url: URL, ctx: CallContext, truncate: boolean): Promise<LockedHop> {
    const release = await processHostLocks.acquire(hostKey(url), ctx.opts.signal);
    try {
      return Object.assign(await this.sendUnderLock(url, ctx, truncate), { release });
    } catch (error) {
      release();
      throw error;
    }
  }

  /**
   * Under the host lock: re-check the live policy and pause, reserve a slot, wait for it, re-check
   * (another process may have paused the host or flipped a kill switch meanwhile), count it against
   * the daily budget, then send it.
   */
  private async sendUnderLock(url: URL, ctx: CallContext, truncate: boolean): Promise<HopOutcome> {
    const host = hostKey(url);
    let policy = await this.policy(host);
    let denial = (await this.denial(ctx, host, policy, true)) ?? this.channelDenial(ctx, policy);
    if (denial) return { kind: 'skip', url, channel: this.hopChannel(ctx, policy), waitMs: 0, ...denial };

    const slot = await this.store.reserveSlot(host, this.intervalFor(url, policy, ctx));
    if (slot.waitMs > 0) {
      await this.sleep(slot.waitMs, ctx.opts.signal);
      policy = await this.policy(host);
      denial = (await this.denial(ctx, host, policy, false)) ?? this.channelDenial(ctx, policy);
      if (denial) return { kind: 'skip', url, channel: this.hopChannel(ctx, policy), waitMs: slot.waitMs, ...denial };
    }
    const channel = this.hopChannel(ctx, policy);
    const budget = await this.store.consumeDailyRequest(host, bucharestDay(this.now()), policy.maxPagesPerDay ?? null);
    if (!budget.allowed) return { kind: 'skip', url, channel, waitMs: slot.waitMs, skipped: 'budget_exhausted' };

    const startedAt = this.now();
    if (channel === 'assisted') {
      const render = policy.accessMode === 'assisted' ? (policy.assistedRender ?? false) : (ctx.chainRender ?? false);
      return this.assistedHop(url, render, ctx, startedAt, slot.waitMs);
    }
    try {
      const headers = buildRequestHeaders({
        userAgent: ctx.purpose === 'feed' ? this.feedUserAgent : this.pageUserAgent,
        purpose: ctx.purpose,
        accept: ctx.opts.accept,
        etag: ctx.opts.etag,
        lastModified: ctx.opts.lastModified,
      });
      // Signed per hop: a redirect to another host gets a signature for that host's authority.
      if (this.signer) Object.assign(headers, this.signer.sign(url));
      const res = await httpGet(url.href, {
        headers,
        dispatcher: this.dispatcher,
        timeoutMs: ctx.timeoutMs,
        maxBytes: ctx.maxBytes,
        truncate,
        signal: ctx.opts.signal,
      });
      const contentType = res.headers['content-type'] ?? null;
      let bytes = res.bytes;
      let text: string | null;
      if ((ctx.purpose === 'sitemap' || ctx.purpose === 'feed') && isGzipMagic(bytes)) {
        // A gzip *file* (sitemap.xml.gz, feed.xml.gz): decoded here, under the same cap.
        bytes = (await gunzipFile(bytes, ctx.maxBytes)).data;
        text = looksLikeText(bytes) ? decodeText(bytes, null) : null;
      } else {
        text = this.textOf(bytes, contentType, ctx.purpose);
      }
      return {
        kind: 'response',
        url,
        channel,
        status: res.status,
        headers: res.headers,
        bytes,
        text,
        contentType,
        wireBytes: res.wireBytes,
        truncated: res.truncated,
        durationMs: this.now() - startedAt,
        waitMs: slot.waitMs,
        startedAt,
      };
    } catch (error) {
      return {
        kind: 'error',
        url,
        channel,
        error,
        aborted: isAbort(error) && Boolean(ctx.opts.signal?.aborted),
        durationMs: this.now() - startedAt,
        waitMs: slot.waitMs,
        startedAt,
      };
    }
  }

  private textOf(bytes: Buffer, contentType: string | null, purpose: FetchPurpose): string | null {
    const textual = isTextualContentType(contentType);
    if (textual === true) return decodeText(bytes, contentType);
    if ((textual === null || purpose === 'robots') && looksLikeText(bytes)) return decodeText(bytes, contentType);
    return null;
  }

  private async assistedHop(
    url: URL,
    render: boolean,
    ctx: CallContext,
    startedAt: number,
    waitMs: number,
  ): Promise<HopOutcome> {
    const channel: Channel = 'assisted';
    // The vendor gets the time budget; if it does not answer shortly after, we stop waiting
    // (a hung vendor call must not hold the host lock forever).
    const deadline = new AbortController();
    const grace = Math.min(ASSISTED_TIMEOUT_GRACE_MS, ctx.timeoutMs);
    const timer = setTimeout(() => {
      deadline.abort(new FetchError('timeout', `assisted channel gave no answer within ${ctx.timeoutMs} ms`));
    }, ctx.timeoutMs + grace);
    const signal = ctx.opts.signal ? AbortSignal.any([deadline.signal, ctx.opts.signal]) : deadline.signal;
    try {
      const r: AssistedFetchResponse = await raceWithSignal(
        (this.assisted as AssistedChannel).fetch(url.href, {
          render,
          followRedirects: false,
          timeoutMs: ctx.timeoutMs,
          purpose: ctx.purpose,
          shopSlug: ctx.shopSlug,
          signal,
        }),
        signal,
      );
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.headers ?? {})) headers[k.toLowerCase()] = v;
      const contentType = r.contentType ?? headers['content-type'] ?? null;
      const bytes = r.bodyBytes ? Buffer.from(r.bodyBytes) : Buffer.from(r.body ?? '', 'utf8');
      if (bytes.length > ctx.maxBytes) {
        throw new FetchError('body_too_large', `assisted response exceeded ${ctx.maxBytes} bytes`);
      }
      let finalUrl = url;
      try {
        if (r.finalUrl) finalUrl = canonicalUrl(new URL(r.finalUrl));
      } catch {
        // keep the requested URL
      }
      const hop: HopResponse = {
        kind: 'response',
        url: finalUrl,
        channel,
        status: r.status,
        headers,
        bytes,
        text: r.body ?? this.textOf(bytes, contentType, ctx.purpose),
        contentType,
        wireBytes: r.bytes ?? bytes.length,
        truncated: false,
        durationMs: this.now() - startedAt,
        waitMs,
        startedAt,
      };
      if (r.blocked) {
        hop.vendorBlock = {
          reason: r.blockReason ?? 'vendor_blocked',
          detail: r.blockDetail ?? 'blocked (reported by the assisted vendor)',
        };
      }
      if (r.error || r.status === 0) hop.vendorError = r.error ?? 'assisted vendor returned no response';
      return hop;
    } catch (error) {
      const aborted = Boolean(ctx.opts.signal?.aborted);
      const wrapped =
        error instanceof FetchError
          ? error
          : deadline.signal.aborted
            ? new FetchError('timeout', `assisted channel gave no answer within ${ctx.timeoutMs} ms`)
            : new FetchError(aborted ? 'aborted' : 'assisted_error', `assisted channel failed: ${String(error)}`, { cause: error });
      return { kind: 'error', url, channel, error: wrapped, aborted, durationMs: this.now() - startedAt, waitMs, startedAt };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Attempts with retry and back-off. */
  private async execute(start: URL, policy: DomainPolicy, ctx: CallContext, flags: ChainFlags): Promise<ExecOutcome> {
    // The channel is fixed when the chain starts (a nested robots.txt fetch inherits it).
    ctx.chainChannel ??= channelOf(policy);
    ctx.chainRender ??= policy.assistedRender ?? false;
    const maxAttempts = ctx.chainChannel === 'assisted' ? 1 : 1 + this.maxRetries;
    let waited = 0;
    let attempt = 0;
    let sent = 0;
    let last: ExecOutcome | undefined;
    try {
      while (attempt < maxAttempts) {
        attempt += 1;
        last = await this.runChain(start, policy, ctx, flags, attempt, attempt >= maxAttempts);
        waited += last.waitedMs;
        if (last.sent) sent += 1;
        if (!last.retryable || attempt >= maxAttempts) break;
        // Don't sleep a back-off for nothing; the next attempt re-checks the pause under the lock.
        if (await this.store.getPause(hostKey(new URL(last.result.finalUrl)))) break;
        const backoff = this.retryBaseMs * 2 ** (attempt - 1) + Math.floor(this.retryBaseMs * 0.1 * this.random());
        ctx.log.info({ url: start.href, attempt, backoffMs: backoff, error: last.result.error, status: last.result.status }, 'transient failure; retrying');
        await this.sleep(backoff, ctx.opts.signal);
        waited += backoff;
      }
    } catch (error) {
      if (!isAbort(error)) throw error;
      // Aborted while waiting (host lock, slot, back-off): nothing more is sent. Requests already
      // sent by this call are logged and still counted.
      await this.writeLog(ctx, {
        ts: new Date(this.now()),
        host: hostKey(start),
        url: start.href,
        status: 0,
        durationMs: 0,
        bytes: 0,
        waitMs: 0,
        channel: ctx.chainChannel,
        attempt: 0,
        hop: 0,
        blocked: false,
        error: 'request aborted by caller',
        errorCode: 'aborted',
      });
      const result: FetchResult = {
        ...emptyResult(start.href, ctx.chainChannel),
        finalUrl: last?.result.finalUrl ?? start.href,
        error: 'request aborted by caller',
        errorCode: 'aborted',
        attempts: sent,
        waitedMs: waited,
      };
      return { result, truncated: false, retryable: false, waitedMs: waited, sent: sent > 0 };
    }
    const outcome = last as ExecOutcome;
    return { ...outcome, result: { ...outcome.result, attempts: sent, waitedMs: waited } };
  }

  /** One attempt: the request and its redirect hops. */
  private async runChain(
    start: URL,
    startPolicy: DomainPolicy,
    ctx: CallContext,
    flags: ChainFlags,
    attempt: number,
    lastAttempt: boolean,
  ): Promise<ExecOutcome> {
    let current = start;
    let policy = startPolicy;
    let waited = 0;
    let duration = 0;
    let sent = false;
    let robotsGroup = flags.robotsGroup;
    let robotsIgnored = flags.robotsIgnored;
    // Every host this chain went through: a refusal anywhere in the chain pauses all of them, so a
    // shop whose page redirects to a challenge on its own subdomain is paused itself.
    const chainHosts: string[] = [];

    const done = (result: FetchResult, retryable = false, truncated = false): ExecOutcome => ({
      result: { ...result, url: start.href, durationMs: duration },
      truncated,
      retryable,
      waitedMs: waited,
      sent,
    });

    for (let hop = 0; ; hop++) {
      const host = hostKey(current);
      if (!chainHosts.includes(host)) chainHosts.push(host);
      if (hop > 0) {
        // A redirect target: no request at all when its host is paused or off, or robots.txt says no.
        const denial = (await this.denial(ctx, host, policy, true)) ?? this.channelDenial(ctx, policy);
        if (denial) {
          return done(await this.skipResult(ctx, current, host, this.hopChannel(ctx, policy), denial, { robotsGroup, hop }));
        }
        if (flags.checkRobots) {
          const verdict = await this.robotsVerdict(current, policy, ctx);
          robotsGroup = verdict.group;
          robotsIgnored = verdict.ignored;
          if (!verdict.allowed) {
            return done(
              await this.skipResult(ctx, current, host, this.hopChannel(ctx, policy), { skipped: 'robots_disallowed', ...verdict }, {
                robotsGroup: verdict.group,
                robotsIgnored: verdict.ignored,
                hop,
              }),
            );
          }
        }
      }

      const out = await this.performHop(current, ctx, flags.truncate);
      // The host lock is held until this hop is classified and any pause or failure is written.
      try {
        waited += out.waitMs;
        if (out.kind === 'skip') {
          return done(
            await this.skipResult(ctx, current, host, out.channel, out, { robotsGroup, hop, waitMs: out.waitMs }),
          );
        }
        sent = true;
        duration += out.durationMs;
        const logBase = {
          ts: new Date(out.startedAt),
          host,
          url: current.href,
          durationMs: out.durationMs,
          waitMs: out.waitMs,
          channel: out.channel,
          attempt,
          hop,
          robotsGroup,
          robotsIgnoredGroups: robotsIgnored,
        };

        if (out.kind === 'error') {
          if (out.aborted) {
            await this.writeLog(ctx, { ...logBase, status: 0, bytes: 0, blocked: false, error: 'request aborted by caller', errorCode: 'aborted' });
            return done({ ...emptyResult(start.href, out.channel), finalUrl: current.href, error: 'request aborted by caller', errorCode: 'aborted' });
          }
          const det = detectBlock({ error: out.error });
          const cls = det.transportError;
          const message = cls?.message ?? String(out.error);
          const code = cls?.code ?? 'network';
          // An error that surfaces long after the request's own timeout means this process was
          // suspended (the machine slept and the shop closed the idle connection meanwhile): not
          // the shop's doing, so no pause and no failure count. On 28 Oct 2026 a sleeping Mac
          // otherwise paused five shops for 24 h with "connection reset".
          if (out.durationMs > ctx.timeoutMs + LOCAL_SUSPEND_SLACK_MS) {
            const note = `${message} (after ${Math.round(out.durationMs / 1000)} s: local suspension)`;
            await this.writeLog(ctx, { ...logBase, status: 0, bytes: 0, blocked: false, error: note, errorCode: 'local_suspend' });
            return done({ ...emptyResult(start.href, out.channel), finalUrl: current.href, error: note, errorCode: 'local_suspend' }, true);
          }
          if (det.blocked && out.channel === 'direct') {
            const pause = await this.pauseChain(chainHosts, 'transport', det, 0, ctx);
            await this.writeLog(ctx, { ...logBase, status: 0, bytes: 0, blocked: true, blockReason: 'transport', blockDetail: det.detail, error: message, errorCode: code });
            return done({
              ...emptyResult(start.href, out.channel),
              finalUrl: current.href,
              blocked: true,
              blockReason: 'transport',
              blockDetail: `${det.detail} (paused until ${new Date(pause.until).toISOString()})`,
              error: message,
              errorCode: code,
            });
          }
          if (cls?.countsAsFailure || out.channel === 'assisted') await this.registerFailure(host, `${code}: ${message}`, ctx);
          await this.writeLog(ctx, { ...logBase, status: 0, bytes: 0, blocked: false, error: message, errorCode: code });
          return done(
            { ...emptyResult(start.href, out.channel), finalUrl: current.href, error: message, errorCode: code },
            cls?.transient ?? false,
          );
        }

        // ---- a response
        const status = out.status;
        const response = (extra: Partial<FetchResult>): FetchResult => ({
          ...emptyResult(start.href, out.channel),
          finalUrl: out.url.href,
          status,
          headers: out.headers,
          contentType: out.contentType,
          ...extra,
        });
        const vendorFailure = async (detail: string, error?: string, errorCode?: FetchErrorCode): Promise<ExecOutcome> => {
          // The vendor handles challenges: a block here is the vendor's, not a reason to pause the
          // shop at once. It counts as a failure, so three in a row pause the shop (1 h, doubling).
          await this.registerFailure(host, detail, ctx);
          await this.writeLog(ctx, {
            ...logBase,
            status,
            bytes: out.wireBytes,
            blocked: !error,
            blockReason: error ? undefined : 'vendor_blocked',
            blockDetail: error ? undefined : detail,
            error,
            errorCode,
          });
          return done(
            response(error ? { error, errorCode } : { blocked: true, blockReason: 'vendor_blocked', blockDetail: detail }),
          );
        };

        if (isRedirect(status) && out.headers.location) {
          let target: URL | null = null;
          try {
            target = canonicalUrl(new URL(out.headers.location, current));
          } catch {
            target = null;
          }
          const redirectResult = (extra: Partial<FetchResult>): FetchResult => ({
            ...emptyResult(start.href, out.channel),
            finalUrl: current.href,
            status,
            headers: out.headers,
            contentType: out.contentType,
            ...extra,
          });
          const notFollowed = async (error: string, errorCode: FetchErrorCode): Promise<ExecOutcome> => {
            await this.writeLog(ctx, { ...logBase, status, bytes: out.wireBytes, blocked: false, error, errorCode });
            return done(redirectResult({ error, errorCode }));
          };
          if (!target || (target.protocol !== 'http:' && target.protocol !== 'https:')) {
            return notFollowed(`redirect to an unusable location: ${out.headers.location}`, 'invalid_redirect');
          }
          const challenge = detectChallengeRedirect(current, target);
          if (challenge) {
            if (out.channel === 'assisted') return vendorFailure(`${challenge.detail} (not followed)`);
            const det: BlockDetection = { blocked: true, reason: 'captcha_redirect', vendor: challenge.vendor, detail: challenge.detail };
            const pause = await this.pauseChain(chainHosts, 'captcha_redirect', det, status, ctx);
            await this.writeLog(ctx, { ...logBase, status, bytes: out.wireBytes, blocked: true, blockReason: 'captcha_redirect', blockDetail: challenge.detail });
            return done(
              redirectResult({
                blocked: true,
                blockReason: 'captcha_redirect',
                blockDetail: `${challenge.detail} (not followed; paused until ${new Date(pause.until).toISOString()})`,
              }),
            );
          }
          if (hop >= MAX_REDIRECTS) return notFollowed(`more than ${MAX_REDIRECTS} redirects`, 'too_many_redirects');
          if (!flags.followAnyHost && !sameSite(current, target)) {
            return notFollowed(`cross-site redirect to ${target.href} not followed`, 'cross_site_redirect');
          }
          const nextHost = hostKey(target);
          const nextPolicy = nextHost === host ? policy : await this.policy(nextHost);
          if (ctx.chainChannel === 'direct' && channelOf(nextPolicy) === 'assisted') {
            return notFollowed(
              `redirect to ${target.href}, a host read only through the assisted channel; not followed on the direct one`,
              'channel_change',
            );
          }
          // A redirect does not end a failure streak: an edge that redirects in front of a dead
          // origin must still trip the breaker.
          await this.writeLog(ctx, { ...logBase, status, bytes: out.wireBytes, blocked: false });
          policy = nextPolicy;
          current = target;
          continue; // the finally block releases this hop's lock before the next hop
        }

        if (out.channel === 'assisted' && out.url.href !== current.href) {
          // The vendor followed a redirect although asked not to: apply our redirect rules after the
          // fact and drop the body when the target is not one we may read.
          const challenge = detectChallengeRedirect(current, out.url);
          if (challenge) return vendorFailure(`vendor followed ${challenge.detail}`);
          if (!sameSite(current, out.url)) {
            return vendorFailure(`vendor followed a cross-site redirect to ${out.url.href}`, `cross-site redirect to ${out.url.href} (followed by the vendor; body dropped)`, 'cross_site_redirect');
          }
          if (flags.checkRobots) {
            // robots.txt of the target may need a request to this very host: release the lock first.
            out.release();
            const targetPolicy = hostKey(out.url) === host ? policy : await this.policy(hostKey(out.url));
            const verdict = await this.robotsVerdict(out.url, targetPolicy, ctx);
            if (!verdict.allowed) {
              return vendorFailure(
                `vendor followed a redirect to ${out.url.href}, which robots.txt disallows`,
                `redirect target ${out.url.href} is not allowed by robots.txt (followed by the vendor; body dropped)`,
                'redirect_disallowed',
              );
            }
          }
        }

        const det = detectBlock({
          status,
          headers: out.headers,
          contentType: out.contentType,
          body: out.text,
          url: current.href,
          purpose: ctx.purpose,
          nowMs: this.now(),
        });

        if (out.channel === 'assisted' && (out.vendorBlock || det.blocked || out.vendorError)) {
          if (out.vendorError && !out.vendorBlock && !det.blocked) return vendorFailure(out.vendorError, out.vendorError, 'assisted_error');
          const detail = out.vendorBlock
            ? `${out.vendorBlock.reason === 'vendor_blocked' ? '' : `${out.vendorBlock.reason}: `}${out.vendorBlock.detail}`
            : `${det.reason}: ${det.detail ?? ''}`.trim();
          return vendorFailure(detail);
        }

        if (det.blocked && det.reason) {
          const pause = await this.pauseChain(chainHosts, det.reason, det, status, ctx);
          await this.writeLog(ctx, { ...logBase, status, bytes: out.wireBytes, blocked: true, blockReason: det.reason, blockDetail: det.detail, contentType: out.contentType });
          return done(
            response({
              blocked: true,
              blockReason: det.reason,
              blockDetail: `${det.detail} (paused until ${new Date(pause.until).toISOString()})`,
            }),
          );
        }

        const body = { body: out.text, bodyBytes: out.bytes as Uint8Array };
        if (status >= 500) {
          await this.registerFailure(host, `HTTP ${status}`, ctx);
          let retryable = !lastAttempt;
          let error = `HTTP ${status}`;
          if (status === 503 && (det.retryAfterMs !== undefined || lastAttempt)) {
            const pause = await this.pauseFor503(host, det.retryAfterMs, ctx);
            retryable = false;
            error = `HTTP 503 (host paused until ${new Date(pause.until).toISOString()})`;
          }
          await this.writeLog(ctx, { ...logBase, status, bytes: out.wireBytes, blocked: false, error, contentType: out.contentType });
          return done(response({ ...body, error }), retryable, out.truncated);
        }

        // A healthy response ends a failure streak. robots.txt does not count: a static file served
        // by a CDN says nothing about the shop's pages, and would keep resetting the back-off.
        if (ctx.purpose !== 'robots') await this.store.resetFailures(host);
        if (status === 304) {
          await this.writeLog(ctx, { ...logBase, status, bytes: out.wireBytes, blocked: false, notModified: true });
          return done(response({ ok: true, notModified: true }));
        }
        await this.writeLog(ctx, { ...logBase, status, bytes: out.wireBytes, blocked: false, contentType: out.contentType });
        return done(response({ ...body, ok: status >= 200 && status < 300 }), false, out.truncated);
      } finally {
        out.release();
      }
    }
  }

  // ---------------------------------------------------------------- pauses and failures

  /** Pauses every host of the request chain (the last one is the host that refused us). */
  private async pauseChain(
    hosts: readonly string[],
    reason: BlockReason,
    det: BlockDetection,
    status: number,
    ctx: CallContext,
  ): Promise<DomainPause> {
    let pause: DomainPause | undefined;
    for (const host of hosts) pause = await this.pauseForBlock(host, reason, det, status, ctx);
    return pause as DomainPause;
  }

  private async pauseForBlock(
    host: string,
    reason: BlockReason,
    det: BlockDetection,
    status: number,
    ctx: CallContext,
  ): Promise<DomainPause> {
    let ms = PAUSE_BLOCK_MS;
    if (reason === 'http_429') {
      const floor = status === 511 ? PAUSE_BLOCK_MS : PAUSE_RATE_LIMIT_MIN_MS;
      ms = Math.min(Math.max(det.retryAfterMs ?? 0, floor), PAUSE_RETRY_AFTER_MAX_MS);
    }
    const now = this.now();
    const pause = await this.store.setPause(
      host,
      { until: now + ms, reason: `${reason}: ${det.detail ?? 'blocked'}`, setAt: now, source: 'auto', blockReason: reason },
      'extend',
    );
    ctx.log.warn(
      { host, blockReason: reason, vendor: det.vendor, detail: det.detail, pausedUntil: new Date(pause.until).toISOString() },
      'blocked by the shop; host paused',
    );
    return pause;
  }

  private async pauseFor503(host: string, retryAfterMs: number | undefined, ctx: CallContext): Promise<DomainPause> {
    const ms = Math.min(Math.max(retryAfterMs ?? 0, PAUSE_RATE_LIMIT_MIN_MS), PAUSE_RETRY_AFTER_MAX_MS);
    const now = this.now();
    const pause = await this.store.setPause(
      host,
      {
        until: now + ms,
        reason: `HTTP 503 Service Unavailable${retryAfterMs !== undefined ? ` (Retry-After ${Math.round(retryAfterMs / 1000)} s)` : ''}`,
        setAt: now,
        source: 'auto',
      },
      'extend',
    );
    ctx.log.warn({ host, pausedUntil: new Date(pause.until).toISOString() }, 'HTTP 503; host paused');
    return pause;
  }

  private async registerFailure(host: string, detail: string, ctx: CallContext): Promise<number> {
    const count = await this.store.recordFailure(host);
    if (count >= FAILURE_PAUSE_THRESHOLD) {
      const ms = Math.min(FAILURE_PAUSE_BASE_MS * 2 ** (count - FAILURE_PAUSE_THRESHOLD), FAILURE_PAUSE_MAX_MS);
      const now = this.now();
      const pause = await this.store.setPause(
        host,
        { until: now + ms, reason: `${count} consecutive failures (last: ${detail})`, setAt: now, source: 'auto' },
        'extend',
      );
      ctx.log.warn({ host, failures: count, pausedUntil: new Date(pause.until).toISOString() }, 'consecutive failures; host paused');
    }
    return count;
  }

  // ---------------------------------------------------------------- robots.txt

  private stateFromEntry(entry: RobotsCacheEntry, source: 'cache' | 'network'): RobotsState {
    let parsed: ParsedRobots | null = null;
    if (entry.outcome === 'parsed' && entry.body !== null) {
      const memo = this.robotsMemo.get(entry.origin);
      if (memo && memo.fetchedAt === entry.fetchedAt) {
        parsed = memo.parsed;
      } else {
        parsed = parseRobotsTxt(entry.body, `${entry.origin}/robots.txt`);
        this.robotsMemo.set(entry.origin, { fetchedAt: entry.fetchedAt, parsed });
      }
    } else {
      this.robotsMemo.delete(entry.origin);
    }
    return { origin: entry.origin, entry, parsed, source };
  }

  /** Cached robots.txt for the origin, fetched when missing, expired or `force`d. */
  private async loadRobots(origin: string, ctx: CallContext, policyHint: DomainPolicy, force: boolean): Promise<RobotsState> {
    if (!force) {
      const cached = await this.store.getRobots(origin);
      if (cached && cached.expiresAt > this.now()) return this.stateFromEntry(cached, 'cache');
    }
    const inflight = this.robotsInflight.get(origin);
    if (inflight) {
      try {
        // Joining someone else's fetch: our own abort still ends our wait (theirs carries on).
        const signal = ctx.opts.signal;
        return signal
          ? await raceWithSignal(inflight, signal, () => new FetchError('aborted', 'aborted while waiting for robots.txt'))
          : await inflight;
      } catch (error) {
        // The caller that started the shared fetch aborted; a caller that did not abort tries again.
        if (isAbort(error) && !ctx.opts.signal?.aborted) return this.loadRobots(origin, ctx, policyHint, force);
        throw error;
      }
    }
    const promise = this.fetchRobots(origin, ctx, policyHint).finally(() => this.robotsInflight.delete(origin));
    this.robotsInflight.set(origin, promise);
    return promise;
  }

  private async fetchRobots(origin: string, parent: CallContext, policyHint: DomainPolicy): Promise<RobotsState> {
    const robotsUrl = new URL('/robots.txt', origin);
    const host = hostKey(robotsUrl);
    const policy = policyHint.host === host || policyHint.host === robotsUrl.hostname ? policyHint : await this.policy(host);
    const cached = await this.store.getRobots(origin);
    const conditional = cached?.outcome === 'parsed';
    const ctx: CallContext = {
      purpose: 'robots',
      opts: {
        purpose: 'robots',
        signal: parent.opts.signal,
        runId: parent.opts.runId,
        sourceId: parent.opts.sourceId,
        etag: conditional ? (cached?.etag ?? undefined) : undefined,
        lastModified: conditional ? (cached?.lastModified ?? undefined) : undefined,
      },
      shopSlug: parent.shopSlug,
      log: parent.log,
      timeoutMs: this.defaultTimeoutMs,
      maxBytes: ROBOTS_MAX_BYTES,
      checkHours: false,
      // Needed by a page chain that is already running: same channel, never a switch.
      chainChannel: parent.chainChannel,
      chainRender: parent.chainRender,
    };

    const gate = await this.gate(ctx, robotsUrl, host, policy);
    if (gate) {
      return {
        origin,
        entry: null,
        parsed: null,
        source: 'none',
        unavailable: {
          skipped: gate.skipped,
          blocked: gate.blocked,
          blockReason: gate.blockReason,
          detail: gate.blockDetail ?? gate.error ?? gate.skipped ?? 'unavailable',
        },
        fetchResult: gate,
      };
    }

    // The interval the robots.txt request reserves already includes the Crawl-delay we knew of.
    const reservedBase = this.baseIntervalFor(robotsUrl, policy, 'robots');
    const exec = await this.execute(robotsUrl, policy, ctx, { followAnyHost: true, checkRobots: false, truncate: true });
    const result = exec.result;
    // A caller's abort says nothing about the shop: nothing is cached.
    if (result.errorCode === 'aborted') throw new FetchError('aborted', 'robots.txt request aborted by caller');
    const entry = this.robotsEntryFrom(origin, result, exec.truncated, cached);
    if (!entry) {
      return {
        origin,
        entry: null,
        parsed: null,
        source: 'none',
        unavailable: {
          skipped: result.skipped,
          blocked: result.blocked,
          blockReason: result.blockReason,
          detail: result.blockDetail ?? result.error ?? result.skipped ?? 'unavailable',
        },
        fetchResult: result,
      };
    }
    await this.store.setRobots(origin, entry);
    const state = this.stateFromEntry(entry, 'network');
    state.fetchResult = result;

    // When the (new) file asks for a longer Crawl-delay than the interval the robots.txt request
    // reserved, push the host's next slot by the difference so the very next page respects it too
    // (and never count a delay twice on a refresh).
    const extra = this.baseIntervalFor(robotsUrl, policy, parent.purpose) - reservedBase;
    if (exec.result.attempts > 0 && extra > 0) await this.store.reserveSlot(host, extra);

    const selection = state.parsed ? selectRobotsGroups(state.parsed, [BOT_PRODUCT_TOKEN]) : null;
    const ignored = state.parsed && selection ? findIgnoredGroups(state.parsed, selection, this.pageUserAgent) : [];
    ctx.log.info(
      {
        host,
        status: entry.status,
        outcome: entry.outcome,
        group: selection?.label,
        crawlDelaySec: selection?.crawlDelaySec ?? null,
        sitemaps: state.parsed?.sitemaps.length ?? 0,
        ignoredGroups: ignored.length > 0 ? ignored.map((g) => `${g.userAgent} (${g.reason})`) : undefined,
      },
      'robots.txt fetched',
    );
    return state;
  }

  private robotsEntryFrom(
    origin: string,
    result: FetchResult,
    truncated: boolean,
    cached: RobotsCacheEntry | null,
  ): RobotsCacheEntry | null {
    const now = this.now();
    const base = {
      origin,
      fetchedAt: now,
      status: result.status,
      finalUrl: result.finalUrl,
      channel: result.channel,
      etag: result.headers.etag ?? null,
      lastModified: result.headers['last-modified'] ?? null,
    };
    const failed = (outcome: 'unreachable' | 'too_many_redirects', detail: string): RobotsCacheEntry => ({
      ...base,
      outcome,
      body: null,
      expiresAt: now + ROBOTS_FAILURE_TTL_MS,
      detail,
    });

    if (result.skipped) {
      // Nothing was requested: nothing to remember (the same gate will answer next time).
      if (result.attempts === 0) return null;
      // The chain stopped after a request (e.g. robots.txt redirects to a paused CDN host): remember
      // it, or the shop would see a robots.txt request on every page call until the pause ends.
      return failed('unreachable', `robots.txt request stopped: ${result.skipped}${result.blockDetail ? ` (${result.blockDetail})` : ''}`);
    }
    if (result.blocked) {
      return {
        ...base,
        outcome: 'blocked',
        body: null,
        expiresAt: now + ROBOTS_FAILURE_TTL_MS,
        blockReason: result.blockReason ?? null,
        detail: result.blockDetail ?? null,
      };
    }
    if (result.notModified && cached) {
      return {
        ...cached,
        fetchedAt: now,
        expiresAt: now + ROBOTS_TTL_MS,
        etag: base.etag ?? cached.etag ?? null,
        lastModified: base.lastModified ?? cached.lastModified ?? null,
      };
    }
    if (result.errorCode === 'too_many_redirects') return failed('too_many_redirects', result.error ?? 'too many redirects');
    const status = result.status;
    if (status === 0) return failed('unreachable', result.error ?? 'no response');
    if (status >= 200 && status < 300) {
      // Only a clean, successful response with a body is a robots.txt. A 2xx that carries an error
      // (an assisted vendor's partial answer, a redirect the vendor followed to another site) or no
      // body at all must never become "nothing disallowed" for 24 h: complete disallow instead.
      if (!result.ok || result.errorCode || result.error || (result.body === null && result.bodyBytes === null)) {
        return failed('unreachable', `unusable robots.txt response (HTTP ${status}${result.error ? `: ${result.error}` : ', no body'})`);
      }
      const text = result.body ?? new TextDecoder().decode(result.bodyBytes as Uint8Array);
      return {
        ...base,
        outcome: 'parsed',
        body: text,
        expiresAt: now + ROBOTS_TTL_MS,
        truncated,
        htmlBody: looksLikeHtml(result.contentType, text),
      };
    }
    if (status >= 400 && status < 500) {
      return { ...base, outcome: 'not_found', body: null, expiresAt: now + ROBOTS_TTL_MS };
    }
    return failed('unreachable', result.error ?? `HTTP ${status}`);
  }

  private async robotsVerdict(url: URL, policy: DomainPolicy, ctx: CallContext): Promise<RobotsVerdict> {
    if (url.pathname === '/robots.txt') return { allowed: true, group: 'robots.txt' };
    const state = await this.loadRobots(url.origin, ctx, policy, false);
    const entry = state.entry;
    if (!entry || state.unavailable) {
      const u = state.unavailable;
      return {
        allowed: false,
        group: 'unavailable',
        blocked: u?.blocked ?? false,
        blockReason: u?.blockReason,
        blockDetail: u?.blocked ? `robots.txt not available: ${u.detail}` : undefined,
        error: `robots.txt not available (${u?.detail ?? 'unknown'}): nothing is fetched without it`,
        errorCode: 'robots_unavailable',
      };
    }
    switch (entry.outcome) {
      case 'parsed': {
        const parsed = state.parsed as ParsedRobots;
        const selection = selectRobotsGroups(parsed, robotsTokensFor(ctx.purpose));
        const evaluation = evaluateRobots(selection.groups, robotsPathOf(url));
        const ignored = findIgnoredGroups(parsed, selection, ctx.purpose === 'feed' ? this.feedUserAgent : this.pageUserAgent);
        return {
          allowed: evaluation.allowed,
          group: selection.label,
          ignored: ignored.length > 0 ? ignored.map((g) => g.userAgent) : undefined,
          error: evaluation.allowed ? undefined : `disallowed by robots.txt (${selection.label}: ${evaluation.rule?.raw ?? ''})`,
        };
      }
      case 'not_found':
        return { allowed: true, group: 'no-robots' };
      case 'blocked':
        return {
          allowed: false,
          group: 'blocked',
          blocked: true,
          blockReason: entry.blockReason ?? undefined,
          blockDetail: `robots.txt request was blocked: ${entry.detail ?? ''}`.trim(),
          error: 'robots.txt request was blocked: complete disallow',
          errorCode: 'robots_unavailable',
        };
      default:
        return {
          allowed: false,
          group: entry.outcome,
          error: `robots.txt ${entry.outcome === 'too_many_redirects' ? 'redirected too many times' : 'unreachable'} (${entry.detail ?? `HTTP ${entry.status}`}): complete disallow (RFC 9309)`,
          errorCode: 'robots_unavailable',
        };
    }
  }

  private describeRobots(state: RobotsState, host: string, policy: DomainPolicy): RobotsDecisionInfo {
    const entry = state.entry;
    const robotsUrl = `${state.origin}/robots.txt`;
    const info: RobotsDecisionInfo = {
      host,
      origin: state.origin,
      robotsUrl,
      productToken: BOT_PRODUCT_TOKEN,
      source: state.source,
      fetchedAt: entry ? new Date(entry.fetchedAt).toISOString() : null,
      expiresAt: entry ? new Date(entry.expiresAt).toISOString() : null,
      status: entry?.status ?? 0,
      outcome: entry?.outcome ?? 'unavailable',
      allowAll: false,
      disallowAll: true,
      matchedGroup: entry?.outcome ?? 'unavailable',
      matchedUserAgents: [],
      rules: [],
      crawlDelaySec: null,
      sitemaps: state.parsed?.sitemaps ?? [],
      groupCount: state.parsed?.groups.length ?? 0,
      ignoredGroups: [],
      htmlBody: entry?.htmlBody ?? false,
      truncated: entry?.truncated ?? false,
      channel: entry?.channel ?? channelOf(policy),
    };
    if (!entry) {
      info.detail = state.unavailable?.detail;
      if (state.unavailable?.blockReason) info.blockReason = state.unavailable.blockReason;
      return info;
    }
    if (entry.blockReason) info.blockReason = entry.blockReason;
    if (entry.detail) info.detail = entry.detail;
    if (entry.outcome === 'not_found') {
      return { ...info, allowAll: true, disallowAll: false, matchedGroup: 'no-robots' };
    }
    if (entry.outcome !== 'parsed' || !state.parsed) return info;

    const selection = selectRobotsGroups(state.parsed, [BOT_PRODUCT_TOKEN]);
    const rules = selection.groups
      .flatMap((g) => g.rules)
      .sort((a, b) => a.line - b.line)
      .map((r) => ({ type: r.allow ? ('allow' as const) : ('disallow' as const), pattern: r.raw }));
    const hasDisallow = rules.some((r) => r.type === 'disallow');
    return {
      ...info,
      allowAll: !hasDisallow,
      disallowAll: !evaluateRobots(selection.groups, '/').allowed && !rules.some((r) => r.type === 'allow'),
      matchedGroup: selection.label,
      matchedUserAgents: selection.groups.flatMap((g) => g.userAgents),
      rules,
      crawlDelaySec: selection.crawlDelaySec,
      ignoredGroups: findIgnoredGroups(state.parsed, selection, this.pageUserAgent),
    };
  }
}

/** Creates the polite fetcher. See the package README for the full policy. */
export function createFetcher(deps: FetcherDeps): Fetcher {
  return new PoliteFetcher(deps);
}
