import { eq, existingShopForMerchantDomain, listingReportProblem, merchants, sql, users } from '@pretoscop/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { FeedReportView } from '@/components/merchant/feed-report';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { FORMAT_LABELS, REASON_CATEGORIES, REPORT_PROBLEM_LABELS, STATUS_LABELS } from '@/lib/merchant-hints';
import {
  approveMerchantAction,
  recheckMerchantFeed,
  reinstateMerchantAction,
  rejectMerchantAction,
  runMerchantFeedNow,
  suspendMerchantAction,
  verifyDomainManually,
} from '../../../merchant-actions';

const OK: Record<string, string> = {
  aprobat: 'Magazinul a fost aprobat: sursa de feed este creată, prima citire e programată, magazinul a primit emailul.',
  respins: 'Cererea a fost respinsă; magazinul a primit motivele pe email.',
  suspendat: 'Listarea a fost suspendată: feed oprit, ofertele ascunse imediat; magazinul a primit motivele pe email.',
  reluat: 'Listarea a fost reluată; ofertele revin după prima citire, care e programată.',
  domeniu: 'Domeniul a fost marcat ca verificat manual.',
  verificare: 'Verificarea feed-ului a fost programată.',
  rulare: 'Citirea feed-ului a fost programată.',
};
/** Every message this page can show: codes only, never free text from the URL. */
const ERR: Record<string, string> = {
  motiv: 'Alege o categorie și descrie faptele (cel puțin 15 caractere): magazinul primește motivarea.',
  nota: 'Descrie cum ai verificat domeniul (cel puțin 10 caractere).',
  fara_domeniu: 'Magazinul nu are încă un domeniu.',
  domeniu_schimbat: 'Domeniul s-a schimbat între timp; verifică din nou ce confirmi.',
  not_found: 'Magazinul nu există.',
  bad_status: 'Starea cererii s-a schimbat între timp; reîncarcă pagina.',
  domain_unverified: 'Domeniul nu este verificat.',
  no_feed: 'Magazinul nu are o adresă de feed sau un fișier.',
  incomplete: 'Lipsește numele magazinului.',
  shop_closed: 'Domeniul aparține unui magazin din registru care nu este activ sau are accesul oprit: activează-l în YAML-ul lui (status: active, access_mode: feed_only) și rulează shops:sync.',
  domain_taken: 'Un alt comerciant este deja listat cu acest domeniu.',
  domain_suspended: 'Un alt comerciant cu acest domeniu este suspendat: rezolvă întâi suspendarea lui.',
  stale_report: 'Ultima verificare a feed-ului nu corespunde feed-ului și domeniului actuale sau nu are oferte pe domeniu: cere o verificare nouă.',
  confirm_existing: 'Domeniul aparține unui magazin pe care îl urmărim deja: bifează confirmarea de atașare (vezi avertismentul).',
};

const btn = 'h-9 rounded-lg px-3 text-sm font-semibold';

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="font-semibold text-ink">{term}</dt>
      <dd className="text-ink-soft">{children}</dd>
    </div>
  );
}

