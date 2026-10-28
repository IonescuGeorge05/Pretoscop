import { expect, test } from '@playwright/test';
import { fixture, fixtureCli } from './fixture';

// Search, browse and shop pages (M14) against the e2e search index: the dev catalogue plus the
// Testoscop fixture (packages/db/src/fixtures/e2e.ts): an indexable TV (eMAG 2.999 lei, IT Galaxy
// 2.899 lei), a single-offer phone (999 lei) and a console with a verified drop (1.700 lei). The
// M13/M09 fixtures also have "Testoscop" in their titles (no brand), so exact counts use the brand.

test('header autocomplete suggests products, categories and brands; Enter searches', async ({ page }) => {
  const f = fixture();
  await page.goto('/');
  const box = page.getByRole('combobox').first();
  await box.fill('testoscop');
  const list = page.getByRole('listbox', { name: 'Sugestii' }).first();
  await expect(list).toBeVisible();
  await expect(list.getByRole('option').filter({ hasText: 'Testoscop Vision' })).toBeVisible();
  // The brand suggestion comes last, with its product count.
  await expect(list.getByRole('option').last()).toContainText('3 produse');
  await box.fill('testoscop vision');
  await expect(list.getByRole('option').first()).toContainText('Testoscop Vision');
  await expect(box).toHaveAttribute('aria-expanded', 'true');

  await box.press('Enter');
  await expect(page).toHaveURL(/\/cauta\?q=testoscop\+vision/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 produs pentru „testoscop vision”');
  const tv = page.getByTestId('product-card').filter({ hasText: 'Testoscop Vision' });
  await expect(tv).toContainText('de la');
  await expect(tv).toContainText('2.899,00 lei');
  await expect(tv).toContainText('la 2 magazine');
  // The header box shows the query on the results page.
  await expect(page.getByRole('combobox').first()).toHaveValue('testoscop vision');
  await tv.getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/p/${f.search.tv.slug}$`));
});

test('arrow keys pick a suggestion and Enter opens it', async ({ page }) => {
  const f = fixture();
  await page.goto('/');
  const box = page.getByRole('combobox').first();
  await box.fill('testoscop play');
  await expect(page.getByRole('listbox', { name: 'Sugestii' }).first().getByRole('option').first()).toContainText('Testoscop Play 5');
  await box.press('ArrowDown');
  await expect(box).toHaveAttribute('aria-activedescendant', /-list-0$/);
  await box.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/p/${f.search.deal.slug}$`));
});

test('suggestions are grouped and close when focus leaves the box', async ({ page }) => {
  await page.goto('/');
  const box = page.getByRole('combobox').first();
  await box.fill('testoscop');
  const list = page.getByRole('listbox', { name: 'Sugestii' }).first();
  await expect(list.getByRole('group', { name: 'Produse' })).toBeVisible();
  await expect(list.getByRole('group', { name: 'Mărci' }).getByRole('option')).toContainText('Testoscop');
  await box.press('Tab');
  await expect(list).toBeHidden();
  await expect(box).toHaveAttribute('aria-expanded', 'false');
});

