import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getAlert, sql } from '@pretoscop/db';
import { signLink, verifyLink } from '@pretoscop/notify';
import { Notice } from '@/components/alerts/notice';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { describeAlert, maskEmail } from '@/lib/alert-form';
import { secret } from '@/lib/alerts';
import { db } from '@/lib/db';
import { formatLei } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dezabonare de la alertele de preț', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

function StopForm({ field, value, token, label, variant = 'primary' }: { field: 'a' | 'u'; value: string | number; token: string; label: string; variant?: 'primary' | 'secondary' }) {
  return (
    <form action="/api/alerts/unsubscribe" method="post">
      <input type="hidden" name={field} value={value} />
      <input type="hidden" name="t" value={token} />
      <Button type="submit" size="lg" variant={variant} className="w-full sm:w-auto">
        {label}
      </Button>
    </form>
  );
}

/**
 * Behind the "Oprește această alertă" / "Dezabonare de la toate alertele" links: one button, no
 * login, no questions. Opening the page changes nothing (mail scanners open links).
 */
export default async function UnsubscribePage({ searchParams }: Props) {
  const p = await searchParams;
  const t = one(p.t);
  const state = one(p.stare);
  const aRaw = one(p.a);
  const u = one(p.u);
  const a = Number(aRaw);
  const forAlert = aRaw !== '' && Number.isInteger(a) && a > 0 && verifyLink(secret(), 'unsub-alert', a, t);
  const forUser = !forAlert && u !== '' && verifyLink(secret(), 'unsub-user', u, t);

  let body: ReactNode;
  if (state === 'gata' && (forAlert || forUser)) {
    body = (
      <Notice tone="good" title={forAlert ? 'Gata, alerta este oprită' : 'Gata, te-ai dezabonat de la toate alertele'}>
        <p>
          {forAlert
            ? 'Nu îți mai trimitem emailuri despre acest produs. Celelalte alerte, dacă ai, rămân active.'
            : 'Nu îți mai trimitem nicio alertă de preț pe email. Am păstrat doar o amprentă criptografică a adresei, ca să nu îți scriem din greșeală, și dovada acordului, cât cere legea.'}
        </p>
        <p>
          Te-ai răzgândit? Poți porni oricând o alertă nouă de pe pagina unui produs. ·{' '}
          <Link href="/confidentialitate#alerte" className="font-medium text-brand-700 underline">
            Cum folosim datele
          </Link>
        </p>
      </Notice>
    );
  } else if (forAlert) {
    const alert = await getAlert(db(), a);
    if (!alert) {
      body = (
        <Notice tone="good" title="Alerta nu mai există">
          <p>Fie ai oprit-o deja, fie a fost ștearsă. Nu îți mai trimitem nimic despre ea.</p>
        </Notice>
      );
    } else {
      body = (
        <div className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-line sm:p-6">
          <h1 className="text-xl font-bold text-ink">Oprești alerta?</h1>
          <p className="mt-3 text-[15px] text-ink-soft">
            <strong className="text-ink">{alert.productTitle}</strong>
            <br />
            {describeAlert(alert.kind, alert.targetBani === null ? null : formatLei(alert.targetBani), alert.anyVariant)}, pe email la {maskEmail(alert.email)}.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <StopForm field="a" value={a} token={t} label="Oprește alerta" />
            <StopForm field="u" value={alert.userId} token={signLink(secret(), 'unsub-user', alert.userId)} label="Oprește toate alertele mele" variant="secondary" />
          </div>
        </div>
      );
    }
  } else if (forUser) {
    const r = await db().execute<{ email: string; n: string }>(sql`
      SELECT u.email, (SELECT count(*) FROM alerts a WHERE a.user_id = u.id AND (a.channel = 'email' OR a.status = 'pending'))::text AS n
      FROM users u WHERE u.id = ${u}`);
    const row = r.rows[0];
    body =
      !row || row.n === '0' ? (
        <Notice tone="good" title="Nu ai alerte active pe email">
          <p>Nu îți mai trimitem nimic. Dacă ai cont, îl poți gestiona sau șterge din pagina Alertele mele.</p>
        </Notice>
      ) : (
        <div className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-line sm:p-6">
          <h1 className="text-xl font-bold text-ink">Te dezabonezi de la toate alertele?</h1>
          <p className="mt-3 text-[15px] text-ink-soft">
            Oprim {row.n === '1' ? 'alerta de preț trimisă' : `cele ${row.n} alerte de preț trimise`} la {maskEmail(row.email)}.
          </p>
          <div className="mt-5">
            <StopForm field="u" value={u} token={t} label="Oprește toate alertele" />
          </div>
        </div>
      );
  } else {
    body = (
      <Notice tone="warn" title="Linkul de dezabonare nu este valid">
        <p>
          Verifică dacă ai copiat linkul întreg din email. Poți opri alertele și din pagina{' '}
          <Link href="/alerte" className="font-medium text-brand-700 underline">
            Alertele mele
          </Link>{' '}
          sau scriindu-ne din{' '}
          <Link href="/contact?subiect=privacy" className="font-medium text-brand-700 underline">
            formularul de contact
          </Link>
          .
        </p>
      </Notice>
    );
  }
  return <Container className="max-w-xl py-10 sm:py-14">{body}</Container>;
}
