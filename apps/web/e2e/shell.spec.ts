import { expect, test } from '@playwright/test';

test('home renders in Romanian with search, footer and legal links', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Pretoscop/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Unde e cel mai ieftin');
  await expect(page.getByRole('search').first()).toBeVisible();
  for (const href of ['/cum-functioneaza', '/cum-castigam-bani', '/bot', '/termeni', '/confidentialitate', '/cookies']) {
    await expect(page.locator(`footer a[href="${href}"]`)).toHaveCount(1);
  }
  // Diacritics are comma-below (ș ț), never cedilla (ş ţ).
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/[şţŞŢ]/);
});

test('no third-party request before consent; reject keeps it that way', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (!['localhost', '127.0.0.1'].includes(host) && !r.url().startsWith('data:')) external.push(r.url());
  });
  await page.route('https://plausible.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto('/');
  await expect(page.getByTestId('consent-accept')).toBeVisible();
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  expect(external).toEqual([]);
  await page.getByTestId('consent-reject').click();
  await expect(page.getByTestId('consent-accept')).toBeHidden();
  await page.reload();
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('consent-accept')).toBeHidden();
  expect(external).toEqual([]);
});

test('accept loads Plausible only after the click', async ({ page }) => {
  const plausible: string[] = [];
  await page.route('https://plausible.test/**', (route) => {
    plausible.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
  });
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.waitForTimeout(1500);
  expect(plausible).toEqual([]);
  await page.getByTestId('consent-accept').click();
  await expect.poll(() => plausible.length).toBe(1);
});

test('404 page and event API limits', async ({ page, request }) => {
  const res = await page.goto('/nu-exista-pagina');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pagina nu există');
  const big = await request.post('/api/events', { data: 'x'.repeat(5000), headers: { 'content-type': 'application/json' } });
  expect(big.status()).toBe(413);
  const bad = await request.post('/api/events', { data: { name: 'Bad Name!' } });
  expect(bad.status()).toBe(400);
});
