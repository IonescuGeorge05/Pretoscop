import type { ReportInput, ReportInputDay, ReportInputOffer } from '../src/analyze';
import { addDays } from '../src/analyze';

/**
 * Known-answer fixture: event window 20–22 Nov 2026, history from 21 Sep. Prices in bani.
 *   A (emag, shop): 1000 lei for 60 days, event 900 lei with reference 1200 → real drop −10 %.
 *   B (emag, shop): 1000 lei, event 995 lei with reference 1300 → claimed, no real drop.
 *   C (itgalaxy, shop): raised to 1200 for the whole month before, event 1000 with reference 1250
 *     → a "real drop" against the 30-day minimum (−16.7 %) that is also a raise-then-cut case
 *     (peak 1200 ≥ 1.15 × 1000, event 1000 ≥ 0.97 × 1000): why the report shows both rules.
 *   D (emag, marketplace): 500 lei, event 550 → higher.
 *   E (forit, shop): only 10 days of history before → insufficient.
 *   F (forit, shop): out of stock during the event → excluded.
 */
export const WINDOW = { from: '2026-11-20', to: '2026-11-22' };

function series(start: string, end: string, price: (day: string) => number | null, old: (day: string) => number | null = () => null): ReportInputDay[] {
  const out: ReportInputDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const p = price(d);
    if (p !== null) out.push({ day: d, priceBani: p, oldPriceBani: old(d) });
  }
  return out;
}

const inEvent = (d: string) => d >= WINDOW.from && d <= WINDOW.to;
const H0 = addDays(WINDOW.from, -60);

export const OFFERS: ReportInputOffer[] = [
  {
    offerId: 1, shop: 'emag', sellerType: 'shop', productId: 10, productTitle: 'Telefon A 128GB', category: 'telefoane-mobile',
    days: series(H0, WINDOW.to, (d) => (inEvent(d) ? 90_000 : 100_000), (d) => (inEvent(d) ? 120_000 : null)),
  },
  {
    offerId: 2, shop: 'emag', sellerType: 'shop', productId: 11, productTitle: 'Laptop B 512GB', category: 'laptopuri',
    days: series(H0, WINDOW.to, (d) => (inEvent(d) ? 99_500 : 100_000), (d) => (inEvent(d) ? 130_000 : null)),
  },
  {
    offerId: 3, shop: 'itgalaxy', sellerType: 'shop', productId: 12, productTitle: 'Televizor C 55"', category: 'televizoare',
    days: series(H0, WINDOW.to, (d) => (inEvent(d) ? 100_000 : d >= addDays(WINDOW.from, -30) ? 120_000 : 100_000), (d) => (inEvent(d) ? 125_000 : null)),
  },
  {
    offerId: 4, shop: 'emag', sellerType: 'marketplace', productId: 10, productTitle: 'Telefon A 128GB', category: 'telefoane-mobile',
    days: series(H0, WINDOW.to, (d) => (inEvent(d) ? 55_000 : 50_000)),
  },
  {
    offerId: 5, shop: 'forit', sellerType: 'shop', productId: 13, productTitle: 'Consola E', category: 'console',
    days: series(addDays(WINDOW.from, -10), WINDOW.to, () => 200_000),
  },
  {
    offerId: 6, shop: 'forit', sellerType: 'shop', productId: 14, productTitle: 'Tableta F', category: 'tablete',
    days: series(H0, addDays(WINDOW.from, -1), () => 70_000),
  },
];

export const INPUT: ReportInput = {
  id: 'test-2026',
  title: 'Raport de test',
  window: WINDOW,
  generatedAt: '2026-11-23T08:00:00.000Z',
  categories: null,
  shopNames: { emag: 'eMAG', itgalaxy: 'IT Galaxy', forit: 'forIT' },
  categoryNames: { 'telefoane-mobile': 'Telefoane mobile', laptopuri: 'Laptopuri', televizoare: 'Televizoare', console: 'Console', tablete: 'Tablete' },
  offers: OFFERS,
};
