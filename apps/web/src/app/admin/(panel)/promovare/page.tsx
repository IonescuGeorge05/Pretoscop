import { randomUUID } from 'node:crypto';
import { DEFAULT_FLOORS, PRICE_BANDS, type PriceBandKey } from '@pretoscop/core';
import { adminPromotedOverview, isFlagEnabled, listFloors } from '@pretoscop/db';
import Link from 'next/link';
import { Section, Stat, Table, Td } from '@/components/admin/ui';
import { requireAdmin } from '@/lib/auth';
import { getCategoryTree, type CategoryNode } from '@/lib/catalog';
import { db } from '@/lib/db';
import { formatDateTime, formatLei } from '@/lib/format';
import { paymentProvider } from '@/lib/promoted';
import { NOT_BILLED_LABELS } from '@/lib/promoted-labels';
import { adjustWalletAction, deleteFloorAction, holdPlacementAction, refundClickAction, upsertFloorAction } from '../../promoted-actions';

export const dynamic = 'force-dynamic';

const OK: Record<string, string> = {
  oprita: 'Campania este oprită de admin (comerciantul vede motivul).',
  reluata: 'Campania a fost reluată.',
  returnat: 'Clicul a fost returnat în sold.',
  ajustat: 'Soldul a fost ajustat.',
  prag: 'Pragul a fost salvat.',
  prag_sters: 'Pragul a fost șters (se aplică pragul general).',
};
const ERR: Record<string, string> = {
  date: 'Date invalide.',
  motiv: 'Scrie un motiv (cel puțin 5 caractere).',
  suma: 'Suma nu este validă (de exemplu 150 sau -25,50; cel mult 10.000 lei).',
  prag: 'Pragul nu este valid: minimul cel puțin 0,01 lei, maximul între minim și 100 lei.',
  insufficient: 'Soldul nu poate scădea sub zero.',
  not_found: 'Înregistrarea nu mai există.',
  bad_status: 'Clicul nu mai este facturat (a fost deja returnat).',
  no_wallet: 'Comerciantul nu are sold deschis.',
  invalid: 'Valoare invalidă.',
};
const BAND_LABEL = Object.fromEntries(PRICE_BANDS.map((b) => [b.key, b.label])) as Record<PriceBandKey, string>;
const lei = (b: number) => formatLei(b);
const field = 'rounded border border-line px-2 py-1 text-xs';
const btn = 'rounded bg-surface px-2 py-1 text-xs ring-1 ring-line hover:bg-brand-50';

function categoryLabel(n: CategoryNode): string {
  const names: string[] = [];
  for (let c: CategoryNode | null = n; c; c = c.parent) names.unshift(c.name);
  return names.join(' › ');
}

/**
 * Promoted placements (M25): wallets, campaigns, the latest promoted clicks, floors and caps, and
 * the monthly statement for the accountant. Money movements happen only through the actions here
 * and the Stripe webhook, each with a ledger row and an audit row.
 */
