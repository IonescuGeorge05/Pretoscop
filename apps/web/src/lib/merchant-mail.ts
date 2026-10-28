import 'server-only';
import { createMailer } from '@pretoscop/mailer';
import { serverEnv } from './db';
import { plainEmail } from './legal';

/**
 * Merchant portal emails (M20). Plain text, Romanian, sender identity in every message. Failures are
 * logged and never block the action that triggered them (the database row is the record).
 */
type Merchant = { id: number; shopName: string | null; contactEmail: string; domain: string | null };

function footer(): string {
  const env = serverEnv();
  return `\n\n— ${env.COMPANY_LEGAL_NAME}, ${env.COMPANY_POSTAL_ADDRESS}\n${env.PUBLIC_BASE_URL.replace(/\/+$/, '')}/pentru-magazine`;
}

async function send(to: string, subject: string, text: string, kind: string): Promise<void> {
  const env = serverEnv();
  try {
    await createMailer(env).send({ to, subject, text: text + footer(), tags: { kind } });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'web.merchant-mail', kind, error: (err as Error).message }));
  }
}

const portal = () => `${serverEnv().PUBLIC_BASE_URL.replace(/\/+$/, '')}/pentru-magazine/cont`;
const name = (m: Merchant) => m.shopName ?? m.domain ?? `magazinul #${m.id}`;

export async function mailSubmitted(m: Merchant): Promise<void> {
  const team = plainEmail(serverEnv().MAIL_REPLY_TO);
  await send(
    team,
    `[Magazine] Cerere nouă de listare: ${name(m)}`,
    `Magazinul ${name(m)} (${m.domain ?? '—'}, ${m.contactEmail}) a trimis feed-ul spre aprobare.\n\nAprobă sau respinge din panoul de administrare: /admin/comercianti/${m.id}`,
    'merchant_submitted_team',
  );
  await send(
    m.contactEmail,
    `Am primit cererea de listare pentru ${name(m)}`,
    `Bună ziua,\n\nAm primit cererea de listare a magazinului ${name(m)} pe Pretoscop. O verificăm de obicei în una-două zile lucrătoare și îți scriem când avem un răspuns.\n\nStadiul cererii: ${portal()}`,
    'merchant_submitted',
  );
}

export async function mailApproved(m: Merchant): Promise<void> {
  await send(
    m.contactEmail,
    `${name(m)} este listat pe Pretoscop`,
    `Bună ziua,\n\nAm aprobat listarea magazinului ${name(m)}. Citim feed-ul de șase ori pe zi; primele oferte apar după prima citire, iar pe paginile de produs după potrivirea cu catalogul.\n\nVezi ofertele, clicurile și sugestiile pentru feed în contul magazinului: ${portal()}`,
    'merchant_approved',
  );
}

export async function mailRejected(m: Merchant, reason: string): Promise<void> {
  await send(
    m.contactEmail,
    `Cererea de listare pentru ${name(m)} nu a fost aprobată`,
    `Bună ziua,\n\nNu am putut aproba listarea magazinului ${name(m)}, din următorul motiv:\n\n${reason}\n\nPoți corecta datele și trimite din nou cererea din contul magazinului: ${portal()}\nDacă nu ești de acord cu decizia, răspunde la acest email; îți răspundem în cel mult 15 zile lucrătoare.`,
    'merchant_rejected',
  );
}

export async function mailSuspended(m: Merchant, reason: string): Promise<void> {
  await send(
    m.contactEmail,
    `Listarea magazinului ${name(m)} a fost suspendată`,
    `Bună ziua,\n\nAm suspendat afișarea ofertelor magazinului ${name(m)} pe Pretoscop, din următorul motiv:\n\n${reason}\n\nNu mai citim feed-ul până la reluare. Pentru a contesta decizia sau după ce ai corectat problema, răspunde la acest email; îți răspundem în cel mult 15 zile lucrătoare.\n\nContul magazinului: ${portal()}`,
    'merchant_suspended',
  );
}

export async function mailReinstated(m: Merchant): Promise<void> {
  await send(
    m.contactEmail,
    `Listarea magazinului ${name(m)} a fost reluată`,
    `Bună ziua,\n\nAm reluat afișarea ofertelor magazinului ${name(m)}. Citim din nou feed-ul de șase ori pe zi.\n\nContul magazinului: ${portal()}`,
    'merchant_reinstated',
  );
}
