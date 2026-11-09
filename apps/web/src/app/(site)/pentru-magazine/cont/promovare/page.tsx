import { currentConsentText } from '@pretoscop/config/legal-texts';
import { DEFAULT_FLOORS, PRICE_BANDS, TOPUP_LIMITS, type PriceBandKey } from '@pretoscop/core';
import { listFloors, merchantPromotedSummary, type MerchantPromotedSummary } from '@pretoscop/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/legal/legal-page';
import { Callout } from '@/components/legal/prose';
import { SignOutButton } from '@/components/merchant/sign-out';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { getCategoryTree, type CategoryNode } from '@/lib/catalog';
import { db, serverEnv } from '@/lib/db';
import { formatDateTime, formatLei } from '@/lib/format';
import { merchantOf, PORTAL_PATH, requirePortalUser } from '@/lib/merchant';
import { paymentProvider, promotedEnabled } from '@/lib/promoted';
import { LEDGER_LABELS, NOT_BILLED_LABELS } from '@/lib/promoted-labels';
import { acceptTermsAction, createCampaignAction, setCampaignStatusAction, startTopUpAction, updateCampaignAction } from './actions';

export const metadata: Metadata = {
  title: 'Oferte promovate',
  description: 'Promovarea ofertelor magazinului pe Pretoscop: sold preplătit, campanii pe categorii, cost pe clic.',
  robots: { index: false, follow: false },
};

const OK: Record<string, string> = {
  termeni: 'Promovarea este activată. Alimentează soldul și creează o campanie.',
  campanie: 'Campania a fost creată. Apare pe pagini în câteva minute, dacă oferta ta este eligibilă și câștigă licitația.',
  modificat: 'Campania a fost modificată.',
  oprit: 'Campania este oprită.',
  pornit: 'Campania este pornită.',
  arhivat: 'Campania a fost arhivată.',
};
const ERR: Record<string, string> = {
  neaprobat: 'Promovarea este disponibilă doar magazinelor cu listarea aprobată.',
  inchis: 'Ofertele promovate nu sunt încă deschise pe Pretoscop. Te anunțăm pe email când pornesc.',
  limita: 'Ai făcut multe modificări în ultimele 24 de ore. Încearcă din nou mai târziu sau scrie-ne.',
  termeni: 'Bifează acceptarea condițiilor pentru ofertele promovate.',
  fara_plata: 'Plata cu cardul nu este disponibilă încă. Scrie-ne pentru alimentare prin transfer bancar.',
  suma: `Suma trebuie să fie între ${formatLei(TOPUP_LIMITS.minBani)} și ${formatLei(TOPUP_LIMITS.maxBani)}.`,
  plata: 'Nu am putut deschide pagina de plată. Nu ți-a fost retrasă nicio sumă; încearcă din nou peste câteva minute.',
  categorie: 'Alege o categorie.',
  interval: 'Alege un interval de preț din listă.',
  oferta: 'Oferta pe clic trebuie să fie între 0,01 lei și 100,00 lei.',
  plafon: 'Plafonul zilnic trebuie să fie cel puțin cât oferta pe clic și cel mult 10.000,00 lei.',
  exista: 'Ai deja o campanie pentru această categorie și acest interval de preț: modific-o pe aceea.',
  campanie: 'Campania nu a fost găsită.',
};
const PAYMENT: Record<string, string> = {
  ok: 'Plata a fost trimisă. Soldul crește imediat ce Stripe ne confirmă plata (de obicei în câteva secunde; reîncarcă pagina).',
  anulata: 'Plata a fost anulată. Nu ți-a fost retrasă nicio sumă.',
};

const TOPUP_LABELS: Record<string, string> = { created: 'începută', pending: 'în așteptarea plății', paid: 'plătită', expired: 'expirată', failed: 'eșuată' };
const STATUS_LABELS: Record<string, string> = { active: 'pornită', paused: 'oprită', archived: 'arhivată' };
const BAND_LABEL = Object.fromEntries(PRICE_BANDS.map((b) => [b.key, b.label])) as Record<PriceBandKey, string>;

const input = 'block h-10 w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';
const label = 'block text-sm font-semibold text-ink';

/** 150 → "1,50" (the value of a lei input). */
const leiValue = (bani: number) => (bani / 100).toFixed(2).replace('.', ',');

