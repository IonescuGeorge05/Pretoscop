import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budgetStatusOf, costUsdNanos, monthStartBucharest, NANOS, UnknownModelError, usageFromApi, usdToEurNanos, worstCaseUsdNanos, ZERO_USAGE } from '../src';

const usage = (u: Partial<typeof ZERO_USAGE>) => ({ ...ZERO_USAGE, ...u });

describe('price table (ADR-011: Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10 per million tokens)', () => {
  it('prices input and output per million tokens', () => {
    // 1M input + 1M output on Haiku: $0.10 + $0.50
    expect(costUsdNanos('claude-haiku-5-5', usage({ inputTokens: 100_000, outputTokens: 0 }), { batch: false })).toBe(10_000_000); // $0.01
    expect(costUsdNanos('claude-haiku-5-5', usage({ inputTokens: 1_000, outputTokens: 1_000 }), { batch: false })).toBe(600_000); // $0.0006
    expect(costUsdNanos('claude-sonnet-5-5', usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }), { batch: false })).toBe(12 * NANOS);
  });

  it('halves every component in a Message Batch', () => {
    const u = usage({ inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 1000, cacheWrite5mTokens: 1000, cacheWrite1hTokens: 1000 });
    const sync = costUsdNanos('claude-haiku-5-5', u, { batch: false });
    const batch = costUsdNanos('claude-haiku-5-5', u, { batch: true });
    expect(sync).toBe(100_000 + 500_000 + 10_000 + 125_000 + 200_000);
    expect(batch).toBe(50_000 + 250_000 + 5_000 + 62_500 + 100_000);
  });

  it('applies the cache multipliers: read 0.1×, 5-minute write 1.25×, 1-hour write 2×', () => {
    expect(costUsdNanos('claude-sonnet-5-5', usage({ cacheReadTokens: 1_000_000 }), { batch: false })).toBe(200_000_000);
    expect(costUsdNanos('claude-sonnet-5-5', usage({ cacheWrite5mTokens: 1_000_000 }), { batch: false })).toBe(2_500_000_000);
    expect(costUsdNanos('claude-sonnet-5-5', usage({ cacheWrite1hTokens: 1_000_000 }), { batch: false })).toBe(4 * NANOS);
  });

  it('uses the long-context rate card of Haiku 5.5 above 100K prompt tokens', () => {
    const short = costUsdNanos('claude-haiku-5-5', usage({ inputTokens: 100_000, outputTokens: 1000 }), { batch: false });
    const long = costUsdNanos('claude-haiku-5-5', usage({ inputTokens: 100_001, outputTokens: 1000 }), { batch: false });
    expect(short).toBe(10_000_000 + 500_000);
    expect(long).toBe(Math.ceil(100_001 * 500_000 / 1000) + 2_500_000);
  });

  it('refuses a model without a price (no call can be costed)', () => {
    expect(() => costUsdNanos('claude-opus-5-5', ZERO_USAGE, { batch: false })).toThrow(UnknownModelError);
    expect(() => worstCaseUsdNanos('gpt-x', { maxInputTokens: 1, maxTokens: 1, batch: true })).toThrow(UnknownModelError);
  });

  it('the worst case bounds every bill within the same token limits', () => {
    const bound = worstCaseUsdNanos('claude-haiku-5-5', { maxInputTokens: 5000, maxTokens: 2048, batch: true });
    for (const split of [0, 0.3, 0.7, 1]) {
      const write = Math.round(5000 * split);
      const actual = costUsdNanos('claude-haiku-5-5', usage({ inputTokens: 5000 - write, cacheWrite1hTokens: write, outputTokens: 2048 }), { batch: true });
      expect(actual).toBeLessThanOrEqual(bound);
    }
  });

  it('reads the documented usage shape; cache writes without a TTL breakdown count as 1-hour writes', () => {
    const msg = JSON.parse(readFileSync(new URL('./fixtures/message-pair-verify.json', import.meta.url), 'utf8'));
    expect(usageFromApi(msg.usage)).toEqual({ inputTokens: 214, outputTokens: 61, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, cacheReadTokens: 1893 });
    expect(usageFromApi({ input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 700, cache_read_input_tokens: null })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 700,
      cacheReadTokens: 0,
    });
    expect(usageFromApi(null)).toEqual(ZERO_USAGE);
  });

  it('converts to euro rounding up', () => {
    expect(usdToEurNanos(1000, 0.9)).toBe(900);
    expect(usdToEurNanos(1001, 0.9)).toBe(901);
    expect(() => usdToEurNanos(1, 0)).toThrow();
  });
});

describe('budget month and levels', () => {
  it('starts the month at midnight in Bucharest (summer and winter time)', () => {
    expect(monthStartBucharest(new Date('2026-10-28T12:00:00Z')).toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(monthStartBucharest(new Date('2026-11-15T12:00:00Z')).toISOString()).toBe('2026-10-31T22:00:00.000Z');
    // 31 Oct 22:30 UTC is already 1 Nov 00:30 in Bucharest
    expect(monthStartBucharest(new Date('2026-10-31T22:30:00Z')).toISOString()).toBe('2026-10-31T22:00:00.000Z');
    expect(monthStartBucharest(new Date('2027-01-01T00:00:00Z')).toISOString()).toBe('2026-12-31T22:00:00.000Z');
  });

  it('warns at 80 % and stops at 100 % of the cap (spent plus in flight)', () => {
    const at = (spent: number, reserved = 0) => budgetStatusOf({ spentEurNanos: spent * NANOS, reservedEurNanos: reserved * NANOS, calls: 1 }, 50, new Date()).level;
    expect(at(39.99)).toBe('ok');
    expect(at(40)).toBe('warn');
    expect(at(30, 10)).toBe('warn');
    expect(at(49.99)).toBe('warn');
    expect(at(40, 10)).toBe('stop');
    expect(budgetStatusOf({ spentEurNanos: 0, reservedEurNanos: 0, calls: 0 }, 0, new Date()).level).toBe('stop');
  });
});
