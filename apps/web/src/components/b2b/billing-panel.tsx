import { B2B_PLANS, type B2bPlan } from '@pretoscop/core';
import { listB2bInvoices } from '@pretoscop/db';
import { openBillingPortalAction, startSubscriptionAction } from '@/app/b2b/actions';
import { Button } from '@/components/ui/button';
import type { B2bContext } from '@/lib/b2b';
import { billingProvider, selfServePrices } from '@/lib/b2b-billing-server';
import { db } from '@/lib/db';
import { formatDate, formatEur } from '@/lib/format';

const STATUS: Record<string, string> = {
  none: 'fără abonament online',
  checkout: 'plată în curs',
  active: 'activ',
  past_due: 'plată restantă (reîncercăm automat)',
  unpaid: 'neplătit',
  canceled: 'încheiat',
  incomplete: 'plată neconfirmată',
};

const money = (amount: string, currency: string) => (currency === 'EUR' ? formatEur(Number(amount)) : `${amount.replace('.', ',')} ${currency}`);

const FISCAL: Record<string, string> = { to_issue: 'factura fiscală urmează', issued: 'emisă', sent: 'trimisă în e-Factura', accepted: 'acceptată în e-Factura', rejected: 'de corectat' };

/** Subscription state, the self-serve plans (M28 billing) and the workspace's invoices. Server component. */
export async function BillingPanel({ ctx, status }: { ctx: B2bContext; status?: string }) {
  const w = ctx.workspace;
  const [provider, invoices] = await Promise.all([billingProvider(), listB2bInvoices(db(), w.id)]);
  const prices = selfServePrices();
  const live = w.billingSubscriptionId !== null && ['active', 'past_due', 'unpaid', 'checkout'].includes(w.billingStatus);
  const plans = (Object.keys(prices) as B2bPlan[]).filter((p) => B2B_PLANS[p].selfServe);
  const billingData = Boolean(w.companyName && w.cui && w.billingAddress);
  return (
    <div className="mt-3 space-y-3 text-sm text-ink-soft" data-testid="b2b-billing">
      {status === 'ok' && (
        <p role="status" className="rounded-lg bg-good-bg px-3 py-2 text-good">
          Mulțumim! Plata se confirmă în câteva secunde; planul se schimbă după confirmarea procesatorului de plăți.
        </p>
      )}
      {status === 'anulat' && <p className="rounded-lg bg-surface px-3 py-2">Plata a fost anulată; nu s-a schimbat nimic.</p>}
      <p>
        Abonament online: <strong>{STATUS[w.billingStatus] ?? w.billingStatus}</strong>
        {w.billingPeriodEnd && live ? ` (perioada plătită până la ${formatDate(w.billingPeriodEnd)})` : ''}.
        {w.plan === 'pilot' && ' Planul pilot este gratuit și stabilit împreună cu echipa Pretoscop.'}
        {w.plan === 'enterprise' && ' Planul Enterprise se facturează prin contract.'}
      </p>
      {ctx.canManage && provider && live && w.billingCustomerId && (
        <form action={openBillingPortalAction}>
          <input type="hidden" name="ws" value={w.id} />
          <Button type="submit" variant="secondary" size="sm">
            Gestionează abonamentul (card, facturi, oprire)
          </Button>
        </form>
      )}
      {ctx.canManage && provider && !live && plans.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {plans.map((p) => (
            <form key={p} action={startSubscriptionAction}>
              <input type="hidden" name="ws" value={w.id} />
              <input type="hidden" name="plan" value={p} />
              <Button type="submit" size="sm" disabled={!billingData}>
                Abonează-te la {B2B_PLANS[p].label} — {formatEur(B2B_PLANS[p].monthlyEurCents! / 100, 0)} / lună + TVA
              </Button>
            </form>
          ))}
          {!billingData && <p className="w-full text-[13px] text-muted">Completează mai jos datele de facturare (firma, CUI, sediul) ca să te poți abona.</p>}
        </div>
      )}
      {!provider && w.plan !== 'pilot' && w.plan !== 'enterprise' && <p>Plata online nu este încă disponibilă; scrie-ne la contact@pretoscop.ro.</p>}
      {invoices.length > 0 && (
        <table className="w-full text-left text-[13px]" data-testid="b2b-invoices">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-1">Plătită</th>
              <th>Perioada</th>
              <th>Plan</th>
              <th>Total</th>
              <th>Factura fiscală</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {invoices.map((i) => (
              <tr key={i.id}>
                <td className="py-1">{i.paidAt ? formatDate(i.paidAt) : '—'}</td>
                <td>{i.periodStart && i.periodEnd ? `${formatDate(i.periodStart)} – ${formatDate(i.periodEnd)}` : '—'}</td>
                <td>{B2B_PLANS[i.plan].label}</td>
                <td className="tabular">{money(i.totalAmount, i.currency)}</td>
                <td>{i.fiscalNumber ? `${i.fiscalNumber} (${FISCAL[i.efacturaStatus] ?? i.efacturaStatus})` : FISCAL[i.efacturaStatus]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
