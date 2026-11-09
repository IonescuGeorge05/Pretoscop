import { B2B_PLANS } from '@pretoscop/core';
import { listB2bInvites, listB2bMembers } from '@pretoscop/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { inviteMemberAction, removeMemberAction, saveBillingAction, setDigestAction } from '@/app/b2b/actions';
import { BillingPanel } from '@/components/b2b/billing-panel';
import { Field, Flash, inputClass, Panel, WorkspaceNav } from '@/components/b2b/ui';
import { Button } from '@/components/ui/button';
import { requireB2bWorkspace } from '@/lib/b2b';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Setări' };

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await requireB2bWorkspace(ws);
  const w = ctx.workspace;
  const [members, invites] = await Promise.all([listB2bMembers(db(), w.id), ctx.canManage ? listB2bInvites(db(), w.id) : Promise.resolve([])]);
  const plan = B2B_PLANS[w.plan];
  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-bold">Setări</h1>
      <WorkspaceNav ws={w.id} current="setari" />
      <Flash ok={sp.ok} eroare={sp.eroare} />
      {ctx.membership && (
        <Panel title="Rezumatul zilnic pe email">
          <form action={setDigestAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="ws" value={w.id} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="digest" defaultChecked={ctx.membership.digest} className="accent-brand-600" data-testid="b2b-digest-toggle" aria-labelledby="b2b-digest-text" />
              <span id="b2b-digest-text">Vreau în fiecare dimineață un email cu schimbările de preț și stoc observate în ultimele 24 de ore la produsele urmărite.</span>
            </label>
            <Button type="submit" size="sm" variant="secondary">
              Salvează
            </Button>
          </form>
        </Panel>
      )}
      <Panel title="Membri">
        <ul className="divide-y divide-line text-sm" data-testid="b2b-members">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2">
              <span>{m.email}</span>
              <span className="text-xs text-muted">{m.role === 'owner' ? 'proprietar' : 'membru'}</span>
              {(ctx.canManage || m.userId === ctx.user.id) && (
                <form action={removeMemberAction} className="ml-auto">
                  <input type="hidden" name="ws" value={w.id} />
                  <input type="hidden" name="user" value={m.userId} />
                  <Button type="submit" size="sm" variant="ghost" className="text-high">
                    {m.userId === ctx.user.id ? 'Ieși din spațiu' : 'Elimină'}
                  </Button>
                </form>
              )}
            </li>
          ))}
          {invites.map((i) => (
            <li key={`i${i.id}`} className="flex flex-wrap items-center gap-3 py-2 text-muted">
              <span>{i.email}</span>
              <span className="text-xs">invitat ({i.role === 'owner' ? 'proprietar' : 'membru'}) {formatDateTime(i.createdAt)}</span>
            </li>
          ))}
        </ul>
        {ctx.canManage && (
          <form action={inviteMemberAction} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="ws" value={w.id} />
            <Field id="invite-email" label="Invită un coleg (email)">
              <input id="invite-email" name="email" type="email" required aria-labelledby="invite-email-label" className={`${inputClass} w-72`} />
            </Field>
            <select name="role" aria-label="Rol" className="h-10 rounded-lg border border-line bg-white px-2 text-sm">
              <option value="member">membru</option>
              <option value="owner">proprietar</option>
            </select>
            <Button type="submit" variant="secondary">
              Invită
            </Button>
          </form>
        )}
        <p className="mt-3 text-[13px] text-muted">
          Invitatul intră pe <Link href="/b2b/autentificare" className="underline">pretoscop.ro/b2b</Link> cu adresa invitată; accesul se activează la prima
          autentificare. Nu trimitem emailuri de invitație.
        </p>
      </Panel>
      <Panel title="Planul">
        <p className="text-sm text-ink-soft" data-testid="b2b-plan">
          {plan.label}: până la {ctx.limits.skuLimit.toLocaleString('ro-RO')} SKU-uri
          {ctx.limits.apiDailyQuota > 0 ? `, API cu ${ctx.limits.apiDailyQuota.toLocaleString('ro-RO')} de cereri pe zi` : ', fără API'}, rezumat zilnic și export CSV.
          {w.termsAcceptedAt && ` Termenii acceptați la ${formatDateTime(w.termsAcceptedAt)} (${w.termsVersion}).`}
        </p>
        <BillingPanel ctx={ctx} status={sp.plata} />
      </Panel>
      <Panel title="Date de facturare">
        {ctx.canManage ? (
          <form action={saveBillingAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="ws" value={w.id} />
            <Field id="companyName" label="Firma">
              <input id="companyName" name="companyName" aria-labelledby="companyName-label" defaultValue={w.companyName ?? ''} className={inputClass} />
            </Field>
            <Field id="cui" label="CUI">
              <input id="cui" name="cui" aria-labelledby="cui-label" defaultValue={w.cui ?? ''} className={inputClass} />
            </Field>
            <Field id="regCom" label="Nr. Registrul Comerțului">
              <input id="regCom" name="regCom" aria-labelledby="regCom-label" defaultValue={w.regCom ?? ''} className={inputClass} />
            </Field>
            <Field id="billingEmail" label="Email pentru facturi">
              <input id="billingEmail" name="billingEmail" type="email" aria-labelledby="billingEmail-label" defaultValue={w.billingEmail ?? ''} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="billingAddress" label="Sediul social (adresa de pe factură)">
                <input id="billingAddress" name="billingAddress" aria-labelledby="billingAddress-label" defaultValue={w.billingAddress ?? ''} className={inputClass} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Salvează datele de facturare</Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-ink-soft">Datele de facturare le gestionează proprietarul spațiului de lucru.</p>
        )}
      </Panel>
    </div>
  );
}
