import type { MerchantFeedReport, MerchantStatus } from '@pretoscop/db/schema';

/** Why a feed check cannot support a submission or an approval (`listingReportProblem` in @pretoscop/db). */
export const REPORT_PROBLEM_LABELS = {
  not_checked: 'verificarea feed-ului nu s-a terminat.',
  stale: 'ultima verificare a fost făcută pentru alt feed sau alt domeniu.',
  failed: 'ultima verificare a feed-ului a eșuat.',
  off_domain_only: 'niciun produs din feed nu are adresa pe domeniul verificat.',
  nothing_listable: 'niciun produs din feed nu poate fi afișat.',
  price_format: 'formatul prețurilor nu este ales.',
} as const;

/**
 * Romanian findings for the merchant portal (M20), from the worker's feed report and from the
 * latest ingestion runs. Pure, so the portal and the admin show the same words.
 */

export type HintLevel = 'error' | 'warn' | 'info';
export interface Hint {
  level: HintLevel;
  text: string;
}

export const STATUS_LABELS: Record<MerchantStatus, string> = {
  draft: 'În lucru',
  pending: 'În așteptarea aprobării',
  approved: 'Aprobat',
  rejected: 'Respins',
  suspended: 'Suspendat',
};

/** Statement-of-reasons categories (P2B Regulation art. 4); the admin adds the facts. */
export const REASON_CATEGORIES = {
  domeniu: 'Nu am putut confirma că administrați domeniul magazinului.',
  feed: 'Feed-ul nu poate fi citit sau conține date incomplete.',
  preturi: 'Prețurile, disponibilitatea sau livrarea din feed nu corespund site-ului.',
  continut: 'Feed-ul conține produse sau conținut care nu pot fi afișate legal.',
  eligibilitate: 'Magazinul nu îndeplinește condițiile de listare din Termenii pentru magazine (punctul 2).',
  altul: 'Alt motiv.',
} as const;

export const FORMAT_LABELS = { google: 'Google Merchant (XML)', compari: 'compari.ro (XML)', csv: 'CSV' } as const;

const REJECT_LABELS: Record<string, string> = {
  external_id_missing: 'fără cod de produs',
  title_missing: 'fără titlu',
  title_junk_hex: 'titlu fără sens',
  price_missing: 'fără preț',
  price_unparseable: 'preț ilizibil',
  price_range: 'interval de prețuri în loc de un preț',
  price_instalment: 'preț pe rate',
  price_unit: 'preț pe unitate de măsură',
  price_zero: 'preț zero',
  price_negative: 'preț negativ',
  price_placeholder: 'preț de umplutură (de exemplu, 9.999.999)',
  price_too_low: 'preț sub 1 leu',
  price_currency: 'monedă neacceptată',
  fx_rate_missing: 'preț în euro fără curs de schimb',
  off_domain: 'adresă în afara domeniului verificat',
};