test('search → product → click-out logs a click', async ({ page, request }) => {
  test.skip(test.info().project.name !== 'desktop', 'one click-out is enough');
  const f = fixture();
  await page.goto('/cauta?q=testoscop+vision');
  await page.getByTestId('product-card').first().getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/p/${f.search.tv.slug}$`));
  const href = await page.getByTestId('offer').first().getByRole('link', { name: /Vezi oferta/ }).getAttribute('href');
  expect(href).toMatch(/^\/out\/\d+\?p=offers_table$/);
  const res = await request.get(href!, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe('https://example.com/e2e/tv-itgalaxy');
  const clicks = fixtureCli('clicks') as Array<{ offerId: number; placement: string | null }>;
  expect(clicks.at(-1)?.placement).toBe('offers_table');
});

test('facets filter by category, brand, stock and price; typos and diacritics do not matter', async ({ page }) => {
  await page.goto('/cauta?q=testoscop');
  const desktop = test.info().project.name === 'desktop';
  const facets = desktop ? page.getByRole('complementary', { name: 'Filtre' }) : page.locator('details').filter({ hasText: 'Filtre' }).first();
  if (!desktop) await facets.locator('summary').click();
  await facets.getByRole('link', { name: /Televizoare/ }).click();
  await expect(page).toHaveURL(/categorie=televizoare/);
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'Filtre active' })).toContainText('Televizoare');

  await page.goto('/cauta?q=testoscop&marca=testoscop&pret_max=1.000');
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByTestId('product-card')).toContainText('Testoscop Y5');

  await page.goto('/cauta?q=testoscp+vision');
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByTestId('product-card')).toContainText('Testoscop Vision');
  await page.goto(`/cauta?q=${encodeURIComponent('consolă testoscop')}`);
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByTestId('product-card')).toContainText('Testoscop Play 5');
});

test('no result, empty query and noindex', async ({ page }) => {
  await page.goto('/cauta?q=tigaie');
  await expect(page.getByTestId('no-results')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.goto('/cauta');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ce cauți?');
  await expect(page.getByRole('link', { name: /TV și audio/ })).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the search form, results and brand page are plain HTML', async ({ page }) => {
    await page.goto('/');
    const form = page.getByRole('search').first();
    await form.getByRole('combobox').fill('testoscop');
    await form.getByRole('button').click();
    await expect(page).toHaveURL(/\/cauta\?q=testoscop/);
    await expect(page.getByTestId('product-card').filter({ hasText: 'Testoscop Vision' })).toHaveCount(1);
    await page.goto('/b/testoscop');
    await expect(page.getByTestId('product-card')).toHaveCount(3);
  });
});

test('category pages: canonical path, breadcrumbs, brand chips, empty categories', async ({ page, request }) => {
  const res = await request.get('/c/televizoare', { maxRedirects: 0 });
  expect([301, 308]).toContain(res.status());
  expect(res.headers().location).toContain('/c/tv-audio/televizoare');
  // Page 0 and page 1 are the canonical first page.
  for (const n of [0, 1]) {
    const r = await request.get(`/c/tv-audio/televizoare/${n}`, { maxRedirects: 0 });
    expect([301, 308]).toContain(r.status());
    expect(r.headers().location).toMatch(/\/c\/tv-audio\/televizoare$/);
    const b = await request.get(`/b/testoscop/${n}`, { maxRedirects: 0 });
    expect([301, 308]).toContain(b.status());
    expect(b.headers().location).toMatch(/\/b\/testoscop$/);
  }

  await page.goto('/c/tv-audio/televizoare');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Televizoare');
  await expect(page.getByRole('navigation', { name: 'Navigare ierarhică' })).toContainText('TV și audio');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/c\/tv-audio\/televizoare$/);
  await expect(page.getByTestId('product-card').first()).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(JSON.parse(ld!)).toContainEqual(expect.objectContaining({ '@type': 'BreadcrumbList' }));
  await page.getByText('Toate mărcile').click();
  await page.getByRole('link', { name: /^Testoscop/ }).click();
  await expect(page).toHaveURL(/\/b\/testoscop\/televizoare$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Televizoare Testoscop');
  await expect(page.getByTestId('product-card')).toHaveCount(1);

  // An empty category says so instead of showing a blank grid (the fixture picks one that has no
  // product in the database, whatever the recorder has collected by now).
  const empty = fixture().search.emptyCategory;
  if (empty) {
    await page.goto(`/c/${empty.path}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(empty.name);
    await expect(page.getByTestId('empty-category')).toBeVisible();
    await expect(page.getByTestId('product-card')).toHaveCount(0);
  } else {
    test.info().annotations.push({ type: 'note', description: 'every subcategory has products: empty-category state not exercised' });
  }
  expect((await request.get('/c/tv-audio/nu-exista')).status()).toBe(404);
  expect((await request.get('/b/testoscop/frigidere')).status()).toBe(404);

  await page.goto('/categorii');
  await expect(page.getByRole('link', { name: 'Televizoare' })).toBeVisible();
});

test('brand page lists the brand by category', async ({ page }) => {
  await page.goto('/b/testoscop');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Testoscop');
  await expect(page.getByTestId('product-card')).toHaveCount(3);
  for (const c of ['Televizoare', 'Telefoane mobile', 'Console']) await expect(page.getByRole('link', { name: new RegExp(`^${c}`) })).toBeVisible();
});

test('shop pages state coverage and freshness honestly', async ({ page }) => {
  await page.goto('/magazin/itgalaxy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('IT Galaxy');
  await expect(page.getByText('Inclus în comparație')).toBeVisible();
  await expect(page.getByTestId('shop-facts')).toContainText('Oferte urmărite');
  await expect(page.getByText(/PretoscopBot, robotul nostru identificat/)).toBeVisible();
  // The shop's products (most popular first: the fixture TV is rarely on page 1 of a real shop), and
  // the shop filter they come from: the fixture TV is sold at IT Galaxy, the phone and console are not.
  await expect(page.getByRole('heading', { name: /Produse IT Galaxy pe care le urmărim/ })).toBeVisible();
  await expect(page.getByTestId('product-card').first()).toBeVisible();
  await page.goto('/cauta?q=testoscop&magazin=itgalaxy&marca=testoscop');
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByTestId('product-card')).toContainText('Testoscop Vision');

  await page.goto('/magazin/altex');
  await expect(page.getByText('Neinclus încă')).toBeVisible();
  await expect(page.getByText(/Nu colectăm încă prețuri de la Altex/)).toBeVisible();

  await page.goto('/magazine');
  await expect(page.getByTestId('shops-covered')).toContainText('IT Galaxy');
  await expect(page.getByTestId('shops-not-yet')).toContainText('Altex');
});

test('suggest API: shape, short public caching, empty for one letter', async ({ request }) => {
  test.skip(test.info().project.name !== 'desktop', 'API test');
  const res = await request.get('/api/suggest?q=testo');
  expect(res.ok()).toBe(true);
  expect(res.headers()['cache-control']).toContain('public');
  const body = (await res.json()) as { products: Array<{ title: string; price: string | null }>; brands: Array<{ name: string; href: string }> };
  expect(body.products.map((p) => p.title)).toEqual(expect.arrayContaining([expect.stringContaining('Testoscop Vision')]));
  expect(body.brands).toContainEqual(expect.objectContaining({ name: 'Testoscop', href: '/b/testoscop' }));
  expect(((await (await request.get('/api/suggest?q=t')).json()) as { products: unknown[] }).products).toEqual([]);
});
