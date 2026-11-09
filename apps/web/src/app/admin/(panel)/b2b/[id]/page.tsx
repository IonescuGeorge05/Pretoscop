import { B2B_PLANS, B2B_PLANS_ORDER, effectiveLimits } from '@pretoscop/core';
import { b2bSkuCounts, bucharestToday, getB2bWorkspace, listB2bApiKeys, listB2bApiUsage, listB2bInvites, listB2bInvoices, listB2bMembers } from '@pretoscop/db';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminCancelInviteAction, adminInviteAction, adminResolveAction, adminRevokeKeyAction, updateWorkspaceAction } from '@/app/admin/b2b-actions';
import { Section, Stat, Table, Td } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';

const MESSAGES: Record<string, string> = {
  creat: 'Spațiul de lucru a fost creat; proprietarul primește acces la prima autentificare pe /b2b.',
  salvat: 'Salvat.',
  invitat: 'Invitația a fost înregistrată (nu trimitem email: spune-i clientului să intre pe /b2b).',
  rezolvat: 'SKU-urile au fost căutate din nou în catalog.',
  plan: 'Plan sau stare necunoscută.',
  limita: 'Limitele trebuie să fie numere întregi ≥ 0 (gol = ale planului).',
  motiv: 'Suspendarea sau închiderea are nevoie de un motiv (îl vede clientul).',
  magazin: 'Magazinul nu există.',
  email: 'Adresa nu este validă.',
};

const input = 'h-9 rounded border border-line bg-white px-2 text-sm';

