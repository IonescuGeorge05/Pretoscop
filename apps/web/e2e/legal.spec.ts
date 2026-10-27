import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

/**
 * M17: legal and trust pages, contact channel, consent preferences, bot identity.
 * Needs the dev services (Postgres, Mailpit on :8025) and a `next build` (see scripts/verify/M17.sh).
 */

const MAILPIT = 'http://localhost:8025/api/v1';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pretoscop:pretoscop@localhost:5432/pretoscop';

// pg is a dependency of @pretoscop/db, not of the web app: resolve it from there.
const requireFromDb = createRequire(new URL('../../../packages/db/package.json', import.meta.url));
interface PgClient {
  connect(): Promise<void>;
  query<R>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
  end(): Promise<void>;
}
const { Client } = requireFromDb('pg') as { Client: new (cfg: { connectionString: string }) => PgClient };

async function query<R>(sql: string, params: unknown[] = []): Promise<R[]> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<R>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

interface MailSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

async function mailpitSearch(text: string): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(text)}`);
  return ((await res.json()) as { messages: MailSummary[] }).messages;
}

const tokens: string[] = [];
const references: string[] = [];
/** Letters and digits only (Mailpit's search treats a leading "-" as negation). */
function uniqueToken(): string {
  const token = `etoet${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  tokens.push(token);
  return token;
}

/** Removes only what this file created: its contact_requests rows and its emails. */
test.afterAll(async () => {
  if (tokens.length > 0) await query(`DELETE FROM contact_requests WHERE message ~ $1`, [tokens.join('|')]);
  const ids = new Set<string>();
  for (const text of [...tokens, ...references.map((r) => `subject:${r}`)]) for (const m of await mailpitSearch(text)) ids.add(m.ID);
  if (ids.size) await fetch(`${MAILPIT}/messages`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ IDs: [...ids] }) });
});

/** The enhanced form sets `novalidate` once React has hydrated it. */
async function waitForEnhancedForm(page: Page) {
  await expect(page.locator('form[action="/api/contact"]')).toHaveAttribute('novalidate', '');
}

const PAGES = [
  ['/despre', 'Despre Pretoscop'],
  ['/cum-functioneaza', 'Cum funcționează clasamentul'],
  ['/cum-castigam-bani', 'Cum câștigăm bani'],
  ['/metodologie', 'Metodologie'],
  ['/bot', 'PretoscopBot'],
  ['/pentru-magazine', 'Pentru magazine'],
  ['/contact', 'Contact'],
  ['/termeni', 'Termeni și condiții'],
  ['/confidentialitate', 'Politica de confidențialitate'],
  ['/cookies', 'Cookie-uri și stocare pe dispozitiv'],
  ['/accesibilitate', 'Declarație de accesibilitate'],
] as const;
const LEGAL = new Set(['/termeni', '/confidentialitate', '/cookies', '/accesibilitate']);

test.describe('legal and trust pages', () => {
  for (const [path, h1] of PAGES) {
    test(`${path} renders in Romanian with its version line`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
      await expect(page).toHaveTitle(/Pretoscop/);
      await expect(page.getByTestId('doc-meta')).toHaveText(/^Ultima actualizare: \d{1,2} \p{L}+ \d{4}, versiunea \d+\.\d+$/u);
      await expect(page.getByTestId('provisional-note')).toHaveCount(LEGAL.has(path) ? 1 : 0);
      if (LEGAL.has(path)) await expect(page.getByTestId('provisional-note')).toContainText('Document provizoriu, în curs de revizuire juridică');
      // Comma-below diacritics only (ș ț), never the cedilla forms.
      expect(await page.locator('body').innerText()).not.toMatch(/[şţŞŢ]/);
    });
  }

  test('every footer link resolves', async ({ page, request }) => {
    await page.goto('/');
    const hrefs = await page.locator('footer a[href^="/"]').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
    for (const [path] of PAGES) expect(hrefs).toContain(path);
    for (const href of new Set(hrefs)) {
      const res = await request.get(href);
      expect(res.status(), href).toBe(200);
    }
  });

  test('the ranking page states the parameters and the live coverage', async ({ page }) => {
    await page.goto('/cum-functioneaza');
    await expect(page.getByRole('heading', { level: 2, name: 'Parametrii clasamentului, în ordinea importanței' })).toBeVisible();
    await expect(page.getByRole('table').first()).toContainText('Prețul total');
    await expect(page.getByTestId('coverage')).toContainText(/Acoperim în prezent \d+ (de )?magazin|Momentan nu avem prețuri verificate/);
    const [blocked] = await query<{ n: string }>(`SELECT count(*)::text AS n FROM shops WHERE status = 'blocked'`);
    if (Number(blocked?.n ?? 0) > 0) await expect(page.getByTestId('not-yet-included')).toContainText('Magazine neincluse încă:');
  });

  test('the methodology page discloses third-party collection with the agreed sentence', async ({ page }) => {
    await page.goto('/metodologie');
    await expect(page.getByText('Pentru unele magazine, prețurile pot fi colectate printr-un serviciu terț de colectare a datelor, cu aceleași reguli de politețe.')).toBeVisible();
    await expect(page.locator('a[href="/contact?subiect=price_error"]').first()).toBeVisible();
  });
});

