import { setTimeout as sleepTimer } from 'node:timers/promises';
import { DEFAULT_MIN_INTERVAL_MS, defaultDomainPolicy, type DomainPolicy } from '@pretoscop/config/policy';
import { Agent, type Dispatcher } from 'undici';
import { decodeText, gunzipFile, isGzipMagic, isTextualContentType, looksLikeText } from './decode';
import { detectBlock, detectChallengeRedirect, looksLikeHtml, type BlockDetection } from './detect';
import { FetchError, fetchCodeOf } from './errors';
import {
  BOT_PRODUCT_TOKEN,
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
import type { DomainPause, DomainStateStore, RobotsCacheEntry } from './state/types';
import { bucharestDay, isWithinAllowedHours } from './time';
import { httpGet } from './transport';
import type {
  AssistedChannel,
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
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_RETRY_BASE_MS = 10_000;

const PURPOSES: ReadonlySet<string> = new Set<FetchPurpose>(['robots', 'sitemap', 'listing', 'product', 'feed', 'probe']);

/** Purposes that ignore the bulk-crawl window (`allowedHours`): one small diagnostic request. */
const HOURS_EXEMPT: ReadonlySet<FetchPurpose> = new Set(['robots', 'probe']);

const NOOP_LOGGER: FetchLogger = { debug() {}, info() {}, warn() {}, error() {} };

interface CallContext {
  purpose: FetchPurpose;
  opts: FetchPoliteOptions;
  shopSlug?: string;
  log: FetchLogger;
  timeoutMs: number;
  maxBytes: number;
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
  vendorBlock?: { reason: BlockReason; detail: string };
  vendorError?: string;
}

interface HopError {
  kind: 'error';
  url: URL;
  channel: Channel;
  error: unknown;
  durationMs: number;
  waitMs: number;
  startedAt: number;
}

interface HopSkip {
  kind: 'skip';
  url: URL;
  skipped: SkipReason;
}

type HopOutcome = HopResponse | HopError | HopSkip;

interface ExecOutcome {
  result: FetchResult;
  truncated: boolean;
  retryable: boolean;
  waitedMs: number;
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

export function hostKey(url: URL): string {
  return url.host.toLowerCase();
}

/** `www.x.ro`, `https://www.x.ro/any/path` or `http://x.ro:8080` to an origin. */
export function toOrigin(hostOrUrl: string): string {
  const s = hostOrUrl.trim();
  return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).origin;
}

function normalizeHost(hostOrUrl: string): string {
  return new URL(toOrigin(hostOrUrl)).host.toLowerCase();
}

const SECOND_LEVEL_LABELS = new Set(['com', 'co', 'org', 'net', 'gov', 'edu', 'ac', 'nom', 'info', 'firm', 'store', 'tm', 'www', 'arts', 'rec', 'nt']);

/** Registrable-domain approximation (`www.dedeman.ro` and `dedeman.ro` share `dedeman.ro`). */
export function siteKey(hostname: string): string {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || h.startsWith('[')) return h;
  const labels = h.split('.');
  if (labels.length <= 2) return h;
  const tld = labels[labels.length - 1] as string;
  const sld = labels[labels.length - 2] as string;
  return tld.length === 2 && SECOND_LEVEL_LABELS.has(sld) ? labels.slice(-3).join('.') : labels.slice(-2).join('.');
}

export function sameSite(a: URL, b: URL): boolean {
  return siteKey(a.hostname) === siteKey(b.hostname);
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

class PoliteFetcher implements Fetcher {
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly random: () => number;
  private readonly store: DomainStateStore;
  private readonly policyFor: (host: string) => DomainPolicy | Promise<DomainPolicy>;
  private readonly logger: FetchLogger;
  private readonly requestLog: RequestLogSink | undefined;
  private readonly assisted: AssistedChannel | undefined;
  private readonly dispatcher: Dispatcher;
  private readonly ownDispatcher: Agent | null;
  private readonly pageUserAgent: string;
  private readonly feedUserAgent: string;
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
      // Test hook only: even then the request must carry our product token (no spoofing).
      if (!deps.userAgent.includes(BOT_PRODUCT_TOKEN) || /[\r\n]/.test(deps.userAgent)) {
        throw new Error(`createFetcher: userAgent override must contain "${BOT_PRODUCT_TOKEN}"`);
      }
      this.pageUserAgent = deps.userAgent;
      this.feedUserAgent = deps.userAgent;
    } else {
      this.pageUserAgent = buildUserAgent('page', infoUrl);
      this.feedUserAgent = buildUserAgent('feed', infoUrl);
    }

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
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return this.invalidUrl(rawUrl, opts, 'invalid_url', `not a valid absolute URL: ${rawUrl}`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return this.invalidUrl(rawUrl, opts, 'unsupported_scheme', `only http(s) URLs are fetched: ${url.protocol}`);
    }
    url.hash = '';
    const host = hostKey(url);
    const policy = await this.policy(host);
    const ctx = this.context(opts, policy);
    try {
      const gate = await this.gate(ctx, url, host, policy, !HOURS_EXEMPT.has(opts.purpose));
      if (gate) return gate;

      if (opts.purpose === 'robots' && url.pathname === '/robots.txt') {
        const state = await this.loadRobots(url.origin, ctx, policy, true);
        return state.fetchResult ?? this.skipResult(ctx, url, host, channelOf(policy), 'paused');
      }

      let flags: ChainFlags = { followAnyHost: false, checkRobots: opts.purpose !== 'robots', truncate: false };
      if (opts.purpose !== 'robots') {
        const verdict = await this.robotsVerdict(url, policy, ctx);
        if (!verdict.allowed) {
          return this.skipResult(ctx, url, host, channelOf(policy), 'robots_disallowed', {
            blocked: verdict.blocked ?? false,
            blockReason: verdict.blockReason,
            blockDetail: verdict.blockDetail,
            error: verdict.error,
            errorCode: verdict.errorCode,
            robotsGroup: verdict.group,
            robotsIgnored: verdict.ignored,
          });
        }
        flags = { ...flags, robotsGroup: verdict.group, robotsIgnored: verdict.ignored };
      }
      return (await this.execute(url, policy, ctx, flags)).result;
    } catch (error) {
      if (!isAbort(error)) throw error;
      const result = emptyResult(url.href, channelOf(policy));
      return { ...result, error: 'request aborted by caller', errorCode: 'aborted' };
    }
  }

  async isAllowedByRobots(rawUrl: string): Promise<boolean> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const policy = await this.policy(hostKey(url));
    const ctx = this.context({ purpose: 'product' }, policy);
    return (await this.robotsVerdict(url, policy, ctx)).allowed;
  }

  async robotsFor(hostOrUrl: string): Promise<RobotsDecisionInfo> {
    const origin = toOrigin(hostOrUrl);
    const host = new URL(origin).host.toLowerCase();
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

  /** Checks that never need a request: access mode, pause, crawl window, daily budget. */
  private async gate(
    ctx: CallContext,
    url: URL,
    host: string,
    policy: DomainPolicy,
    checkHours: boolean,
  ): Promise<FetchResult | null> {
    const channel = channelOf(policy);
    const access = this.accessSkip(policy, ctx.purpose);
    if (access) return this.skipResult(ctx, url, host, channel, access);

    const pause = await this.store.getPause(host);
    if (pause) {
      return this.skipResult(ctx, url, host, channel, 'paused', {
        blocked: true,
        blockReason: 'paused',
        blockDetail: describePause(pause),
      });
    }

    if (checkHours) {
      const within = isWithinAllowedHours(policy.allowedHours, this.now());
      if (within !== true) {
        return this.skipResult(
          ctx,
          url,
          host,
          channel,
          'outside_allowed_hours',
          within === 'invalid'
            ? { error: `invalid allowedHours ${JSON.stringify(policy.allowedHours)}`, errorCode: 'invalid_policy' }
            : {},
        );
      }
    }

    if (policy.maxPagesPerDay !== null && policy.maxPagesPerDay !== undefined) {
      const count = await this.store.getDailyCount(host, bucharestDay(this.now()));
      if (count >= policy.maxPagesPerDay) return this.skipResult(ctx, url, host, channel, 'budget_exhausted');
    }
    return null;
  }

  private async skipResult(
    ctx: CallContext,
    url: URL,
    host: string,
    channel: Channel,
    skipped: SkipReason,
    extra: {
      blocked?: boolean;
      blockReason?: BlockReason;
      blockDetail?: string;
      error?: string;
      errorCode?: FetchErrorCode;
      robotsGroup?: string;
      robotsIgnored?: string[];
    } = {},
  ): Promise<FetchResult> {
    const result: FetchResult = {
      ...emptyResult(url.href, channel),
      skipped,
      blocked: extra.blocked ?? false,
    };
    if (extra.blockReason) result.blockReason = extra.blockReason;
    if (extra.blockDetail) result.blockDetail = extra.blockDetail;
    if (extra.error) result.error = extra.error;
    if (extra.errorCode) result.errorCode = extra.errorCode;
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
      blocked: result.blocked,
      blockReason: result.blockReason,
      blockDetail: result.blockDetail,
      skipped,
      error: result.error,
      errorCode: result.errorCode,
      robotsGroup: extra.robotsGroup,
      robotsIgnoredGroups: extra.robotsIgnored,
    });
    ctx.log.debug({ host, url: url.href, purpose: ctx.purpose, skipped, detail: result.blockDetail ?? result.error }, 'request skipped');
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

  private intervalFor(url: URL, policy: DomainPolicy, purpose: FetchPurpose, log: FetchLogger): number {
    let interval =
      Number.isFinite(policy.minIntervalMs) && policy.minIntervalMs >= 0 ? policy.minIntervalMs : DEFAULT_MIN_INTERVAL_MS;
    if (policy.respectCrawlDelay !== false) {
      const memo = this.robotsMemo.get(url.origin);
      const delaySec = memo ? selectRobotsGroups(memo.parsed, robotsTokensFor(purpose)).crawlDelaySec : null;
      if (delaySec !== null && delaySec * 1000 > interval) {
        if (delaySec > MAX_CRAWL_DELAY_SEC) {
          log.warn({ host: hostKey(url), crawlDelaySec: delaySec }, 'robots.txt Crawl-delay capped at 3600 s');
        }
        interval = Math.min(delaySec, MAX_CRAWL_DELAY_SEC) * 1000;
      }
    }
    const r = Math.min(Math.max(this.random(), 0), 0.999_999);
    return interval + Math.floor(interval * JITTER_RATIO * r);
  }

  /** One network request: host lock, daily budget, slot, then the request. */
  private async performHop(url: URL, policy: DomainPolicy, ctx: CallContext, truncate: boolean): Promise<HopOutcome> {
    const host = hostKey(url);
    const channel = channelOf(policy);
    const release = await processHostLocks.acquire(host, ctx.opts.signal);
    try {
      const budget = await this.store.consumeDailyRequest(host, bucharestDay(this.now()), policy.maxPagesPerDay ?? null);
      if (!budget.allowed) return { kind: 'skip', url, skipped: 'budget_exhausted' };
      const slot = await this.store.reserveSlot(host, this.intervalFor(url, policy, ctx.purpose, ctx.log));
      if (slot.waitMs > 0) await this.sleep(slot.waitMs, ctx.opts.signal);
      const startedAt = this.now();
      if (channel === 'assisted') return await this.assistedHop(url, policy, ctx, startedAt, slot.waitMs);
      try {
        const res = await httpGet(url.href, {
          headers: buildRequestHeaders({
            userAgent: ctx.purpose === 'feed' ? this.feedUserAgent : this.pageUserAgent,
            purpose: ctx.purpose,
            accept: ctx.opts.accept,
            etag: ctx.opts.etag,
            lastModified: ctx.opts.lastModified,
          }),
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
        if (isAbort(error) && ctx.opts.signal?.aborted) throw error;
        return { kind: 'error', url, channel, error, durationMs: this.now() - startedAt, waitMs: slot.waitMs, startedAt };
      }
    } finally {
      release();
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
    policy: DomainPolicy,
    ctx: CallContext,
    startedAt: number,
    waitMs: number,
  ): Promise<HopOutcome> {
    const channel: Channel = 'assisted';
    try {
      const r = await (this.assisted as AssistedChannel).fetch(url.href, {
        render: policy.assistedRender ?? false,
        timeoutMs: ctx.timeoutMs,
        purpose: ctx.purpose,
        shopSlug: ctx.shopSlug,
        signal: ctx.opts.signal,
      });
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.headers ?? {})) headers[k.toLowerCase()] = v;
      const contentType = r.contentType ?? headers['content-type'] ?? null;
      const bytes = r.bodyBytes ? Buffer.from(r.bodyBytes) : Buffer.from(r.body ?? '', 'utf8');
      if (bytes.length > ctx.maxBytes) {
        throw new FetchError('body_too_large', `assisted response exceeded ${ctx.maxBytes} bytes`);
      }
      let finalUrl = url;
      try {
        if (r.finalUrl) finalUrl = new URL(r.finalUrl);
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
      if (r.blocked) hop.vendorBlock = { reason: r.blockReason ?? 'vendor_blocked', detail: r.blockDetail ?? 'blocked (reported by the assisted vendor)' };
      if (r.error || r.status === 0) hop.vendorError = r.error ?? 'assisted vendor returned no response';
      return hop;
    } catch (error) {
      if (isAbort(error) && ctx.opts.signal?.aborted) throw error;
      const wrapped =
        error instanceof FetchError ? error : new FetchError('assisted_error', `assisted channel failed: ${String(error)}`, { cause: error });
      return { kind: 'error', url, channel, error: wrapped, durationMs: this.now() - startedAt, waitMs, startedAt };
    }
  }

  /** Attempts with retry and back-off. */
  private async execute(start: URL, policy: DomainPolicy, ctx: CallContext, flags: ChainFlags): Promise<ExecOutcome> {
    const maxAttempts = channelOf(policy) === 'assisted' ? 1 : 1 + this.maxRetries;
    let waited = 0;
    let attempt = 0;
    let last: ExecOutcome | undefined;
    while (attempt < maxAttempts) {
      attempt += 1;
      last = await this.runChain(start, policy, ctx, flags, attempt, attempt >= maxAttempts);
      waited += last.waitedMs;
      if (!last.retryable || attempt >= maxAttempts) break;
      if (await this.store.getPause(hostKey(new URL(last.result.finalUrl)))) break; // breaker tripped
      const backoff = this.retryBaseMs * 2 ** (attempt - 1) + Math.floor(this.retryBaseMs * 0.1 * this.random());
      ctx.log.info({ url: start.href, attempt, backoffMs: backoff, error: last.result.error, status: last.result.status }, 'transient failure; retrying');
      await this.sleep(backoff, ctx.opts.signal);
      waited += backoff;
    }
    const outcome = last as ExecOutcome;
    return { ...outcome, result: { ...outcome.result, attempts: attempt, waitedMs: waited } };
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
    let robotsGroup = flags.robotsGroup;
    let robotsIgnored = flags.robotsIgnored;

    const done = (result: FetchResult, retryable = false, truncated = false): ExecOutcome => ({
      result: { ...result, url: start.href, durationMs: duration },
      truncated,
      retryable,
      waitedMs: waited,
    });

    for (let hop = 0; ; hop++) {
      const host = hostKey(current);
      if (hop > 0) {
        const gate = await this.gate(ctx, current, host, policy, false);
        if (gate) return done(gate);
        if (flags.checkRobots) {
          const verdict = await this.robotsVerdict(current, policy, ctx);
          robotsGroup = verdict.group;
          robotsIgnored = verdict.ignored;
          if (!verdict.allowed) {
            return done(
              await this.skipResult(ctx, current, host, channelOf(policy), 'robots_disallowed', {
                blocked: verdict.blocked ?? false,
                blockReason: verdict.blockReason,
                blockDetail: verdict.blockDetail,
                error: verdict.error,
                errorCode: verdict.errorCode,
                robotsGroup: verdict.group,
                robotsIgnored: verdict.ignored,
              }),
            );
          }
        }
      }

      const out = await this.performHop(current, policy, ctx, flags.truncate);
      if (out.kind === 'skip') {
        return done(await this.skipResult(ctx, current, host, channelOf(policy), out.skipped, { robotsGroup }));
      }
      waited += out.waitMs;
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
        const det = detectBlock({ error: out.error });
        const cls = det.transportError;
        const message = cls?.message ?? String(out.error);
        const code = cls?.code ?? 'network';
        if (det.blocked) {
          const pause = await this.pauseForBlock(host, 'transport', det, 0, ctx);
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
        if (cls?.countsAsFailure) await this.registerFailure(host, `${code}: ${message}`, ctx);
        await this.writeLog(ctx, { ...logBase, status: 0, bytes: 0, blocked: false, error: message, errorCode: code });
        return done(
          { ...emptyResult(start.href, out.channel), finalUrl: current.href, error: message, errorCode: code },
          cls?.transient ?? false,
        );
      }

      // ---- a response
      const status = out.status;
      if (out.channel === 'direct' && isRedirect(status) && out.headers.location) {
        let target: URL | null = null;
        try {
          target = new URL(out.headers.location, current);
          target.hash = '';
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
        if (!target || (target.protocol !== 'http:' && target.protocol !== 'https:')) {
          const error = `redirect to an unusable location: ${out.headers.location}`;
          await this.writeLog(ctx, { ...logBase, status, bytes: out.wireBytes, blocked: false, error, errorCode: 'invalid_redirect' });
          return done(redirectResult({ error, errorCode: 'invalid_redirect' }));
        }
        const challenge = detectChallengeRedirect(current, target);
        if (challenge) {
          const det: BlockDetection = { blocked: true, reason: 'captcha_redirect', vendor: challenge.vendor, detail: challenge.detail };
          const pause = await this.pauseForBlock(host, 'captcha_redirect', det, status, ctx);
          await this.writeLog(ctx, { ...logBase, status, bytes: out.wireBytes, blocked: true, blockReason: 'captcha_redirect', blockDetail: challenge.detail });
          return done(
            redirectResult({
              blocked: true,
              blockReason: 'captcha_redirect',
              blockDetail: `${challenge.detail} (not followed; paused until ${new Date(pause.until).toISOString()})`,
            }),
          );
        }
        if (hop >= MAX_REDIRECTS) {
          const error = `more than ${MAX_REDIRECTS} redirects`;
          await this.writeLog(ctx, { ...logBase, status, bytes: out.wireBytes, blocked: false, error, errorCode: 'too_many_redirects' });
          return done(redirectResult({ error, errorCode: 'too_many_redirects' }));
        }
        if (!flags.followAnyHost && !sameSite(current, target)) {
          const error = `cross-site redirect to ${target.href} not followed`;
          await this.writeLog(ctx, { ...logBase, status, bytes: out.wireBytes, blocked: false, error, errorCode: 'cross_site_redirect' });
          return done(redirectResult({ error, errorCode: 'cross_site_redirect' }));
        }
        if (ctx.purpose !== 'robots') await this.store.resetFailures(host);
        await this.writeLog(ctx, { ...logBase, status, bytes: out.wireBytes, blocked: false });
        const nextHost = hostKey(target);
        if (nextHost !== host) policy = await this.policy(nextHost);
        current = target;
        continue;
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
      const response = (extra: Partial<FetchResult>): FetchResult => ({
        ...emptyResult(start.href, out.channel),
        finalUrl: out.url.href,
        status,
        headers: out.headers,
        contentType: out.contentType,
        ...extra,
      });

      if (out.channel === 'assisted' && (out.vendorBlock || det.blocked || out.vendorError)) {
        // The vendor handles challenges; a block or failure here is the vendor's, not a reason to
        // pause the shop (M05B's success-rate auto-pause decides). It still counts as a failure.
        const blocked = Boolean(out.vendorBlock || det.blocked);
        const blockReason: BlockReason | undefined = blocked ? (out.vendorBlock?.reason ?? 'vendor_blocked') : undefined;
        const blockDetail = out.vendorBlock?.detail ?? det.detail;
        const error = out.vendorError;
        await this.registerFailure(host, blockDetail ?? error ?? 'assisted failure', ctx);
        await this.writeLog(ctx, {
          ...logBase,
          status,
          bytes: out.wireBytes,
          blocked,
          blockReason,
          blockDetail,
          error,
          errorCode: error ? 'assisted_error' : undefined,
        });
        return done(
          response({
            blocked,
            blockReason,
            blockDetail,
            error,
            errorCode: error ? 'assisted_error' : undefined,
          }),
        );
      }

      if (det.blocked && det.reason) {
        const pause = await this.pauseForBlock(host, det.reason, det, status, ctx);
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
    }
  }

  // ---------------------------------------------------------------- pauses and failures

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
    if (inflight) return inflight;
    const promise = this.fetchRobots(origin, ctx, policyHint).finally(() => this.robotsInflight.delete(origin));
    this.robotsInflight.set(origin, promise);
    return promise;
  }

  private async fetchRobots(origin: string, parent: CallContext, policyHint: DomainPolicy): Promise<RobotsState> {
    const robotsUrl = new URL('/robots.txt', origin);
    const host = hostKey(robotsUrl);
    const policy = policyHint.host === new URL(origin).hostname || policyHint.host === host ? policyHint : await this.policy(host);
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
    };

    const gate = await this.gate(ctx, robotsUrl, host, policy, false);
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

    const exec = await this.execute(robotsUrl, policy, ctx, { followAnyHost: true, checkRobots: false, truncate: true });
    const result = exec.result;
    const entry = this.robotsEntryFrom(origin, result, exec.truncated, cached);
    if (!entry) {
      return {
        origin,
        entry: null,
        parsed: null,
        source: 'none',
        unavailable: { skipped: result.skipped, blocked: result.blocked, blockReason: result.blockReason, detail: result.blockDetail ?? result.skipped ?? 'unavailable' },
        fetchResult: result,
      };
    }
    await this.store.setRobots(origin, entry);
    const state = this.stateFromEntry(entry, 'network');
    state.fetchResult = result;

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
    if (result.skipped) return null;
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
      const text = result.body ?? (result.bodyBytes ? new TextDecoder().decode(result.bodyBytes) : '');
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
