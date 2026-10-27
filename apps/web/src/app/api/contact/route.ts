import { contactRequests } from '@pretoscop/db';
import { createMailer } from '@pretoscop/mailer';
import {
  CONTACT_KIND_LABELS,
  contactReference,
  sendsReceipt,
  storedMessage,
  validateContact,
  type ContactInput,
  type ContactKind,
} from '@/lib/contact';
import { db, serverEnv } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { plainEmail } from '@/lib/legal';
import { clientIp, hashWithDailySalt } from '@/lib/privacy';
import { createRateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 16 * 1024;
/** 5 submissions per hour per daily-salted session hash (no raw IP is kept). */
const limiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

type Mode = 'json' | 'form';

/** JSON for the enhanced form; a 303 back to /contact for the plain HTML form (no JavaScript). */
function reply(mode: Mode, status: number, body: Record<string, unknown>, redirect: string, headers: Record<string, string> = {}): Response {
  const base = { 'cache-control': 'no-store', ...headers };
  if (mode === 'form') return new Response(null, { status: 303, headers: { ...base, location: redirect } });
  return Response.json(body, { status, headers: base });
}

function logError(event: string, fields: Record<string, unknown>, err: unknown): void {
  console.error(
    JSON.stringify({ level: 'error', service: 'web.contact', event, ...fields, error: err instanceof Error ? err.message : String(err), time: new Date().toISOString() }),
  );
}

const TEAM_NOTES: Partial<Record<ContactKind, string>> = {
  shop_objection:
    'Termen: răspuns și oprirea colectării în cel mult o zi lucrătoare (docs/07 §9: kill switch pentru toate sursele magazinului, inclusiv accesul asistat; notă în infra/legal/objections.md).',
  illegal_content: 'Sesizare DSA (art. 16): confirmare de primire trimisă automat dacă există email; decizie motivată către notificator.',
  privacy: 'Cerere privind datele personale: răspuns în cel mult o lună (GDPR art. 12 alin. (3)); verifică identitatea înainte de a comunica date.',
  price_error: 'Eroare de preț: verifică pe pagina magazinului; corectează sau pune în carantină (docs/07 §9).',
};

const RECEIPT_LINES: Partial<Record<ContactKind, string>> = {
  shop_objection: 'Îți răspundem și oprim colectarea prețurilor de pe site-ul indicat în cel mult o zi lucrătoare de la primire.',
  illegal_content: 'Analizăm sesizarea fără întârzieri nejustificate și te anunțăm decizia, împreună cu motivele ei.',
};

/** Team notification (to MAIL_REPLY_TO) and, where due, a confirmation of receipt to the sender. */
async function notify(input: ContactInput, id: number, reference: string, receivedAt: Date): Promise<void> {
  const env = serverEnv();
  const mailer = createMailer(env);
  const label = CONTACT_KIND_LABELS[input.kind];
  const when = `${formatDateTime(receivedAt)} (ora României)`;
  const urgent = input.kind === 'shop_objection' || input.kind === 'illegal_content';
  const team = [
    'Solicitare nouă din formularul de contact Pretoscop.',
    '',
    `Număr: ${reference}`,
    `Tip: ${label} (${input.kind})`,
    `Primită: ${when}`,
    `Nume: ${input.name ?? '—'}`,
    `Email: ${input.email ?? '—'}`,
    `Pagina: ${input.url ?? '—'}`,
    '',
    'Mesaj:',
    storedMessage(input),
  ];
  const note = TEAM_NOTES[input.kind];
  if (note) team.push('', note);

  const sends: Array<Promise<unknown>> = [
    mailer.send({
      to: plainEmail(env.MAIL_REPLY_TO),
      subject: `[Contact${urgent ? ' · 1 zi lucrătoare' : ''}] ${label} — ${reference}`,
      text: team.join('\n'),
      replyTo: input.email ?? undefined,
      tags: { kind: input.kind },
    }),
  ];
  const receipt = RECEIPT_LINES[input.kind];
  if (input.email && sendsReceipt(input.kind) && receipt) {
    sends.push(
      mailer.send({
        to: input.email,
        subject: `Am primit solicitarea ta (${reference})`,
        text: [
          'Bună ziua,',
          '',
          'Am primit solicitarea trimisă prin formularul de contact Pretoscop.',
          '',
          `Număr de înregistrare: ${reference}`,
          `Tip: ${label}`,
          `Primită: ${when}`,
          '',
          receipt,
          '',
          'Dacă nu ai trimis tu această solicitare, poți ignora acest email.',
          '',
          `— ${env.COMPANY_LEGAL_NAME}, ${env.COMPANY_POSTAL_ADDRESS}`,
          env.PUBLIC_BASE_URL,
        ].join('\n'),
        tags: { kind: `${input.kind}_receipt` },
      }),
    );
  }
  const results = await Promise.allSettled(sends);
  results.forEach((r) => {
    if (r.status === 'rejected') logError('contact.email_failed', { contact_id: id, kind: input.kind }, r.reason);
  });
}

/**
 * POST /api/contact — stores a `contact_requests` row and emails the team. Accepts JSON (the
 * enhanced form, answers 201 `{ ok, id, reference }` or 400 `{ ok:false, errors }`) and plain form
 * posts (answers 303 back to /contact). Refuses cross-site posts, bodies over 16 KB, a filled
 * honeypot and more than 5 submissions per hour per session. No cookies are read or set.
 */
export async function POST(req: Request): Promise<Response> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
  const mode: Mode = contentType.includes('application/json') ? 'json' : 'form';

  // Fetch Metadata: other websites cannot post into the form; direct API clients send no header.
  if (req.headers.get('sec-fetch-site') === 'cross-site') {
    return reply(mode, 403, { ok: false, error: 'forbidden' }, '/contact?eroare=respins');
  }
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) {
    return reply(mode, 413, { ok: false, error: 'too_large' }, '/contact?eroare=validare');
  }

  let raw: Record<string, unknown>;
  try {
    if (mode === 'json') {
      const text = await req.text();
      if (text.length > MAX_BYTES) return reply(mode, 413, { ok: false, error: 'too_large' }, '/contact?eroare=validare');
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reply(mode, 400, { ok: false, error: 'invalid_body' }, '/contact?eroare=validare');
      raw = parsed as Record<string, unknown>;
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'));
    } else {
      return new Response('unsupported content type', { status: 415, headers: { 'cache-control': 'no-store' } });
    }
  } catch {
    return reply(mode, 400, { ok: false, error: 'invalid_body' }, '/contact?eroare=validare');
  }

  const session = hashWithDailySalt(clientIp(req.headers), req.headers.get('user-agent'));
  const limit = limiter.hit(session);
  if (!limit.allowed) {
    return reply(mode, 429, { ok: false, error: 'rate_limited' }, '/contact?eroare=limita', { 'retry-after': String(limit.retryAfterSec) });
  }

  const result = validateContact(raw);
  if (!result.ok) {
    if (result.spam) return reply(mode, 400, { ok: false, error: 'rejected' }, '/contact?eroare=respins');
    const kind = typeof raw.kind === 'string' && /^[a-z_]{1,20}$/.test(raw.kind) ? `subiect=${raw.kind}&` : '';
    return reply(mode, 400, { ok: false, errors: result.errors }, `/contact?${kind}eroare=validare`);
  }

  const input = result.value;
  let row: { id: number; createdAt: Date } | undefined;
  try {
    [row] = await db()
      .insert(contactRequests)
      .values({ kind: input.kind, name: input.name, email: input.email, subjectUrl: input.url, message: storedMessage(input), sessionHash: session })
      .returning({ id: contactRequests.id, createdAt: contactRequests.createdAt });
  } catch (err) {
    logError('contact.store_failed', { kind: input.kind }, err);
  }
  if (!row) return reply(mode, 500, { ok: false, error: 'server' }, `/contact?subiect=${input.kind}&eroare=server`);

  const reference = contactReference(row.id);
  // The row is the record: a failed email is logged and never loses the request.
  await notify(input, row.id, reference, row.createdAt).catch((err: unknown) => logError('contact.notify_failed', { contact_id: row.id, kind: input.kind }, err));

  return reply(mode, 201, { ok: true, id: row.id, reference, kind: input.kind }, `/contact?trimis=${reference}&tip=${input.kind}`);
}
