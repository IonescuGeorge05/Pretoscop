import { resolveTxt } from 'node:dns/promises';
import { type MerchantDomainCheck, merchants, saveMerchantDomainCheck, shopsCoveringHost, sql } from '@pretoscop/db';
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
    if (res.ok && res.body !== null && res.body.trim() === verificationValue(token)) return 'found';
    if (res.blocked || res.skipped === 'robots_disallowed' || res.skipped === 'paused') outcome = 'blocked';
    else if (res.status === 0 && outcome !== 'blocked') outcome = 'error';
  }
  return outcome;
}

/**
 * Worker job `merchant.domain_check`: looks for `pretoscop-verificare=<token>` as a TXT record on the
 * shop's domain (works even when the site blocks bots) or as the content of the file
 * `/.well-known/pretoscop-verificare.txt` (fetched politely as PretoscopBot, merchant-scoped state).
 * Either one verifies, and only the domain that was checked: the result is stored, and the domain
 * marked verified, only while the merchant still claims that domain. The file is never requested
 * from a shop we already crawl (another party's claim must not send our bot there): such domains
 * are proven by DNS, an email address on the domain, or the admin.
 */
export async function verifyMerchantDomain(deps: MerchantCheckDeps & { resolveTxt?: TxtResolver }, merchantId: number): Promise<MerchantDomainCheck> {
  const [m] = await deps.db.select().from(merchants).where(eq(merchants.id, merchantId));
  if (!m) throw new Error(`merchant ${merchantId} not found`);
  const requestedAt = m.domainCheck?.requestedAt ?? new Date().toISOString();
  if (!m.domain) {
    const check: MerchantDomainCheck = { status: 'done', requestedAt, finishedAt: new Date().toISOString(), detail: 'no domain' };
    await deps.db.update(merchants).set({ domainCheck: check }).where(sql`${merchants.id} = ${m.id} AND ${merchants.domain} IS NULL`);
    return check;
  }
  const domain = m.domain;
  await deps.db
    .update(merchants)
    .set({ domainCheck: { status: 'running', requestedAt, domain } })
    .where(sql`${merchants.id} = ${m.id} AND ${merchants.domain} = ${domain}`);
  const dns = await dnsHasToken(deps.resolveTxt ?? resolveTxt, domain, m.verificationToken);
  let file: MerchantDomainCheck['file'];
  let detail: string | undefined;
  if (dns !== 'found') {
    const crawled = (await shopsCoveringHost(deps.db, domain)).concat(await shopsCoveringHost(deps.db, `www.${domain}`)).find((s) => s.legalBasisRef !== `merchant:${m.id}`);
    if (crawled) {
      file = 'skipped';
      detail = `${domain} belongs to the registered shop ${crawled.slug}: no file request`;
    } else {
      file = await fileHasToken(deps, m.id, domain, m.verificationToken);
    }
  }
  const check = { status: 'done', requestedAt, finishedAt: new Date().toISOString(), domain, dns, ...(file ? { file } : {}), ...(detail ? { detail } : {}) } satisfies MerchantDomainCheck;
  const method = dns === 'found' ? 'dns' : file === 'found' ? 'file' : null;
  const stored = await saveMerchantDomainCheck(deps.db, m.id, check, method, deps.now?.() ?? new Date());
  deps.log.info(
    { merchant_id: m.id, domain, dns, file: file ?? null, verified: Boolean(method) && stored, stored },
    stored ? 'merchant domain checked' : 'merchant domain changed during the check: result dropped',
  );
  return check;
}
