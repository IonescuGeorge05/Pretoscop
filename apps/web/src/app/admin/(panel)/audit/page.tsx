import { auditLog, desc } from '@pretoscop/db';
import { Section, Table, Td } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDateTime } from '@/lib/format';

export default async function AuditPage() {
  // Each admin page checks the session itself: the layout guard does not stop a segment from rendering.
  await requireAdmin();
  const rows = await db().select().from(auditLog).orderBy(desc(auditLog.id)).limit(300);
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Audit</h1>
      <Section title="Ultimele 300 de acțiuni">
        <Table head={['Când', 'Cine', 'Acțiune', 'Entitate', 'Înainte → după']}>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap">{formatDateTime(r.ts)}</Td>
              <Td className="font-mono text-xs">{r.actor}</Td>
              <Td>{r.action}</Td>
              <Td className="font-mono text-xs">
                {r.entity}
                {r.entityId ? `#${r.entityId}` : ''}
              </Td>
              <Td className="max-w-lg break-words font-mono text-[11px] text-ink-soft">
                {r.before ? JSON.stringify(r.before).slice(0, 200) : '∅'} → {r.after ? JSON.stringify(r.after).slice(0, 300) : '∅'}
              </Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}
