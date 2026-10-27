import type { GroupStats, ProductDrop } from './schema';

/**
 * Static SVG charts for reports (press PNGs and the public page). Pure string builders, light
 * theme (the site has no dark mode). Colours follow the data-viz method: a diverging blue ↔ red
 * pair with a neutral gray midpoint for "real drop / no real drop / higher" (validated: CVD ΔE 8.7,
 * contrast ≥ 3:1), one blue for a single series, blue + orange for two series. Text never wears a
 * series colour; every chart has a legend for ≥ 2 series, selective direct labels and a table
 * twin (Markdown/CSV and the page's tables).
 */

export const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', surface: '#fcfcfb' } as const;
export const CLASS_COLORS = { real_drop: '#2a78d6', no_real_drop: '#898781', higher: '#e34948' } as const;
const SERIES = ['#2a78d6', '#eb6834'] as const;
const FONT = `system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`;

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const pctFmt = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
export const pct = (x: number) => `${pctFmt.format(Math.round(x * 100))}%`;
const leiFmt = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions);
export const lei = (bani: number) => `${leiFmt.format(bani / 100)} lei`;
const leiShortFmt = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions);
const leiShort = (bani: number) => `${leiShortFmt.format(Math.round(bani / 100))} lei`;
const dayFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const roDay = (day: string) => dayFmt.format(new Date(`${day}T00:00:00Z`));

/** Rough text width for layout decisions (system sans, ~0.56 em per character). */
const textWidth = (s: string, size: number) => s.length * size * 0.56;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** A horizontal bar segment: square at the start, 4px rounded at the data end when `roundEnd`. */
function hbar(x: number, y: number, w: number, h: number, fill: string, roundEnd: boolean, title: string): string {
  if (w <= 0) return '';
  const r = roundEnd ? Math.min(4, w / 2, h / 2) : 0;
  const d = r
    ? `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`
    : `M${x},${y}H${x + w}V${y + h}H${x}Z`;
  return `<path d="${d}" fill="${fill}"><title>${esc(title)}</title></path>`;
}

function frame(width: number, height: number, title: string, subtitle: string, body: string, source: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t d" font-family="${FONT}">`,
    `<title id="t">${esc(title)}</title><desc id="d">${esc(subtitle)}</desc>`,
    `<rect width="${width}" height="${height}" fill="${INK.surface}"/>`,
    `<text x="24" y="34" font-size="18" font-weight="600" fill="${INK.primary}">${esc(title)}</text>`,
    `<text x="24" y="56" font-size="13" fill="${INK.secondary}">${esc(subtitle)}</text>`,
    body,
    `<text x="24" y="${height - 14}" font-size="11" fill="${INK.muted}">${esc(source)}</text>`,
    '</svg>',
  ].join('');
}

function legend(items: Array<[string, string]>, x: number, y: number): string {
  let cx = x;
  const out: string[] = [];
  for (const [color, label] of items) {
    out.push(`<rect x="${cx}" y="${y - 9}" width="12" height="12" rx="2" fill="${color}"/>`);
    out.push(`<text x="${cx + 18}" y="${y + 1}" font-size="12" fill="${INK.secondary}">${esc(label)}</text>`);
    cx += 18 + textWidth(label, 12) + 22;
  }
  return out.join('');
}

/**
 * 100% stacked bars per group (shop, seller type, category): offers with history split into
 * real drop / no real drop / higher. Segment labels only where they fit.
 */
