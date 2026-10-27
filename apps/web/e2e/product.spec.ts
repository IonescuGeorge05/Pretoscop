import { expect, test } from '@playwright/test';
import { fixture, fixtureCli } from './fixture';

// Product page (M13) against the throwaway product of packages/db/src/fixtures/e2e.ts:
// eMAG marketplace 2.168,99 · IT Galaxy 2.179,00 (delivery unknown) · forIT 2.224,00 ·
// eMAG 2.249,99 · Elefant 2.099,00 out of stock · Flip 1.799,00 refurbished (hidden by default).

test('offers are ranked by total price, best offer summarised, refurbished behind a filter', async ({ page, isMobile }) => {
  const f = fixture();
  await page.goto(`/p/${f.slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Testoscop X1');

  const offers = page.getByTestId('offer');
  await expect(offers).toHaveCount(5);
  expect(await offers.evaluateAll((els) => els.map((e) => e.getAttribute('data-total')))).toEqual(['2168.99', '2179.00', '2224.00', '2249.99', '2099.00']);
  await expect(offers.first()).toContainText('Cel mai mic preț total');
  await expect(offers.first()).toContainText('Gadget Store SRL');
  await expect(offers.nth(1)).toContainText('livrare de verificat');
  await expect(offers.nth(4)).toContainText('Stoc epuizat');

  const summary = page.getByTestId(isMobile ? 'summary-summary_mobile' : 'summary-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('2.168,99 lei');
  if (isMobile) {
    // docs/03 §7.2: on a phone the best price comes right after the title, before the offers.
    const summaryBox = await summary.boundingBox();
    const offersBox = await page.locator('#oferte').boundingBox();
    expect(summaryBox!.y).toBeLessThan(offersBox!.y);
  }

  await page.getByLabel('Include resigilate și folosite').check();
  await expect(offers).toHaveCount(6);
  await expect(offers.first()).toContainText('Resigilat / recondiționat');
  await page.getByLabel('Doar în stoc').check();
  await expect(offers).toHaveCount(5);

  await expect(page.locator('#continut').getByText('Prețurile și disponibilitatea sunt preluate automat de pe site-urile magazinelor')).toBeVisible();
  await expect(page.getByTestId('price-chart').locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: '30 de zile' }).click();
  await expect(page.getByRole('button', { name: '30 de zile' })).toHaveAttribute('aria-pressed', 'true');
});

test('a wrong slug redirects permanently to the canonical one', async ({ request }) => {
  const f = fixture();
  const res = await request.get(`/p/alt-nume-${f.productId}`, { maxRedirects: 0 });
  expect([301, 308]).toContain(res.status());
  expect(res.headers().location).toContain(`/p/${f.slug}`);
});

test('click-out logs a hashed click and redirects to the shop', async ({ request }) => {
  test.skip(test.info().project.name !== 'desktop', 'one click is enough');
  const f = fixture();
  const forit = f.offers.forit!;
  const res = await request.get(`/out/${forit.offerId}?p=offers_table`, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe('https://example.com/e2e/forit');
  expect(res.headers()['x-robots-tag']).toContain('noindex');
  const clicks = fixtureCli('clicks') as Array<{ offerId: number; placement: string | null; ipHash: string | null }>;
  const last = clicks.at(-1);
  expect(last).toMatchObject({ offerId: forit.offerId, placement: 'offers_table' });
  expect(last?.ipHash).toMatch(/^[0-9a-f]{16,}$/);
  expect((await request.get('/out/999999999', { maxRedirects: 0 })).status()).toBe(404);
});

test('history API returns the daily series without marketplace or refurbished offers', async ({ request }) => {
  test.skip(test.info().project.name !== 'desktop', 'API test');
  const f = fixture();
  const res = await request.get(`/api/products/${f.productId}/history?range=30d`);
  expect(res.ok()).toBe(true);
  const h = (await res.json()) as {
    range: string;
    series: { min: Array<[string, number]>; marketplace: Array<[string, number]>; shops: Record<string, Array<[string, number]>> };
    stats: { min30d: number | null; observationsDays: number } | null;
  };
  expect(h.range).toBe('30d');
  expect(h.series.min.length).toBeGreaterThanOrEqual(9);
  expect(h.series.min[0]![1]).toBe(2099);
  expect(h.series.min.at(-1)![1]).toBe(2179);
  expect(h.series.marketplace.at(-1)![1]).toBe(2168.99);
  expect(Object.keys(h.series.shops).sort()).toEqual(['elefant', 'emag', 'forit', 'itgalaxy']);
  expect(h.stats).toMatchObject({ min30d: 2099 });
  expect((await request.get(`/api/products/${f.productId}/history?range=5y`)).status()).toBe(400);
});
