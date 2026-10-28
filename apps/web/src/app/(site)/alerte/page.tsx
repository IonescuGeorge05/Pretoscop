import { consentTextByKey, currentConsentText } from '@pretoscop/config/legal-texts';
import { userAlerts, type AlertView } from '@pretoscop/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ChannelsSection } from '@/components/alerts/channels-section';
import { Notice } from '@/components/alerts/notice';
import { PageHeader } from '@/components/legal/legal-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { describeAlert } from '@/lib/alert-form';
import { getSession } from '@/lib/auth';
import { userChannels, type UserChannels } from '@/lib/channels';
import { db } from '@/lib/db';
import { formatDateTime, formatLei } from '@/lib/format';
import { confirmPendingAction, deleteAccountAction, deleteAlertAction, requestLoginLink, signOutAction, stopAllAction, updateAlertAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Alertele mele',
  description: 'Alertele de preț Pretoscop: vezi, modifică sau oprește alertele și descarcă ori șterge datele tale.',
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

const ERRORS: Record<string, string> = {
  email: 'Adresa de email nu pare corectă.',
  limita: 'Ai cerut mai multe linkuri în ultimele minute. Încearcă din nou mai târziu.',
  trimitere: 'Nu am putut trimite emailul. Încearcă din nou peste câteva minute.',
  alerta: 'Alerta nu a fost găsită.',
  tip: 'Alege când te anunțăm.',
  'prag-empty': 'Scrie pragul de preț.',
  'prag-invalid': 'Scrie pragul ca număr, de exemplu 1.999 sau 1.999,99.',
  'prag-too_low': 'Pragul trebuie să fie de cel puțin 1 leu.',
  'prag-too_high': 'Pragul este prea mare.',
  'prag-not_below_current': 'Prețul total de acum este deja sub acest prag. Alege un prag mai mic.',
  confirmare: 'Bifează caseta de confirmare ca să ștergem contul.',
  canal: 'Canalul ales nu este pregătit: activează-l mai întâi în „Canale de notificare”.',
  'acord-email': 'Ca să primești alerta pe email, bifează acordul pentru email din formular.',
  'acord-telegram': 'Bifează acordul pentru Telegram ca să conectăm contul.',
  telegram: 'Alertele pe Telegram nu sunt încă disponibile.',
};

const CHANNEL_LABEL = { email: 'pe email', push: 'în browser', telegram: 'pe Telegram' } as const;

const inputClass =
  'block w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';

function StatusBadge({ a }: { a: AlertView }) {
  if (a.status === 'active') return <Badge tone="good">Activă</Badge>;
  if (a.status === 'pending') return <Badge tone="usual">Așteaptă confirmarea</Badge>;
  const why = a.pausedReason === 'suppressed' ? 'adresa nu mai primește emailuri' : a.pausedReason === 'channel_unavailable' ? 'canalul nu mai funcționează' : 'pusă pe pauză';
  return <Badge tone="high">Oprită: {why}</Badge>;
}

function AlertCard({ a, highlight, usable, emailConsent }: { a: AlertView; highlight: boolean; usable: UserChannels['usable']; emailConsent: string }) {
  const consent = consentTextByKey(a.consentTextVersion);
  const target = a.targetBani === null ? '' : (a.targetBani / 100).toFixed(2).replace('.', ',');
  return (
    <li id={`alerta-${a.id}`} data-testid="alert-card" className={`rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] ring-1 sm:p-5 ${highlight ? 'ring-brand-400' : 'ring-line'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link href={`/p/${a.productSlug}`} className="min-w-0 font-semibold text-ink hover:text-brand-700">
          {a.productTitle}
        </Link>
        <StatusBadge a={a} />
      </div>
      <p className="mt-1 text-sm text-ink-soft">{describeAlert(a.kind, a.targetBani === null ? null : formatLei(a.targetBani), a.anyVariant)} · {CHANNEL_LABEL[a.channel]}</p>
      <p className="mt-1 text-sm text-muted">
        {a.lastNotifiedAt && a.lastNotifiedBani !== null
          ? `Ultima alertă: ${formatDateTime(a.lastNotifiedAt)}, la ${formatLei(a.lastNotifiedBani)}.`
          : a.kind === 'any_drop' && a.baselineBani !== null
            ? `Nicio alertă trimisă încă. Prețul de referință: ${formatLei(a.baselineBani)}.`
            : 'Nicio alertă trimisă încă.'}
      </p>
      <p className="mt-1 text-xs text-muted">
        Acord dat pe {formatDateTime(a.consentAt)}
        {consent ? ` (${consent.key})` : ''}
        {a.confirmedAt ? `, confirmat pe ${formatDateTime(a.confirmedAt)}` : ''}.
      </p>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        {a.status === 'pending' && (
          <form action={confirmPendingAction}>
            <input type="hidden" name="alertId" value={a.id} />
            <Button type="submit" size="sm">
              Confirmă acum
            </Button>
          </form>
        )}
        <details className="group w-full sm:w-auto">
          <summary className="inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-sm font-semibold text-ink ring-1 ring-line hover:bg-brand-50">Modifică</summary>
          <form action={updateAlertAction} className="mt-3 space-y-3 rounded-lg bg-surface p-3 ring-1 ring-line">
            <input type="hidden" name="alertId" value={a.id} />
            <fieldset className="space-y-2 text-sm">
              <legend className="font-semibold text-ink">Când te anunțăm</legend>
              <div className="flex flex-wrap items-center gap-2">
                <input id={`kind-below-${a.id}`} aria-labelledby={`kind-below-${a.id}-label`} type="radio" name="kind" value="below" defaultChecked={a.kind === 'below'} className="size-4 accent-brand-600" />
                <label id={`kind-below-${a.id}-label`} htmlFor={`kind-below-${a.id}`}>Când prețul total ajunge la</label>
                <input
                  name="target"
                  inputMode="decimal"
                  defaultValue={target}
                  aria-label="Pragul de preț, în lei"
                  className={`${inputClass} h-9 w-28`}
                  placeholder="1.999"
                />
                <span>lei sau mai jos</span>
              </div>
              <div className="flex items-center gap-2">
                <input id={`kind-drop-${a.id}`} aria-labelledby={`kind-drop-${a.id}-label`} type="radio" name="kind" value="any_drop" defaultChecked={a.kind === 'any_drop'} className="size-4 accent-brand-600" />
                <label id={`kind-drop-${a.id}-label`} htmlFor={`kind-drop-${a.id}`}>La orice scădere de cel puțin 1%</label>
              </div>
            </fieldset>
            <div className="space-y-1 text-sm">
              <label id={`channel-${a.id}-label`} htmlFor={`channel-${a.id}`} className="block font-semibold text-ink">
                Unde te anunțăm
              </label>
              <select id={`channel-${a.id}`} aria-labelledby={`channel-${a.id}-label`} name="channel" defaultValue={a.channel} className={`${inputClass} h-9 w-auto`}>
                <option value="email">Pe email</option>
                {(usable.push || a.channel === 'push') && (
                  <option value="push" disabled={!usable.push}>
                    În browser (notificări)
                  </option>
                )}
                {(usable.telegram || a.channel === 'telegram') && (
                  <option value="telegram" disabled={!usable.telegram}>
                    Pe Telegram
                  </option>
                )}
              </select>
            </div>
            {a.channel !== 'email' && (
              <div className="flex items-start gap-2.5">
                <input id={`email-consent-${a.id}`} aria-labelledby={`email-consent-${a.id}-label`} name="emailConsent" type="checkbox" className="mt-1 size-4 shrink-0 accent-brand-600" />
                <label id={`email-consent-${a.id}-label`} htmlFor={`email-consent-${a.id}`} className="text-[13px] leading-snug text-ink-soft">
                  Doar dacă alegi emailul: {emailConsent}
                </label>
              </div>
            )}
            <Button type="submit" size="sm">
              Salvează
            </Button>
          </form>
        </details>
        <form action={deleteAlertAction}>
          <input type="hidden" name="alertId" value={a.id} />
          <Button type="submit" size="sm" variant="secondary">
            Șterge alerta
          </Button>
        </form>
      </div>
    </li>
  );
}

function LoggedOut({ linkSent, error }: { linkSent: boolean; error: string | null }) {
  return (
    <Container className="grid gap-8 py-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="max-w-xl space-y-4 text-[15px] leading-relaxed text-ink-soft">
        <p>Aici vezi alertele de preț pe care le-ai pornit, le modifici sau le oprești și îți descarci sau ștergi datele.</p>
        <p>
          Nu ai cont? Se creează singur când pornești prima alertă de pe pagina unui produs și o confirmi din email. Nu folosim parole: te autentifici cu un
          link trimis pe email.
        </p>
        <p>
          <Link href="/confidentialitate#alerte" className="font-medium text-brand-700 underline">
            Cum folosim adresa ta de email
          </Link>
        </p>
      </div>
      <div className="space-y-4">
        {linkSent && (
          <Notice tone="good" title="Verifică emailul" headingLevel={2}>
            <p>Dacă adresa are un cont, în câteva minute primești un link de autentificare, valabil 10 minute.</p>
          </Notice>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-high-bg px-4 py-3 text-sm font-medium text-high ring-1 ring-red-200">
            {error}
          </p>
        )}
        <form action={requestLoginLink} className="space-y-3 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-line">
          <h2 className="font-semibold text-ink">Autentificare</h2>
          <label id="login-email-label" htmlFor="login-email" className="block text-sm font-semibold text-ink">
            Adresa de email
          </label>
          <input id="login-email" aria-labelledby="login-email-label" name="email" type="email" required autoComplete="email" inputMode="email" className={`${inputClass} h-11`} />
          <Button type="submit" size="lg" className="w-full">
            Trimite linkul de autentificare
          </Button>
        </form>
      </div>
    </Container>
  );
}

/** /alerte: the account page (docs/03 §7.1: dynamic, authenticated). */
export default async function AlertsPage({ searchParams }: Props) {
  const p = await searchParams;
  const error = ERRORS[one(p.eroare)] ?? null;
  const session = await getSession();
  const header = <PageHeader eyebrow="Cont" title="Alertele mele" lead="Prețurile pe care le urmărești, într-un singur loc." />;
  if (!session) {
    return (
      <>
        {header}
        {one(p['cont-sters']) === '1' && (
          <Container className="pt-8">
            <Notice tone="good" title="Contul a fost șters">
              <p>Alertele s-au oprit și datele tale s-au șters. Păstrăm doar dovada acordului (3 ani, cât cere legea) și o amprentă a adresei, ca să nu îți mai scriem.</p>
            </Notice>
          </Container>
        )}
        <LoggedOut linkSent={one(p.link) === 'trimis'} error={error} />
      </>
    );
  }

  const [alerts, ch] = await Promise.all([userAlerts(db(), session.user.id), userChannels(session.user.id)]);
  const changed = Number(one(p.modificat) || one(p.confirmat));
  const notice =
    one(p.modificat) !== ''
      ? 'Alerta a fost modificată. Pornește de la prețul de acum.'
      : one(p.confirmat) !== ''
        ? 'Alerta este activă.'
        : one(p['sters-alerta']) === '1'
          ? 'Alerta a fost ștearsă.'
          : one(p.oprite) === '1'
            ? 'Toate alertele au fost oprite.'
            : one(p.canal) === 'telegram-oprit'
              ? 'Telegram este deconectat. Alertele de pe Telegram sunt oprite până îl conectezi din nou.'
              : one(p.canal) === 'notificari-oprite'
                ? 'Notificările pe acel dispozitiv sunt oprite.'
                : null;

  return (
    <>
      {header}
      <Container className="space-y-8 py-8 sm:py-10">
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-soft">
          <span>
            Autentificat ca <strong className="text-ink">{session.user.email}</strong>
          </span>
          <form action={signOutAction}>
            <Button type="submit" size="sm" variant="ghost">
              Ieși din cont
            </Button>
          </form>
        </div>
        {notice && <Notice tone="good" title={notice} headingLevel={2} />}
        {error && (
          <p role="alert" className="rounded-lg bg-high-bg px-4 py-3 text-sm font-medium text-high ring-1 ring-red-200">
            {error}
          </p>
        )}

        <section aria-labelledby="lista" className="space-y-3">
          <h2 id="lista" className="text-lg font-semibold">
            {alerts.length === 0 ? 'Nu ai alerte' : alerts.length === 1 ? 'O alertă' : `${alerts.length} alerte`}
          </h2>
          {alerts.length === 0 ? (
            <p className="text-[15px] text-ink-soft">
              Pornește o alertă din pagina unui produs: alegi un prag de preț sau orice scădere și îți scriem când prețul total chiar scade.
            </p>
          ) : (
            <ul className="space-y-3">
              {alerts.map((a) => (
                <AlertCard key={a.id} a={a} highlight={a.id === changed} usable={ch.usable} emailConsent={currentConsentText('alertConsent').text} />
              ))}
            </ul>
          )}
          {alerts.length > 0 && (
            <form action={stopAllAction}>
              <Button type="submit" variant="secondary">
                Oprește toate alertele
              </Button>
            </form>
          )}
          <p className="text-sm text-muted">
            Îți scriem cel mult o dată pe zi pentru fiecare alertă, doar când prețul total (preț + livrare) scade la un magazin care vinde direct, verificat
            recent. Fiecare email are linkul de dezabonare. Notificările în browser și pe Telegram așteaptă dimineața (8:00–22:00).
          </p>
        </section>

        <ChannelsSection
          email={session.user.email}
          ch={ch}
          telegramToken={one(p.tg) || null}
          pushConsent={currentConsentText('pushConsent')}
          telegramConsent={currentConsentText('telegramConsent')}
        />

        <section id="date" aria-labelledby="date-titlu" className="space-y-3 rounded-[var(--radius-card)] bg-surface p-4 ring-1 ring-line sm:p-5">
          <h2 id="date-titlu" className="text-lg font-semibold">
            Datele tale
          </h2>
          <p className="text-[15px] text-ink-soft">
            Păstrăm adresa de email, alertele, alertele trimise și dovada acordului tău.{' '}
            <Link href="/confidentialitate#alerte" className="font-medium text-brand-700 underline">
              Detalii
            </Link>
          </p>
          <p>
            <a href="/api/account/export" className="font-medium text-brand-700 underline" download>
              Descarcă datele mele (JSON)
            </a>
          </p>
          <form action={deleteAccountAction} className="space-y-3">
            <div className="flex items-start gap-2.5">
              <input id="delete-confirm" aria-labelledby="delete-confirm-label" name="confirm" type="checkbox" required className="mt-1 size-4 shrink-0 accent-brand-600" />
              <label id="delete-confirm-label" htmlFor="delete-confirm" className="text-sm text-ink-soft">
                Înțeleg că ștergerea contului este definitivă: alertele se opresc și datele mele se șterg.
              </label>
            </div>
            <Button type="submit" variant="secondary">
              Șterge contul
            </Button>
          </form>
        </section>
      </Container>
    </>
  );
}
