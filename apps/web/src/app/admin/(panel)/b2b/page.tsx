import { B2B_PLANS, B2B_PLANS_ORDER } from '@pretoscop/core';
import { b2bWorkspaceSummaries, isFlagEnabled } from '@pretoscop/db';
import Link from 'next/link';
import { createWorkspaceAction } from '@/app/admin/b2b-actions';
import { Section, Table, Td } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';

const ERRORS: Record<string, string> = {
  nume: 'Numele trebuie să aibă cel puțin 2 caractere.',
  plan: 'Plan sau stare necunoscută.',
  email: 'Adresa proprietarului nu este validă.',
  magazin: 'Un spațiu de tip magazin are nevoie de slug-ul unui magazin existent.',
  cui: 'CUI invalid.',
  negasit: 'Spațiul de lucru nu există.',
};

const input = 'h-9 rounded border border-line bg-white px-2 text-sm';

/** B2B workspaces (M28): provisioning, plans, usage. */
export default async function B2bAdminPage({ searchParams }: { searchParams: Promise<{ eroare?: string }> }) {
  // Each admin page checks the session itself: the layout guard does not stop a segment from rendering.
  await requireAdmin();
  const { eroare } = await searchParams;
  const [rows, open, digest, billing] = await Promise.all([
    b2bWorkspaceSummaries(db()),
    isFlagEnabled(db(), 'b2b.enabled'),
    isFlagEnabled(db(), 'b2b.digest.enabled'),
    isFlagEnabled(db(), 'b2b.billing.enabled'),
  ]);
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">B2B</h1>
      <p className="mb-4 text-sm text-ink-soft">
        Flaguri: <code>b2b.enabled</code> {open ? 'pornit' : 'oprit'} (clienții intră în spații și în API), <code>b2b.digest.enabled</code> {digest ? 'pornit' : 'oprit'},{' '}
        <code>b2b.billing.enabled</code> {billing ? 'pornit' : 'oprit'}. Cu flagul oprit, doar administratorii deschid spațiile (previzualizare).
      </p>
      {eroare && (
        <p role="alert" className="mb-4 rounded bg-high-bg px-3 py-2 text-sm text-high">
          {ERRORS[eroare] ?? 'Eroare.'}
        </p>
      )}
      <Section title="Spațiu de lucru nou">
        <form action={createWorkspaceAction} className="grid gap-3 p-4 sm:grid-cols-3" data-testid="b2b-create">
          <label className="text-sm">
            Nume
            <input name="name" aria-label="Nume" required className={`${input} mt-1 block w-full`} />
          </label>
          <label className="text-sm">
            Tip
            <select name="kind" aria-label="Tip" className={`${input} mt-1 block w-full`}>
              <option value="merchant">magazin (prețurile din magazinul lui)</option>
              <option value="brand">brand (prețuri de referință)</option>
            </select>
          </label>
          <label className="text-sm">
            Magazin (slug, pentru tip magazin)
            <input name="shop" aria-label="Magazin (slug)" placeholder="ex. itgalaxy" className={`${input} mt-1 block w-full`} />
          </label>
          <label className="text-sm">
            Plan
            <select name="plan" aria-label="Plan" defaultValue="pilot" className={`${input} mt-1 block w-full`}>
              {B2B_PLANS_ORDER.map((p) => (
                <option key={p} value={p}>
                  {B2B_PLANS[p].label} ({B2B_PLANS[p].skuLimit} SKU)
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Email proprietar (invitație)
            <input name="ownerEmail" aria-label="Email proprietar" type="email" className={`${input} mt-1 block w-full`} />
          </label>
          <label className="text-sm">
            Firma / CUI (opțional)
            <span className="mt-1 flex gap-2">
              <input name="companyName" aria-label="Firma" placeholder="SC Exemplu SRL" className={`${input} w-full`} />
              <input name="cui" aria-label="CUI" placeholder="CUI" className={`${input} w-28`} />
            </span>
          </label>
          <div className="sm:col-span-3">
            <button className="rounded bg-brand-600 px-3 py-2 text-sm font-semibold text-white">Creează</button>
          </div>
        </form>
      </Section>
      <Section title="Spații de lucru">
        <Table head={['Nume', 'Tip / magazin', 'Plan', 'Stare', 'SKU', 'Membri', 'Chei', 'API azi', 'Termeni', 'Creat']}>
          {rows.map((w) => (
            <tr key={w.id} data-testid={`b2b-ws-${w.id}`}>
              <Td>
                <Link href={`/admin/b2b/${w.id}`} className="font-medium text-brand-700 hover:underline">
                  {w.name}
                </Link>
              </Td>
              <Td>
                {w.kind === 'merchant' ? 'magazin' : 'brand'}
                {w.shopName && <div className="text-xs text-muted">{w.shopName}</div>}
              </Td>
              <Td>{B2B_PLANS[w.plan].label}</Td>
              <Td>{w.status}</Td>
              <Td className="tabular">{w.skus}</Td>
              <Td className="tabular">
                {w.members}
                {w.invites > 0 && <span className="text-xs text-muted"> (+{w.invites} invitați)</span>}
              </Td>
              <Td className="tabular">{w.activeKeys}</Td>
              <Td className="tabular">{w.requestsToday}</Td>
              <Td>{w.termsAccepted ? 'da' : 'nu'}</Td>
              <Td className="text-xs">{formatDateTime(w.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}
