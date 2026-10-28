import type { DomainPolicy } from '@pretoscop/config/policy';
import type { Dispatcher } from 'undici';
import type { DomainStateStore } from './state/types';
import type { RequestSigner } from './signing';

/** Why a request is made. Drives the Accept header, the User-Agent (feeds) and some policy rules. */
export type FetchPurpose = 'robots' | 'sitemap' | 'listing' | 'product' | 'feed' | 'probe';

/** How the request reached the shop: our own identified crawler, or the assisted-access vendor (M05B). */
export type Channel = 'direct' | 'assisted';

/** Why a response (or a host) counts as blocked. */
export type BlockReason =
  | 'http_403'
  | 'http_429'
  | 'challenge'
  | 'captcha_redirect'
  | 'transport'
  | 'paused'
  | 'vendor_blocked';

/** Why no request was made for this call. */
export type SkipReason =
  | 'robots_disallowed'
  | 'paused'
  | 'outside_allowed_hours'
  | 'budget_exhausted'
  | 'access_off'
  | 'feed_only'
  | 'assisted_unavailable';

/** Stable, machine-readable error codes (the `error` string carries the human message). */
export type FetchErrorCode =
  | 'invalid_url'
  | 'unsupported_scheme'
  | 'aborted'
  | 'timeout'
  | 'connect_timeout'
  | 'connection_reset'
  | 'http2_reset'
  | 'tls_error'
  | 'tls_certificate'
  | 'dns'
  | 'connection_refused'
  | 'network_unreachable'
  | 'protocol_error'
  | 'network'
  | 'body_too_large'
  | 'decode_error'
  | 'too_many_redirects'
  | 'cross_site_redirect'
  | 'invalid_redirect'
  | 'redirect_disallowed'
  | 'channel_change'
  | 'robots_unavailable'
  | 'invalid_policy'
  | 'invalid_request'
  | 'crawl_disabled'
  | 'assisted_error'
  /** A tool's own request cap (M21 `shops:probe`): the request was never sent. */
  | 'request_cap'
  /** A transport error that surfaced long after the request's own timeout: this process was suspended (the machine slept), not refused. */
  | 'local_suspend';

export interface FetchPoliteOptions {
  /** Shop registry slug, for logs and the request log. Defaults to the policy's `shopSlug`. */
  shopSlug?: string;
  purpose: FetchPurpose;
  /** Overrides the default Accept header for the purpose (e.g. `application/json`). */
  accept?: string;
  /** Previous ETag of this resource: sent as `If-None-Match`. */
  etag?: string;
  /** Previous Last-Modified of this resource: sent as `If-Modified-Since`. */
  lastModified?: string;
  /** Overall time budget of one request (connect + headers + body). Default 30 s. */
  timeoutMs?: number;
  /** Hard cap on the response body (wire and decoded). Default 15 MiB. */
  maxBytes?: number;
  signal?: AbortSignal;
  /** Ingest run id (M05): copied to the request log and to every log line. */
  runId?: string | number;
  /** Source id (M05): copied to the request log and to every log line. */
  sourceId?: string | number;
}

export interface FetchResult {
  /** The requested URL (normalized, without fragment). */
  url: string;
  /** The last URL requested (after same-site redirects). */
  finalUrl: string;
  /** HTTP status of the final response; 0 when no response was received (skipped or transport error). */
  status: number;
  /** 2xx (not blocked) or 304 Not Modified. */
  ok: boolean;
  blocked: boolean;
  blockReason?: BlockReason;
  /** Human-readable explanation (vendor, marker, pause end). */
  blockDetail?: string;
  /** Set when no request was made for this URL. */
  skipped?: SkipReason;
  notModified: boolean;
  /** Decoded text for textual content types; null for binary, skipped, blocked or 304 responses. */
  body: string | null;
  /** Entity bytes after content-decoding; null for skipped, blocked or 304 responses. */
  bodyBytes: Uint8Array | null;
  contentType: string | null;
  /** Response headers, lower-case names, multi-value headers joined with ", ". */
  headers: Record<string, string>;
  /** Network time of the final attempt (all redirect hops). */
  durationMs: number;
  /** Time spent waiting for per-domain slots and retry back-off (all attempts and hops). */
  waitedMs: number;
  channel: Channel;
  /** Attempts (1 + retries) that sent at least one request; 0 when nothing was sent. */
  attempts: number;
  error?: string;
  errorCode?: FetchErrorCode;
}

