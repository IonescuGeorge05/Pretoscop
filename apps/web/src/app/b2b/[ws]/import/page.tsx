import { B2B_IMPORT_MAX_LINES } from '@pretoscop/core';
import { b2bSkuCounts, searchB2bCatalogue } from '@pretoscop/db';
import type { Metadata } from 'next';
import { addCatalogueSkuAction, importSkusAction } from '@/app/b2b/actions';
import { Field, Flash, inputClass, Panel, WorkspaceNav } from '@/components/b2b/ui';
import { Button } from '@/components/ui/button';
import { requireB2bData } from '@/lib/b2b';
import { db } from '@/lib/db';

export const metadata: Metadata = { title: 'Import SKU-uri' };

const EXAMPLE = 'cod_intern;ean;mpn;marca;nume;pret\nTV-55;8806095426280;QE55Q80D;Samsung;Televizor QLED 55";3.999,90';

export default async function ImportPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await requireB2bData(ws);
  const w = ctx.workspace;
  const q = (sp.q ?? '').slice(0, 120);
  const [counts, results] = await Promise.all([b2bSkuCounts(db(), w.id), q ? searchB2bCatalogue(db(), q, 20) : Promise.resolve([])]);
  const summary =
    sp.ok === 'import'
      ? `Adăugate: ${sp.adaugate ?? 0} (găsite în catalog: ${sp.gasite ?? 0}, negăsite încă: ${sp.negasite ?? 0}, ambigue: ${sp.ambigue ?? 0}). Deja urmărite sau repetate: ${sp.duplicate ?? 0}. Rânduri cu erori: ${sp.invalide ?? 0}. Peste limita planului: ${sp.peste_limita ?? 0}.`
      : undefined;
  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-bold">Import SKU-uri</h1>
      <WorkspaceNav ws={w.id} current="import" />
      <Flash ok={sp.ok} eroare={sp.eroare} detail={summary ?? sp.detaliu} />
      {sp.probleme && (
        <p className="mb-4 text-sm text-ink-soft" data-testid="b2b-import-problems">
          Primele probleme: {sp.probleme}
        </p>
      )}
      <p className="mb-4 text-sm text-ink-soft" data-testid="b2b-sku-usage">
        Urmărești {counts.total} din {ctx.limits.skuLimit} SKU-uri ({counts.matched} găsite în catalog, {counts.unmatched + counts.ambiguous} încă negăsite).
      </p>
      {!ctx.canManage ? (
        <p className="text-sm text-ink-soft">Doar proprietarul spațiului de lucru poate adăuga SKU-uri.</p>
      ) : (
        <>
          <Panel title="Lipește lista sau încarcă un fișier">
            <form action={importSkusAction} className="space-y-4" encType="multipart/form-data">
              <input type="hidden" name="ws" value={w.id} />
              <Field
                id="list"
                label="Lista de SKU-uri"
                hint={`Un cod pe rând (GTIN/EAN sau MPN), ori un tabel cu antet: cod intern, EAN, MPN, marcă, nume, preț (separat prin virgulă, punct și virgulă sau tab). Cel mult ${B2B_IMPORT_MAX_LINES.toLocaleString('ro-RO')} de rânduri.`}
              >
                <textarea id="list" name="list" aria-labelledby="list-label" aria-describedby="list-hint" rows={10} placeholder={EXAMPLE} className={`${inputClass} h-auto py-2 font-mono text-[13px]`} />
              </Field>
              <Field id="file" label="sau un fișier CSV / TXT (cel mult 900 KB)">
                <input id="file" name="file" type="file" accept=".csv,.txt,.tsv" aria-labelledby="file-label" className="block text-sm" />
              </Field>
              <Button type="submit">Importă</Button>
            </form>
            <p className="mt-3 text-[13px] text-muted">
              Găsim produsul după GTIN, apoi după marcă și MPN. Ce nu găsim acum rămâne în listă și îl căutăm din nou în fiecare noapte. Coloana preț e opțională:
              prețul tău recomandat (pentru branduri) sau de referință.
            </p>
          </Panel>
          <Panel title="Alege din catalog">
            <form className="mb-3 flex flex-wrap items-end gap-2" role="search">
              <Field id="q" label="Caută după nume, MPN sau GTIN">
                <input id="q" name="q" aria-labelledby="q-label" defaultValue={q} className={`${inputClass} w-80 max-w-full`} />
              </Field>
              <Button type="submit" variant="secondary">
                Caută
              </Button>
            </form>
            {q && results.length === 0 && <p className="text-sm text-ink-soft">Niciun produs găsit.</p>}
            {results.length > 0 && (
              <ul className="divide-y divide-line" data-testid="b2b-catalogue-results">
                {results.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      {p.title}
                      <span className="ml-2 text-xs text-muted">{[p.brand, p.mpn].filter(Boolean).join(' · ')}</span>
                    </span>
                    <form action={addCatalogueSkuAction}>
                      <input type="hidden" name="ws" value={w.id} />
                      <input type="hidden" name="productId" value={p.id} />
                      <input type="hidden" name="q" value={q} />
                      <Button type="submit" size="sm" variant="secondary">
                        Urmărește
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
