import { describe, expect, it } from 'vitest';
import { promotedDailyJob, promotedRefreshJob } from '../src/jobs/promoted';
import type { JobContext } from '../src/jobs/types';

const log = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as JobContext['log'];

describe('promoted jobs (M25)', () => {
  it('promoted.refresh forwards only promoted tags to every web replica', async () => {
    const sent: string[][] = [];
    const ctx = { services: { revalidate: async (t: string[]) => (sent.push(t), t.length) }, log } as unknown as JobContext;
    await promotedRefreshJob.handler({ data: { tags: ['promoted:c12', 'promoted:categorii', 'products', 'product:1', 42, 'promoted'] } } as never, ctx);
    expect(sent).toEqual([['promoted:c12', 'promoted:categorii', 'promoted']]);
    await promotedRefreshJob.handler({ data: { tags: 'promoted' } } as never, ctx);
    expect(sent).toHaveLength(1);
  });

  it('promoted.daily runs after midnight Romania time and refreshes every slot', () => {
    expect(promotedDailyJob.schedule?.cron).toBe('5 0 * * *');
    expect(promotedDailyJob.schedule?.tz).toBeUndefined();
  });
});
