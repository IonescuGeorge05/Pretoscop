import { lei, pct, roDay } from './charts';
import type { GroupStats, ReportData } from './schema';

/** Markdown and CSV renderers for a report (deterministic for a given ReportData). */

const sharePct = (x: number | null) => (x === null ? '—' : pct(x));
const signed = (x: number | null) => (x === null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${pct(Math.abs(x))}`);

function table(head: string[], rows: string[][]): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|');
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n');
}

function groupTable(groups: GroupStats[], first: string): string {
  if (!groups.some((g) => g.withHistory > 0)) return 'Nicio ofertă cu istoric suficient.';
  return table(
    [first, 'Oferte cu istoric', 'Cu reducere afișată', 'Reduceri fără scădere reală', 'Scădere reală', 'Fără scădere reală', 'Mai scump', 'Variația mediană'],
    groups
      .filter((g) => g.withHistory > 0)
      .map((g) => [
        g.label,
        String(g.withHistory),
        String(g.claims),
        g.claims ? `${g.claimsWithoutRealDrop} (${sharePct(g.claimsWithoutRealDropShare)})` : '—',
        String(g.realDrop),
        String(g.noRealDrop),
        String(g.higher),
        signed(g.medianChangePct),
      ]),
  );
}

export function renderMarkdown(r: ReportData, charts: Array<{ file: string; alt: string }> = []): string {
  const h = r.headline;
  const shops = r.byShop.filter((g) => g.offers > 0).length;
  const out: string[] = [];
  out.push(`# ${r.title}`);
  out.push('');
  out.push(`Perioada analizată: ${roDay(r.window.from)} – ${roDay(r.window.to)} ${r.window.to.slice(0, 4)} (zile în ora României). Date generate la ${r.generatedAt}.`);
  out.push('');
  out.push(
    r.approval.approved
      ? `Cifre verificate și aprobate de ${r.approval.by} pe ${r.approval.at ? roDay(r.approval.at.slice(0, 10)) : '—'} ${r.approval.at?.slice(0, 4) ?? ''}.`
      : '> **Date preliminare.** Cifrele nu se publică până nu sunt verificate și aprobate de fondatori (`report:approve`).',
  );
  out.push('');
  out.push('## Pe scurt');
  out.push('');
  out.push(`- ${h.offers} oferte au fost în stoc în perioadă, la ${shops} ${shops === 1 ? 'magazin' : 'magazine'}; ${h.withHistory} au istoric suficient (observate în cel puțin 70% din cele 30 de zile dinainte).`);
  if (h.claims > 0) {
    out.push(
      `- ${h.claims} dintre ele afișau o reducere (un preț de referință tăiat). La **${h.claimsWithoutRealDrop} (${sharePct(h.claimsWithoutRealDropShare)})** prețul din perioadă nu a fost cu cel puțin 2% sub cel mai mic preț observat de Pretoscop la același magazin în cele 30 de zile dinainte.`,
    );
  } else {
    out.push('- Nicio ofertă cu istoric suficient nu a afișat o reducere în perioadă.');
  }
  out.push(`- Scădere reală (cel puțin 2% sub minimul celor 30 de zile): ${h.realDrop} oferte; fără scădere reală: ${h.noRealDrop}; mai scump: ${h.higher}. Variația mediană: ${signed(h.medianChangePct)}.`);
  out.push(
    r.raiseThenCut.evaluated === 0
      ? '- Regula „preț crescut înainte, apoi redus” nu a putut fi evaluată: cere 60 de zile de istoric înaintea perioadei.'
      : `- Prețuri crescute cu cel puțin 15% înainte și „reduse” în perioadă înapoi la nivelul anterior: ${r.raiseThenCut.cases.length} din ${r.raiseThenCut.evaluated} oferte evaluate.`,
  );
  out.push('');
  if (charts.length) {
    out.push('## Grafice');
    out.push('');
    for (const c of charts) out.push(`![${c.alt}](${c.file})`, '');
  }
  out.push('## Pe magazine');
  out.push('');
  out.push(groupTable(r.byShop, 'Magazin'));
  out.push('');
  out.push('## Vândut de magazin sau prin marketplace');
  out.push('');
  out.push(groupTable(r.bySeller, 'Vânzător'));
  out.push('');
  out.push('## Pe categorii');
  out.push('');
  out.push(groupTable(r.byCategory, 'Categorie'));
  out.push('');
  out.push('## Cele mai mari scăderi reale');
  out.push('');
  out.push(
    r.biggestDrops.length
      ? table(
          ['Produs', 'Categorie', 'Minimul celor 30 de zile dinainte', 'Minimul din perioadă', 'Ziua', 'Scădere', 'Magazine'],
          r.biggestDrops.slice(0, 15).map((d) => [d.title, d.category ?? '—', lei(d.min30Bani), lei(d.eventMinBani), roDay(d.eventMinDay), `−${pct(d.dropPct)}`, String(d.shops)]),
        )
      : 'Nicio scădere reală de cel puțin 2% (pe ofertele vândute de magazine, cu istoric suficient).',
  );
  out.push('');
  out.push('## Prețuri crescute înainte, apoi reduse');
  out.push('');
  out.push(
    r.raiseThenCut.cases.length
      ? table(
          ['Magazin', 'Produs', 'Mediana lunii anterioare', 'Vârf', 'Ziua vârfului', 'Prețul din perioadă', 'Ziua'],
          r.raiseThenCut.cases.slice(0, 20).map((c) => [c.shop, c.productTitle ?? `ofertă #${c.offerId}`, lei(c.earlierMedianBani), lei(c.peakBani), roDay(c.peakDay), lei(c.eventMinBani), roDay(c.eventMinDay)]),
        )
      : r.raiseThenCut.evaluated === 0
        ? 'Nu a putut fi evaluată (60 de zile de istoric necesare).'
        : 'Niciun caz.',
  );
  out.push('');
  out.push('## Metodologie');
  out.push('');
  out.push('- Sursa: prețurile observate de Pretoscop pe paginile publice ale magazinelor (robotul PretoscopBot, https://pretoscop.ro/bot) și din fluxurile de produse ale magazinelor. Doar oferte noi, nu pachete, în stoc.');
  out.push('- „Scădere reală”: cel mai mic preț din perioadă este cu cel puțin 2% sub cel mai mic preț observat la aceeași ofertă în cele 30 de zile dinainte. Comparația se face doar dacă am observat oferta în cel puțin 70% din acele zile.');
  out.push('- „Reducere afișată”: magazinul a afișat un preț de referință tăiat, mai mare decât prețul de vânzare. Nu verificăm ce spune magazinul despre acel preț; îl comparăm doar cu prețurile pe care le-am observat noi.');
  out.push('- „Preț crescut înainte, apoi redus”: vârful din [−30, −3] zile este cu cel puțin 15% peste mediana din [−60, −31] zile, iar prețul din perioadă este încă la cel puțin 97% din acea mediană.');
  out.push('- Prețul unei zile este cel în vigoare la sfârșitul zilei, după ultima noastră observație. Zilele fără observații rămân goale; nu interpolăm.');
  out.push('- Scăderile pe produse folosesc doar ofertele vândute direct de magazine (ca seria principală din graficele de istoric).');
  out.push('- Detalii: https://pretoscop.ro/metodologie');
  out.push('');
  if (r.notes.length) {
    out.push('## Note');
    out.push('');
    for (const n of r.notes) out.push(`- ${n}`);
    out.push('');
  }
  out.push('## Date');
  out.push('');
  out.push('`oferte.csv` (o linie pe ofertă), `magazine.csv`, `scaderi.csv`, `crescut-redus.csv`, `report.json` (schema `pretoscop.report/v1`). Prețuri în lei, cu TVA.');
  out.push('');
  return out.join('\n');
}