export default async function PromotedAdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; eroare?: string; luna?: string }> }) {
  // Each admin page checks the session itself: the layout guard does not stop a segment from rendering.
  await requireAdmin();
  const params = await searchParams;
  const month = params.luna && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.luna) ? params.luna : new Date().toISOString().slice(0, 7);
  const [o, floors, tree, enabled, adsEnabled] = await Promise.all([
    adminPromotedOverview(db()),
    listFloors(db()),
    getCategoryTree(),
    isFlagEnabled(db(), 'promoted.enabled'),
    isFlagEnabled(db(), 'ads.slots.enabled'),
  ]);
  const categories = [...tree.byPath.values()].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), 'ro'));
  const ok = params.ok ? OK[params.ok] : undefined;
  const err = params.eroare ? ERR[params.eroare] : undefined;
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Promovare</h1>
      <p className="mb-4 text-sm text-ink-soft">
        Oferte promovate (CPC, licitație la al doilea preț) și soldurile preplătite ale magazinelor. Flag <code>promoted.enabled</code>: <strong>{enabled ? 'pornit' : 'oprit'}</strong> · flag{' '}
        <code>ads.slots.enabled</code>: <strong>{adsEnabled ? 'pornit' : 'oprit'}</strong> (<Link href="/admin/flaguri" className="text-brand-700 underline">Flaguri</Link>) · plăți cu cardul:{' '}
        <strong>{paymentProvider() ? 'Stripe configurat' : 'neconfigurate (D3)'}</strong>. Un clic promovat nu poartă niciodată link afiliat: venitul CPC și comisioanele nu numără același clic.
      </p>
      {ok && <p className="mb-4 rounded bg-brand-50 px-3 py-2 text-sm text-brand-900 ring-1 ring-brand-200">{ok}</p>}
      {err && (
        <p role="alert" className="mb-4 rounded bg-high-bg px-3 py-2 text-sm text-high ring-1 ring-red-200">
          {err}
        </p>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Solduri (total)" value={lei(o.walletsTotalBani)} testId="admin-promoted-wallets" />
        <Stat label="Facturat azi" value={lei(o.spendTodayBani)} />
        <Stat label="Facturat 30 de zile" value={lei(o.spend30Bani)} hint={`${o.billed30} clicuri`} testId="admin-promoted-spend30" />
        <Stat label="Alimentări 30 de zile" value={lei(o.topups30.paidBani)} hint={`${o.topups30.paid} plătite, ${o.topups30.pending} în curs`} />
        <Stat label="Nefacturate 30 de zile" value={Object.values(o.byReason30).reduce((a, b) => a + b, 0)} hint="vezi motivele mai jos" />
      </div>

      <div id="solduri">
        <Section title="Solduri">
          <Table head={['Comerciant', 'Stare', 'Sold', '30 de zile', 'Ajustare (credit sau, cu minus, debit)']}>
            {o.wallets.map((w) => (
              <tr key={w.merchantId}>
                <Td>
                  {w.status === null ? (
                    <span>#{w.merchantId} · profil șters (soldul rămas se restituie)</span>
                  ) : (
                    <Link href={`/admin/comercianti/${w.merchantId}`} className="text-brand-700 underline">
                      {w.shopName ?? `#${w.merchantId}`}
                    </Link>
                  )}
                  {w.companyName && <div className="text-xs text-muted">{w.companyName}</div>}
                </Td>
                <Td className="text-xs">{w.status ?? '—'}</Td>
                <Td className="tabular">{lei(w.balanceBani)}</Td>
                <Td className="tabular">
                  {lei(w.spend30Bani)} · {w.billed30} clicuri
                </Td>
                <Td>
                  <form action={adjustWalletAction} className="flex flex-wrap items-center gap-1">
                    <input type="hidden" name="merchantId" value={w.merchantId} />
                    <input type="hidden" name="token" value={randomUUID()} />
                    <input name="amount" placeholder="150 sau -25,50" aria-label="Suma (lei)" className={`${field} w-28`} />
                    <input name="note" placeholder="motiv (transfer bancar OP 123…)" aria-label="Motiv" className={`${field} w-56`} />
                    <button className={btn}>Aplică</button>
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      </div>

      <div id="campanii">
        <Section title="Campanii">
          <Table head={['#', 'Comerciant', 'Categorie', 'Interval', 'Ofertă / plafon', 'Azi', 'Stare', 'Control admin']}>
            {o.placements.map((p) => (
              <tr key={p.id}>
                <Td className="tabular">{p.id}</Td>
                <Td>{p.shopName ?? `#${p.merchantId}`}</Td>
                <Td>{p.categoryName}</Td>
                <Td className="text-xs">{p.priceBand ? BAND_LABEL[p.priceBand] : 'toate'}</Td>
                <Td className="tabular">
                  {lei(p.bidBani)} / {lei(p.dailyCapBani)}
                </Td>
                <Td className="tabular">{lei(p.spentTodayBani)}</Td>
                <Td className="text-xs">
                  {p.status}
                  {p.adminHold && <div className="text-high">oprită: {p.adminHoldReason}</div>}
                </Td>
                <Td>
                  <form action={holdPlacementAction} className="flex flex-wrap items-center gap-1">
                    <input type="hidden" name="placementId" value={p.id} />
                    {p.adminHold ? (
                      <button name="hold" value="0" className={btn}>
                        Reia
                      </button>
                    ) : (
                      <>
                        <input name="reason" placeholder="motivul (îl vede comerciantul)" aria-label="Motiv" className={`${field} w-48`} />
                        <button name="hold" value="1" className={btn}>
                          Oprește
                        </button>
                      </>
                    )}
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      </div>

      <div id="clicuri">
        <Section title="Ultimele clicuri promovate">
          <Table head={['Când', 'Comerciant', 'Ofertă', 'Spațiu', 'Rezultat', 'Preț', 'Retur']}>
            {o.clicks.map((c) => (
              <tr key={c.id}>
                <Td className="text-xs">{formatDateTime(c.createdAt)}</Td>
                <Td>{c.shopName ?? `#${c.merchantId}`}</Td>
                <Td className="tabular">{c.offerId}</Td>
                <Td className="text-xs">{c.slot === 'product' ? 'produs' : 'categorie'}</Td>
                <Td className="text-xs">{c.status === 'not_billed' ? `nefacturat: ${NOT_BILLED_LABELS[c.reason ?? ''] ?? c.reason}` : c.status === 'billed' ? 'facturat' : 'returnat'}</Td>
                <Td className="tabular">{c.priceBani ? lei(c.priceBani) : '—'}</Td>
                <Td>
                  {c.status === 'billed' && (
                    <form action={refundClickAction} className="flex items-center gap-1">
                      <input type="hidden" name="clickId" value={c.id} />
                      <input name="reason" placeholder="motiv" aria-label="Motiv" className={`${field} w-32`} />
                      <button className={btn}>Returnează</button>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
        {Object.keys(o.byReason30).length > 0 && (
          <ul className="-mt-6 mb-8 text-xs text-muted">
            {Object.entries(o.byReason30).map(([r, n]) => (
              <li key={r}>
                {r === 'refunded' ? 'returnate' : (NOT_BILLED_LABELS[r] ?? r)}: {n}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div id="praguri">
        <Section title="Praguri (minim și maxim pe clic)">
          <Table head={['Categorie', 'Interval', 'Minim', 'Maxim', 'Modificat', '']}>
            {PRICE_BANDS.filter((b) => !floors.some((f) => f.categoryId === null && f.band === b.key)).map((b) => (
              <tr key={`default-${b.key}`} className="text-muted">
                <Td>implicit (tot site-ul)</Td>
                <Td className="text-xs">{b.label}</Td>
                <Td className="tabular">{lei(DEFAULT_FLOORS[b.key].floorBani)}</Td>
                <Td className="tabular">{lei(DEFAULT_FLOORS[b.key].capBani)}</Td>
                <Td className="text-xs">în cod</Td>
                <Td>{null}</Td>
              </tr>
            ))}
            {floors.map((f) => (
              <tr key={f.id}>
                <Td>{f.categoryName ?? 'tot site-ul'}</Td>
                <Td className="text-xs">{BAND_LABEL[f.band]}</Td>
                <Td className="tabular">{lei(f.floorBani)}</Td>
                <Td className="tabular">{lei(f.capBani)}</Td>
                <Td className="text-xs">
                  {f.updatedBy} · {formatDateTime(f.updatedAt)}
                </Td>
                <Td>
                  <form action={deleteFloorAction}>
                    <input type="hidden" name="floorId" value={f.id} />
                    <button className={btn}>Șterge</button>
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
        <form action={upsertFloorAction} className="-mt-6 mb-8 flex flex-wrap items-center gap-2 text-xs">
          <select name="categoryId" aria-label="Categorie" className={field} defaultValue="">
            <option value="">tot site-ul</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
          <select name="band" aria-label="Interval" className={field}>
            {PRICE_BANDS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <input name="floor" placeholder="minim, ex. 0,40" aria-label="Minim (lei)" className={`${field} w-28`} />
          <input name="cap" placeholder="maxim, ex. 2,50" aria-label="Maxim (lei)" className={`${field} w-28`} />
          <button className={btn}>Salvează pragul</button>
        </form>
      </div>

      <Section
        title={`Pentru contabil: ${month}`}
        right={
          <div className="flex items-center gap-3 text-xs">
            <form className="flex items-center gap-1">
              <input name="luna" defaultValue={month} aria-label="Luna (AAAA-LL)" className="w-24 rounded border border-line px-2 py-1" />
              <button className="rounded bg-surface px-2 py-1 ring-1 ring-line">Arată</button>
            </form>
            <Link href={`/admin/promovare/extras?luna=${month}`} className="text-brand-700 underline">
              CSV
            </Link>
          </div>
        }
      >
        <p className="p-3 text-xs text-ink-soft">
          Extrasul lunar pe comerciant: sold inițial, alimentări plătite (net, TVA, brut: facturile de emis prin e-Factura), clicuri facturate, retururi, ajustări și soldul final. Luna în
          ora României.
        </p>
      </Section>
    </div>
  );
}