function ReasonForm({ action, merchantId, label, testid }: { action: (form: FormData) => Promise<void>; merchantId: number; label: string; testid: string }) {
  return (
    <form action={action} className="space-y-2 rounded-lg bg-surface p-3 ring-1 ring-line">
      <input type="hidden" name="merchantId" value={merchantId} />
      <label className="block text-sm font-semibold" htmlFor={`${testid}-category`}>
        Motivul (P2B art. 4)
      </label>
      <select id={`${testid}-category`} name="category" required className="h-9 w-full rounded-lg border border-line bg-white px-2 text-sm">
        {Object.entries(REASON_CATEGORIES).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <label id={`${testid}-facts-label`} className="block text-sm font-semibold" htmlFor={`${testid}-facts`}>
        Faptele pe care se sprijină decizia (le primește magazinul)
      </label>
      <textarea id={`${testid}-facts`} aria-labelledby={`${testid}-facts-label`} name="facts" required minLength={15} rows={3} className="w-full rounded-lg border border-line bg-white p-2 text-sm" />
      <button type="submit" className={`${btn} bg-high text-white`} data-testid={testid}>
        {label}
      </button>
    </form>
  );
}

export default async function MerchantAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const merchantId = Number(id);
  if (!Number.isInteger(merchantId)) notFound();
  const [row] = await db()
    .select({ m: merchants, email: users.email })
    .from(merchants)
    .innerJoin(users, eq(users.id, merchants.userId))
    .where(eq(merchants.id, merchantId));
  if (!row) notFound();
  const m = row.m;
  const source = m.shopId
    ? (
        await db().execute<{ key: string; url: string; enabled: boolean; kill_switch: boolean; health: string; schedule: string | null; slug: string }>(sql`
          SELECT s.key, s.url, s.enabled, s.kill_switch, s.health, s.schedule, p.slug FROM shop_sources s JOIN shops p ON p.id = s.shop_id
          WHERE s.config->>'origin' = 'merchant' AND (s.config->>'merchantId')::bigint = ${m.id}`)
      ).rows[0]
    : undefined;
  // Approving onto a shop we already crawl attaches a stranger's feed to it: say so, loudly.
  const existing = m.status === 'pending' && m.domain ? await existingShopForMerchantDomain(db(), m.domain) : null;
  const problem = m.status === 'pending' ? listingReportProblem(m) : null;
  const ok = q.ok ? OK[q.ok] : undefined;
  const err = q.eroare ? ERR[q.eroare] : undefined;
  const hidden = <input type="hidden" name="merchantId" value={m.id} />;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/comercianti" className="text-sm text-brand-700 hover:underline">
          ← Magazine partenere
        </Link>
        <h1 className="mt-1 text-xl font-bold">
          {m.shopName ?? `Magazin #${m.id}`} <span className="text-base font-normal text-muted">({STATUS_LABELS[m.status]})</span>
        </h1>
      </div>
      {ok && (
        <p role="status" className="rounded-lg bg-good-bg px-3 py-2 text-sm text-good">
          {ok}
        </p>
      )}
      {err && (
        <p role="alert" className="rounded-lg bg-high-bg px-3 py-2 text-sm text-high">
          {err}
        </p>
      )}
      <dl className="grid gap-x-6 gap-y-2 rounded-lg bg-white p-4 text-sm ring-1 ring-line sm:grid-cols-[11rem_minmax(0,1fr)]">
        <Row term="Cont">{row.email}</Row>
        <Row term="Firma">
          {m.companyName ?? '—'} · CUI {m.cui ?? '—'}
        </Row>
        <Row term="Contact">{[m.contactName, m.contactEmail, m.contactPhone].filter(Boolean).join(' · ')}</Row>
        <Row term="Site">{m.websiteUrl ?? '—'}</Row>
        <Row term="Domeniu">
          {m.domain ?? '—'} · {m.domainVerifiedAt ? `verificat ${m.verificationMethod} (${formatDateTime(m.domainVerifiedAt)})` : 'NEVERIFICAT'}
        </Row>
        <Row term="Feed">
          {m.feedUrl ?? (m.feedUploadKey ? `fișier încărcat (${m.feedUploadKey})` : '—')} · {m.feedFormat ? FORMAT_LABELS[m.feedFormat] : 'format detectat automat'} · prețuri{' '}
          {m.priceFormat ?? 'auto'}
        </Row>
        <Row term="Livrare declarată">{JSON.stringify(m.shippingRules ?? {})}</Row>
        <Row term="Termeni">{m.termsVersion ? `${m.termsVersion}, acceptați ${m.termsAcceptedAt ? formatDateTime(m.termsAcceptedAt) : '—'}` : '—'}</Row>
        {m.statusReason && <Row term="Motivarea">{m.statusReason}</Row>}
        {source && (
          <Row term="Sursă">
            <Link href="/admin/surse" className="text-brand-700 hover:underline">
              {source.key}
            </Link>{' '}
            · {source.enabled ? 'activă' : 'oprită'}
            {source.kill_switch ? ' · KILL SWITCH' : ''} · {source.health} · {source.schedule ?? 'fără program (fișier)'}
          </Row>
        )}
      </dl>

      {existing && (
        <section role="alert" data-testid="existing-shop-warning" className="space-y-2 rounded-lg border-2 border-high bg-high-bg p-4 text-sm text-high">
          <h2 className="text-base font-bold">
            Atenție: domeniul {m.domain} aparține magazinului „{existing.shop.name}” ({existing.shop.slug}), pe care îl urmărim deja
          </h2>
          <p>
            Aprobarea atașează feed-ul acestui comerciant la magazinul existent ({existing.shop.status}, acces {existing.shop.accessMode}): ofertele lui vor apărea sub numele
            „{existing.shop.name}”. Aprobă doar dacă ești sigur că persoana reprezintă magazinul (domeniul este verificat {m.verificationMethod ?? '—'}).
          </p>
          <p className="font-semibold">Surse existente ale magazinului:</p>
          <ul className="list-disc pl-5">
            {existing.sources.length === 0 && <li>niciuna</li>}
            {existing.sources.map((s) => (
              <li key={s.key}>
                {s.key} · {s.kind} · {s.enabled ? 'activă' : 'oprită'}
                {s.killSwitch ? ' · KILL SWITCH' : ''}
                {(s.config as { origin?: string } | null)?.origin === 'merchant' ? ' · feed de comerciant' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Ultima verificare a feed-ului</h2>
        {problem && (
          <p className="text-sm font-semibold text-high" data-testid="report-problem">
            Nu poate fi aprobat încă: {REPORT_PROBLEM_LABELS[problem]}
          </p>
        )}
        <FeedReportView validation={m.validation} showDetail />
        <form action={recheckMerchantFeed}>
          {hidden}
          <button type="submit" className={`${btn} bg-white ring-1 ring-line`}>
            Verifică din nou
          </button>
        </form>
      </section>

      {!m.domainVerifiedAt && m.domain && (
        <form action={verifyDomainManually} className="space-y-2 rounded-lg bg-white p-4 ring-1 ring-line">
          {hidden}
          <input type="hidden" name="domain" value={m.domain} />
          <label id="note-label" className="block text-sm font-semibold" htmlFor="note">
            Verificare manuală a domeniului {m.domain} (cum ai confirmat că reprezintă magazinul)
          </label>
          <input id="note" aria-labelledby="note-label" name="note" required minLength={10} className="h-9 w-full rounded-lg border border-line px-2 text-sm" />
          <button type="submit" className={`${btn} bg-white ring-1 ring-line`}>
            Marchează domeniul ca verificat
          </button>
        </form>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {m.status === 'pending' && (
          <>
            <form action={approveMerchantAction} className="space-y-2 rounded-lg bg-white p-4 ring-1 ring-line">
              {hidden}
              {existing ? (
                <label className="flex items-start gap-2 text-sm font-semibold text-high">
                  <input
                    type="checkbox"
                    name="confirmShopId"
                    value={existing.shop.id}
                    required
                    aria-labelledby="confirm-existing-text"
                    className="mt-1"
                    data-testid="confirm-existing"
                  />
                  <span id="confirm-existing-text">
                    Confirm atașarea feed-ului la magazinul existent „{existing.shop.name}” ({existing.shop.slug}).
                  </span>
                </label>
              ) : (
                <p className="text-sm text-ink-soft">Aprobarea creează magazinul {m.domain} și sursa de feed, citită de 6 ori pe zi.</p>
              )}
              <button type="submit" className={`${btn} bg-brand-600 text-white`} data-testid="approve">
                Aprobă
              </button>
            </form>
            <ReasonForm action={rejectMerchantAction} merchantId={m.id} label="Respinge" testid="reject" />
          </>
        )}
        {m.status === 'approved' && (
          <>
            <form action={runMerchantFeedNow} className="rounded-lg bg-white p-4 ring-1 ring-line">
              {hidden}
              <button type="submit" className={`${btn} bg-white ring-1 ring-line`}>
                Citește feed-ul acum
              </button>
            </form>
            <ReasonForm action={suspendMerchantAction} merchantId={m.id} label="Suspendă" testid="suspend" />
          </>
        )}
        {m.status === 'suspended' && (
          <form action={reinstateMerchantAction} className="rounded-lg bg-white p-4 ring-1 ring-line">
            {hidden}
            <button type="submit" className={`${btn} bg-brand-600 text-white`} data-testid="reinstate">
              Reia listarea
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
