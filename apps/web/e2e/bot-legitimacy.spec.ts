import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { DIRECTORY_MEDIA_TYPE, jwkThumbprint, verifyDirectoryResponse, type DirectoryJwk } from '@pretoscop/fetch/signing';
import { expect, test, type Page } from '@playwright/test';

/**
 * M21: the key directory (signed), the final /bot page, ips.json in googlebot.json format and the
 * outreach tracker. scripts/verify/M21.sh starts the server with the public RFC 9421 test key,
 * BOT_INFO_URL on the e2e port and a documentation IP in BOT_EGRESS_IPS.
 */

const MAILPIT = 'http://localhost:8025/api/v1';
const ADMIN = 'admin@pretoscop.test';
/** The database the web server under test uses: the environment, else the repo's .env (as `getEnv` reads it). */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(new URL('../../../.env', import.meta.url), 'utf8');
    const fromFile = /^DATABASE_URL=(.+)$/m.exec(env)?.[1]?.trim();
    if (fromFile) return fromFile;
  } catch {
    // no .env: the dev default below
  }
  return 'postgres://pretoscop:pretoscop@localhost:5432/pretoscop';
}
const DATABASE_URL = databaseUrl();
const ui = expect.configure({ timeout: 20_000 });
/** Throwaway shop of the outreach test; `dropE2eFixture` removes leftovers (`e2e-fixture-` slugs). */
const OUTREACH_SHOP = 'e2e-fixture-outreach';

const requireFromDb = createRequire(new URL('../../../packages/db/package.json', import.meta.url));
interface PgClient {
  connect(): Promise<void>;
  query<R>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
  end(): Promise<void>;
}
const { Client } = requireFromDb('pg') as { Client: new (cfg: { connectionString: string }) => PgClient };
async function query<R>(sql: string, params: unknown[] = []): Promise<R[]> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return (await c.query<R>(sql, params)).rows;
  } finally {
    await c.end();
  }
}

async function magicLink(email: string, since: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = (await (await fetch(`${MAILPIT}/search?query=to:${encodeURIComponent(email)}`)).json()) as { messages: { ID: string; Created: string }[] };
    const id = list.messages.find((m) => Date.parse(m.Created) >= since - 2000)?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/message/${id}`)).json()) as { Text: string };
      const link = /(https?:\/\/\S+magic-link\/verify\S+)/.exec(msg.Text)?.[1];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no magic link for ${email}`);
}

async function login(page: Page): Promise<void> {
  await page.goto('/admin');
  await page.getByLabel('Email').fill(ADMIN);
  const since = Date.now();
  await page.getByRole('button', { name: 'Trimite linkul' }).click();
  await ui(page.getByText('Verifică emailul')).toBeVisible();
  await page.goto(await magicLink(ADMIN, since));
  await ui(page).toHaveURL(/\/admin$/);
}