function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titlu`} className="scroll-mt-36 space-y-4 rounded-[var(--radius-card)] bg-canvas p-5 ring-1 ring-line md:scroll-mt-24 sm:p-6">
      <h2 id={`${id}-titlu`} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      <div className="space-y-4 text-[15px] text-ink-soft">{children}</div>
    </section>
  );
}

function categoryLabel(n: CategoryNode): string {
  const names: string[] = [];
  for (let c: CategoryNode | null = n; c; c = c.parent) names.unshift(c.name);
  return names.join(' › ');
}

function Stats({ s }: { s: MerchantPromotedSummary }) {
  const items: Array<[string, string, string?]> = [
    ['Sold disponibil', formatLei(s.wallet?.balanceBani ?? 0)],
    ['Cheltuit azi', formatLei(s.spentTodayBani)],
    ['Cheltuit (30 de zile)', formatLei(s.spend30Bani)],
    ['Clicuri facturate (30 de zile)', new Intl.NumberFormat('ro-RO').format(s.billed30)],
    ['Cost mediu pe clic', s.cpc30Bani === null ? '—' : formatLei(s.cpc30Bani), 'ultimele 30 de zile'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="promoted-stats">
      {items.map(([title, value, hint]) => (
        <div key={title} className="rounded-[var(--radius-card)] bg-white p-4 ring-1 ring-line">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
          <div className="mt-1 text-xl font-bold text-ink tabular" data-testid={`promoted-stat-${title}`}>
            {value}
          </div>
          {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
        </div>
      ))}
    </div>
  );
}

export default async function PromotedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePortalUser();
  const [m, open, params] = await Promise.all([merchantOf(user.id), promotedEnabled(), searchParams]);
  const ok = typeof params.ok === 'string' ? OK[params.ok] : undefined;
  const err = typeof params.eroare === 'string' ? ERR[params.eroare] : undefined;
  const paid = typeof params.plata === 'string' ? PAYMENT[params.plata] : undefined;
  const approved = m?.status === 'approved';
  const [summary, tree, floors] = approved ? await Promise.all([merchantPromotedSummary(db(), m.id), getCategoryTree(), listFloors(db())]) : [null, null, []];
  const canPay = paymentProvider() !== null;
  const vat = serverEnv().TOPUP_VAT_PERCENT;
  const terms = currentConsentText('promotedTerms');
  const categories = tree ? [...tree.byPath.values()].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), 'ro')) : [];
  const siteFloors = PRICE_BANDS.map((b) => {
    const row = floors.find((f) => f.categoryId === null && f.band === b.key);
    return { band: b, floorBani: row?.floorBani ?? DEFAULT_FLOORS[b.key].floorBani, capBani: row?.capBani ?? DEFAULT_FLOORS[b.key].capBani };
  });
  const categoryFloors = floors.filter((f) => f.categoryId !== null);
  const notBilled = Object.entries(summary?.notBilled30 ?? {});

  return (
    <>
      <PageHeader eyebrow="Pentru magazine" title="Oferte promovate" lead="Plătești doar clicurile valide din spațiile marcate „Promovat”. Lista de oferte rămâne ordonată după prețul total.">
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-soft">
          <Link href={PORTAL_PATH} className="text-brand-700 underline">
            ← Contul magazinului
          </Link>
          <span>Autentificat ca {user.email}</span>
          <SignOutButton />
        </div>
      </PageHeader>
      <Container className="space-y-6 py-8 sm:py-10">
        {(ok || paid) && (
          <p role="status" className="rounded-lg bg-brand-50 px-4 py-3 text-sm font-medium text-brand-900 ring-1 ring-brand-200">
            {ok ?? paid}
          </p>
        )}
        {err && (
          <p role="alert" className="rounded-lg bg-high-bg px-4 py-3 text-sm font-medium text-high ring-1 ring-red-200">
            {err}
          </p>
        )}
        {!approved && (
          <Callout tone="neutral" title="Promovarea este pentru magazinele aprobate">
            <p>
              După ce listarea gratuită a magazinului tău este aprobată, poți promova ofertele de aici. <Link href={PORTAL_PATH}>Vezi starea contului</Link>.
            </p>
          </Callout>
        )}
        {approved && !open && (
          <Callout tone="info" title="Ofertele promovate nu sunt încă deschise">
            <p>Pregătim lansarea. Până atunci nu se fac plăți și nu se afișează campanii; soldul și istoricul de mai jos rămân vizibile.</p>
          </Callout>
        )}

        {approved && summary && (
          <>
            <Card id="cum" title="Cum funcționează">
              <ul className="list-disc space-y-1 pl-5">
                <li>Alegi o categorie (și, dacă vrei, un interval de preț), o ofertă maximă pe clic și un plafon zilnic.</li>
                <li>
                  Pe pagina unui produs și pe paginile de categorie există câte un singur spațiu „Promovat”, deasupra listei. Îl primește campania cu oferta cea mai mare;
                  plătești cât oferta următoare plus 0,01 lei, cel puțin pragul minim și niciodată mai mult decât oferta ta.
                </li>
                <li>Plătești doar clicurile valide: un singur clic pe zi de la același vizitator; clicurile roboților, preîncărcările și rafalele nu se facturează.</li>
                <li>Doar ofertele noi, în stoc, verificate recent și vândute de magazinul tău pot fi promovate. Dacă oferta ta nu este cea mai ieftină, spațiul spune cu cât costă mai mult.</li>
                <li>Promovarea nu schimbă ordinea listei de oferte. Detalii în <Link href="/pentru-magazine/termeni#promovare">Termenii pentru magazine</Link>.</li>
              </ul>
            </Card>

            {!summary.wallet ? (
              <Card id="termeni" title="Activează promovarea">
                <form action={acceptTermsAction} className="space-y-3">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" name="terms" className="mt-1 size-4" data-testid="promoted-terms" aria-labelledby="promoted-terms-text" />
                    <span id="promoted-terms-text">
                      {terms.text}{' '}
                      <Link href={terms.link.href} className="text-brand-700 underline">
                        {terms.link.label}
                      </Link>
                    </span>
                  </label>
                  <Button type="submit" disabled={!open}>
                    {terms.acceptLabel}
                  </Button>
                </form>
              </Card>
            ) : (
              <>
                <Stats s={summary} />
                <Card id="sold" title="Sold">
                  <p>
                    Sold disponibil: <strong className="text-ink tabular" data-testid="promoted-balance">{formatLei(summary.wallet.balanceBani)}</strong>. Soldul este preplătit și se consumă doar
                    cu clicuri facturate.
                  </p>
                  {canPay ? (
                    <form action={startTopUpAction} className="flex flex-wrap items-end gap-3">
                      <div>
                        <label id="amount-label" htmlFor="amount" className={label}>
                          Suma de alimentat (lei)
                        </label>
                        <input id="amount" aria-labelledby="amount-label" name="amount" inputMode="decimal" required defaultValue={leiValue(TOPUP_LIMITS.minBani)} className={`${input} w-40`} />
                      </div>
                      <Button type="submit" disabled={!open}>
                        Plătește cu cardul (Stripe)
                      </Button>
                      <p className="w-full text-sm text-muted">
                        Minimum {formatLei(TOPUP_LIMITS.minBani)}, maximum {formatLei(TOPUP_LIMITS.maxBani)}.{' '}
                        {vat > 0 ? `La sumă se adaugă TVA ${vat}%.` : 'Fără TVA adăugat.'} Plata se face pe pagina securizată Stripe; noi nu vedem datele cardului. Factura o primești de la
                        noi, pe datele firmei din cont.
                      </p>
                    </form>
                  ) : (
                    <p>Plata cu cardul nu este disponibilă încă. <Link href="/contact?subiect=merchant">Scrie-ne</Link> pentru alimentare prin transfer bancar.</p>
                  )}
                  {summary.topups.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-ink">Alimentări</h3>
                      <ul className="mt-2 space-y-1 text-sm">
                        {summary.topups.map((t) => (
                          <li key={t.id}>
                            {formatDateTime(t.createdAt)}: {formatLei(t.netBani)}
                            {t.vatBani > 0 && ` + TVA ${formatLei(t.vatBani)}`}, {TOPUP_LABELS[t.status] ?? t.status}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>

                <Card id="campanii" title="Campanii">
                  {summary.placements.length === 0 ? (
                    <p>Nu ai încă nicio campanie.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-sm" data-testid="promoted-campaigns">
                        <thead className="text-xs uppercase tracking-wide text-muted">
                          <tr>
                            <th className="py-2 pr-3">Categorie</th>
                            <th className="py-2 pr-3">Interval</th>
                            <th className="py-2 pr-3">Stare</th>
                            <th className="py-2 pr-3">Azi</th>
                            <th className="py-2 pr-3">30 de zile</th>
                            <th className="py-2 pr-3">Ofertă / plafon zilnic</th>
                            <th className="py-2">
                              <span className="sr-only">Acțiuni</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {summary.placements.map((p) => (
                            <tr key={p.id} className="align-top">
                              <td className="py-2 pr-3 text-ink">{p.categoryName}</td>
                              <td className="py-2 pr-3">{p.priceBand ? BAND_LABEL[p.priceBand] : 'toate prețurile'}</td>
                              <td className="py-2 pr-3">
                                {STATUS_LABELS[p.status] ?? p.status}
                                {p.adminHold && <span className="block text-high">oprită de Pretoscop: {p.adminHoldReason ?? 'verificare'}</span>}
                              </td>
                              <td className="py-2 pr-3 tabular">
                                {formatLei(p.spentTodayBani)} · {p.billedToday} clicuri
                              </td>
                              <td className="py-2 pr-3 tabular">
                                {formatLei(p.spend30Bani)} · {p.billed30} clicuri
                              </td>
                              <td className="py-2 pr-3">
                                <form action={updateCampaignAction} className="flex flex-wrap items-center gap-2">
                                  <input type="hidden" name="placementId" value={p.id} />
                                  <input name="bid" aria-label="Oferta pe clic (lei)" defaultValue={leiValue(p.bidBani)} inputMode="decimal" className={`${input} h-8 w-20`} />
                                  <input name="dailyCap" aria-label="Plafon zilnic (lei)" defaultValue={leiValue(p.dailyCapBani)} inputMode="decimal" className={`${input} h-8 w-24`} />
                                  <Button type="submit" variant="secondary" size="sm">
                                    Salvează
                                  </Button>
                                </form>
                              </td>
                              <td className="py-2" aria-label="Acțiuni">
                                <form action={setCampaignStatusAction} className="flex gap-2">
                                  <input type="hidden" name="placementId" value={p.id} />
                                  <Button type="submit" name="status" value={p.status === 'active' ? 'paused' : 'active'} variant="secondary" size="sm">
                                    {p.status === 'active' ? 'Oprește' : 'Pornește'}
                                  </Button>
                                  <Button type="submit" name="status" value="archived" variant="ghost" size="sm">
                                    Arhivează
                                  </Button>
                                </form>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {notBilled.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-ink">Clicuri nefacturate (30 de zile)</h3>
                      <ul className="mt-2 space-y-1 text-sm" data-testid="promoted-not-billed">
                        {notBilled.map(([reason, n]) => (
                          <li key={reason}>
                            {NOT_BILLED_LABELS[reason] ?? reason}: {n}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>

                <Card id="campanie-noua" title="Campanie nouă">
                  <form action={createCampaignAction} className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="categoryId" className={label}>
                        Categorie (include subcategoriile)
                      </label>
                      <select id="categoryId" name="categoryId" required className={input} defaultValue="">
                        <option value="" disabled>
                          Alege categoria
                        </option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {categoryLabel(c)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="band" className={label}>
                        Interval de preț total
                      </label>
                      <select id="band" name="band" className={input} defaultValue="">
                        <option value="">Toate prețurile</option>
                        {PRICE_BANDS.map((b) => (
                          <option key={b.key} value={b.key}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label id="bid-label" htmlFor="bid" className={label}>
                        Oferta maximă pe clic (lei)
                      </label>
                      <input id="bid" aria-labelledby="bid-label" name="bid" required inputMode="decimal" placeholder="0,60" className={input} />
                    </div>
                    <div>
                      <label id="dailyCap-label" htmlFor="dailyCap" className={label}>
                        Plafon zilnic (lei)
                      </label>
                      <input id="dailyCap" aria-labelledby="dailyCap-label" name="dailyCap" required inputMode="decimal" placeholder="30,00" className={input} />
                    </div>
                    <div className="flex items-end">
                      <Button type="submit" disabled={!open}>
                        Creează campania
                      </Button>
                    </div>
                  </form>
                  <div>
                    <h3 className="font-semibold text-ink">Praguri pe clic</h3>
                    <p className="text-sm">Oferta trebuie să atingă pragul minim al intervalului ofertei; peste plafon contează doar plafonul.</p>
                    <ul className="mt-2 space-y-1 text-sm" data-testid="promoted-floors">
                      {siteFloors.map((f) => (
                        <li key={f.band.key}>
                          {f.band.label}: minim {formatLei(f.floorBani)}, maxim {formatLei(f.capBani)}
                        </li>
                      ))}
                      {categoryFloors.map((f) => (
                        <li key={f.id}>
                          {f.categoryName}, {BAND_LABEL[f.band]}: minim {formatLei(f.floorBani)}, maxim {formatLei(f.capBani)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>

                <Card id="istoric" title="Mișcările soldului">
                  {summary.ledger.length === 0 ? (
                    <p>Nicio mișcare încă.</p>
                  ) : (
                    <ul className="space-y-1 text-sm" data-testid="promoted-ledger">
                      {summary.ledger.map((l) => (
                        <li key={l.id} className="tabular">
                          {formatDateTime(l.createdAt)}: {LEDGER_LABELS[l.kind] ?? l.kind} {l.amountBani > 0 ? '+' : '−'}
                          {formatLei(Math.abs(l.amountBani))} → {formatLei(l.balanceAfterBani)}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}
          </>
        )}
        <p className="text-sm text-muted">
          <Link href="/pentru-magazine/termeni#promovare" className="text-brand-700 underline">
            Condițiile pentru ofertele promovate
          </Link>{' '}
          ·{' '}
          <Link href="/cum-functioneaza#promovat" className="text-brand-700 underline">
            Cum arată spațiul „Promovat”
          </Link>{' '}
          ·{' '}
          <Link href="/contact?subiect=merchant" className="text-brand-700 underline">
            Reclamații și întrebări
          </Link>
        </p>
      </Container>
    </>
  );
}
