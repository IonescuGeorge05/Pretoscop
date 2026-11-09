import { B2B_PLANS } from '@pretoscop/core';
import { bucharestToday, listB2bApiKeys, listB2bApiUsage } from '@pretoscop/db';
import type { Metadata } from 'next';
import { revokeApiKeyAction } from '@/app/b2b/actions';
import { CreateKeyForm } from '@/components/b2b/create-key-form';
import { Flash, Panel, StatBox, WorkspaceNav } from '@/components/b2b/ui';
import { Button } from '@/components/ui/button';
import { requireB2bData } from '@/lib/b2b';
import { db, serverEnv } from '@/lib/db';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'API' };

export default async function ApiPage({ params, searchParams }: { params: Promise<{ ws: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { ws } = await params;
  const sp = await searchParams;
  const ctx = await requireB2bData(ws);
  const w = ctx.workspace;
  const [keys, usage] = await Promise.all([listB2bApiKeys(db(), w.id), listB2bApiUsage(db(), w.id, 30)]);
  const today = usage.find((u) => u.day === bucharestToday());
  const base = `${serverEnv().PUBLIC_BASE_URL}/api/v1/b2b`;
  const quota = ctx.limits.apiDailyQuota;
  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-xl font-bold">API</h1>
      <WorkspaceNav ws={w.id} current="api" />
      <Flash ok={sp.ok} eroare={sp.eroare} />
      {quota <= 0 ? (
        <Panel title="Acces API">
          <p className="text-sm text-ink-soft">Planul {B2B_PLANS[w.plan].label} nu include acces API. Planurile Pro și Enterprise îl includ; scrie-ne pentru o schimbare de plan.</p>
        </Panel>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatBox label="Cereri azi" value={`${today?.requests ?? 0} / ${quota.toLocaleString('ro-RO')}`} testId="b2b-api-today" />
            <StatBox label="Refuzate azi (peste cotă)" value={today?.refused ?? 0} />
            <StatBox label="Pe minut, pe cheie" value={ctx.limits.apiPerMinute} />
          </div>
          <Panel title="Chei API">
            {ctx.canManage && <CreateKeyForm ws={w.id} />}
            <ul className="mt-4 divide-y divide-line text-sm" data-testid="b2b-keys">
              {keys.length === 0 && <li className="py-2 text-ink-soft">Nicio cheie încă.</li>}
              {keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="font-semibold">{k.name}</span>
                  <code className="text-xs text-muted">{k.prefix}</code>
                  <span className="text-xs text-muted">
                    creată {formatDateTime(k.createdAt)}
                    {k.lastUsedAt ? ` · folosită ${formatDateTime(k.lastUsedAt)}` : ' · nefolosită'}
                    {k.revokedAt ? ` · revocată ${formatDateTime(k.revokedAt)}` : ''}
                  </span>
                  {!k.revokedAt && ctx.canManage && (
                    <form action={revokeApiKeyAction} className="ml-auto">
                      <input type="hidden" name="ws" value={w.id} />
                      <input type="hidden" name="key" value={k.id} />
                      <Button type="submit" size="sm" variant="ghost" className="text-high">
                        Revocă
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
      <Panel title="Documentație">
        <div className="space-y-2 text-sm text-ink-soft">
          <p>
            Trimite cheia în antetul <code>Authorization: Bearer psk_…</code>. Răspunsurile sunt JSON; sumele sunt în lei, cu TVA, ca text zecimal (
            <code>&quot;1234.56&quot;</code>), iar orele în UTC (ISO 8601). Fiecare cerere se scade din cota zilnică (ziua după ora României); peste cotă primești{' '}
            <code>429</code> cu <code>Retry-After</code>.
          </p>
          <ul className="list-inside list-disc">
            <li>
              <code>GET /positions</code> — tabelul de poziții (paginare: <code>limit</code>, <code>offset</code>)
            </li>
            <li>
              <code>GET /skus</code>, <code>POST /skus</code> — lista de SKU-uri și adăugarea lor (GTIN/MPN)
            </li>
            <li>
              <code>GET /skus/{'{id}'}</code>, <code>DELETE /skus/{'{id}'}</code>, <code>GET /skus/{'{id}'}/history</code> — un SKU, cu ofertele concurenței și istoricul
            </li>
            <li>
              <code>GET /changes?since=…</code> — schimbările de preț și stoc observate (cel mult 7 zile în urmă)
            </li>
            <li>
              <code>GET /usage</code> — cota și consumul
            </li>
          </ul>
          <p>
            Schema completă (OpenAPI 3.1):{' '}
            <a href="/api/v1/b2b/openapi.json" className="text-brand-700 underline">
              /api/v1/b2b/openapi.json
            </a>
            . Exemplu: <code className="break-all">curl -H &quot;Authorization: Bearer $CHEIE&quot; {base}/positions?limit=50</code>
          </p>
        </div>
      </Panel>
    </div>
  );
}