export function classShareChart(groups: GroupStats[], opts: { title: string; subtitle: string; source: string }): string {
  const rows = groups.filter((g) => g.withHistory > 0);
  const width = 960;
  const labelW = 210;
  const x0 = 24 + labelW;
  const barW = width - x0 - 90;
  const rowH = 38;
  const top = 104;
  const height = top + Math.max(1, rows.length) * rowH + 56;
  const parts: string[] = [
    legend(
      [
        [CLASS_COLORS.real_drop, 'Scădere reală (≥ 2% sub minimul de 30 de zile)'],
        [CLASS_COLORS.no_real_drop, 'Fără scădere reală (± 2%)'],
        [CLASS_COLORS.higher, 'Mai scump'],
      ],
      24,
      84,
    ),
  ];
  rows.forEach((g, i) => {
    const y = top + i * rowH;
    const h = 22;
    parts.push(`<text x="24" y="${y + 15}" font-size="13" fill="${INK.primary}">${esc(truncate(g.label, 30))}</text>`);
    const segs: Array<[keyof typeof CLASS_COLORS, number]> = [
      ['real_drop', g.realDrop],
      ['no_real_drop', g.noRealDrop],
      ['higher', g.higher],
    ];
    const visible = segs.filter(([, n]) => n > 0);
    let x = x0;
    visible.forEach(([cls, n], k) => {
      const share = n / g.withHistory;
      const last = k === visible.length - 1;
      const w = Math.max(1, share * barW - (last ? 0 : 2)); // 2px surface gap between segments
      const name = cls === 'real_drop' ? 'scădere reală' : cls === 'no_real_drop' ? 'fără scădere reală' : 'mai scump';
      parts.push(hbar(x, y, w, h, CLASS_COLORS[cls], last, `${g.label}: ${name} ${pct(share)} (${n} din ${g.withHistory})`));
      const label = pct(share);
      if (textWidth(label, 12) + 12 <= w) {
        parts.push(`<text x="${x + w / 2}" y="${y + 15}" font-size="12" font-weight="600" text-anchor="middle" fill="#ffffff">${label}</text>`);
      }
      x += w + (last ? 0 : 2);
    });
    parts.push(`<text x="${x0 + barW + 10}" y="${y + 15}" font-size="12" fill="${INK.muted}">n = ${g.withHistory}</text>`);
  });
  return frame(width, height, opts.title, opts.subtitle, parts.join(''), opts.source);
}

/** Biggest real drops (one series): product, bar to the drop, value at the bar tip. */
export function dropsChart(drops: ProductDrop[], opts: { title: string; subtitle: string; source: string; limit?: number }): string {
  const rows = drops.slice(0, opts.limit ?? 10);
  const width = 960;
  const labelW = 330;
  const x0 = 24 + labelW;
  const barW = width - x0 - 230;
  const rowH = 34;
  const top = 84;
  const height = top + Math.max(1, rows.length) * rowH + 70;
  const max = Math.max(0.1, Math.ceil(Math.max(0, ...rows.map((r) => r.dropPct)) * 10) / 10);
  const parts: string[] = [];
  // Hairline grid at 0, 10%, 20%… (solid, recessive).
  for (let t = 0; t <= max + 1e-9; t += 0.1) {
    const x = x0 + (t / max) * barW;
    parts.push(`<line x1="${x}" y1="${top - 8}" x2="${x}" y2="${top + rows.length * rowH}" stroke="${t === 0 ? INK.axis : INK.grid}" stroke-width="1"/>`);
    parts.push(`<text x="${x}" y="${top + rows.length * rowH + 18}" font-size="11" text-anchor="middle" fill="${INK.muted}">${pct(t)}</text>`);
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const w = (r.dropPct / max) * barW;
    parts.push(`<text x="24" y="${y + 16}" font-size="13" fill="${INK.primary}">${esc(truncate(r.title, 46))}</text>`);
    parts.push(hbar(x0, y + 2, w, 20, SERIES[0], true, `${r.title}: −${pct(r.dropPct)} (${lei(r.min30Bani)} → ${lei(r.eventMinBani)})`));
    parts.push(
      `<text x="${x0 + w + 8}" y="${y + 16}" font-size="12" fill="${INK.secondary}"><tspan font-weight="600" fill="${INK.primary}">−${pct(r.dropPct)}</tspan>  ${esc(`${leiShort(r.min30Bani)} → ${leiShort(r.eventMinBani)}`)}</text>`,
    );
  });
  if (rows.length === 0) parts.push(`<text x="24" y="${top + 16}" font-size="13" fill="${INK.secondary}">Nicio scădere reală de cel puțin 2% în această perioadă.</text>`);
  return frame(width, height, opts.title, opts.subtitle, parts.join(''), opts.source);
}

export interface SeriesPoint {
  day: string;
  bani: number | null;
}

/**
 * One offer's observed price and the shop's displayed reference price over time (step lines;
 * gaps stay gaps), with the event window shaded.
 */
