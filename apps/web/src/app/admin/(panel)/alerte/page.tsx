import { alertAdminStats, findUserByEmail } from '@pretoscop/db';
import Link from 'next/link';
import { Section, Stat, Table, Td } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { deleteUserAsAdmin } from '../../alert-actions';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

const STATUS: Record<string, string> = { active: 'active', pending: 'în așteptare', paused: 'oprite' };

/** Admin: alert volumes (M19) and data-subject requests by email (export, delete). */
export default async function AdminAlerts({ searchParams }: Props) {
  const p = await searchParams;
  const s = await alertAdminStats(db());
  const email = one(p.email).trim();
  const found = email ? await findUserByEmail(db(), email) : null;
  const total = (status: string) => s.byStatus.filter((x) => x.status === status).reduce((a, x) => a + x.n, 0);
  const sent = (d: 'd1' | 'd7') => s.sends.filter((x) => x.status === 'sent').reduce((a, x) => a + x[d], 0);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Alerte de preț</h1>
      {one(p.sters) === '1' && <p className="mb-4 rounded-lg bg-good-bg px-3 py-2 text-sm text-good">Utilizatorul și datele lui au fost șterse (rând în audit).</p>}
      {one(p.eroare) && <p className="mb-4 rounded-lg bg-high-bg px-3 py-2 text-sm text-high">Operația nu s-a făcut ({one(p.eroare)}).</p>}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Alerte active" value={total('active').toLocaleString('ro-RO')} hint={`${s.users.toLocaleString('ro-RO')} utilizatori`} />
        <Stat label="În așteptare" value={total('pending').toLocaleString('ro-RO')} hint={`${s.pendingOlder24h} mai vechi de 24 h`} />
        <Stat label="Oprite" value={total('paused').toLocaleString('ro-RO')} />
        <Stat label="Confirmate 7 zile" value={s.confirmed7d.toLocaleString('ro-RO')} />
        <Stat label="Trimise 24 h" value={sent('d1').toLocaleString('ro-RO')} hint={`${sent('d7').toLocaleString('ro-RO')} în 7 zile`} />
        <Stat label="Adrese suprimate" value={s.suppressions.reduce((a, x) => a + x.n, 0).toLocaleString('ro-RO')} hint={s.suppressions.map((x) => `${x.reason} ${x.n}`).join(' · ') || '—'} />
      </div>

      <Section title="Pe canale">
        <Table head={['Stare', 'Canal', 'Alerte']}>
          {s.byStatus.map((x) => (
            <tr key={`${x.status}-${x.channel}`}>
              <Td>{STATUS[x.status] ?? x.status}</Td>
              <Td>{x.channel}</Td>
              <Td className="tabular">{x.n}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Trimiteri (fără simulări)">
        <Table head={['Stare', 'Canal', '24 h', '7 zile']}>
          {s.sends.map((x) => (
            <tr key={`${x.status}-${x.channel}`}>
              <Td>{x.status}</Td>
              <Td>{x.channel}</Td>
              <Td className="tabular">{x.d1}</Td>
              <Td className="tabular">{x.d7}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Retrageri ale acordului (30 de zile)">
        <Table head={['Cum', 'Câte']}>
          {s.withdrawals30d.map((x) => (
            <tr key={x.method}>
              <Td>{x.method}</Td>
              <Td className="tabular">{x.n}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Produse cu cele mai multe alerte active">
        <Table head={['Produs', 'Alerte']}>
          {s.topProducts.map((x) => (
            <tr key={x.productId}>
              <Td>
                <Link href={`/p/${x.slug}`} className="text-brand-700 hover:underline">
                  {x.title}
                </Link>
              </Td>
              <Td className="tabular">{x.n}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Ultimele eșecuri">
        <Table head={['Trimitere', 'Canal', 'Eroare', 'Când']}>
          {s.recentFailures.map((x) => (
            <tr key={x.id}>
              <Td className="tabular">{x.id}</Td>
              <Td>{x.channel}</Td>
              <Td className="max-w-md truncate">{x.error ?? '—'}</Td>
              <Td>{formatDateTime(x.at)}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <section className="mb-8 rounded-lg bg-white p-4 ring-1 ring-line">
        <h2 className="text-base font-semibold">Cerere privind datele personale</h2>
        <p className="mt-1 text-sm text-ink-soft">Caută după adresa de email (de exemplu, o cerere primită din formularul de contact). Verifică identitatea înainte să trimiți date.</p>
        <form method="get" className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="dsr-email" id="dsr-email-label" className="sr-only">
            Adresa de email
          </label>
          <input id="dsr-email" aria-labelledby="dsr-email-label" name="email" type="email" defaultValue={email} className="h-9 w-72 rounded-lg border border-line px-3 text-sm" />
          <button type="submit" className="h-9 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white">
            Caută
          </button>
        </form>
        {email && !found && <p className="mt-3 text-sm text-muted">Nu există un cont cu această adresă.</p>}
        {found && (
          <div className="mt-3 space-y-2 text-sm">
            <p>
              Cont <code>{found.id}</code> · rol {found.role} · creat {formatDateTime(found.createdAt)} · {found.alerts} alerte
            </p>
            <p>
              <a href={`/api/admin/users/${encodeURIComponent(found.id)}/export`} className="text-brand-700 underline" download>
                Exportă datele (JSON)
              </a>
            </p>
            {found.role !== 'admin' && (
              <form action={deleteUserAsAdmin} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="userId" value={found.id} />
                <input id="dsr-confirm" aria-labelledby="dsr-confirm-label" name="confirm" type="checkbox" required className="size-4" />
                <label id="dsr-confirm-label" htmlFor="dsr-confirm">
                  Confirm ștergerea definitivă
                </label>
                <button type="submit" className="h-8 rounded-lg bg-high px-3 text-xs font-semibold text-white">
                  Șterge contul
                </button>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
