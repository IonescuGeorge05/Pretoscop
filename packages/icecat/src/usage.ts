/**
 * Download counter per language repository and calendar month (UTC). Open Icecat's Fair Use
 * Policy allows up to 1,000,000 data-sheet downloads per month per country/language repository
 * (an excess may be billed at €0.30 per 1,000). Every datasheet request is counted before it is
 * sent, found or not, so the counter can only over-count; image downloads are not datasheets.
 */
export interface IcecatUsageStore {
  /** Counts one datasheet request for `lang` this month unless `cap` is already reached. */
  reserve(lang: string, cap: number, now: Date): Promise<{ allowed: boolean; used: number }>;
  /** Requests counted for `lang` in the month of `now`. */
  used(lang: string, now: Date): Promise<number>;
}

/** Open Icecat's monthly limit per language repository. */
export const OPEN_ICECAT_MONTHLY_CAP = 1_000_000;

/** Counter key: `icecat:RO`. */
export function usageKey(lang: string): string {
  return `icecat:${lang.toUpperCase()}`;
}

/** First day of the UTC month of `now`, `YYYY-MM-01`. */
export function monthStart(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

/** In-process counter (tests, the lookup CLI). */
export class MemoryIcecatUsage implements IcecatUsageStore {
  private readonly counts = new Map<string, number>();

  async reserve(lang: string, cap: number, now: Date): Promise<{ allowed: boolean; used: number }> {
    const key = `${usageKey(lang)}|${monthStart(now)}`;
    const used = this.counts.get(key) ?? 0;
    if (used >= cap) return { allowed: false, used };
    this.counts.set(key, used + 1);
    return { allowed: true, used: used + 1 };
  }

  async used(lang: string, now: Date): Promise<number> {
    return this.counts.get(`${usageKey(lang)}|${monthStart(now)}`) ?? 0;
  }
}
