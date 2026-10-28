import { expect, test, type Page } from '@playwright/test';

// M05B: the assisted-access admin page (read-only checks; nothing is switched).
// Logs in through a magic link delivered to the shared Mailpit, without deleting anyone's mail:
// only a message created after our request is used.
const ADMIN = 'admin@pretoscop.test';
const MAILPIT = 'http://localhost:8025/api/v1';

async function linkSince(email: string, since: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = (await (await fetch(`${MAILPIT}/search?query=to:${encodeURIComponent(email)}`)).json()) as { messages: { ID: string; Created: string }[] };
    const fresh = list.messages.find((m) => Date.parse(m.Created) >= since - 1000);
    if (fresh) {
      const msg = (await (await fetch(`${MAILPIT}/message/${fresh.ID}`)).json()) as { Text: string };
      const link = /(https?:\/\/\S+magic-link\/verify\S+)/.exec(msg.Text)?.[1];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('no fresh magic link received');
}

async function login(page: Page) {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/autentificare/);
  await page.getByLabel('Email').fill(ADMIN);
  const since = Date.now();
  await page.getByRole('button', { name: 'Trimite linkul' }).click();
  await expect(page.getByText('Verifică emailul')).toBeVisible();
  await page.goto(await linkSince(ADMIN, since));
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('admin: assisted access', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('lists the designated shops with mode, legal basis, success and cost, and the cap', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'Acces asistat' }).click();
    await expect(page.getByRole('heading', { name: 'Acces asistat' })).toBeVisible();
    await expect(page.getByText('Plafon lunar')).toBeVisible();
    await expect(page.getByText('Magazine desemnate')).toBeVisible();
    for (const slug of ['altex', 'mediagalaxy', 'flanco', 'pcgarage', 'cel', 'evomag', 'vexio']) {
      await expect(page.getByTestId(`assisted-kill-${slug}`)).toBeVisible();
    }
    await expect(page.getByTestId('assisted-kill-emag')).toHaveCount(0);
    await expect(page.getByTestId('assisted-flag')).toBeVisible();
  });

  test('refuses visitors without a session', async ({ request }) => {
    const res = await request.get('/admin/acces-asistat', { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(res.status());
  });
});
