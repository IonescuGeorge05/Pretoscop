import { currentConsentText } from '@pretoscop/config/legal-texts';
import { CheckCircle2, Circle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/legal/legal-page';
import { Callout } from '@/components/legal/prose';
import { AutoRefresh } from '@/components/merchant/auto-refresh';
import { FeedReportView, HintList } from '@/components/merchant/feed-report';
import { SignOutButton } from '@/components/merchant/sign-out';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { cn } from '@/lib/cn';
import { formatDateTime, formatLei, formatRelative } from '@/lib/format';
import { merchantDashboard, merchantOf, portalOpen, requirePortalUser, uploadFreshnessHours, type Merchant } from '@/lib/merchant';
import { listingReportProblem } from '@pretoscop/db';
import { dashboardHints, FORMAT_LABELS, STATUS_LABELS } from '@/lib/merchant-hints';
import { checkDomain, pullNow, recheckFeed, saveCompany, saveFeedUrl, saveSettings, submitForReview } from './actions';

export const metadata: Metadata = {
  title: 'Contul magazinului',
  description: 'Listarea gratuită a magazinului pe Pretoscop: date, domeniu, feed, aprobare și statistici.',
  robots: { index: false, follow: false },
};

const OK: Record<string, string> = {
  firma: 'Datele au fost salvate.',
  domeniu: 'Verificăm domeniul; rezultatul apare mai jos în câteva secunde.',
  feed: 'Am salvat adresa feed-ului și îl verificăm.',
  fisier: 'Am primit fișierul și îl verificăm.',
  setari: 'Setările au fost salvate; verificăm din nou feed-ul cu ele.',
  trimis: 'Cererea a fost trimisă spre aprobare. Îți scriem pe email când avem un răspuns.',
  citire: 'Am programat o citire a feed-ului; rezultatul apare aici în câteva minute.',
};
const ERR: Record<string, string> = {
  portal_inchis: 'Înscrierile online nu sunt deschise încă. Scrie-ne și te ajutăm direct.',
  nume: 'Completează numele magazinului (cel puțin 2 caractere).',
  firma: 'Completează denumirea firmei.',
  cui: 'CUI-ul nu este valid: verifică cifrele (prefixul RO este opțional).',
  site: 'Adresa site-ului nu este validă (de exemplu, https://www.magazinul-tau.ro).',
  telefon: 'Numărul de telefon nu pare valid.',
  stare: 'Nu poți modifica aceste date acum (cererea este în așteptare sau aprobată). Scrie-ne dacă trebuie schimbate.',
  url: 'Adresa feed-ului nu este validă: folosește o adresă http(s) publică, fără nume de utilizator, parolă sau port special.',
  asteapta: 'Ai cerut o verificare acum câteva secunde. Așteaptă puțin și încearcă din nou.',
  asteapta_ora: 'Feed-ul a fost citit în ultima oră; încearcă mai târziu.',
  fara_feed: 'Adaugă mai întâi adresa feed-ului sau încarcă un fișier.',
  pret: 'Alege cum sunt scrise prețurile în feed.',
  livrare: 'Valorile de livrare trebuie să fie sume în lei, între 0 și 10.000.',
  termeni: 'Bifează acceptarea termenilor pentru magazine.',
  incomplet: 'Completează toți pașii: datele firmei, domeniul verificat și un feed verificat, cu cel puțin un produs care poate fi afișat.',
  fisier: 'Fișierul nu a putut fi citit. Încarcă un fișier XML sau CSV (poate fi arhivat .gz).',
  fisier_mare: 'Fișierul depășește 15 MB.',
  gazda:
    'Adresa feed-ului este pe site-ul unui magazin pe care îl urmărim deja. Dacă este magazinul tău, verifică mai întâi domeniul lui (pasul 2); altfel folosește o adresă de pe domeniul tău sau încarcă fișierul.',
  limita: 'Ai făcut multe verificări în ultimele 24 de ore. Încearcă din nou mai târziu sau scrie-ne.',
  verificare_in_curs: 'Verificarea feed-ului nu s-a terminat încă. Așteaptă rezultatul, apoi trimite cererea.',
  raport_vechi: 'Ultima verificare a fost făcută pentru alt feed sau alt domeniu. Verifică din nou feed-ul, apoi trimite cererea.',
  in_afara_domeniului: 'Niciun produs din feed nu are adresa pe domeniul verificat. Afișăm doar produse de pe domeniul tău.',
};
const METHOD: Record<string, string> = { email: 'prin adresa de email', dns: 'prin înregistrarea DNS', file: 'prin fișierul de verificare', admin: 'manual, de echipa Pretoscop' };

const input = 'block h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';
const label = 'block text-sm font-semibold text-ink';

function Step({ id, n, title, done, children }: { id: string; n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titlu`} className="scroll-mt-36 rounded-[var(--radius-card)] bg-canvas p-5 ring-1 ring-line md:scroll-mt-24 sm:p-6">
      <h2 id={`${id}-titlu`} className="flex items-center gap-2.5 text-lg font-semibold text-ink">
        {done ? <CheckCircle2 className="size-5 text-brand-700" aria-hidden /> : <Circle className="size-5 text-muted" aria-hidden />}
        <span>
          {n}. {title}
        </span>
        <span className="sr-only">{done ? '(gata)' : '(de făcut)'}</span>
      </h2>
      <div className="mt-4 space-y-4 text-[15px] text-ink-soft">{children}</div>
    </section>
  );
}

function Field({ id, text, hint, children }: { id: string; text: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label id={`${id}-label`} htmlFor={id} className={label}>
        {text}
      </label>
      {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function CompanyForm({ m }: { m: Merchant | null }) {
  return (
    <form action={saveCompany} className="grid gap-4 sm:grid-cols-2">
      <Field id="shopName" text="Numele magazinului" hint="Așa cum îl știu cumpărătorii; apare lângă oferte.">
        <input id="shopName" aria-labelledby="shopName-label" name="shopName" required minLength={2} maxLength={80} defaultValue={m?.shopName ?? ''} className={input} />
      </Field>
      <Field id="websiteUrl" text="Adresa site-ului" hint="Domeniul de aici trebuie verificat la pasul 2.">
        <input id="websiteUrl" aria-labelledby="websiteUrl-label" name="websiteUrl" required inputMode="url" placeholder="https://www.magazinul-tau.ro" defaultValue={m?.websiteUrl ?? ''} className={input} />
      </Field>
      <Field id="companyName" text="Denumirea firmei" hint="De exemplu, SC Magazinul Meu SRL.">
        <input id="companyName" aria-labelledby="companyName-label" name="companyName" required minLength={2} maxLength={120} defaultValue={m?.companyName ?? ''} className={input} />
      </Field>
      <Field id="cui" text="CUI" hint="Codul unic de înregistrare; prefixul RO este opțional.">
        <input id="cui" aria-labelledby="cui-label" name="cui" required inputMode="numeric" maxLength={20} defaultValue={m?.cui ?? ''} className={input} />
      </Field>
      <Field id="contactName" text="Persoana de contact (opțional)">
        <input id="contactName" aria-labelledby="contactName-label" name="contactName" maxLength={80} autoComplete="name" defaultValue={m?.contactName ?? ''} className={input} />
      </Field>
      <Field id="contactPhone" text="Telefon (opțional)">
        <input id="contactPhone" aria-labelledby="contactPhone-label" name="contactPhone" maxLength={30} autoComplete="tel" inputMode="tel" defaultValue={m?.contactPhone ?? ''} className={input} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit">Salvează datele</Button>
      </div>
    </form>
  );
}

function DomainStep({ m, email }: { m: Merchant; email: string }) {
  if (!m.domain) return <p>Completează mai întâi adresa site-ului la pasul 1.</p>;
  if (m.domainVerifiedAt) {
    return (
      <p data-testid="domain-verified">
        Domeniul <strong className="text-ink">{m.domain}</strong> este verificat {METHOD[m.verificationMethod ?? 'admin']} ({formatDateTime(m.domainVerifiedAt)}). Vom
        afișa doar produsele ale căror adrese sunt pe acest domeniu.
      </p>
    );
  }
  const value = `pretoscop-verificare=${m.verificationToken}`;
  // A result for another domain (the merchant changed it meanwhile) is never shown.
  const check = m.domainCheck && (!m.domainCheck.domain || m.domainCheck.domain === m.domain) ? m.domainCheck : null;
  return (
    <>
      <p>
        Ca nimeni să nu poată lista produsele altui magazin, verificăm că tu controlezi domeniul <strong className="text-ink">{m.domain}</strong>. Alege una dintre
        variante:
      </p>
      <ol className="list-decimal space-y-3 pl-5">
        <li>
          <strong className="text-ink">Adresă de email pe domeniu.</strong> Ieși din cont și intră cu o adresă de forma nume@{m.domain} (acum folosești {email}).
        </li>
        <li>
          <strong className="text-ink">Înregistrare DNS de tip TXT</strong> pe domeniul {m.domain} (nume sau „host”: <code>@</code>), cu valoarea:
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-[13px] text-ink ring-1 ring-line" data-testid="verification-value">
            {value}
          </code>
          Funcționează și când site-ul blochează roboții. Propagarea poate dura de la câteva minute la câteva ore.
        </li>
        <li>
          <strong className="text-ink">Fișier pe site</strong> la adresa <code>https://{m.domain}/.well-known/pretoscop-verificare.txt</code>, cu același conținut. Îl
          citește robotul nostru, cu respectarea robots.txt.
        </li>
      </ol>
      <form action={checkDomain} className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary">
          Verifică acum
        </Button>
        {check?.status === 'done' && (
          <span className="text-sm" role="status">
            Ultima verificare ({formatDateTime(check.finishedAt ?? check.requestedAt)}): DNS {check.dns === 'found' ? 'găsit' : 'negăsit'}
            {check.file && check.file !== 'skipped'
              ? `, fișier ${check.file === 'found' ? 'găsit' : check.file === 'blocked' ? 'inaccesibil (robots.txt sau protecție anti-bot)' : 'negăsit'}`
              : ''}
            .
          </span>
        )}
        {check?.status === 'done' && check.file === 'skipped' && (
          <span className="text-sm" data-testid="file-skipped">
            Pe acest domeniu urmărim deja un magazin, așa că nu citim fișiere de verificare de pe el: folosește înregistrarea DNS sau o adresă de email pe
            domeniu.
          </span>
        )}
        {(check?.status === 'queued' || check?.status === 'running') && (
          <span className="text-sm" role="status">
            Verificăm…
          </span>
        )}
      </form>
    </>
  );
}

function FeedForms({ m, uploadHours }: { m: Merchant; uploadHours: number }) {
  const select = (
    <select name="feedFormat" defaultValue={m.feedFormat ?? 'auto'} aria-label="Formatul feed-ului" className={cn(input, 'sm:w-56')}>
      <option value="auto">Detectează automat</option>
      <option value="google">{FORMAT_LABELS.google}</option>
      <option value="compari">{FORMAT_LABELS.compari}</option>
      <option value="csv">{FORMAT_LABELS.csv}</option>
    </select>
  );
  return (
    <>
      <form action={saveFeedUrl} className="space-y-3">
        <Field id="feedUrl" text="Adresa feed-ului" hint="Același feed pe care îl dai Google Shopping sau compari.ro. Îl citim de 6 ori pe zi, cu robotul PretoscopBot-Feed.">
          <input id="feedUrl" aria-labelledby="feedUrl-label" name="feedUrl" required inputMode="url" placeholder="https://www.magazinul-tau.ro/feed/google.xml" defaultValue={m.feedUrl ?? ''} className={input} />
        </Field>
        <div className="flex flex-wrap gap-3">
          {select}
          <Button type="submit">Salvează și verifică</Button>
        </div>
      </form>
      <details className="rounded-lg bg-surface px-4 py-3 ring-1 ring-line">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Nu ai o adresă? Încarcă fișierul</summary>
        <form action="/api/merchant/feed-upload" method="post" encType="multipart/form-data" className="mt-3 space-y-3">
          <p className="text-sm">
            Un fișier încărcat nu se actualizează singur: prețurile lui apar ca „verificate” la momentul încărcării și devin gri după {uploadHours >= 48 ? `${uploadHours / 24} zile` : `${uploadHours} ore`}. Recomandăm o adresă.
          </p>
          <label id="feedFile-label" htmlFor="feedFile" className={label}>
            Fișierul feed-ului (XML sau CSV, cel mult 15 MB)
          </label>
          <input id="feedFile" aria-labelledby="feedFile-label" name="feed" type="file" required accept=".xml,.csv,.txt,.tsv,.gz" className="block text-sm" />
          <div className="flex flex-wrap gap-3">
            {select}
            <Button type="submit" variant="secondary">
              Încarcă și verifică
            </Button>
          </div>
        </form>
      </details>
      {m.feedUploadKey && !m.feedUrl && m.feedUploadedAt && (
        <p className="text-sm">Folosești fișierul încărcat la {formatDateTime(m.feedUploadedAt)}.</p>
      )}
    </>
  );
}

function SettingsForm({ m }: { m: Merchant }) {
  const report = m.validation?.report;
  const needs = report?.priceFormat.needsChoice ?? false;
  const example = report?.priceFormat.ambiguousExamples[0] ?? '12.500';
  const current = m.priceFormat ?? report?.priceFormat.effective ?? '';
  const r = m.shippingRules ?? {};
  return (
    <form action={saveSettings} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className={label}>Cum sunt scrise prețurile în feed?</legend>
        {needs && (
          <p className="text-sm font-medium text-high" data-testid="price-format-question">
            Am găsit prețuri ca „{example}”: alege dacă înseamnă {formatLei(Math.round(Number(example) * 100))} sau {formatLei(Number(example.replace(/\./g, '')) * 100)}.
          </p>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="priceFormat" value="decimal" aria-labelledby="pf-decimal" defaultChecked={current === 'decimal'} className="mt-1 accent-brand-600" />
          <span id="pf-decimal">Cu punct zecimal, ca în Google Merchant: „1299.99”, iar „12.500” înseamnă 12,50 lei.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="priceFormat" value="ro" aria-labelledby="pf-ro" defaultChecked={current === 'ro'} className="mt-1 accent-brand-600" />
          <span id="pf-ro">În format românesc: „1.299,99”, iar „12.500” înseamnă douăsprezece mii cinci sute de lei.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="priceFormat" value="" aria-labelledby="pf-auto" defaultChecked={current === ''} className="mt-1 accent-brand-600" />
          <span id="pf-auto">Nu știu; detectează automat (doar când prețurile nu sunt ambigue).</span>
        </label>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className={label}>Livrarea standard (dacă nu apare în feed la fiecare produs)</legend>
        <p className="text-sm">Folosim aceste reguli pentru prețul total și le marcăm „livrare estimată”. Lasă gol ce nu se aplică. Sume în lei, cu TVA.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="freeOver" text="Livrare gratuită de la">
            <input id="freeOver" aria-labelledby="freeOver-label" name="freeOver" inputMode="decimal" defaultValue={r.free_over ?? ''} className={input} />
          </Field>
          <Field id="flat" text="Tarif curier">
            <input id="flat" aria-labelledby="flat-label" name="flat" inputMode="decimal" defaultValue={r.flat ?? ''} className={input} />
          </Field>
          <Field id="lockerFlat" text="Tarif locker">
            <input id="lockerFlat" aria-labelledby="lockerFlat-label" name="lockerFlat" inputMode="decimal" defaultValue={r.locker_flat ?? ''} className={input} />
          </Field>
        </div>
      </fieldset>
      <Button type="submit">Salvează setările</Button>
    </form>
  );
}

function Onboarding({ m, email, open, uploadHours }: { m: Merchant | null; email: string; open: boolean; uploadHours: number }) {
  const problem = m ? listingReportProblem(m) : 'not_checked';
  const companyDone = Boolean(m?.shopName && m.companyName && m.cui && m.domain);
  const domainDone = Boolean(m?.domainVerifiedAt);
  // Done only for a finished check of the current feed and domain with listable offers on that domain.
  const feedDone = problem === null || problem === 'price_format';
  const settingsDone = problem === null;
  const terms = currentConsentText('merchantTerms');
  return (
    <div className="space-y-6">
      <Step id="pas-1" n={1} title="Magazinul și firma" done={companyDone}>
        <CompanyForm m={m} />
      </Step>
      <Step id="pas-2" n={2} title="Verificarea domeniului" done={domainDone}>
        {m ? <DomainStep m={m} email={email} /> : <p>Salvează mai întâi datele de la pasul 1.</p>}
      </Step>
      <Step id="pas-3" n={3} title="Feed-ul de produse" done={feedDone}>
        {m ? (
          <>
            <FeedForms m={m} uploadHours={uploadHours} />
            {(m.feedUrl || m.feedUploadKey) && (
              <form action={recheckFeed}>
                <Button type="submit" variant="ghost" size="sm">
                  Verifică din nou feed-ul
                </Button>
              </form>
            )}
            <FeedReportView validation={m.validation} />
          </>
        ) : (
          <p>Salvează mai întâi datele de la pasul 1.</p>
        )}
      </Step>
      <Step id="pas-4" n={4} title="Prețuri și livrare" done={settingsDone}>
        {m ? <SettingsForm m={m} /> : <p>Salvează mai întâi datele de la pasul 1.</p>}
      </Step>
      <Step id="pas-5" n={5} title="Trimite spre aprobare" done={false}>
        {!open && <p className="font-medium text-ink">Înscrierile online nu sunt deschise încă; poți pregăti totul, iar trimiterea se activează curând.</p>}
        <form action={submitForReview} className="space-y-4">
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="accept" required aria-labelledby="accept-terms-text" className="mt-1 size-4 shrink-0 accent-brand-600" data-testid="accept-terms" />
            <span id="accept-terms-text">
              {terms.text}{' '}
              <Link href={terms.link.href} className="font-medium text-brand-700 underline">
                {terms.link.label}
              </Link>
            </span>
          </label>
          <Button type="submit" size="lg" disabled={!(companyDone && domainDone && feedDone && settingsDone && open)}>
            {terms.acceptLabel}
          </Button>
          {!(companyDone && domainDone && feedDone && settingsDone) && <p className="text-sm text-muted">Butonul se activează după ce pașii 1–4 sunt gata.</p>}
        </form>
      </Step>
    </div>
  );
}

async function Dashboard({ m }: { m: Merchant }) {
  const d = await merchantDashboard(m);
  if (!d) return null;
  const last = d.runs[0];
  const lastRun = last
    ? {
        status: last.status,
        rejected: Number(last.stats?.rejected ?? 0),
        offDomain: Number(last.stats?.offDomain ?? 0),
        errorSample: last.error_sample,
      }
    : null;
  const matchedPct = d.activeOffers ? Math.round((d.matched / d.activeOffers) * 100) : 0;
  const freshPct = d.activeOffers ? Math.round(((d.activeOffers - d.stale) / d.activeOffers) * 100) : 0;
  const stats: Array<[string, string, string?]> = [
    ['Oferte afișate', new Intl.NumberFormat('ro-RO').format(d.activeOffers)],
    ['Potrivite cu produse', `${matchedPct}%`, `${d.matched} oferte`],
    ['Clicuri (30 de zile)', new Intl.NumberFormat('ro-RO').format(d.clicks30)],
    ['Ultima citire reușită', d.source?.last_success_at ? formatRelative(d.source.last_success_at) : '—', d.source?.health === 'ok' ? 'fără probleme' : d.source ? `stare: ${d.source.health}` : undefined],
    ['Oferte proaspete', `${freshPct}%`, `confirmate de feed în ultimele ${d.freshnessHours} ore`],
  ];
  return (
    <section id="panou" aria-labelledby="panou-titlu" className="space-y-6">
      <h2 id="panou-titlu" className="text-xl font-semibold text-ink">
        Panoul magazinului
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="merchant-stats">
        {stats.map(([title, value, hint]) => (
          <div key={title} className="rounded-[var(--radius-card)] bg-canvas p-4 ring-1 ring-line">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
            <div className="mt-1 text-2xl font-bold text-ink tabular" data-testid={`stat-${title}`}>
              {value}
            </div>
            {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold text-ink">Ce poți îmbunătăți</h3>
        <HintList hints={dashboardHints({ ...d, lastRun })} />
        {dashboardHints({ ...d, lastRun }).length === 0 && <p className="text-sm text-ink-soft">Feed-ul arată bine. Mulțumim!</p>}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-semibold text-ink">Cele mai accesate produse (30 de zile)</h3>
          {d.top.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Încă nu există clicuri spre magazinul tău.</p>
          ) : (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
              {d.top.map((p) => (
                <li key={p.product_id}>
                  <Link href={`/p/${p.slug}`} className="text-brand-700 underline">
                    {p.title}
                  </Link>{' '}
                  <span className="text-muted">({p.clicks} clicuri)</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h3 className="font-semibold text-ink">Ultimele citiri ale feed-ului</h3>
          {d.runs.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Prima citire este programată.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {d.runs.map((r) => (
                <li key={r.started_at}>
                  {formatDateTime(r.started_at)}: {r.status === 'success' ? 'reușită' : r.status === 'partial' ? 'parțială' : r.status === 'held' ? 'oprită pentru verificare' : 'eșuată'}, {r.stats?.parsed ?? 0}{' '}
                  produse citite
                </li>
              ))}
            </ul>
          )}
          <form action={pullNow} className="mt-3">
            <Button type="submit" variant="secondary" size="sm">
              Citește feed-ul acum
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}

export default async function MerchantPortalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalUser();
  const [m, open, params] = await Promise.all([merchantOf(user.id), portalOpen(), searchParams]);
  const uploadHours = await uploadFreshnessHours(m);
  const ok = typeof params.ok === 'string' ? OK[params.ok] : undefined;
  const err = typeof params.eroare === 'string' ? ERR[params.eroare] : undefined;
  const checking = [m?.validation?.status, m?.domainCheck?.status].some((s) => s === 'queued' || s === 'running');
  const editable = !m || m.status === 'draft' || m.status === 'rejected';
  return (
    <>
      <PageHeader eyebrow="Pentru magazine" title={m?.shopName ?? 'Contul magazinului'} lead={m?.domain ? `Domeniu: ${m.domain}` : 'Listare gratuită, cu feed-ul pe care îl ai deja.'}>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
          {m && (
            <span className="rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-800 ring-1 ring-brand-200" data-testid="merchant-status">
              {STATUS_LABELS[m.status]}
            </span>
          )}
          <span>Autentificat ca {user.email}</span>
          <SignOutButton />
        </div>
      </PageHeader>
      <Container className="space-y-6 py-8 sm:py-10">
        {checking && <AutoRefresh />}
        {ok && (
          <p role="status" className="rounded-lg bg-brand-50 px-4 py-3 text-sm font-medium text-brand-900 ring-1 ring-brand-200">
            {ok}
          </p>
        )}
        {err && (
          <p role="alert" className="rounded-lg bg-high-bg px-4 py-3 text-sm font-medium text-high ring-1 ring-red-200">
            {err}
          </p>
        )}
        {!m && !open && (
          <Callout tone="info" title="Înscrierile online se deschid în curând">
            <p>
              Poți pregăti deja datele magazinului. Dacă vrei să fii listat acum, <Link href="/contact?subiect=merchant">scrie-ne</Link> și configurăm noi feed-ul.
            </p>
          </Callout>
        )}
        {m?.status === 'rejected' && (
          <Callout tone="neutral" title="Cererea nu a fost aprobată">
            <p data-testid="status-reason">{m.statusReason}</p>
            <p>Corectează datele de mai jos și trimite din nou. Dacă nu ești de acord, răspunde la emailul primit sau scrie-ne.</p>
          </Callout>
        )}
        {m?.status === 'suspended' && (
          <Callout tone="neutral" title="Listarea este suspendată">
            <p data-testid="status-reason">{m.statusReason}</p>
            <p>
              Ofertele tale nu mai apar pe Pretoscop și nu mai citim feed-ul până la reluare. După ce ai corectat problema sau dacă vrei să contești
              decizia, <Link href="/contact?subiect=merchant">scrie-ne</Link>.
            </p>
          </Callout>
        )}
        {m?.status === 'pending' && (
          <section id="stare" className="space-y-4 rounded-[var(--radius-card)] bg-canvas p-5 ring-1 ring-line sm:p-6">
            <h2 className="text-lg font-semibold text-ink">Cererea este în așteptarea aprobării</h2>
            <p className="text-[15px] text-ink-soft">
              Am primit-o la {m.submittedAt ? formatDateTime(m.submittedAt) : '—'}. O verificăm de obicei în una-două zile lucrătoare și îți scriem la {m.contactEmail}.
            </p>
            <FeedReportView validation={m.validation} />
          </section>
        )}
        {editable && <Onboarding m={m} email={user.email} open={open} uploadHours={uploadHours} />}
        {m && (m.status === 'approved' || m.status === 'suspended') && (
          <>
            {m.status === 'approved' && <Dashboard m={m} />}
            <section className="space-y-4 rounded-[var(--radius-card)] bg-canvas p-5 ring-1 ring-line sm:p-6" id="pas-3" aria-labelledby="feed-titlu">
              <h2 id="feed-titlu" className="text-lg font-semibold text-ink">
                Feed-ul
              </h2>
              <FeedForms m={m} uploadHours={uploadHours} />
              <FeedReportView validation={m.validation} />
            </section>
            <section className="space-y-4 rounded-[var(--radius-card)] bg-canvas p-5 ring-1 ring-line sm:p-6" id="pas-4" aria-labelledby="setari-titlu">
              <h2 id="setari-titlu" className="text-lg font-semibold text-ink">
                Prețuri și livrare
              </h2>
              <SettingsForm m={m} />
              {m.shippingRules?.free_over != null && <p className="text-sm text-muted">Livrare gratuită de la {formatLei(Math.round(m.shippingRules.free_over * 100))}.</p>}
            </section>
          </>
        )}
        <p className="text-sm text-muted">
          <Link href="/pentru-magazine/termeni" className="text-brand-700 underline">
            Termenii pentru magazine
          </Link>{' '}
          ·{' '}
          <Link href="/cum-functioneaza" className="text-brand-700 underline">
            Cum ordonăm ofertele
          </Link>{' '}
          ·{' '}
          <Link href="/contact?subiect=merchant" className="text-brand-700 underline">
            Reclamații și întrebări
          </Link>
        </p>
      </Container>
    </>
  );
}
