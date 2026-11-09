import { expect, test, type Page } from '@playwright/test';
import { fixture } from './fixture';

// Category expansion (M29): the books and beauty subtrees render through M14's category pages and
// follow M16's index rules. Fixture (packages/db/src/fixtures/e2e.ts): "Harry Potter și piatra
// filozofală" with two live offers (Libris 39,99 lei, Elefant 41,40 lei: indexable) in "Cărți pentru
// copii", and "Harry Potter și camera secretelor" from one Libris offer (provisional) in
// "Beletristică". No beauty product exists: its pages show the empty state.
//
// SITE_INDEXABLE=false in the e2e build makes every page noindex, so the per-page index decision is
// observed through what M16 derives from it: a category page publishes a schema.org ItemList of its
// indexable products only (and the sitemap lists only categories that have one).

async function itemLists(page: Page): Promise<Array<{ itemListElement: Array<{ url: string }> }>> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks
    .map((b) => JSON.parse(b) as unknown)
    .flatMap((x) => (Array.isArray(x) ? x : [x]))
    .filter((x): x is { '@type': string; itemListElement: Array<{ url: string }> } => (x as { '@type'?: string })['@type'] === 'ItemList');
}

test('the books root lists its genres; only the genres with products link', async ({ page }) => {
  await page.goto('/c/carti');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cărți');
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('link', { name: /^Cărți pentru copii/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Beletristică/ })).toBeVisible();
  // A genre without products is shown as "coming soon", not as a link to an empty page.
  await expect(page.getByText('Biografii și memorii')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Biografii și memorii/ })).toHaveCount(0);
});

test('a genre with an indexable book: card, breadcrumbs, ItemList with the product', async ({ page }) => {
  const f = fixture();
  await page.goto('/c/carti/carti-pentru-copii');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cărți pentru copii');
  await expect(page.getByRole('navigation', { name: 'Navigare ierarhică' })).toContainText('Cărți');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/c\/carti\/carti-pentru-copii$/);
  const card = page.getByTestId('product-card').filter({ hasText: 'Harry Potter și piatra filozofală' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('39,99');
  const lists = await itemLists(page);
  expect(lists.flatMap((l) => l.itemListElement.map((i) => new URL(i.url).pathname))).toContain(`/p/${f.search.book.slug}`);
});

test('a genre whose only book is provisional (one offer): listed, but no ItemList (noindex rule)', async ({ page }) => {
  const f = fixture();
  await page.goto('/c/carti/beletristica');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beletristică');
  await expect(page.getByTestId('product-card').filter({ hasText: 'Harry Potter și camera secretelor' })).toBeVisible();
  const urls = (await itemLists(page)).flatMap((l) => l.itemListElement.map((i) => new URL(i.url).pathname));
  expect(urls).not.toContain(`/p/${f.search.bookSingle.slug}`);
});

test('beauty pages render with the empty state until a feed brings products', async ({ page }) => {
  for (const [path, name] of [
    ['/c/frumusete', 'Frumusețe și parfumuri'],
    ['/c/frumusete/parfumuri', 'Parfumuri'],
    ['/c/frumusete/ingrijire-ten', 'Îngrijirea tenului'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
    await expect(page.getByTestId('product-card')).toHaveCount(0);
    expect(await itemLists(page)).toEqual([]);
  }
  await expect(page.getByTestId('empty-category')).toBeVisible();
  // A short link to a genre redirects to its canonical path.
  const res = await page.request.get('/c/parfumuri', { maxRedirects: 0 });
  expect([301, 308]).toContain(res.status());
  expect(res.headers().location).toContain('/c/frumusete/parfumuri');
});

test('the category index lists the new roots; search finds a book without diacritics', async ({ page }) => {
  await page.goto('/categorii');
  await expect(page.getByRole('link', { name: /^Cărți/ }).first()).toBeVisible();
  await expect(page.getByText('Frumusețe și parfumuri').first()).toBeVisible();
  await page.goto('/cauta?q=harry+potter+piatra+filozofala');
  await expect(page.getByTestId('product-card').filter({ hasText: 'Harry Potter și piatra filozofală' })).toBeVisible();
});
