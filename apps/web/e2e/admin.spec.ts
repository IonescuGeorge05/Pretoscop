import { expect, test, type Page } from '@playwright/test';
import { fixture } from './fixture';

// Admin login through a real magic link delivered to Mailpit (http://localhost:8025).
const ADMIN = 'admin@pretoscop.test';
const MAILPIT = 'http://localhost:8025/api/v1';

// Mailpit is shared with other test runs: pick the newest message sent to us after `since`
// instead of deleting everyone's mail.
async function latestLink(email: string, since: number): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const list = (await (await fetch(`${MAILPIT}/search?query=to:${encodeURIComponent(email)}`)).json()) as { messages: { ID: string; Created: string }[] };
    const id = list.messages.find((m) => Date.parse(m.Created) >= since - 2000)?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/message/${id}`)).json()) as { Text: string };
      const link = /(https?:\/\/\S+magic-link\/verify\S+)/.exec(msg.Text)?.[1];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no magic link received');
}

async function login(page: Page) {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/autentificare/);
  await page.getByLabel('Email').fill(ADMIN);
  const since = Date.now();
  await page.getByRole('button', { name: 'Trimite linkul' }).click();
  await expect(page.getByText('Verifică emailul')).toBeVisible();
  await page.goto(await latestLink(ADMIN, since));
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('admin', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('magic-link login, kill switch and flag toggles are audited', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'Panou' })).toBeVisible();

    await page.goto('/admin/surse');
    const kill = page.getByTestId('kill-dedeman:sitemap:produse');
    const before = (await kill.textContent())?.trim();
    await kill.click();
    await expect(page.getByTestId('kill-dedeman:sitemap:produse')).not.toHaveText(before ?? '');
    await page.getByTestId('kill-dedeman:sitemap:produse').click(); // restore
    await expect(page.getByTestId('kill-dedeman:sitemap:produse')).toHaveText(before ?? '');

    await page.goto('/admin/flaguri');
    const flag = page.getByTestId('flag-promoted.enabled');
    await flag.click();
    await page.getByTestId('flag-promoted.enabled').click(); // restore (off)
    await expect(page.getByTestId('flag-promoted.enabled')).toHaveText('Pornește');

    await page.goto('/admin/audit');
    await expect(page.getByText('source.kill').first()).toBeVisible();
    await expect(page.getByText('flag.set').first()).toBeVisible();
  });

  test('review queue: accepting a candidate links the offer and is audited', async ({ page }) => {
    const f = fixture().admin;
    await login(page);
    // The live queue can be long: filter to the fixture's item.
    await page.goto(`/admin/potriviri?q=${encodeURIComponent('Testoscop Y2')}`);
    const item = page.getByTestId('review-item').filter({ hasText: f.reviewTitle });
    await expect(item).toHaveCount(1);
    await item.getByRole('button', { name: /^Acceptă \(1\)$/ }).click();
    await expect(page.getByTestId('review-item').filter({ hasText: f.reviewTitle })).toHaveCount(0);
    await page.goto(`/admin/produse/${f.dupA}`);
    await expect(page.getByText(f.reviewTitle)).toBeVisible();
    await page.goto('/admin/audit');
    await expect(page.getByText('review.accept').first()).toBeVisible();
  });

  test('merge two products (old URL redirects), then undo', async ({ page, request }) => {
    const f = fixture().admin;
    await login(page);
    await page.goto(`/admin/produse/${f.dupB}`);
    await page.getByTestId('merge-into').fill(String(f.dupA));
    await page.getByRole('button', { name: 'Îmbină', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/produse/${f.dupA}$`));
    await expect(page.getByText('Smartphone Testoscop Y2 256 GB albastru')).toBeVisible();
    const old = await request.get(`/p/${f.dupBSlug}`, { maxRedirects: 0 });
    expect([301, 308]).toContain(old.status());
    expect(old.headers().location).toMatch(new RegExp(`-${f.dupA}$`));

    await page.goto(`/admin/produse/${f.dupB}`);
    await expect(page.getByTestId('product-status')).toHaveText('merged');
    await page.getByRole('button', { name: 'Anulează îmbinarea' }).click();
    await expect(page.getByTestId('product-status')).toHaveText('active');
    await page.goto('/admin/audit');
    await expect(page.getByText('product.merge').first()).toBeVisible();
    await expect(page.getByText('product.unmerge').first()).toBeVisible();
  });

  test('admin pages refuse visitors without a session', async ({ request }) => {
    const res = await request.get('/admin/surse', { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(res.status());
  });
});
