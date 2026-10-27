// @pretoscop/fetch: the only HTTP client the crawler uses. Identified (PretoscopBot), throttled
// per host, robots.txt-compliant (RFC 9309), with block detection, pauses and a request log.
// Contract and policy: packages/fetch/README.md. The assisted channel (M05B) plugs in through
// `FetcherDeps.assisted`.

export type {
  AssistedChannel,
  AssistedFetchRequest,
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

export {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BASE_MS,
  DEFAULT_TIMEOUT_MS,
  FAILURE_PAUSE_BASE_MS,
  FAILURE_PAUSE_MAX_MS,
  FAILURE_PAUSE_THRESHOLD,
  JITTER_RATIO,
  MAX_CRAWL_DELAY_SEC,
  MAX_REDIRECTS,
  PAUSE_BLOCK_MS,
  PAUSE_RATE_LIMIT_MIN_MS,
  PAUSE_RETRY_AFTER_MAX_MS,
  ROBOTS_FAILURE_TTL_MS,
  ROBOTS_MAX_BYTES,
  ROBOTS_TTL_MS,
  createFetcher,
  sameSite,
  siteKey,
  toOrigin,
} from './fetcher';

export {
  ACCEPT_ENCODING,
  ACCEPT_LANGUAGE,
  BOT_INFO_URL,
  BOT_PRODUCT_TOKEN,
  BOT_USER_AGENT,
  BOT_VERSION,
  DEFAULT_ACCEPT,
  DEFAULT_BOT_INFO_URL,
  FEED_PRODUCT_TOKEN,
  FEED_USER_AGENT,
  buildRequestHeaders,
  buildUserAgent,
  resolveBotInfoUrl,
  robotsTokensFor,
} from './identity';

export {
  INTERSTITIAL_MAX_CHARS,
  classifyTransportError,
  detectBlock,
  detectChallengeRedirect,
  findChallengeMarker,
  looksLikeHtml,
  parseRetryAfter,
  type BlockDetection,
  type BlockDetectionInput,
  type BlockVendor,
  type TransportErrorClass,
} from './detect';

export {
  ROBOTS_PARSE_LIMIT_BYTES,
  evaluateRobots,
  extractProductToken,
  findIgnoredGroups,
  isAllowedByParsedRobots,
  normalizeRobotsPath,
  parseRobotsTxt,
  robotsPathOf,
  robotsPatternMatches,
  selectRobotsGroups,
  type IgnoredRobotsGroup,
  type ParsedRobots,
  type RobotsEvaluation,
  type RobotsGroup,
  type RobotsGroupSelection,
  type RobotsRule,
} from './robots';

export { BUCHAREST_TZ, bucharestDay, bucharestTime, isWithinAllowedHours, parseHHMM } from './time';
export { decodeText, detectCharset } from './decode';
export { FetchError } from './errors';

export type {
  DailyBudgetResult,
  DomainPause,
  DomainStateStore,
  RobotsCacheEntry,
  RobotsOutcome,
  SlotReservation,
} from './state/types';
export { MemoryDomainStateStore } from './state/memory';
export { FileDomainStateStore, type FileDomainStateStoreOptions } from './state/file';