function csv(head: string[], rows: Array<Array<string | number | boolean | null>>): string {
  const cell = (v: string | number | boolean | null) => {
    if (v === null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${[head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}

const money = (bani: number | null) => (bani === null ? null : (bani / 100).toFixed(2));

export function renderCsv(r: ReportData): Record<string, string> {
  return {
    'oferte.csv': csv(
      ['offer_id', 'shop', 'seller_type', 'product_id', 'product', 'category', 'min_30d_before', 'coverage_30d', 'event_min', 'event_min_day', 'reference_price', 'discount_shown', 'change_pct', 'class', 'reference_above_30d_min'],
      r.offers.map((o) => [
        o.offerId,
        o.shop,
        o.sellerType,
        o.productId,
        o.productTitle,
        o.category,
        money(o.min30Bani),
        o.coverage30,
        money(o.eventMinBani),
        o.eventMinDay,
        money(o.referenceBani),
        o.discountClaimed,
        o.changePct,
        o.class,
        o.referenceAboveMin30,
      ]),
    ),
    'magazine.csv': csv(
      ['shop', 'name', 'offers', 'with_history', 'discounts_shown', 'discounts_without_real_drop', 'share_without_real_drop', 'real_drop', 'no_real_drop', 'higher', 'median_change_pct'],
      r.byShop.map((g) => [g.key, g.label, g.offers, g.withHistory, g.claims, g.claimsWithoutRealDrop, g.claimsWithoutRealDropShare, g.realDrop, g.noRealDrop, g.higher, g.medianChangePct]),
    ),
    'scaderi.csv': csv(
      ['product_id', 'product', 'category', 'min_30d_before', 'event_min', 'event_min_day', 'drop_pct', 'shops'],
      r.biggestDrops.map((d) => [d.productId, d.title, d.category, money(d.min30Bani), money(d.eventMinBani), d.eventMinDay, d.dropPct, d.shops]),
    ),
    'crescut-redus.csv': csv(
      ['offer_id', 'shop', 'product', 'earlier_median', 'peak', 'peak_day', 'event_min', 'event_min_day', 'raise_pct'],
      r.raiseThenCut.cases.map((c) => [c.offerId, c.shop, c.productTitle, money(c.earlierMedianBani), money(c.peakBani), c.peakDay, money(c.eventMinBani), c.eventMinDay, c.raisePct]),
    ),
  };
}