export default async function B2bWorkspaceAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; eroare?: string }> }) {
  // Each admin page checks the session itself: the layout guard does not stop a segment from rendering.
  await requireAdmin();
  const { id } = await params;
  const { ok, eroare } = await searchParams;
  const wsId = /^\d{1,12}$/.test(id) ? Number(id) : null;
  const w = wsId === null ? null : await getB2bWorkspace(db(), wsId);
  if (!w) notFound();
  const [members, invites, keys, usage, counts, invoices] = await Promise.all([
    listB2bMembers(db(), w.id),
    listB2bInvites(db(), w.id),
    listB2bApiKeys(db(), w.id),
    listB2bApiUsage(db(), w.id, 30),
    b2bSkuCounts(db(), w.id),
    listB2bInvoices(db(), w.id),
  ]);
  const limits = effectiveLimits(w.plan, { skuLimit: w.skuLimit, apiDailyQuota: w.apiDailyQuota });
  const msg = MESSAGES[(eroare ?? ok) ?? ''];
  return (
    <div>
      <p className="mb-1 text-sm">
        <Link href="/admin/b2b" className="text-brand-700 underline">
          ← B2B
        </Link>
      </p>
      <h1 className="mb-1 text-xl font-bold" data-testid="b2b-admin-name">
        {w.name}
      </h1>
      <p className="mb-4 text-sm text-ink-soft">
        {w.kind === 'merchant' ? `Magazin: ${w.shopName ?? '—'}` : 'Brand'} · {B2B_PLANS[w.plan].label} · {w.status}
        {w.termsAcceptedAt ? ` · termeni acceptați ${formatDateTime(w.termsAcceptedAt)} (${w.termsVersion})` : ' · termeni neacceptați'} ·{' '}
        <Link href={`/b2b/${w.id}`} className="text-brand-700 underline">
          deschide spațiul
        </Link>
      </p>
      {msg && (
        <p role={eroare ? 'alert' : 'status'} className={`mb-4 rounded px-3 py-2 text-sm ${eroare ? 'bg-high-bg text-high' : 'bg-good-bg text-good'}`}>
          {msg}
        </p>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="SKU-uri" value={`${counts.total} / ${limits.skuLimit}`} hint={`${counts.matched} găsite, ${counts.unmatched + counts.ambiguous} negăsite`} />
        <Stat label="API azi" value={`${usage.find((u) => u.day === bucharestToday())?.requests ?? 0} / ${limits.apiDailyQuota}`} />
        <Stat label="Chei active" value={keys.filter((k) => !k.revokedAt).length} />
        <Stat label="Abonament" value={w.billingStatus} hint={w.billingPeriodEnd ? `până la ${formatDateTime(w.billingPeriodEnd)}` : undefined} />
      </div>
      <Section title="Plan, stare și limite">
        <form action={updateWorkspaceAction} className="grid gap-3 p-4 sm:grid-cols-3">
          <input type="hidden" name="ws" value={w.id} />
          <label className="text-sm">
            Nume
            <input name="name" aria-label="Nume" defaultValue={w.name} className={`${input} mt-1 block w-full`} />
          </label>
          <label className="text-sm">
            Plan
            <select name="plan" aria-label="Plan" defaultValue={w.plan} className={`${input} mt-1 block w-full`}>
              {B2B_PLANS_ORDER.map((p) => (
                <option key={p} value={p}>
                  {B2B_PLANS[p].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Stare
            <select name="status" aria-label="Stare" defaultValue={w.status} className={`${input} mt-1 block w-full`}>
              <option value="active">activ</option>
              <option value="suspended">suspendat</option>
              <option value="cancelled">închis</option>
            </select>
          </label>
          <label className="text-sm">
            Limită SKU (gol = {B2B_PLANS[w.plan].skuLimit})
            <input name="skuLimit" aria-label="Limită SKU" defaultValue={w.skuLimit ?? ''} inputMode="numeric" className={`${input} mt-1 block w-full`} />
          </label>
          <label className="text-sm">
            Cotă API pe zi (gol = {B2B_PLANS[w.plan].apiDailyQuota})
            <input name="apiDailyQuota" aria-label="Cotă API pe zi" defaultValue={w.apiDailyQuota ?? ''} inputMode="numeric" className={`${input} mt-1 block w-full`} data-testid="b2b-admin-quota" />
          </label>
          {w.kind === 'merchant' && (
            <label className="text-sm">
              Magazin (slug; gol = neschimbat)
              <input name="shop" aria-label="Magazin (slug)" placeholder={w.shopName ?? ''} className={`${input} mt-1 block w-full`} />
            </label>
          )}
          <label className="text-sm sm:col-span-3">
            Motiv (obligatoriu la suspendare sau închidere; îl vede clientul)
            <input name="statusReason" aria-label="Motiv" defaultValue={w.statusReason ?? ''} className={`${input} mt-1 block w-full`} />
          </label>
          <div className="sm:col-span-3">
            <button className="rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white">Salvează</button>
          </div>
        </form>
      </Section>
      <Section title="Membri și invitații">
        <Table head={['Email', 'Rol', 'Rezumat zilnic', 'De la', '']}>
          {members.map((m) => (
            <tr key={m.userId}>
              <Td>{m.email}</Td>
              <Td>{m.role}</Td>
              <Td>{m.digest ? 'da' : 'nu'}</Td>
              <Td className="text-xs">{formatDateTime(m.createdAt)}</Td>
              <Td> </Td>
            </tr>
          ))}
          {invites.map((i) => (
            <tr key={`i${i.id}`} className="text-muted">
              <Td>{i.email}</Td>
              <Td>{i.role} (invitat)</Td>
              <Td>—</Td>
              <Td className="text-xs">{formatDateTime(i.createdAt)}</Td>
              <Td>
                <form action={adminCancelInviteAction}>
                  <input type="hidden" name="ws" value={w.id} />
                  <input type="hidden" name="invite" value={i.id} />
                  <button className="text-xs text-high underline">anulează</button>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
        <form action={adminInviteAction} className="flex flex-wrap items-end gap-2 p-4">
          <input type="hidden" name="ws" value={w.id} />
          <input name="email" type="email" required placeholder="email" aria-label="Email" className={`${input} w-72`} />
          <select name="role" aria-label="Rol" className={input}>
            <option value="owner">proprietar</option>
            <option value="member">membru</option>
          </select>
          <button className="rounded bg-surface px-3 py-2 text-sm ring-1 ring-line">Invită</button>
        </form>
      </Section>
      <Section title="Chei API">
        <Table head={['Nume', 'Prefix', 'Creată', 'Folosită', 'Revocată', '']}>
          {keys.map((k) => (
            <tr key={k.id}>
              <Td>{k.name}</Td>
              <Td className="font-mono text-xs">{k.prefix}</Td>
              <Td className="text-xs">{formatDateTime(k.createdAt)}</Td>
              <Td className="text-xs">{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : '—'}</Td>
              <Td className="text-xs">{k.revokedAt ? formatDateTime(k.revokedAt) : '—'}</Td>
              <Td>
                {!k.revokedAt && (
                  <form action={adminRevokeKeyAction}>
                    <input type="hidden" name="ws" value={w.id} />
                    <input type="hidden" name="key" value={k.id} />
                    <button className="text-xs text-high underline">revocă</button>
                  </form>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Consum API (30 de zile)">
        <Table head={['Ziua', 'Cereri', 'Refuzate']}>
          {usage.map((u) => (
            <tr key={u.day}>
              <Td>{u.day}</Td>
              <Td className="tabular">{u.requests}</Td>
              <Td className="tabular">{u.refused}</Td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Facturi (plăți confirmate)">
        <Table head={['Plătită', 'Plan', 'Total', 'Factura fiscală', 'Stripe']}>
          {invoices.map((i) => (
            <tr key={i.id}>
              <Td className="text-xs">{i.paidAt ? formatDateTime(i.paidAt) : '—'}</Td>
              <Td>{B2B_PLANS[i.plan].label}</Td>
              <Td className="tabular">
                {i.totalAmount} {i.currency}
              </Td>
              <Td className="text-xs">{i.fiscalNumber ?? i.efacturaStatus}</Td>
              <Td className="font-mono text-xs">{i.providerInvoiceId}</Td>
            </tr>
          ))}
        </Table>
      </Section>
      <form action={adminResolveAction} className="mb-8">
        <input type="hidden" name="ws" value={w.id} />
        <button className="rounded bg-surface px-3 py-2 text-sm ring-1 ring-line">Caută din nou SKU-urile negăsite</button>
      </form>
    </div>
  );
}
