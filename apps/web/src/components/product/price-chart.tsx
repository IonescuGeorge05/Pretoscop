'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { formatLeiShort } from '@/lib/format';

type Range = '30d' | '90d' | '1y' | 'all';
interface History {
  range: Range;
  series: { min: Array<[string, number]>; shops: Record<string, Array<[string, number]>> };
  shops: Record<string, { name: string }>;
}

const RANGES: Array<[Range, string]> = [
  ['30d', '30 de zile'],
  ['90d', '90 de zile'],
  ['1y', '1 an'],
  ['all', 'Tot'],
];
const PALETTE = ['#1d7a73', '#2563eb', '#b45309', '#7c3aed', '#be185d', '#0f766e', '#4d7c0f', '#9a3412'];

/** Daily minimum total across shops plus one step line per shop; missing days stay empty (gaps). */
export function PriceChart({ productId }: { productId: number }) {
  const [range, setRange] = useState<Range>('90d');
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

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
    if (!data || data.series.min.length === 0) return null;
    const days = new Set<string>();
    data.series.min.forEach(([d]) => days.add(d));
    Object.values(data.series.shops).forEach((s) => s.forEach(([d]) => days.add(d)));
    const xs = [...days].sort();
    const toSec = (d: string) => Date.parse(`${d}T12:00:00Z`) / 1000;
    const col = (s: Array<[string, number]>) => {
      const m = new Map(s);
      return xs.map((d) => m.get(d) ?? null);
    };
    const shops = Object.keys(data.series.shops);
    return { x: xs.map(toSec), min: col(data.series.min), shops, cols: shops.map((s) => col(data.series.shops[s]!)) };
  }, [data]);

  useEffect(() => {
    if (!box.current || !aligned || !data) return;
    const stepped = uPlot.paths.stepped!({ align: 1 });
    const opts: uPlot.Options = {
      width: box.current.clientWidth,
      height: 260,
      tzDate: (ts) => uPlot.tzDate(new Date(ts * 1000), 'Europe/Bucharest'),
      legend: { show: true },
      cursor: { drag: { x: false, y: false } },
      scales: { x: { time: true } },
      axes: [
        { stroke: '#64748b', grid: { stroke: '#eef2f6' } },
        { stroke: '#64748b', grid: { stroke: '#eef2f6' }, size: 70, values: (_u, vals) => vals.map((v) => formatLeiShort(Math.round(v * 100))) },
      ],
      series: [
        { value: (_u, v) => (v == null ? '—' : new Date(v * 1000).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' })) },
        { label: 'Cel mai mic preț total', stroke: '#15803d', width: 2.5, paths: stepped, spanGaps: false, value: (_u, v) => (v == null ? '—' : formatLeiShort(Math.round(v * 100))) },
        ...aligned.shops.map((s, i) => ({
          label: data.shops[s]?.name ?? s,
          stroke: PALETTE[i % PALETTE.length],
          width: 1.25,
          paths: stepped,
          spanGaps: false,
          dash: [4, 3],
          value: (_u: uPlot, v: number | null) => (v == null ? '—' : formatLeiShort(Math.round(v * 100))),
        })),
      ],
    };
    plot.current?.destroy();
    plot.current = new uPlot(opts, [aligned.x, aligned.min, ...aligned.cols] as uPlot.AlignedData, box.current);
    const ro = new ResizeObserver(() => box.current && plot.current?.setSize({ width: box.current.clientWidth, height: 260 }));
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
  }, [aligned, data]);

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
      <div ref={box} className="w-full" aria-label="Grafic cu istoricul prețului" role="img" />
    </div>
  );
}
