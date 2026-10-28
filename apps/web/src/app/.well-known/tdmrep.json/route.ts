import { serverEnv } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TDM Reservation Protocol (W3C TDMRep community group): text and data mining rights are reserved
 * for the whole site (Law 8/1996 art. 36², Directive (EU) 2019/790 art. 4(3)); the policy is the
 * database section of the terms. Every response also carries `tdm-reservation: 1` (next.config).
 */
export function GET(): Response {
  const base = serverEnv().PUBLIC_BASE_URL.replace(/\/+$/, '');
  return Response.json([{ location: '/', 'tdm-reservation': 1, 'tdm-policy': `${base}/termeni#baza-de-date` }], {
    headers: { 'cache-control': 'public, max-age=86400' },
  });
}
