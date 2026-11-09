import type { B2bContext } from '@/lib/b2b';

/** Subscription state of the workspace (M28 billing). */
export function BillingPanel({ ctx }: { ctx: B2bContext; status?: string }) {
  const w = ctx.workspace;
  if (w.plan === 'pilot') return <p className="mt-2 text-sm text-ink-soft">Planul pilot este gratuit și stabilit împreună cu echipa Pretoscop.</p>;
  return <p className="mt-2 text-sm text-ink-soft">Abonament: {w.billingStatus}. Pentru schimbări scrie-ne la contact@pretoscop.ro.</p>;
}
