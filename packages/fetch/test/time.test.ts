import { describe, expect, it } from 'vitest';
import { bucharestDay, bucharestTime, isWithinAllowedHours, parseHHMM } from '../src/time';

const at = (iso: string) => Date.parse(iso);

describe('Europe/Bucharest calendar', () => {
  it('switches day at local midnight in winter (UTC+2) and summer (UTC+3)', () => {
    expect(bucharestDay(at('2026-10-27T21:59:59Z'))).toBe('2026-10-27');
    expect(bucharestDay(at('2026-10-27T22:00:00Z'))).toBe('2026-10-28');
    expect(bucharestDay(at('2026-07-01T20:59:59Z'))).toBe('2026-07-01');
    expect(bucharestDay(at('2026-07-01T21:00:00Z'))).toBe('2026-07-02');
  });

  it('follows the DST jump (29 March 2026, 03:00 -> 04:00 local)', () => {
    expect(bucharestTime(at('2026-03-29T00:59:00Z')).minutes).toBe(2 * 60 + 59);
    expect(bucharestTime(at('2026-03-29T01:00:00Z')).minutes).toBe(4 * 60);
  });
});

describe('allowed hours', () => {
  const offPeak = { start: '02:00', end: '07:00' };
  const overnight = { start: '22:00', end: '06:00' };

  it('applies a same-day window, start inclusive and end exclusive', () => {
    expect(isWithinAllowedHours(offPeak, at('2026-10-28T00:00:00Z'))).toBe(true); // 02:00 local
    expect(isWithinAllowedHours(offPeak, at('2026-10-28T04:59:00Z'))).toBe(true); // 06:59
    expect(isWithinAllowedHours(offPeak, at('2026-10-28T05:00:00Z'))).toBe(false); // 07:00
    expect(isWithinAllowedHours(offPeak, at('2026-10-27T23:59:00Z'))).toBe(false); // 01:59
  });

  it('applies an overnight window (22:00-06:00)', () => {
    expect(isWithinAllowedHours(overnight, at('2026-10-28T20:30:00Z'))).toBe(true); // 22:30
    expect(isWithinAllowedHours(overnight, at('2026-10-28T21:59:00Z'))).toBe(true); // 23:59
    expect(isWithinAllowedHours(overnight, at('2026-10-28T22:00:00Z'))).toBe(true); // 00:00
    expect(isWithinAllowedHours(overnight, at('2026-10-29T03:59:00Z'))).toBe(true); // 05:59
    expect(isWithinAllowedHours(overnight, at('2026-10-29T04:00:00Z'))).toBe(false); // 06:00
    expect(isWithinAllowedHours(overnight, at('2026-10-28T12:00:00Z'))).toBe(false); // 14:00
    expect(isWithinAllowedHours(overnight, at('2026-10-28T19:59:00Z'))).toBe(false); // 21:59
  });

  it('treats no window and start == end as "any time", and rejects malformed times', () => {
    expect(isWithinAllowedHours(null, at('2026-10-28T12:00:00Z'))).toBe(true);
    expect(isWithinAllowedHours({ start: '00:00', end: '00:00' }, at('2026-10-28T12:00:00Z'))).toBe(true);
    expect(isWithinAllowedHours({ start: '00:00', end: '24:00' }, at('2026-10-28T12:00:00Z'))).toBe(true);
    expect(isWithinAllowedHours({ start: '2am', end: '07:00' }, at('2026-10-28T12:00:00Z'))).toBe('invalid');
  });

  it('parses HH:MM', () => {
    expect(parseHHMM('7:05')).toBe(425);
    expect(parseHHMM('24:00')).toBe(1440);
    expect(parseHHMM('24:01')).toBeNull();
    expect(parseHHMM('12:60')).toBeNull();
    expect(parseHHMM('noon')).toBeNull();
  });
});
