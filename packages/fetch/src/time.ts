import type { AllowedHours } from '@pretoscop/config/policy';

/** Romania's civil time: daily budgets and crawl windows follow it (DST included). */
export const BUCHAREST_TZ = 'Europe/Bucharest';

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUCHAREST_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface BucharestTime {
  /** `YYYY-MM-DD` */
  day: string;
  /** Minutes since local midnight, 0..1439. */
  minutes: number;
}

export function bucharestTime(epochMs: number): BucharestTime {
  const parts: Record<string, string> = {};
  for (const p of formatter.formatToParts(new Date(epochMs))) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
  };
}

/** The Bucharest calendar day (`YYYY-MM-DD`) a request counts against. */
export function bucharestDay(epochMs: number): string {
  return bucharestTime(epochMs).day;
}

/** `HH:MM` (00:00..23:59, also 24:00) to minutes, or null when malformed. */
export function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59 || h > 24 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

/**
 * Whether `epochMs` falls in the window (start inclusive, end exclusive, Bucharest time).
 * `end` earlier than `start` means the window crosses midnight (22:00-06:00). `start == end`
 * means the whole day. Returns 'invalid' for malformed times; the fetcher then makes no request.
 */
export function isWithinAllowedHours(window: AllowedHours | null | undefined, epochMs: number): boolean | 'invalid' {
  if (!window) return true;
  const start = parseHHMM(window.start);
  const end = parseHHMM(window.end);
  if (start === null || end === null) return 'invalid';
  if (start === end) return true;
  const { minutes } = bucharestTime(epochMs);
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
