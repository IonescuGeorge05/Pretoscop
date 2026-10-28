import { expect, test, type APIRequestContext } from '@playwright/test';
import { fixture, fixtureCli, revalidateToken } from './fixture';

// M24: the product page labels and the click-out use affiliate links only while the shop's program
// is approved and allows comparators; a sync that marks the program forbidden makes both plain.
async function revalidate(request: APIRequestContext, productId: number) {
  const res = await request.post('/api/revalidate', { headers: { authorization: `Bearer ${revalidateToken()}` }, data: { tags: [`product:${productId}`] } });
  expect(res.ok()).toBe(true);
}

test('allowed program: labelled affiliate link with our click id; forbidden after sync: plain link', async ({ page, request }) => {
  test.skip(test.info().project.name !== 'desktop', 'one run is enough');
  test.setTimeout(180_000); // three fixture CLI runs and two cache refreshes
  const f = fixture();
  const forit = f.offers.forit!;
  const { flagWas } = fixtureCli('affiliate-allow') as { flagWas: boolean };
  try {
    await revalidate(request, f.productId);
    await page.goto(`/p/${f.slug}`);
    const card = page.getByTestId('offer').filter({ hasText: 'Vândut de forit' });
    await expect(card).toContainText('Link afiliat');
    await expect(card.getByRole('link', { name: /Vezi oferta/ })).toHaveAttribute('rel', /sponsored/);
    const out = await request.get(`/out/${forit.offerId}?p=offers_table`, { maxRedirects: 0 });
    expect(out.status()).toBe(302);
    expect(out.headers().location).toMatch(
      /^https:\/\/event\.2performant\.com\/events\/click\?ad_type=quicklink&aff_code=e2e-aff&unique=e2e-unique&redirect_to=https%3A%2F%2Fwww\.forit\.ro%2Fe2e-fixture%2Fforit&st=c\d+$/,
    );
    // eMAG never gets an affiliate link (ADR-013), whatever its program says.
    const emag = await request.get(`/out/${f.offers.emag!.offerId}?p=offers_table`, { maxRedirects: 0 });
    expect(emag.headers().location).toBe('https://www.emag.ro/e2e-fixture/emag');

    expect((fixtureCli('affiliate-sync-forbidden') as { changes: number }).changes).toBe(1);
    await revalidate(request, f.productId);
    await page.reload();
    await expect(page.getByTestId('offer').filter({ hasText: 'Vândut de forit' })).not.toContainText('Link afiliat');
    const plain = await request.get(`/out/${forit.offerId}?p=offers_table`, { maxRedirects: 0 });
    expect(plain.headers().location).toBe('https://www.forit.ro/e2e-fixture/forit');
  } finally {
    fixtureCli('affiliate-restore', String(flagWas));
    await revalidate(request, f.productId);
  }
});
