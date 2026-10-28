import { ALERT_CONFIRM_TTL_DAYS } from '@pretoscop/core';
import { confirmAlert, getAlert } from '@pretoscop/db';
import { verifyLink } from '@pretoscop/notify';
import { hashEmail, logAlert, secret } from '@/lib/alerts';
import { db } from '@/lib/db';
import { clientIp, hashWithDailySalt } from '@/lib/privacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/alerts/confirm (form fields `a`, `t`): the double opt-in click. A button on
 * /alerte/confirmare posts here, so mail scanners that open links never confirm anything.
 * Answers 303 back to the page with `stare=confirmat|deja|expirat|invalid`.
 */
export async function POST(req: Request): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const a = Number(form?.get('a'));
  const t = String(form?.get('t') ?? '');
  const back = (state: string) =>
    new Response(null, { status: 303, headers: { location: `/alerte/confirmare?a=${Number.isInteger(a) ? a : 0}&t=${encodeURIComponent(t)}&stare=${state}`, 'cache-control': 'no-store' } });
  if (req.headers.get('sec-fetch-site') === 'cross-site') return back('invalid');
  if (!Number.isInteger(a) || a <= 0 || !verifyLink(secret(), 'confirm', a, t)) return back('invalid');
  const alert = await getAlert(db(), a);
  if (!alert) return back('expirat');
  const ipHash = hashWithDailySalt('ip', clientIp(req.headers));
  const outcome = await confirmAlert(db(), a, { ipHash, method: 'email_link', ttlDays: ALERT_CONFIRM_TTL_DAYS, emailHash: hashEmail(alert.email) });
  logAlert('alert.confirm', { alert_id: a, outcome });
  return back(outcome === 'confirmed' ? 'confirmat' : outcome === 'already' ? 'deja' : 'expirat');
}