test.describe('PretoscopBot identity', () => {
  test('/bot/ips.json is valid JSON with the User-Agent and IP lists', async ({ request }) => {
    const res = await request.get('/bot/ips.json');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');
    const body = JSON.parse(await res.text()) as { updated: string; user_agent: string; feed_user_agent: string; ipv4: unknown; ipv6: unknown };
    expect(body.user_agent).toMatch(/^Mozilla\/5\.0 \(compatible; PretoscopBot\/1\.0; \+https?:\/\/\S+\)$/);
    expect(body.feed_user_agent).toContain('PretoscopBot-Feed/1.0');
    expect(body.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(body.ipv4)).toBe(true);
    expect(Array.isArray(body.ipv6)).toBe(true);
  });

  test('/bot shows the User-Agent, the published IPs (or when they will be) and how to stop us', async ({ page, request }) => {
    const ips = (await (await request.get('/bot/ips.json')).json()) as { user_agent: string; ipv4: string[]; ipv6: string[] };
    await page.goto('/bot');
    await expect(page.getByText(ips.user_agent, { exact: true })).toBeVisible();
    const all = [...ips.ipv4, ...ips.ipv6];
    if (all.length === 0) await expect(page.getByTestId('bot-ips-pending')).toContainText('va fi publicată aici și în /bot/ips.json la lansare');
    for (const ip of all) await expect(page.getByText(ip, { exact: true })).toBeVisible();
    await expect(page.getByText('Această pagină descrie doar PretoscopBot.', { exact: false })).toBeVisible();
    await expect(page.locator('a[href="mailto:bot@pretoscop.ro"]').first()).toBeVisible();
  });
});

test.describe('consent', () => {
  async function stubPlausible(page: Page) {
    await page.route('https://plausible.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  }

  test('no third-party request before consent on the legal pages', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (url.startsWith('data:')) return;
      if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) external.push(url);
    });
    await stubPlausible(page);
    for (const path of ['/confidentialitate', '/cookies', '/termeni', '/contact', '/bot']) {
      await page.goto(path);
      await expect(page.getByTestId('consent-accept')).toBeVisible();
      await page.waitForLoadState('load');
    }
    await page.waitForTimeout(1000);
    expect(external).toEqual([]);
  });

  test('"Schimbă preferințele" re-opens the banner and records the text version', async ({ page }) => {
    await stubPlausible(page);
    await page.goto('/cookies');
    await expect(page.getByTestId('consent-current')).toContainText('încă nu ai ales');
    await page.getByTestId('consent-accept').click();
    await expect(page.getByTestId('consent-accept')).toBeHidden();
    await expect(page.getByTestId('consent-current')).toContainText('ai acceptat');

    await page.getByTestId('consent-reset').click();
    await expect(page.getByTestId('consent-accept')).toBeVisible();
    await expect(page.getByTestId('consent-current')).toContainText('încă nu ai ales');
    // Withdrawal leaves no analytics script running in the page.
    await expect(page.locator('script[data-pretoscop="plausible"]')).toHaveCount(0);

    await page.getByTestId('consent-reject').click();
    await expect(page.getByTestId('consent-accept')).toBeHidden();
    await expect(page.getByTestId('consent-current')).toContainText('ai refuzat');
    const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('pretoscop.consent'))) ?? '{}') as Record<string, string>;
    expect(stored).toMatchObject({ choice: 'rejected', version: 'analyticsConsent.v1' });
  });
});

