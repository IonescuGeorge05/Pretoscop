import { expect, test, type Page } from '@playwright/test';
import { mailsTo } from './mailpit';

// M05B: the assisted-access admin page. Logs in through a magic link delivered to the shared Mailpit,
// without deleting anyone's mail: only a message created after our request, whose link points at
// this server (other checkouts run e2e on other ports with the same admin address), is used.
const ADMIN = 'admin@pretoscop.test';
const MAILPIT = process.env.MAILPIT_API ?? 'http://localhost:8025/api/v1';

async function linkSince(email: string, since: number, baseURL: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    for (const m of await mailsTo(email, since)) {
      const msg = (await (await fetch(`${MAILPIT}/message/${m.ID}`)).json()) as { Text: string };
      const link = /(https?:\/\/\S+magic-link\/verify\S+)/.exec(msg.Text)?.[1];
      if (link?.startsWith(`${baseURL}/`)) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no fresh magic link for ${baseURL} received`);
}

async function login(page: Page, baseURL: string) {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/autentificare/);
  await page.getByLabel('Email').fill(ADMIN);
  const since = Date.now();
  await page.getByRole('button', { name: 'Trimite linkul' }).click();
  await expect(page.getByText('Verifică emailul')).toBeVisible();
  await page.goto(await linkSince(ADMIN, since, baseURL));
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('admin: assisted access', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('lists the designated shops (never eMAG) with mode, legal basis, success and cost, and the cap; a shop stop is audited', async ({ page, baseURL }) => {
    await login(page, baseURL!);
    await page.getByRole('link', { name: 'Acces asistat' }).click();
    await expect(page.getByRole('heading', { name: 'Acces asistat' })).toBeVisible();
    await expect(page.getByText('Plafon lunar', { exact: true })).toBeVisible();
    await expect(page.getByText('Magazine desemnate', { exact: true })).toBeVisible();
    for (const slug of ['altex', 'mediagalaxy', 'flanco', 'pcgarage', 'cel', 'evomag', 'vexio']) {
      await expect(page.getByTestId(`assisted-kill-${slug}`)).toBeVisible();
    }
    await expect(page.getByTestId('assisted-kill-emag')).toHaveCount(0);
    await expect(page.getByTestId('assisted-flag')).toHaveText('Pornește canalul asistat');

    // Vexio has no source in the registry yet: stopping it changes nothing but must leave an audit row.
    await page.getByTestId('assisted-kill-vexio').click();
    await expect(page.getByTestId('assisted-event').first()).toContainText('shop.kill_all');
    await expect(page.getByTestId('assisted-event').first()).toContainText('vexio');
    await page.getByTestId('assisted-unkill-vexio').click();
    await expect(page.getByTestId('assisted-event').first()).toContainText('shop.unkill_all');
  });

  test('refuses visitors without a session', async ({ request }) => {
    const res = await request.get('/admin/acces-asistat', { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(res.status());
  });
});
