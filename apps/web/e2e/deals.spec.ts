import { expect, test, type Page } from '@playwright/test';
import { fixture } from './fixture';

// Deals page and badges (M15) against the Testoscop fixture: "Consola Testoscop Play 5" was observed
// at 2.000 lei for 41 days, then at 1.700 lei for the last 4 days (a verified −15% drop and a new
// all-time low); the TV has 2 days of history (no badge allowed).

test('/reduceri lists the verified drop with its reference, tabs and explanations', async ({ page }) => {
  const f = fixture();
  await page.goto('/reduceri');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reduceri verificate');
  const deal = page.getByTestId('deal').filter({ hasText: 'Testoscop Play 5' });
  await expect(deal).toBeVisible();
  await expect(deal.getByTestId('drop-badge')).toHaveText('−15% față de minimul din 30 de zile');
  await expect(deal.getByTestId('all-time-low-badge')).toHaveText('Minim istoric');
  await expect(deal).toContainText('1.700,00 lei');
  await expect(deal).toContainText('minim 30 de zile înainte: 2.000,00 lei');
  await expect(page.getByRole('link', { name: 'Cum verificăm reducerile' })).toHaveAttribute('href', '/metodologie#reduceri');
  await expect(page.getByText('Ce înseamnă etichetele')).toBeVisible();

  await page.getByRole('navigation', { name: 'Categorii' }).getByRole('link', { name: /Gaming/ }).click();
  await expect(page).toHaveURL(/\/reduceri\/gaming$/);
  await expect(page.getByTestId('deal').filter({ hasText: 'Testoscop Play 5' })).toBeVisible();
  await deal.getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/p/${f.search.deal.slug}$`));
});

async function checkFilters(page: Page) {
  await page.goto('/reduceri');
  const deal = page.getByTestId('deal').filter({ hasText: 'Testoscop Play 5' });
  const filters = page.getByTestId('deal-filters');
  await expect(deal).toBeVisible();
  await filters.getByText('30%').click();
  await expect(deal).toBeHidden();
  await filters.getByText('10%').click();
  await expect(deal).toBeVisible();
  await filters.getByText('Azi').click();
  await expect(deal).toBeHidden();
  await filters.getByText('Ultimele 7 zile').click();
  await filters.getByText('Doar minime istorice').click();
  await expect(deal).toBeVisible();
}

test('filters hide and show deals in place', async ({ page }) => {
  await checkFilters(page);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the same filters work (CSS only)', async ({ page }) => {
    await checkFilters(page);
  });
});

test('the product page explains the badge; a short history gets none', async ({ page }) => {
  const f = fixture();
  await page.goto(`/p/${f.search.deal.slug}`);
  const summary = page.getByTestId(test.info().project.name === 'mobile' ? 'summary-summary_mobile' : 'summary-summary');
  await expect(summary.getByTestId('drop-badge')).toHaveText('−15% față de minimul din 30 de zile');
  await expect(summary.getByTestId('all-time-low-badge')).toBeVisible();
  await expect(summary.getByTestId('drop-explanation')).toContainText('cu 15% sub cel mai mic preț observat de Pretoscop în cele 30 de zile dinaintea scăderii (2.000,00 lei');
  await page.goto(`/p/${f.search.tv.slug}`);
  await expect(page.getByTestId('drop-badge')).toHaveCount(0);
  await expect(page.getByTestId('all-time-low-badge')).toHaveCount(0);
});

test('listings show the badge and sort by the verified drop', async ({ page }) => {
  await page.goto('/cauta?q=testoscop+play');
  await expect(page.getByTestId('product-card').first().getByTestId('drop-badge')).toHaveText('−15% față de minimul din 30 de zile');
  await page.goto('/cauta?q=testoscop&marca=testoscop&ordine=reducere');
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByTestId('product-card')).toContainText('Testoscop Play 5');
});
