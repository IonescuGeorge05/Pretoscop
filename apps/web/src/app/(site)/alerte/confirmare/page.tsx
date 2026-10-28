import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { consentTextByKey } from '@pretoscop/config/legal-texts';
import { getAlert } from '@pretoscop/db';
import { verifyLink } from '@pretoscop/notify';
import { Notice } from '@/components/alerts/notice';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { describeAlert, maskEmail } from '@/lib/alert-form';
import { secret } from '@/lib/alerts';
import { db } from '@/lib/db';
import { formatDateTime, formatLei } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Confirmă alerta de preț', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * The page behind the confirmation link (double opt-in). Opening it changes nothing: the button
 * posts to /api/alerts/confirm, so link scanners in mail systems never confirm an alert.
 */
export default async function ConfirmPage({ searchParams }: Props) {
  const p = await searchParams;
  const a = Number(one(p.a));
  const t = one(p.t);
  const state = one(p.stare);
  const valid = Number.isInteger(a) && a > 0 && verifyLink(secret(), 'confirm', a, t);
  const alert = valid ? await getAlert(db(), a) : null;

  let body: ReactNode;
  if (!valid) {
    body = (
      <Notice tone="warn" title="Linkul de confirmare nu este valid">
        <p>Verifică dacă ai copiat linkul întreg din email. Poți cere o alertă nouă de pe pagina produsului.</p>
      </Notice>
    );
  } else if (alert && alert.status === 'paused' && state !== 'expirat') {
    // Confirmed earlier, but stopped since (suppressed address, channel gone, paused by the user).
    body = (
      <Notice tone="warn" title="Alerta este confirmată, dar oprită">
        <p>
          Alerta pentru <strong className="text-ink">{alert.productTitle}</strong> nu trimite emailuri acum
          {alert.pausedReason === 'suppressed' ? ': adresa ta nu mai primește emailuri de la noi.' : '.'} O găsești în pagina Alertele mele.
        </p>
        <p>
          <Link href="/alerte" className="font-medium text-brand-700 underline">
            Vezi și gestionează alertele
          </Link>
        </p>
      </Notice>
    );
  } else if (state === 'confirmat' || (alert && alert.status !== 'pending' && state !== 'expirat')) {
    body = (
      <Notice tone="good" title={state === 'confirmat' ? 'Gata, alerta este activă' : 'Alerta este deja activă'}>
        {alert && (
          <p>
            Urmărim <strong className="text-ink">{alert.productTitle}</strong>: {describeAlert(alert.kind, alert.targetBani === null ? null : formatLei(alert.targetBani), alert.anyVariant).toLowerCase()}. Îți scriem
            cel mult o dată pe zi, doar când prețul chiar scade, și fiecare email are linkul de dezabonare.
          </p>
        )}
        <p>
          <Link href="/alerte" className="font-medium text-brand-700 underline">
            Vezi și gestionează alertele
          </Link>
          {alert && (
            <>
              {' '}
              ·{' '}
              <Link href={`/p/${alert.productSlug}`} className="font-medium text-brand-700 underline">
                Înapoi la produs
              </Link>
            </>
          )}
        </p>
      </Notice>
    );
  } else if (!alert || state === 'expirat') {
    body = (
      <Notice tone="warn" title="Cererea a expirat">
        <p>Cererile neconfirmate se șterg după 7 zile, împreună cu adresa de email. Poți porni o alertă nouă de pe pagina produsului.</p>
        {alert && (
          <p>
            <Link href={`/p/${alert.productSlug}`} className="font-medium text-brand-700 underline">
              Înapoi la produs
            </Link>
          </p>
        )}
      </Notice>
    );
  } else {
    const consent = consentTextByKey(alert.consentTextVersion);
    body = (
      <div className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-line sm:p-6">
        <h1 className="text-xl font-bold text-ink">Confirmă alerta de preț</h1>
        <p className="mt-3 text-[15px] text-ink-soft">
          Pentru <strong className="text-ink">{alert.productTitle}</strong>
        </p>
        <p className="mt-1 text-[15px] text-ink-soft">{describeAlert(alert.kind, alert.targetBani === null ? null : formatLei(alert.targetBani), alert.anyVariant)}.</p>
        <p className="mt-1 text-sm text-muted">Pe email, la {maskEmail(alert.email)}.</p>
        {consent && (
          <blockquote className="mt-4 border-l-4 border-brand-200 pl-3 text-sm text-ink-soft">
            „{consent.text}”
            <footer className="mt-1 text-xs text-muted">
              Text bifat pe {formatDateTime(alert.consentAt)} ({consent.key})
            </footer>
          </blockquote>
        )}
        <form action="/api/alerts/confirm" method="post" className="mt-5">
          <input type="hidden" name="a" value={a} />
          <input type="hidden" name="t" value={t} />
          <Button type="submit" size="lg">
            Confirm alerta
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted">Dacă nu ai cerut tu această alertă, închide pagina: nu pornim nimic și ștergem cererea în 7 zile.</p>
      </div>
    );
  }
  return <Container className="max-w-xl py-10 sm:py-14">{body}</Container>;
}
