import { eq, merchants, sql, users } from '@pretoscop/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { FeedReportView } from '@/components/merchant/feed-report';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { FORMAT_LABELS, REASON_CATEGORIES, STATUS_LABELS } from '@/lib/merchant-hints';
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
  suspendat: 'Listarea a fost suspendată (feed oprit); magazinul a primit motivele pe email.',
  reluat: 'Listarea a fost reluată; prima citire e programată.',
  domeniu: 'Domeniul a fost marcat ca verificat manual.',
  verificare: 'Verificarea feed-ului a fost programată.',
  rulare: 'Citirea feed-ului a fost programată.',
};
const ERR: Record<string, string> = {
  motiv: 'Alege o categorie și descrie faptele (cel puțin 15 caractere): magazinul primește motivarea.',
  nota: 'Descrie cum ai verificat domeniul (cel puțin 10 caractere).',
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
  const ok = q.ok ? OK[q.ok] : undefined;
  const err = q.eroare ? (ERR[q.eroare] ?? q.mesaj ?? q.eroare) : undefined;
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

      <section className="space-y-3">
        <h2 className="font-semibold">Ultima verificare a feed-ului</h2>
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
              <p className="text-sm text-ink-soft">
                Aprobarea creează magazinul (sau folosește magazinul existent cu domeniul {m.domain}, dacă este activ) și sursa de feed, citită de 6 ori pe zi.
              </p>
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