export function rejectLabel(reason: string): string {
  return REJECT_LABELS[reason] ?? reason;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** What the merchant should know or fix after a feed check. */
export function feedReportHints(r: MerchantFeedReport): Hint[] {
  const out: Hint[] = [];
  if (r.parseError) out.push({ level: 'error', text: `Feed-ul are o eroare de structură; am citit doar ce era înainte de ea (${r.parseError}).` });
  if (r.skippedRows > 0) {
    out.push({ level: 'warn', text: `${r.skippedRows} rânduri nu au titlu, adresa produsului sau preț și nu vor fi afișate.` });
  }
  if (r.normalization.rejected > 0) {
    const reasons = Object.entries(r.normalization.rejectReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, n]) => `${rejectLabel(k)} (${n})`)
      .join(', ');
    out.push({ level: 'warn', text: `${r.normalization.rejected} produse nu pot fi afișate: ${reasons}.` });
  }
  if (r.domain.expected && r.offers > 0 && r.domain.onDomain === 0) {
    out.push({ level: 'error', text: `Niciun produs nu are adresa pe domeniul ${r.domain.expected}: feed-ul nu poate fi trimis spre aprobare.` });
  } else if (r.domain.expected && r.domain.offDomain > 0) {
    out.push({
      level: 'error',
      text: `${r.domain.offDomain} produse au adresa în afara domeniului ${r.domain.expected} (de exemplu, ${r.domain.offDomainExamples[0] ?? '—'}). Afișăm doar produse de pe domeniul verificat.`,
    });
  }
  if (r.priceFormat.needsChoice) {
    out.push({
      level: 'error',
      text: `Nu putem ști sigur cum sunt scrise prețurile (de exemplu, „${r.priceFormat.ambiguousExamples[0] ?? '12.500'}”). Alege formatul la pasul 4.`,
    });
  } else if (r.priceFormat.verdict === 'mixed') {
    out.push({ level: 'warn', text: 'Feed-ul amestecă prețuri scrise cu virgulă și cu punct zecimal. Verifică previzualizarea.' });
  }
  if (r.vat.excluded > 0) {
    out.push({ level: 'warn', text: `${r.vat.excluded} prețuri sunt declarate fără TVA; le afișăm cu TVA adăugată. Recomandăm prețuri cu TVA inclus.` });
  }
  const foreign = Object.entries(r.currencies).filter(([c]) => c !== 'RON');
  if (foreign.length > 0) out.push({ level: 'warn', text: `Prețuri în altă monedă decât lei: ${foreign.map(([c, n]) => `${c} (${n})`).join(', ')}.` });
  const gtins = r.fields.gtin ?? 0;
  if (r.offers > 0 && gtins < r.offers) {
    out.push({
      level: 'info',
      text: `Codul EAN/GTIN lipsește la ${pct(r.offers - gtins, r.offers)}% dintre produse. Cu EAN, ofertele ajung mai repede pe pagina produsului corect.`,
    });
  }
  if (r.offers > 0 && (r.fields.shippingCost ?? 0) === 0) {
    out.push({ level: 'info', text: 'Feed-ul nu are costuri de livrare. Completează regulile de livrare la pasul 4, ca prețul total să fie corect.' });
  }
  if (r.duplicateIds > 0) out.push({ level: 'warn', text: `${r.duplicateIds} produse au același cod (id) ca altele; păstrăm doar ultimul.` });
  if (r.truncated) out.push({ level: 'info', text: 'Am verificat primele 5.000 de produse; restul vor fi citite după aprobare.' });
  return out;
}

/** "Fix my feed" for an approved merchant, from live offers and the last run. */
export function dashboardHints(s: {
  /** Hours after which an offer counts as not recently confirmed (the shop's freshness SLO). */
  freshnessHours: number;
  activeOffers: number;
  withGtin: number;
  matched: number;
  stale: number;
  shippingUnknown: number;
  lastRun: { status: string; rejected: number; offDomain: number; errorSample: string | null } | null;
}): Hint[] {
  const out: Hint[] = [];
  if (!s.lastRun) {
    out.push({ level: 'info', text: 'Prima citire a feed-ului este programată; datele apar aici după ea.' });
    return out;
  }
  if (s.lastRun.status === 'failed') {
    out.push({ level: 'error', text: `Ultima citire a feed-ului a eșuat${s.lastRun.errorSample ? `: ${s.lastRun.errorSample.split('\n')[0]}` : ''}.` });
  }
  if (s.lastRun.status === 'held') {
    out.push({ level: 'warn', text: 'Ultima citire a fost oprită pentru verificare (multe prețuri s-au schimbat brusc sau feed-ul a scăzut mult). Ne uităm noi.' });
  }
  if (s.lastRun.offDomain > 0) out.push({ level: 'error', text: `${s.lastRun.offDomain} produse au adresa în afara domeniului verificat și nu sunt afișate.` });
  if (s.lastRun.rejected - s.lastRun.offDomain > 0) {
    out.push({ level: 'warn', text: `${s.lastRun.rejected - s.lastRun.offDomain} produse din ultima citire au fost respinse (preț, titlu sau cod lipsă).` });
  }
  if (s.activeOffers > 0 && s.matched < s.activeOffers) {
    out.push({
      level: 'info',
      text: `${pct(s.activeOffers - s.matched, s.activeOffers)}% dintre oferte nu sunt încă potrivite cu un produs din catalog; codurile EAN și MPN grăbesc potrivirea.`,
    });
  }
  if (s.activeOffers > 0 && s.withGtin < s.activeOffers) {
    out.push({ level: 'info', text: `Adaugă codul EAN la ${s.activeOffers - s.withGtin} oferte.` });
  }
  if (s.stale > 0) out.push({ level: 'warn', text: `${s.stale} oferte nu au mai fost confirmate de feed în ultimele ${s.freshnessHours} ore și apar cu gri.` });
  if (s.shippingUnknown > 0) out.push({ level: 'info', text: `La ${s.shippingUnknown} oferte nu știm costul livrării: adaugă-l în feed sau completează regulile de livrare.` });
  return out;
}