/** One row per network request (every attempt and redirect hop) and per skipped call. */
export interface RequestLogEntry {
  ts: Date;
  host: string;
  url: string;
  method: 'GET';
  /** 0 when there was no HTTP response. */
  status: number;
  durationMs: number;
  /** Bytes received on the wire (before content-decoding). */
  bytes: number;
  /** Time waited for this request's per-domain slot. */
  waitMs: number;
  purpose: FetchPurpose;
  shopSlug?: string;
  channel: Channel;
  /** 1-based attempt number; 0 for skipped calls. */
  attempt: number;
  /** 0 for the first request of an attempt, 1.. for redirect hops. */
  hop: number;
  blocked: boolean;
  blockReason?: BlockReason;
  blockDetail?: string;
  skipped?: SkipReason;
  error?: string;
  errorCode?: FetchErrorCode;
  /** robots.txt group that decided this request (`PretoscopBot`, `*`, `none`, `no-robots`, ...). */
  robotsGroup?: string;
  /** Groups that looked like they target generic bots but do not match under RFC 9309 (e.g. cel.ro's `bot/`). */
  robotsIgnoredGroups?: string[];
  notModified?: boolean;
  contentType?: string | null;
  runId?: string | number;
  sourceId?: string | number;
}

export interface RequestLogSink {
  write(entry: RequestLogEntry): void | Promise<void>;
}

/** The subset of a pino logger the fetch layer uses. A pino `Logger` satisfies it. */
export interface FetchLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  child?(bindings: Record<string, unknown>): FetchLogger;
}

/** Arguments the fetch layer passes to the assisted-access client (M05B). */
export interface AssistedFetchRequest {
  /** Use the vendor's browser-rendered tier (`DomainPolicy.assistedRender`). */
  render: boolean;
  /**
   * Always false: the client must not follow redirects but return the 3xx with its `location`
   * header, so robots.txt and the CAPTCHA/cross-site rules apply to every hop. If the vendor
   * follows one anyway (`finalUrl` differs), the fetch layer checks the target and drops the body
   * when the target is not allowed.
   */
  followRedirects: false;
  /** The vendor must answer within this time; the fetch layer gives up shortly after it. */
  timeoutMs: number;
  purpose: FetchPurpose;
  shopSlug?: string;
  signal?: AbortSignal;
}

/** What the assisted client returns; the fetch layer completes it into a `FetchResult`. */
export interface AssistedFetchResponse {
  /** Status of the shop's response as reported by the vendor; 0 when the vendor failed. */
  status: number;
  body: string | null;
  bodyBytes?: Uint8Array | null;
  finalUrl?: string;
  headers?: Record<string, string>;
  contentType?: string | null;
  /** Set by the client when the vendor reports that the shop blocked it. */
  blocked?: boolean;
  blockReason?: BlockReason;
  blockDetail?: string;
  error?: string;
  /** Bytes billed/received, for the request log. */
  bytes?: number;
}

/** Hook implemented by M05B (`packages/fetch/assisted`). */
export interface AssistedChannel {
  fetch(url: string, request: AssistedFetchRequest): Promise<AssistedFetchResponse>;
}

