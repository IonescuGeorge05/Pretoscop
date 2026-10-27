/**
 * Per-domain crawl policy. The shop registry (M04) produces these from
 * `packages/config/shops/*.yaml`; the fetch layer (M02) enforces them.
 */

/** How a shop may be read (`shops.access_mode`). */
export type AccessMode = 'direct' | 'assisted' | 'feed_only' | 'off';

export interface AllowedHours {
  /** 'HH:MM' in Europe/Bucharest, inclusive. */
  start: string;
  /** 'HH:MM' in Europe/Bucharest, exclusive. May be earlier than `start` (window over midnight). */
  end: string;
}

export interface DomainPolicy {
  /** Lower-case host, e.g. `www.emag.ro`. */
  host: string;
  shopSlug?: string;
  accessMode: AccessMode;
  /** Minimum time between the starts of two requests to this host. Default 5000. */
  minIntervalMs: number;
  /** Always 1 for shops (CLAUDE.md). */
  maxConcurrency: 1;
  /** Bulk crawling window; null = any time. */
  allowedHours: AllowedHours | null;
  /** Hard daily request budget for the host; null = unlimited. */
  maxPagesPerDay: number | null;
  /** Use robots.txt `Crawl-delay` when it is longer than `minIntervalMs`. Default true. */
  respectCrawlDelay: boolean;
  /** Assisted channel only (M05B): use the vendor's browser-rendered tier. */
  assistedRender?: boolean;
}

export const DEFAULT_MIN_INTERVAL_MS = 5000;

export function defaultDomainPolicy(host: string, overrides: Partial<DomainPolicy> = {}): DomainPolicy {
  return {
    host: host.toLowerCase(),
    accessMode: 'direct',
    minIntervalMs: DEFAULT_MIN_INTERVAL_MS,
    maxConcurrency: 1,
    allowedHours: null,
    maxPagesPerDay: null,
    respectCrawlDelay: true,
    ...overrides,
  };
}
