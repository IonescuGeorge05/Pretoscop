'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { formatDayMonth, formatLeiShort } from '@/lib/format';

type Range = '30d' | '90d' | '1y' | 'all';
interface History {
  range: Range;
  series: { min: Array<[string, number]>; marketplace?: Array<[string, number]>; shops: Record<string, Array<[string, number]>> };
  shops: Record<string, { name: string }>;
}

const RANGES: Array<[Range, string, number | null]> = [
  ['30d', '30 de zile', 30],
  ['90d', '90 de zile', 90],
  ['1y', '1 an', 365],
  ['all', 'Tot', null],
];
const PALETTE = ['#2563eb', '#b45309', '#7c3aed', '#be185d', '#0f766e', '#4d7c0f', '#9a3412', '#475569'];
const DAY = 86_400;
const HEIGHT = 260;

const toSec = (d: string) => Date.parse(`${d}T12:00:00Z`) / 1000;
const lei = (v: number | null | undefined) => (v == null ? '—' : formatLeiShort(Math.round(v * 100)));

/**
 * Daily lowest total across shops (solid), marketplace sellers (dotted) and one step line per shop
 * (dashed). Days without observations stay empty: gaps are never bridged. The x axis covers the
 * observed part of the selected window (at least a week), so a young history is not squeezed into
 * the right edge of an empty year.
 */
export function PriceChart({ productId }: { productId: number }) {
  const [range, setRange] = useState<Range>('90d');
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  // uPlot (~20 kB compressed) loads only when the chart comes near the viewport (M16 performance
  // budget: it is below the fold on phones, and most visitors read the offers first).
  const [UPlot, setUPlot] = useState<typeof uPlot | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let done = false;
    const load = () => {
      if (done) return;
      done = true;
      void import('uplot').then((m) => setUPlot(() => m.default));
    };
    if (typeof IntersectionObserver === 'undefined') {
      load();
      return;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && (load(), io.disconnect()), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/products/${productId}/history?range=${range}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((h: History) => !cancelled && (setData(h), setError(false)))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [productId, range]);

  const aligned = useMemo(() => {
    if (!data) return null;
    const mp = data.series.marketplace ?? [];
    const shops = Object.keys(data.series.shops);
    const days = new Set<string>();
    for (const [d] of data.series.min) days.add(d);
    for (const [d] of mp) days.add(d);
    for (const s of shops) for (const [d] of data.series.shops[s]!) days.add(d);
    if (days.size === 0) return null;
    const xs = [...days].sort();
    const col = (s: Array<[string, number]>) => {
      const m = new Map(s);
      return xs.map((d) => m.get(d) ?? null);
    };
    const windowDays = RANGES.find(([r]) => r === data.range)?.[2] ?? null;
    return { x: xs.map(toSec), min: col(data.series.min), mp: mp.length ? col(mp) : null, shops, cols: shops.map((s) => col(data.series.shops[s]!)), windowDays, points: xs.length };
  }, [data]);

  useEffect(() => {
    if (!box.current || !aligned || !data || !UPlot) return;
    const uPlot = UPlot;
    // x range: the observed part of the window up to today, at least a week wide.
    const today = Math.max(aligned.x.at(-1)!, Math.floor(Date.now() / 1000 / DAY) * DAY + DAY / 2);
    const windowStart = aligned.windowDays === null ? -Infinity : today - (aligned.windowDays - 1) * DAY;
    const x1 = today + DAY / 2;
    const x0 = Math.min(Math.max(windowStart, aligned.x[0]! - DAY), x1 - 7 * DAY);
    const stepped = uPlot.paths.stepped!({ align: 1 });
    const sparse = aligned.points <= 3;
    const line = (label: string, stroke: string, width: number, dash?: number[]): uPlot.Series => ({
      label,
      stroke,
      width,
      paths: stepped,
      spanGaps: false,
      points: { show: sparse, size: 6, fill: stroke },
      value: (_u, v) => lei(v),
      ...(dash ? { dash } : {}),
    });
    const opts: uPlot.Options = {
      width: box.current.clientWidth,
      height: HEIGHT,
      tzDate: (ts) => uPlot.tzDate(new Date(ts * 1000), 'Europe/Bucharest'),
      legend: { show: true },
      cursor: { drag: { x: false, y: false } },
      scales: {
        x: { time: true, range: () => [x0, x1] },
        y: {
          range: (_u, min, max) => {
            if (min == null || max == null) return [0, 1];
            const pad = Math.max((max - min) * 0.15, max * 0.03, 1);
            return [Math.max(0, min - pad), max + pad];
          },
        },
      },
      axes: [
        { stroke: '#64748b', grid: { stroke: '#eef2f6' }, values: (_u, splits) => splits.map((v) => formatDayMonth(v * 1000)) },
        { stroke: '#64748b', grid: { stroke: '#eef2f6' }, size: 70, values: (_u, vals) => vals.map((v) => lei(v)) },
      ],
      series: [
        { label: 'Data', value: (_u, v) => (v == null ? '—' : new Date(v * 1000).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Bucharest' })) },
        line('Cel mai mic preț total', '#15803d', 2.5),
        ...(aligned.mp ? [line('Marketplace (vânzători terți)', '#64748b', 1.5, [2, 3])] : []),
        ...aligned.shops.map((s, i) => line(data.shops[s]?.name ?? s, PALETTE[i % PALETTE.length]!, 1.25, [5, 3])),
      ],
    };
    plot.current?.destroy();
    plot.current = new uPlot(opts, [aligned.x, aligned.min, ...(aligned.mp ? [aligned.mp] : []), ...aligned.cols] as uPlot.AlignedData, box.current);
    const ro = new ResizeObserver(() => box.current && plot.current?.setSize({ width: box.current.clientWidth, height: HEIGHT }));
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
  }, [aligned, data, UPlot]);

  const summary = useMemo(() => {
    const vals = data?.series.min.map(([, v]) => v) ?? [];
    if (!vals.length || !data) return null;
    return `Între ${data.series.min[0]![0]} și ${data.series.min.at(-1)![0]}: minim ${lei(Math.min(...vals))}, maxim ${lei(Math.max(...vals))}, ultimul ${lei(vals.at(-1))}.`;
  }, [data]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Interval istoric">
        {RANGES.map(([r, label]) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={range === r ? 'rounded-md bg-brand-600 px-3 py-1 text-sm font-semibold text-white' : 'rounded-md bg-surface px-3 py-1 text-sm text-ink-soft ring-1 ring-line'}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-high">Istoricul nu a putut fi încărcat.</p>}
      {!error && data && !aligned && <p className="rounded-lg bg-surface p-4 text-sm text-muted">Încă nu avem observații în acest interval.</p>}
      <div
        ref={box}
        className="w-full"
        // Room for the chart while the data and the chart library load (no layout shift), none once
        // the window turns out to be empty.
        style={{ minHeight: (!data && !error) || aligned ? HEIGHT : undefined }}
        role="img" aria-label={summary ? `Grafic cu istoricul prețului. ${summary}` : 'Grafic cu istoricul prețului'} data-testid="price-chart" />
    </div>
  );
}
