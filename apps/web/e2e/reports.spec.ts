import { expect, test } from '@playwright/test';

// M23 public report pages: only approved reports are published; planned ones show a placeholder.
test('reports index lists the planned Black Friday report with its method', async ({ page }) => {
  await page.goto('/rapoarte');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rapoarte');
  await page.getByRole('link', { name: /Black Friday 2026/ }).click();
  await expect(page).toHaveURL(/\/rapoarte\/black-friday-2026$/);
  await expect(page.getByText('Nu publicăm cifre înainte să le verificăm.')).toBeVisible();
  await page.getByRole('link', { name: 'Cum calculăm' }).click();
  await expect(page).toHaveURL(/\/metodologie#rapoarte$/);
  await expect(page.locator('#rapoarte')).toContainText('Prețul unei zile');
});

test('unknown reports and data files are 404', async ({ request }) => {
  expect((await request.get('/rapoarte/nu-exista')).status()).toBe(404);
  expect((await request.get('/rapoarte/black-friday-2026/date/oferte.csv')).status()).toBe(404);
});
