import { normalizeEmail } from '@pretoscop/core';
import { alertProduct, bestAlertOffer, createAlert, deleteAlert, markConfirmationSent, recentConfirmationCount, sql, suppressionReason } from '@pretoscop/db';
import { validateAlertForm, type AlertErrors } from '@/lib/alert-form';
import { alertConsent, alertsEnabled, findOrCreateUser, hashEmail, logAlert, sendConfirmation } from '@/lib/alerts';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientIp, hashWithDailySalt } from '@/lib/privacy';
import { createRateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024;
/** Per daily-salted session hash (no raw IP is kept): 10 alert requests per hour. */
const limiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });
/** At most this many confirmation emails per address per 24 hours (someone typing another's address). */
const MAX_CONFIRMATIONS_PER_DAY = 3;

type Mode = 'json' | 'form';
type Outcome = 'pending' | 'active';

function reply(mode: Mode, status: number, body: Record<string, unknown>, redirect: string, headers: Record<string, string> = {}): Response {
  const base = { 'cache-control': 'no-store', ...headers };
  if (mode === 'form') return new Response(null, { status: 303, headers: { ...base, location: redirect } });
  return Response.json(body, { status, headers: base });
}

const resultUrl = (state: string, slug: string | null) => `/alerte/rezultat?stare=${state}${slug ? `&p=${encodeURIComponent(slug)}` : ''}`;

/**
 * POST /api/alerts — creates a price alert from the product-page form. Explicit consent (unticked
 * box, versioned text) is required; the alert stays pending until the link in the confirmation
 * email is clicked (double opt-in), unless the visitor is logged in with this very address.
 * Answers JSON `{ ok, status }` to the enhanced form and 303 to /alerte/rezultat to a plain form.
 * The answer is the same whether or not the address already has an account (no enumeration).
 */
export async function POST(req: Request): Promise<Response> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
  const mode: Mode = contentType.includes('application/json') ? 'json' : 'form';
  if (req.headers.get('sec-fetch-site') === 'cross-site') return reply(mode, 403, { ok: false, error: 'forbidden' }, resultUrl('respins', null));
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) return reply(mode, 413, { ok: false, error: 'too_large' }, resultUrl('eroare', null));

  let raw: Record<string, unknown>;
  try {
    if (mode === 'json') {
      const text = await req.text();
      if (text.length > MAX_BYTES) return reply(mode, 413, { ok: false, error: 'too_large' }, resultUrl('eroare', null));
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reply(mode, 400, { ok: false, error: 'invalid_body' }, resultUrl('eroare', null));
      raw = parsed as Record<string, unknown>;
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'));
    } else {
      return new Response('unsupported content type', { status: 415, headers: { 'cache-control': 'no-store' } });
    }
  } catch {
    return reply(mode, 400, { ok: false, error: 'invalid_body' }, resultUrl('eroare', null));
  }

  if (!(await alertsEnabled())) return reply(mode, 503, { ok: false, error: 'disabled' }, resultUrl('oprit', null));

  const ip = clientIp(req.headers);
  const session = hashWithDailySalt(ip, req.headers.get('user-agent'));
  const limit = limiter.hit(session);
  if (!limit.allowed) return reply(mode, 429, { ok: false, error: 'rate_limited' }, resultUrl('limita', null), { 'retry-after': String(limit.retryAfterSec) });

  const d = db();
  const product = await alertProduct(d, Number(raw.productId));
  const slug = product?.slug ?? null;
  if (!product || product.status !== 'active') {
    return reply(mode, 400, { ok: false, errors: { product: 'Produsul nu mai este disponibil pentru alerte.' } satisfies AlertErrors }, resultUrl('eroare', slug));
  }
  const anyVariantAsked = raw.anyVariant === true || raw.anyVariant === 'on' || raw.anyVariant === 'true';
  const best = await bestAlertOffer(d, product.id, anyVariantAsked && product.variants > 1);
  const consent = alertConsent();
  const v = validateAlertForm({ ...raw, productId: product.id }, { currentBestBani: best?.totalBani ?? null, consentVersion: consent.key });
  if (!v.ok) {
    if (v.spam) return reply(mode, 400, { ok: false, error: 'rejected' }, resultUrl('respins', slug));
    return reply(mode, 400, { ok: false, errors: v.errors }, resultUrl('eroare', slug));
  }
  const input = v.value;
  const anyVariant = input.anyVariant && product.variants > 1;
  const email = normalizeEmail(input.email);
  const emailHashValue = hashEmail(email);
  const ipHash = hashWithDailySalt('ip', ip);
  const now = new Date();

  try {
    // Logged in with this very (verified) address: the session is the proof, no email round trip.
    const s = await auth().api.getSession({ headers: req.headers }).catch(() => null);
    const sessionEmail = s?.user.email ? normalizeEmail(s.user.email) : null;
    if (s && sessionEmail === email && s.user.emailVerified) {
      const created = await createAlert(d, {
        userId: s.user.id,
        productId: product.id,
        kind: input.kind,
        targetBani: input.targetBani,
        anyVariant,
        channel: 'email',
        consentAt: now,
        consentIpHash: ipHash,
        consentTextVersion: consent.key,
        emailHash: emailHashValue,
        confirm: { method: 'session', ipHash },
      });
      logAlert('alert.created', { alert_id: created.alertId, status: 'active', via: 'session' });
      return reply(mode, 201, { ok: true, status: 'active' satisfies Outcome }, resultUrl('activ', slug));
    }

    const user = await findOrCreateUser(email);
    // A pending request for this product in the last 10 minutes: the email is on its way.
    const dup = await d.execute<{ id: string }>(sql`
      SELECT id::text FROM alerts WHERE user_id = ${user.id} AND product_id = ${product.id} AND status = 'pending'
        AND confirmation_sent_at > now() - interval '10 minutes' LIMIT 1`);
    const suppressed = await suppressionReason(d, emailHashValue);
    const blocked = suppressed === 'complaint' || suppressed === 'bounce';
    const tooMany = (await recentConfirmationCount(d, user.id)) >= MAX_CONFIRMATIONS_PER_DAY;
    if (!dup.rows[0] && !blocked && !tooMany) {
      const created = await createAlert(d, {
        userId: user.id,
        productId: product.id,
        kind: input.kind,
        targetBani: input.targetBani,
        anyVariant,
        channel: 'email',
        consentAt: now,
        consentIpHash: ipHash,
        consentTextVersion: consent.key,
        emailHash: emailHashValue,
      });
      try {
        await sendConfirmation({ to: email, alertId: created.alertId, productTitle: product.title, kind: input.kind, targetBani: input.targetBani, anyVariant, requestedAt: now });
      } catch (err) {
        // No email, no pending alert: the visitor can simply try again.
        await deleteAlert(d, created.alertId, { method: 'confirmation_not_sent' });
        throw err;
      }
      await markConfirmationSent(d, created.alertId);
      logAlert('alert.created', { alert_id: created.alertId, status: 'pending' });
    } else {
      logAlert('alert.confirmation_withheld', { reason: dup.rows[0] ? 'duplicate' : blocked ? 'suppressed' : 'daily_limit' });
    }
    return reply(mode, 201, { ok: true, status: 'pending' satisfies Outcome }, resultUrl('trimis', slug));
  } catch (err) {
    logAlert('alert.create_failed', { product_id: product.id }, err);
    return reply(mode, 500, { ok: false, error: 'server' }, resultUrl('eroare', slug));
  }
}
