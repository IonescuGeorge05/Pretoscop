/**
 * PretoscopBot identity self-check (M21):
 *
 *   pnpm --filter @pretoscop/worker bot:check [--site https://pretoscop.ro] [--skip-dns]
 *
 * 1. reverse DNS of every BOT_EGRESS_IPS address is crawl-N.bot.pretoscop.ro and resolves back;
 * 2. <site>/bot/ips.json lists exactly those addresses;
 * 3. <site>/.well-known/http-message-signatures-directory is served without a redirect (verifiers
 *    never follow one), with a matching Content-Digest, a possession proof per key, and our key;
 * 4. when WEB_BOT_AUTH is on, prints the headers a signed request would carry (nothing is sent).
 * Only DNS and our own site are contacted, never a shop. Exit 0 when every check passes, 1 otherwise.
 */
import { promises as dns } from 'node:dns';
import { parseArgs } from 'node:util';
import { getEnv, loadRootEnvFile } from '@pretoscop/config/env';
import { signerFromEnv, WEB_BOT_AUTH_SPEC } from '@pretoscop/fetch';
import { checkDirectory, checkIpsJson, checkReverseDns, type Check } from '../ops/bot-identity';

loadRootEnvFile();
const env = getEnv();
const { values } = parseArgs({ options: { site: { type: 'string' }, 'skip-dns': { type: 'boolean', default: false } } });
const site = new URL(values.site ?? env.BOT_INFO_URL).origin;

async function fetchOwn(url: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  // redirect: 'manual': a verifier MUST NOT follow a redirect for the key directory (draft §5.5).
  const res = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text() };
}

const redirected = (name: string, r: { status: number; headers: Record<string, string> }): Check | null =>
  r.status >= 300 && r.status < 400 ? { name, ok: false, detail: `HTTP ${r.status} redirect to ${r.headers.location ?? '?'}: serve it at ${site} itself` } : null;

const checks: Check[] = [];
if (!values['skip-dns']) {
  const singles = env.BOT_EGRESS_IPS.filter((e) => !e.includes('/'));
  if (singles.length === 0) checks.push({ name: 'reverse DNS', ok: false, detail: 'BOT_EGRESS_IPS is empty (setup A4)' });
  for (const ip of singles) checks.push(await checkReverseDns(ip, dns));
}
try {
  const ips = await fetchOwn(`${site}/bot/ips.json`);
  checks.push(
    redirected('/bot/ips.json', ips) ??
      (ips.status === 200 ? checkIpsJson(JSON.parse(ips.body), env.BOT_EGRESS_IPS) : { name: '/bot/ips.json', ok: false, detail: `HTTP ${ips.status}` }),
  );
} catch (err) {
  checks.push({ name: '/bot/ips.json', ok: false, detail: (err as Error).message });
}
try {
  const dir = await fetchOwn(`${site}/.well-known/http-message-signatures-directory`);
  checks.push(
    redirected('/.well-known/http-message-signatures-directory', dir) ??
      checkDirectory({ siteOrigin: site, status: dir.status, headers: dir.headers, body: dir.body, privateKey: env.WEB_BOT_AUTH_PRIVATE_KEY }),
  );
} catch (err) {
  checks.push({ name: 'key directory', ok: false, detail: (err as Error).message });
}

for (const c of checks) process.stdout.write(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}: ${c.detail}\n`);
const signer = signerFromEnv({ WEB_BOT_AUTH: String(env.WEB_BOT_AUTH), WEB_BOT_AUTH_PRIVATE_KEY: env.WEB_BOT_AUTH_PRIVATE_KEY, BOT_INFO_URL: env.BOT_INFO_URL });
if (signer) {
  process.stdout.write(`\nA signed request to https://www.example-shop.ro/ would carry (${WEB_BOT_AUTH_SPEC}; not sent):\n`);
  for (const [k, v] of Object.entries(signer.sign(new URL('https://www.example-shop.ro/')))) process.stdout.write(`  ${k}: ${v}\n`);
} else {
  process.stdout.write('\nWEB_BOT_AUTH is off: crawler requests are not signed.\n');
}
process.exitCode = checks.every((c) => c.ok) ? 0 : 1;
