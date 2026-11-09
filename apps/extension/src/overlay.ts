import { formatDay, formatLei, formatRelative, plural } from './format';
import type { LookupData } from './lookup-data';
import type { ShopId } from './shops';
import { sparkline } from './sparkline';

/**
 * The Pretoscop panel: one element appended to the shop page, everything else inside its shadow
 * root (the page's CSS cannot reach in, ours cannot leak out). Built with DOM calls only: every
 * value from the API is set as text (`textContent`), never parsed as HTML. The panel adds no link
 * to the shop page and changes nothing on it; its one link goes to the product page on Pretoscop,
 * plain (no tracking or affiliate parameters). It takes no focus by itself; Escape (with focus in
 * the panel) or the close button removes it.
 */
export const HOST_ID = 'pretoscop-ext-host';

export interface PanelContext {
  shopId: ShopId;
  siteBase: string;
  now: number;
  onClose: () => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const TONE: Record<LookupData['verdict']['code'], 'good' | 'neutral' | 'high'> = {
  good_price: 'good',
  usual: 'neutral',
  above_usual: 'high',
  insufficient_data: 'neutral',
};

// Inline !important on the host keeps the page's own rules (e.g. `html > div { display: none }`) off it.
const HOST_STYLE: Array<[string, string]> = [
  ['all', 'initial'],
  ['display', 'block'],
  ['position', 'fixed'],
  ['right', '16px'],
  ['bottom', '16px'],
  ['z-index', '2147483646'],
  ['width', '340px'],
  ['max-width', 'calc(100vw - 32px)'],
  ['margin', '0'],
  ['padding', '0'],
  ['border', '0'],
];

export const PANEL_CSS = `
.panel{box-sizing:border-box;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#1f2933;background:#fff;border:1px solid #d8dee4;border-radius:12px;box-shadow:0 8px 24px rgba(16,24,40,.18);padding:10px 14px 12px;max-height:min(80vh,640px);overflow:auto;text-align:left;letter-spacing:normal;text-transform:none}
.panel *,.panel *::before,.panel *::after{box-sizing:border-box}
:focus-visible{outline:2px solid #1d7a73;outline-offset:2px}
.head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 4px}
.brand{margin:0;font-size:14px;font-weight:700;color:#1d7a73}
.close{appearance:none;border:0;background:transparent;color:#374151;font:inherit;font-size:22px;line-height:1;width:32px;height:32px;border-radius:8px;cursor:pointer;padding:0}
.close:hover{background:#f1f5f9}
.title{margin:0 0 8px;font-size:13px;color:#4b5563;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.label{margin:0;font-size:12px;color:#4b5563}
.best{margin:2px 0 0;font-size:22px;font-weight:700;color:#111827;font-variant-numeric:tabular-nums}
.where{margin:2px 0 0;font-size:13px;color:#374151}
.muted{color:#6b7280;font-size:12px}
.badges{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0 4px;padding:0;list-style:none}
.badge{display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:600}
.tone-good{background:#dcfce7;color:#14532d}
.tone-neutral{background:#f1f5f9;color:#334155}
.tone-high{background:#fee2e2;color:#7f1d1d}
.text{margin:0 0 4px;font-size:12px;color:#374151}
h2{margin:10px 0 2px;font-size:12px;font-weight:600;color:#4b5563}
.spark{display:block;width:100%;height:56px;margin:4px 0 2px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0;padding:0}
.stats div{margin:0}
.stats dt{margin:0;font-size:11px;color:#6b7280}
.stats dd{margin:0;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.offers{list-style:none;margin:4px 0 0;padding:0}
.offers li{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid #eef2f6;font-size:13px}
.offers .price{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.link{display:block;margin:10px 0 6px;color:#1d7a73;font-weight:600;text-decoration:underline}
.note{margin:0;font-size:11px;color:#6b7280}
`;

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const lei = (bani: number) => formatLei(`${Math.floor(bani / 100)}.${String(bani % 100).padStart(2, '0')}`);

function applyStyles(doc: Document, root: ShadowRoot): void {
  try {
    // A constructed sheet is not subject to the page's style-src CSP.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(PANEL_CSS);
    root.adoptedStyleSheets = [sheet];
    if (root.adoptedStyleSheets.length === 1) return;
  } catch {
    // Older engines or a content-script sandbox without constructable sheets: a <style> element.
  }
  root.append(el(doc, 'style', undefined, PANEL_CSS));
}

function shippingText(shipping: string | null): string {
  if (shipping === null) return 'livrare de verificat';
  if (shipping === '0.00') return 'livrare gratuită';
  return `include livrarea de ${formatLei(shipping)}`;
}

function sparkSvg(doc: Document, data: LookupData): SVGSVGElement | null {
  const s = sparkline(data.history);
  if (!s) return null;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('viewBox', `0 0 ${s.width} ${s.height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  const days = s.observedDays === 1 ? '1 zi observată' : `${plural(s.observedDays, 'zi', 'zile')} observate`;
  const label =
    s.firstDay === s.lastDay
      ? `Cel mai mic preț total observat pe ${formatDay(s.firstDay)}: ${lei(s.lowBani)}.`
      : `Cel mai mic preț total pe zi, ${days} între ${formatDay(s.firstDay)} și ${formatDay(s.lastDay)}: între ${lei(s.lowBani)} și ${lei(s.highBani)}.`;
  svg.setAttribute('aria-label', label);
  const title = doc.createElementNS(SVG_NS, 'title');
  title.textContent = label;
  svg.append(title);
  for (const d of s.paths) {
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#1d7a73');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(p);
  }
  for (const dot of s.dots) {
    const c = doc.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(dot.x));
    c.setAttribute('cy', String(dot.y));
    c.setAttribute('r', '2');
    c.setAttribute('fill', '#1d7a73');
    svg.append(c);
  }
  return svg;
}

/** Worth showing: at least a current offer or some history (an empty panel helps nobody). */
export function worthShowing(data: LookupData): boolean {
  return data.bestOffers.length > 0 || data.history.length > 0;
}

/** Builds the panel host (not yet attached); `ctx.onClose` runs after it removed itself. */
export function buildPanel(doc: Document, data: LookupData, ctx: PanelContext): HTMLElement {
  const host = doc.createElement('div');
  host.id = HOST_ID;
  for (const [k, v] of HOST_STYLE) host.style.setProperty(k, v, 'important');
  const root = host.attachShadow({ mode: 'open' });
  applyStyles(doc, root);

  const panel = el(doc, 'section', 'panel');
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Pretoscop: istoricul prețului');
  panel.setAttribute('lang', 'ro');

  const close = () => {
    host.remove();
    ctx.onClose();
  };
  const head = el(doc, 'div', 'head');
  head.append(el(doc, 'p', 'brand', 'Pretoscop · istoricul prețului'));
  const btn = el(doc, 'button', 'close', '×');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Închide panoul Pretoscop');
  btn.addEventListener('click', close);
  head.append(btn);
  panel.append(head);
  panel.append(el(doc, 'p', 'title', data.title));

  const best = data.bestOffers[0];
  panel.append(el(doc, 'p', 'label', 'Cel mai mic preț total acum'));
  if (best) {
    panel.append(el(doc, 'p', 'best', formatLei(best.total)));
    const seller = best.marketplace ? ` (vânzător terț${best.sellerName ? `: ${best.sellerName}` : ''})` : '';
    panel.append(el(doc, 'p', 'where', `la ${best.shopName}${seller} · ${shippingText(best.shipping)}`));
    panel.append(el(doc, 'p', 'muted', `Verificat ${formatRelative(best.checkedAt, ctx.now)}`));
    if (best.shop === ctx.shopId) panel.append(el(doc, 'p', 'text', 'Cel mai mic preț total este chiar la acest magazin.'));
  } else {
    panel.append(el(doc, 'p', 'where', 'Nicio ofertă nouă în stoc, verificată recent.'));
  }

  const badges = el(doc, 'ul', 'badges');
  const verdict = el(doc, 'li', `badge tone-${TONE[data.verdict.code]}`, data.verdict.label);
  badges.append(verdict);
  for (const b of data.badges) {
    const li = el(doc, 'li', 'badge tone-good', b.label);
    li.title = b.text;
    badges.append(li);
  }
  panel.append(badges);
  panel.append(el(doc, 'p', 'text', data.verdict.text));
  for (const b of data.badges) panel.append(el(doc, 'p', 'note', b.text));

  const svg = sparkSvg(doc, data);
  if (svg) {
    panel.append(el(doc, 'h2', undefined, 'Istoricul prețului'));
    panel.append(svg);
    const days = data.observationsDays === 1 ? '1 zi observată' : `${plural(data.observationsDays, 'zi', 'zile')} observate`;
    panel.append(el(doc, 'p', 'muted', data.historyStartedAt ? `Din ${formatDay(data.historyStartedAt)} · ${days}` : days));
  }
  const stats = el(doc, 'dl', 'stats');
  for (const [k, v] of [
    ['Minim 30 de zile', data.low30d],
    ['Minim istoric', data.lowAllTime],
    ['Mediana 30 de zile', data.median30d],
  ] as const) {
    const d = el(doc, 'div');
    d.append(el(doc, 'dt', undefined, k), el(doc, 'dd', undefined, formatLei(v)));
    stats.append(d);
  }
  panel.append(stats);

  if (data.bestOffers.length > 1) {
    panel.append(el(doc, 'h2', undefined, 'Cele mai mici prețuri totale'));
    const list = el(doc, 'ul', 'offers');
    for (const o of data.bestOffers) {
      const li = el(doc, 'li');
      const who = el(doc, 'span', undefined, `${o.shopName}${o.marketplace ? ' (vânzător terț)' : ''}${o.shop === ctx.shopId ? ' · acest magazin' : ''}`);
      who.append(el(doc, 'br'), el(doc, 'span', 'muted', `verificat ${formatRelative(o.checkedAt, ctx.now)}`));
      li.append(who, el(doc, 'span', 'price', formatLei(o.total)));
      list.append(li);
    }
    panel.append(list);
  }

  const link = el(doc, 'a', 'link', 'Vezi toate ofertele și istoricul pe Pretoscop');
  link.href = `${ctx.siteBase}/p/${data.slug}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  panel.append(link);
  panel.append(
    el(doc, 'p', 'note', 'Prețuri observate de Pretoscop: preț + livrare cunoscută. Prețul final este cel afișat de magazin la plasarea comenzii.'),
  );

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });
  root.append(panel);
  return host;
}
