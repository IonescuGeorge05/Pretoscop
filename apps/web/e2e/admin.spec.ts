import { expect, test, type Page } from '@playwright/test';

// Admin login through a real magic link delivered to Mailpit (http://localhost:8025).
const ADMIN = 'admin@pretoscop.test';
const MAILPIT = 'http://localhost:8025/api/v1';

async function latestLink(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const list = (await (await fetch(`${MAILPIT}/search?query=to:${encodeURIComponent(email)}`)).json()) as { messages: { ID: string }[] };
    const id = list.messages[0]?.ID;
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
  await fetch(`${MAILPIT}/messages`, { method: 'DELETE' });
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/autentificare/);
  await page.getByLabel('Email').fill(ADMIN);
  await page.getByRole('button', { name: 'Trimite linkul' }).click();
  await expect(page.getByText('Verifică emailul')).toBeVisible();
  await page.goto(await latestLink(ADMIN));
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

  test('admin pages refuse visitors without a session', async ({ request }) => {
    const res = await request.get('/admin/surse', { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(res.status());
  });
});