test.describe('contact channel', () => {
  test('preselects ?subiect=, stores the request, emails the team and confirms receipt to the shop', async ({ page }) => {
    const token = uniqueToken();
    const email = `magazin.${token}@example.com`;
    await page.goto('/contact?subiect=shop_objection');
    await waitForEnhancedForm(page);
    await expect(page.getByLabel('Tipul solicitării')).toHaveValue('shop_objection');
    await page.getByLabel('Adresa de email').fill(email);
    await page.getByLabel('Mesajul').fill(`Vă rugăm să opriți colectarea prețurilor de pe site-ul nostru. ${token}`);
    await page.getByRole('button', { name: 'Trimite mesajul' }).click();

    const confirmation = page.getByTestId('contact-confirmation');
    await expect(confirmation).toContainText(/PS-\d{6}/);
    await expect(confirmation).toContainText('cel mult o zi lucrătoare');
    const reference = /PS-\d{6,}/.exec(await confirmation.innerText())?.[0] ?? '';
    references.push(reference);

    const rows = await query<{ kind: string; email: string; message: string; status: string; session_hash: string }>(
      `SELECT kind, email, message, status, session_hash FROM contact_requests WHERE id = $1`,
      [Number(reference.slice(3))],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'shop_objection', email, status: 'new' });
    expect(rows[0]?.message).toContain(token);
    expect(rows[0]?.session_hash).toMatch(/^[0-9a-f]{32}$/);

    await expect.poll(async () => (await mailpitSearch(`subject:${reference}`)).length, { timeout: 10_000 }).toBe(2);
    const mails = await mailpitSearch(`subject:${reference}`);
    const team = mails.find((m) => m.To.some((t) => t.Address === 'contact@pretoscop.ro'));
    const receipt = mails.find((m) => m.To.some((t) => t.Address === email));
    expect(team?.Subject).toBe(`[Contact · 1 zi lucrătoare] Magazin: cerere de oprire a colectării — ${reference}`);
    expect(receipt?.Subject).toBe(`Am primit solicitarea ta (${reference})`);
  });

  test('client-side validation names the missing fields', async ({ page }) => {
    await page.goto('/contact?subiect=privacy');
    await waitForEnhancedForm(page);
    await page.getByLabel('Mesajul').fill('scurt');
    await page.getByRole('button', { name: 'Trimite mesajul' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Verifică câmpurile' })).toBeVisible();
    await expect(page.getByText('Avem nevoie de adresa ta de email')).toBeVisible();
    await expect(page.getByText('Mesajul este prea scurt')).toBeVisible();
    await expect(page.getByLabel('Adresa de email')).toBeFocused();
  });

  test('the honeypot rejects bots: nothing stored, nothing sent', async ({ request }) => {
    const token = uniqueToken();
    const res = await request.post('/api/contact', { data: { kind: 'general', message: `Ofertă specială pentru tine ${token}`, website: 'https://spam.example' } });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'rejected' });
    expect(await query(`SELECT id FROM contact_requests WHERE message LIKE $1`, [`%${token}%`])).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 750));
    expect(await mailpitSearch(token)).toHaveLength(0);
  });

  test('the API refuses cross-site posts and limits a session to 5 requests per hour', async ({ request }) => {
    const valid = { kind: 'general', message: 'Un mesaj suficient de lung pentru validare.' };
    const cross = await request.post('/api/contact', { data: valid, headers: { 'sec-fetch-site': 'cross-site' } });
    expect(cross.status()).toBe(403);

    const ua = `e2e-rate-limit-${uniqueToken()}`;
    const post = (data: Record<string, unknown>) => request.post('/api/contact', { data, headers: { 'user-agent': ua } });
    const bad = await post({ kind: 'privacy', message: 'scurt' });
    expect(bad.status()).toBe(400);
    expect(Object.keys(((await bad.json()) as { errors: Record<string, string> }).errors).sort()).toEqual(['email', 'message']);
    for (let i = 0; i < 4; i++) expect((await post({ kind: 'necunoscut' })).status()).toBe(400);
    const limited = await post(valid);
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);
  });
});

test.describe('contact channel without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the plain HTML form still stores the request and shows the reference', async ({ page }) => {
    const token = uniqueToken();
    await page.goto('/contact?subiect=general');
    await page.getByLabel('Mesajul').fill(`Întrebare trimisă fără JavaScript. ${token}`);
    await page.getByRole('button', { name: 'Trimite mesajul' }).click();
    await expect(page).toHaveURL(/\/contact\?trimis=PS-\d{6,}&tip=general$/);
    await expect(page.getByTestId('contact-confirmation')).toContainText(/PS-\d{6}/);
    const rows = await query<{ kind: string }>(`SELECT kind FROM contact_requests WHERE message LIKE $1`, [`%${token}%`]);
    expect(rows).toEqual([{ kind: 'general' }]);
  });
});
