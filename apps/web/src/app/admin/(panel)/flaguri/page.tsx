import { asc, featureFlags } from '@pretoscop/db';
import { Section, Table, Td } from '@/components/admin/ui';
import { db } from '@/lib/db';
import { setFlagAction } from '../../actions';

export default async function FlagsPage() {
  const flags = await db().select().from(featureFlags).orderBy(asc(featureFlags.key));
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Flaguri</h1>
      <Section title="Funcționalități (implicit oprite pentru tot ce atinge magazine, bani sau email)">
        <Table head={['Cheie', 'Descriere', 'Stare', '']}>
          {flags.map((f) => (
            <tr key={f.key}>
              <Td className="font-mono text-xs">{f.key}</Td>
              <Td className="text-ink-soft">{f.description}</Td>
              <Td>{f.enabled ? <strong className="text-good">pornit</strong> : <span className="text-muted">oprit</span>}</Td>
              <Td>
                <form action={setFlagAction}>
                  <input type="hidden" name="key" value={f.key} />
                  <input type="hidden" name="enabled" value={f.enabled ? '0' : '1'} />
                  <button className="rounded bg-surface px-2 py-1 text-xs font-semibold ring-1 ring-line" data-testid={`flag-${f.key}`}>
                    {f.enabled ? 'Oprește' : 'Pornește'}
                  </button>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}
