import { exportUserData } from '@pretoscop/db';
import { hashEmail, logAlert } from '@/lib/alerts';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/account/export — GDPR arts 15 and 20: everything Pretoscop holds about the logged-in
 * person (account, alerts with their consent evidence, sent alerts, consent records, sessions),
 * as a JSON download.
 */
export async function GET(req: Request): Promise<Response> {
  const s = await auth().api.getSession({ headers: req.headers });
  if (!s) return new Response('Autentifică-te în pagina /alerte ca să descarci datele.', { status: 401, headers: { 'cache-control': 'no-store' } });
  const data = await exportUserData(db(), s.user.id, hashEmail(s.user.email));
  if (!data) return new Response('Contul nu a fost găsit.', { status: 404, headers: { 'cache-control': 'no-store' } });
  logAlert('account.export', {});
  const day = new Date().toISOString().slice(0, 10);
  const body = {
    generatedAt: new Date().toISOString(),
    about:
      'Datele pe care Pretoscop le păstrează despre contul tău. Amprentele (hash) ale adresei IP sunt calculate cu o cheie care se schimbă zilnic și nu pot fi transformate înapoi în adresa IP.',
    ...data,
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="pretoscop-datele-mele-${day}.json"`,
      'cache-control': 'no-store',
    },
  });
}
