import { B2B_PLANS } from '@pretoscop/core';
import { b2bWorkspacesForUser } from '@pretoscop/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Flash, Panel } from '@/components/b2b/ui';
import { SignOutButton } from '@/components/merchant/sign-out';
import { acceptInvitesFor, b2bOpen, requireB2bUser } from '@/lib/b2b';
import { db } from '@/lib/db';

export const metadata: Metadata = { title: 'Spațiile de lucru' };

const STATUS: Record<string, string> = { active: 'activ', suspended: 'suspendat', cancelled: 'închis' };

export default async function B2bHome({ searchParams }: { searchParams: Promise<{ eroare?: string }> }) {
  const user = await requireB2bUser();
  const { eroare } = await searchParams;
  // The magic link proved the address: open invitations for it become memberships now.
  await acceptInvitesFor(user);
  const [list, open] = await Promise.all([b2bWorkspacesForUser(db(), user.id), b2bOpen()]);
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Spațiile tale de lucru</h1>
        <span className="ml-auto text-sm text-muted">{user.email}</span>
        <SignOutButton to="/b2b/autentificare" />
      </div>
      <Flash eroare={eroare} />
      {!open && !user.isAdmin && (
        <p className="mb-4 rounded-lg bg-white p-4 text-sm text-ink-soft ring-1 ring-line">
          Serviciul pentru companii este în pregătire: îl deschidem treptat, pentru clienții pilot.
        </p>
      )}
      {user.isAdmin && (
        <p className="mb-4 text-sm text-ink-soft">
          Ești administrator: spațiile de lucru se creează din <Link href="/admin/b2b" className="text-brand-700 underline">Admin → B2B</Link>.
        </p>
      )}
      <Panel title="Acces">
        {list.length === 0 ? (
          <p className="text-sm text-ink-soft" data-testid="b2b-no-workspace">
            Adresa ta nu are încă acces la un spațiu de lucru. Dacă firma ta are un abonament, roagă proprietarul contului să te invite; altfel scrie-ne la{' '}
            <a href="mailto:contact@pretoscop.ro" className="text-brand-700 underline">contact@pretoscop.ro</a>.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link href={`/b2b/${w.id}`} className="font-semibold text-brand-700 underline" data-testid="b2b-workspace-link">
                  {w.name}
                </Link>
                <span className="text-xs text-muted">
                  {B2B_PLANS[w.plan].label} · {w.role === 'owner' ? 'proprietar' : 'membru'} · {STATUS[w.status] ?? w.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
