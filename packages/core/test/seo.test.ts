import { describe, expect, it } from 'vitest';
import { INDEX_MIN_HISTORY_DAYS, INDEX_MIN_LIVE_OFFERS, isProductIndexable, productIndexDecision } from '../src/seo';

describe('product index policy (docs/03 §6.6)', () => {
  const base = { status: 'active', provisional: false, liveOffers: 2, observationsDays: 0 };

  it('indexes products with two live offers, or one offer and 14 days of history', () => {
    expect(INDEX_MIN_LIVE_OFFERS).toBe(2);
    expect(INDEX_MIN_HISTORY_DAYS).toBe(14);
    expect(productIndexDecision(base)).toBe('indexable');
    expect(productIndexDecision({ ...base, liveOffers: 1, observationsDays: 14 })).toBe('indexable');
    expect(productIndexDecision({ ...base, liveOffers: 1, observationsDays: 13 })).toBe('thin');
  });

  it('never indexes provisional, inactive or zero-offer products', () => {
    expect(productIndexDecision({ ...base, provisional: true, liveOffers: 6, observationsDays: 90 })).toBe('provisional');
    expect(productIndexDecision({ ...base, status: 'hidden' })).toBe('inactive');
    expect(productIndexDecision({ ...base, status: 'merged' })).toBe('inactive');
    expect(productIndexDecision({ ...base, liveOffers: 0, observationsDays: 200 })).toBe('no_live_offers');
    expect(isProductIndexable({ provisional: false, liveOffers: 3, observationsDays: 0 })).toBe(true);
  });
});