/** robots.txt decision summary for one origin, as `robotsFor()` returns it. */
export interface RobotsDecisionInfo {
  host: string;
  origin: string;
  robotsUrl: string;
  /** The product token we match groups against. */
  productToken: string;
  /** `cache` when served from the state store, `network` when fetched by this call, `none` when unavailable. */
  source: 'network' | 'cache' | 'none';
  fetchedAt: string | null;
  expiresAt: string | null;
  /** HTTP status of the robots.txt response; 0 when there was none. */
  status: number;
  /** parsed | not_found (allow all) | unreachable, blocked, too_many_redirects (disallow all) | unavailable (not fetched). */
  outcome: 'parsed' | 'not_found' | 'unreachable' | 'blocked' | 'too_many_redirects' | 'unavailable';
  allowAll: boolean;
  disallowAll: boolean;
  /** Group that applies to us: `PretoscopBot` (product token), `*`, or `none` (no group: everything allowed). */
  matchedGroup: string;
  /** The user-agent lines of the group(s) that applied. */
  matchedUserAgents: string[];
  /** Rules of the applied group(s), in file order. */
  rules: Array<{ type: 'allow' | 'disallow'; pattern: string }>;
  crawlDelaySec: number | null;
  sitemaps: string[];
  groupCount: number;
  /** Non-matching groups whose user-agent looks generic or close to ours, with the reason. */
  ignoredGroups: Array<{ userAgent: string; reason: 'generic_fragment' | 'substring_of_our_user_agent' | 'other_pretoscop_token' }>;
  /** The robots.txt body was an HTML document (soft 404); no rules were found in it. */
  htmlBody: boolean;
  truncated: boolean;
  channel: Channel;
  blockReason?: BlockReason;
  detail?: string;
}

export interface Fetcher {
  fetchPolite(url: string, opts: FetchPoliteOptions): Promise<FetchResult>;
  isAllowedByRobots(url: string): Promise<boolean>;
  robotsFor(host: string): Promise<RobotsDecisionInfo>;
  pauseDomain(host: string, hours: number, reason: string): Promise<void>;
  unpauseDomain(host: string): Promise<void>;
  /** Closes the fetcher's own HTTP agent (not an injected dispatcher). */
  close(): Promise<void>;
}

export interface FetcherDeps {
  /** Policy per host (`www.emag.ro`). Default: `defaultDomainPolicy(host)`. Map kill switches to `accessMode: 'off'`. */
  policyFor?: (host: string) => DomainPolicy | Promise<DomainPolicy>;
  stateStore: DomainStateStore;
  /**
   * Global switch for any request to a shop. Default: env `CRAWL_ENABLED` (`1/true/yes/on`);
   * unset or anything else means off (fail closed, like `@pretoscop/config`'s default), which turns
   * every call into `skipped: 'access_off'`, `errorCode: 'crawl_disabled'`.
   */
  crawlEnabled?: boolean;
  requestLog?: RequestLogSink;
  /** Assisted-access client (M05B). Without it, `accessMode: 'assisted'` hosts return `skipped: 'assisted_unavailable'`. */
  assisted?: AssistedChannel;
  logger?: FetchLogger;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Returns [0, 1); used for jitter. */
  random?: () => number;
  /** undici dispatcher (tests: MockAgent, H2CClient). Default: an internal Agent. */
  dispatcher?: Dispatcher;
  /** Tests only. Must have our exact format: `Mozilla/5.0 (compatible; PretoscopBot[-Feed]/<version>; +<url>)`. */
  userAgent?: string;
  /** Info URL inside the User-Agent. Default: env `BOT_INFO_URL`, else https://pretoscop.ro/bot. */
  botInfoUrl?: string;
  /** Default per-request time budget (env `FETCH_TIMEOUT_MS`). Default 30 000. */
  defaultTimeoutMs?: number;
  /** Default body cap (env `FETCH_MAX_BODY_BYTES`). Default 15 MiB. */
  defaultMaxBytes?: number;
  /** TCP/TLS connect timeout of the internal agent. Default 10 000. */
  connectTimeoutMs?: number;
  /** Retries of transient failures (5xx without challenge markers, timeouts). Default 2 extra attempts, 10 s base back-off. */
  retry?: { maxRetries?: number; baseDelayMs?: number };
  /**
   * Web Bot Auth signer (M21, `./signing`). Default: from env (`WEB_BOT_AUTH=1` +
   * `WEB_BOT_AUTH_PRIVATE_KEY`), else none. `null` turns signing off whatever the env says.
   */
  signer?: RequestSigner | null;
}