export function offerHistoryChart(
  price: SeriesPoint[],
  reference: SeriesPoint[],
  opts: { title: string; subtitle: string; source: string; window: { from: string; to: string }; windowLabel: string },
): string {
  const width = 960;
  const height = 436;
  const left = 96;
  const right = width - 140;
  const top = 112;
  const bottom = height - 70;
  const days = [...new Set([...price, ...reference].map((p) => p.day))].sort();
  if (days.length === 0) return frame(width, height, opts.title, opts.subtitle, '', opts.source);
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const tMin = t(days[0]!);
  const tMax = t(days.at(-1)!) + 86_400_000;
  const xs = (d: string) => left + ((t(d) - tMin) / (tMax - tMin)) * (right - left);
  const vals = [...price, ...reference].map((p) => p.bani).filter((v): v is number => v !== null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.12, hi * 0.02, 100);
  const step = niceStep((hi - lo + 2 * pad) / 4);
  const yMin = Math.floor((lo - pad) / step) * step;
  const yMax = Math.ceil((hi + pad) / step) * step;
  const ys = (v: number) => bottom - ((v - yMin) / (yMax - yMin)) * (bottom - top);
  const parts: string[] = [];
  // Event window band (a wash, not a series).
  const wx0 = xs(opts.window.from < days[0]! ? days[0]! : opts.window.from);
  const wx1 = Math.min(right, xs(opts.window.to) + (right - left) / Math.max(1, (tMax - tMin) / 86_400_000));
  if (wx1 > wx0) {
    parts.push(`<rect x="${wx0}" y="${top}" width="${wx1 - wx0}" height="${bottom - top}" fill="#f0efec"/>`);
    parts.push(`<text x="${wx0 + 6}" y="${top + 16}" font-size="12" fill="${INK.secondary}">${esc(opts.windowLabel)}</text>`);
  }
  for (let v = yMin; v <= yMax + 1e-6; v += step) {
    parts.push(`<line x1="${left}" y1="${ys(v)}" x2="${right}" y2="${ys(v)}" stroke="${v === yMin ? INK.axis : INK.grid}" stroke-width="1"/>`);
    parts.push(`<text x="${left - 8}" y="${ys(v) + 4}" font-size="11" text-anchor="end" fill="${INK.muted}">${esc(leiShort(v))}</text>`);
  }
  const tickEvery = Math.max(1, Math.round(days.length / 6));
  days.forEach((d, i) => {
    if (i % tickEvery === 0) parts.push(`<text x="${xs(d)}" y="${bottom + 18}" font-size="11" text-anchor="middle" fill="${INK.muted}">${esc(roDay(d))}</text>`);
  });
  const stepPath = (pts: SeriesPoint[]) => {
    const byDay = new Map(pts.map((p) => [p.day, p.bani]));
    let d = '';
    let open = false;
    for (let i = 0; i < days.length; i++) {
      const v = byDay.get(days[i]!) ?? null;
      const x = xs(days[i]!);
      const xNext = i + 1 < days.length ? xs(days[i + 1]!) : right;
      if (v === null) {
        open = false;
        continue;
      }
      d += `${open ? 'L' : 'M'}${x},${ys(v)}H${xNext}`;
      open = true;
    }
    return d;
  };
  const series: Array<[SeriesPoint[], string, string]> = [
    [reference, SERIES[1], 'Preț de referință afișat de magazin'],
    [price, SERIES[0], 'Prețul observat de Pretoscop'],
  ];
  for (const [pts, color] of series) {
    const d = stepPath(pts);
    if (d) parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  // Direct labels at the series ends (with the legend, never colour alone).
  for (const [pts, color, name] of series) {
    const last = [...pts].reverse().find((p) => p.bani !== null);
    if (!last) continue;
    parts.push(`<circle cx="${right}" cy="${ys(last.bani!)}" r="4" fill="${color}" stroke="${INK.surface}" stroke-width="2"><title>${esc(`${name}: ${lei(last.bani!)}`)}</title></circle>`);
    parts.push(`<text x="${right + 10}" y="${ys(last.bani!) + 4}" font-size="12" fill="${INK.secondary}">${esc(leiShort(last.bani!))}</text>`);
  }
  parts.push(
    legend(
      [
        [SERIES[0], 'Prețul observat de Pretoscop'],
        [SERIES[1], 'Preț de referință afișat de magazin'],
      ],
      24,
      82,
    ),
  );
  return frame(width, height, opts.title, opts.subtitle, parts.join(''), opts.source);
}

function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