test.describe('bot legitimacy', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');
  test.describe.configure({ mode: 'serial' });

  test('the key directory publishes only the public key, with a digest and a possession proof that verify', async ({ request, baseURL }) => {
    const res = await request.get('/.well-known/http-message-signatures-directory', { maxRedirects: 0 });
    test.skip(res.status() === 404, 'no WEB_BOT_AUTH_PRIVATE_KEY on this server');
    expect(res.status()).toBe(200);
    const headers = res.headers();
    expect(headers['content-type']).toBe(DIRECTORY_MEDIA_TYPE);
    const text = await res.text();
    const body = JSON.parse(text) as { keys: DirectoryJwk[] };
    expect(body.keys).toHaveLength(1);
    expect(Object.keys(body.keys[0]!).sort()).toEqual(['crv', 'kid', 'kty', 'use', 'x']);
    expect(body.keys[0]!.kid).toBe(jwkThumbprint(body.keys[0]!));
    const url = `${baseURL}/.well-known/http-message-signatures-directory`;
    expect(verifyDirectoryResponse({ requestUrl: url, headers, body: text })).toEqual({ ok: true, keyids: [body.keys[0]!.kid] });
  });

  test('/bot/ips.json carries the googlebot.json prefixes next to the first-version fields', async ({ request }) => {
    const body = (await (await request.get('/bot/ips.json')).json()) as { creationTime: string; prefixes: Array<Record<string, string>>; ipv4: string[]; ipv6: string[] };
    expect(body.creationTime).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000000Z$/);
    expect(body.prefixes).toHaveLength(body.ipv4.length + body.ipv6.length);
    for (const ip of body.ipv4) expect(body.prefixes).toContainEqual({ ipv4Prefix: ip.includes('/') ? ip : `${ip}/32` });
  });

  test('/bot explains the three ways to verify us and the anti-bot services', async ({ page, request }) => {
    const directory = await request.get('/.well-known/http-message-signatures-directory');
    await page.goto('/bot');
    await expect(page.getByRole('heading', { name: 'Cum verifici că o cerere vine de la noi' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '2. Reverse DNS' })).toBeVisible();
    await expect(page.getByText('crawl-N.bot.pretoscop.ro', { exact: true }).first()).toBeVisible();
    const status = page.getByTestId('web-bot-auth-status');
    await expect(status).toContainText('RFC 9421');
    if (directory.status() === 200) {
      await expect(status).toContainText('Cheia publică este deja publicată');
      await expect(page.getByTestId('web-bot-auth-directory')).toHaveAttribute('href', /\/\.well-known\/http-message-signatures-directory$/);
    }
    await expect(page.getByTestId('bot-program-cloudflare')).toHaveText('cerere în pregătire');
    await expect(page.getByRole('link', { name: 'contul de magazin' })).toHaveAttribute('href', '/pentru-magazine/cont');
  });

  test('the outreach tracker keeps business contacts only, audits without them, and erases on request', async ({ page }) => {
    test.setTimeout(120_000);
    // A throwaway shop (paused, no sources: never crawled), so real outreach entries are never touched.
    await query(`DELETE FROM shops WHERE slug = $1`, [OUTREACH_SHOP]);
    const [shop] = await query<{ id: string; name: string }>(
      `INSERT INTO shops (slug, name, domain, website_url, status, access_mode) VALUES ($1, $2, 'e2e-fixture-outreach.test', 'https://www.e2e-fixture-outreach.test', 'paused', 'off') RETURNING id::text, name`,
      [OUTREACH_SHOP, 'Magazin contactări (produs de test E2E)'],
    );
    try {
      await login(page);
      await page.goto('/admin/contactari');
      const before = Number(await page.getByTestId('outreach-contacted').innerText());
      const form = page.getByTestId('outreach-form');
      const fill = async (contact: string) => {
        await form.getByLabel('Magazin').selectOption({ value: shop!.id });
        await form.getByLabel('Scop').selectOption('feed_or_allowlist');
        await form.getByLabel('Canal').selectOption('email');
        await form.getByLabel('Șablon').selectOption('feed-listing-v1');
        await form.getByLabel('Contact (adresă de rol, formular, centrală)').fill(contact);
        await form.getByRole('button', { name: 'Adaugă' }).click();
      };

      // A private mailbox is refused, nothing stored.
      await fill('ion.popescu@gmail.com');
      await ui(page.getByRole('alert')).toContainText('Nu păstrăm adrese personale');
      expect(await query(`SELECT 1 FROM outreach WHERE shop_id = $1`, [shop!.id])).toHaveLength(0);

      await fill('marketing@e2e-fixture-outreach.test');
      await ui(page.getByRole('status')).toHaveText('Contactarea a fost adăugată.');
      await expect(page.getByTestId('outreach-contacted')).toHaveText(String(before + 1));

      const [row] = await query<{ id: string }>(`SELECT id::text FROM outreach WHERE shop_id = $1`, [shop!.id]);
      const tr = page.getByTestId(`outreach-row-${row!.id}`);
      await tr.getByLabel(`Stare pentru ${shop!.name}`).selectOption('replied');
      await tr.getByLabel(`Răspuns de la ${shop!.name}`).fill('Revin după ce discută cu echipa tehnică.');
      await tr.getByRole('button', { name: 'Salvează' }).click();
      await ui(page.getByRole('status')).toHaveText('Contactarea a fost actualizată.');
      await expect(page.getByTestId(`outreach-row-${row!.id}`)).toContainText('Au răspuns');

      await page.getByTestId(`outreach-row-${row!.id}`).getByLabel(`Confirm ștergerea contactării pentru ${shop!.name}`).check();
      await page.getByTestId(`outreach-row-${row!.id}`).getByRole('button', { name: 'Șterge' }).click();
      await ui(page.getByRole('status')).toHaveText('Contactarea a fost ștearsă.');
      await expect(page.getByTestId(`outreach-row-${row!.id}`)).toHaveCount(0);
      expect(await query(`SELECT 1 FROM outreach WHERE shop_id = $1`, [shop!.id])).toHaveLength(0);

      const audit = await query<{ action: string; data: string }>(
        `SELECT action, coalesce(before::text, '') || coalesce(after::text, '') AS data FROM audit_log WHERE entity = 'outreach' AND entity_id = $1 ORDER BY id`,
        [row!.id],
      );
      expect(audit.map((a) => a.action)).toEqual(['outreach.create', 'outreach.update', 'outreach.delete']);
      for (const a of audit) {
        expect(a.data).not.toContain('marketing@');
        expect(a.data).not.toContain('echipa tehnică');
      }
    } finally {
      await query(`DELETE FROM shops WHERE slug = $1`, [OUTREACH_SHOP]);
    }
  });
});
