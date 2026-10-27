import { resolveTxt } from 'node:dns/promises';
import { type MerchantDomainCheck, merchants } from '@pretoscop/db';
import { eq } from 'drizzle-orm';
import type { MerchantCheckDeps } from './validate';

/** TXT record value (on the shop's domain) and file content that prove control of the domain. */
export function verificationValue(token: string): string {
  return `pretoscop-verificare=${token}`;
}

/** Path of the verification file, on the shop's domain or its www host. */
export const VERIFICATION_FILE_PATH = '/.well-known/pretoscop-verificare.txt';

export type TxtResolver = (domain: string) => Promise<string[][]>;

async function dnsHasToken(resolver: TxtResolver, domain: string, token: string): Promise<'found' | 'missing' | 'error'> {
  try {
    const records = await resolver(domain);
    return records.some((chunks) => chunks.join('').trim() === verificationValue(token)) ? 'found' : 'missing';
  } catch (err) {
    const code = (err as { code?: string }).code;
    return code === 'ENODATA' || code === 'ENOTFOUND' ? 'missing' : 'error';
  }
}

async function fileHasToken(deps: MerchantCheckDeps, merchantId: number, domain: string, token: string): Promise<'found' | 'missing' | 'blocked' | 'error'> {
  let outcome: 'missing' | 'blocked' | 'error' = 'missing';
  for (const host of [domain, `www.${domain}`]) {
    const res = await deps.fetcher.fetchPolite(`https://${host}${VERIFICATION_FILE_PATH}`, { shopSlug: `merchant-${merchantId}`, purpose: 'probe' });
    if (res.ok && res.body !== null && res.body.includes(verificationValue(token))) return 'found';
    if (res.blocked || res.skipped === 'robots_disallowed' || res.skipped === 'paused') outcome = 'blocked';
    else if (res.status === 0 && outcome !== 'blocked') outcome = 'error';
  }
  return outcome;
}

/**
 * Worker job `merchant.verify_domain`: looks for `pretoscop-verificare=<token>` as a TXT record on the
 * shop's domain (works even when the site blocks bots) or in the file
 * `/.well-known/pretoscop-verificare.txt` (fetched politely as PretoscopBot). Either one verifies.
 */
export async function verifyMerchantDomain(deps: MerchantCheckDeps & { resolveTxt?: TxtResolver }, merchantId: number): Promise<MerchantDomainCheck> {
  const [m] = await deps.db.select().from(merchants).where(eq(merchants.id, merchantId));
  if (!m) throw new Error(`merchant ${merchantId} not found`);
  const requestedAt = m.domainCheck?.requestedAt ?? new Date().toISOString();
  if (!m.domain) {
    const check: MerchantDomainCheck = { status: 'done', requestedAt, finishedAt: new Date().toISOString(), detail: 'no domain' };
    await deps.db.update(merchants).set({ domainCheck: check }).where(eq(merchants.id, m.id));
    return check;
  }
  await deps.db.update(merchants).set({ domainCheck: { status: 'running', requestedAt } }).where(eq(merchants.id, m.id));
  const dns = await dnsHasToken(deps.resolveTxt ?? resolveTxt, m.domain, m.verificationToken);
  const file = dns === 'found' ? undefined : await fileHasToken(deps, m.id, m.domain, m.verificationToken);
  const check: MerchantDomainCheck = { status: 'done', requestedAt, finishedAt: new Date().toISOString(), dns, ...(file ? { file } : {}) };
  const method = dns === 'found' ? 'dns' : file === 'found' ? 'file' : null;
  await deps.db
    .update(merchants)
    .set({
      domainCheck: check,
      ...(method && !m.domainVerifiedAt ? { domainVerifiedAt: deps.now?.() ?? new Date(), verificationMethod: method } : {}),
    })
    .where(eq(merchants.id, m.id));
  deps.log.info({ merchant_id: m.id, dns, file: file ?? null, verified: Boolean(method) }, 'merchant domain checked');
  return check;
}
