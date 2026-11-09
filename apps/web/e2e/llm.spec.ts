import { expect, test, type Page } from '@playwright/test';
import { fixture, fixtureCli } from './fixture';
import { mailsTo } from './mailpit';

// M22: LLM spend on the dashboard, LLM decisions on /admin/potriviri and their undo back to the
// human review queue. The LLM decision comes from a fixture (no API key exists): a review item of
// the shared admin fixture's product, accepted the way `llm.match` accepts, with one billed ledger
// row; `drop` in global teardown removes all of it (offers by prefix, ledger rows by subject).
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

test.describe('admin: LLM matching', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('shows the month spend, the LLM decision with its opinion, and sends it back to a human', async ({ page, baseURL }) => {
    const llm = fixtureCli('llm-decision', String(fixture().admin.dupA)) as { offerId: number; title: string };
    await login(page, baseURL!);

    const stat = page.getByTestId('stat-llm');
    await expect(stat).toContainText('LLM (luna)');
    await expect(stat).toContainText(/\d+,\d{2} € \/ \d+ €/);
    await expect(stat).toContainText('acceptate');

    await page.goto('/admin/potriviri');
    await expect(page.getByTestId('llm-spend-line')).toContainText('LLM luna aceasta');
    const row = page.getByTestId('llm-decision-row').filter({ hasText: llm.title });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('acceptată →');
    await expect(row).toContainText('claude-haiku-5-5 · 0.95');
    await expect(row.getByRole('button', { name: 'Corect' })).toBeVisible();

    await row.getByRole('button', { name: 'Înapoi la verificare' }).click();
    await expect(page.getByTestId('llm-decision-row').filter({ hasText: llm.title })).toContainText('înlocuită (pending)');

    // Back in the human queue, with the LLM's opinion next to the candidate.
    await page.goto(`/admin/potriviri?q=${encodeURIComponent('verificat LLM')}`);
    const item = page.getByTestId('review-item').filter({ hasText: llm.title });
    await expect(item).toHaveCount(1);
    await expect(item.getByTestId('review-llm-opinion')).toContainText('LLM (haiku-5-5): același produs 0.95');

    await page.goto('/admin/audit');
    await expect(page.getByText('llm.revert').first()).toBeVisible();
  });
});
