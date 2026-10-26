"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatLei, formatShortDate } from "@/lib/format";
import { IS_STATIC, dataUrl } from "@/lib/static";
import type { CalendarEvent, History } from "@/lib/types";

// slot categorial fix per magazin: culoarea urmează magazinul, nu rangul lui
const SHOP_SLOT: Record<string, number> = { emag: 1, altex: 2, flanco: 3, pcgarage: 4, evomag: 5 };
const RANGES = [
  { v: "30d", label: "30 zile" },
  { v: "90d", label: "90 zile" },
  { v: "1y", label: "1 an" },
] as const;
const GRANULARITIES = [
  { v: "day", label: "Zi" },
  { v: "week", label: "Săptămână" },
] as const;
const EVENT_SHORT: Record<string, string> = {
  black_friday: "Black Friday",
  singles_day: "11.11",
  craciun: "Crăciun",
  paste: "Paște",
  back_to_school: "Back to school",
};
const DAY = 86400000;
const LABEL_ROW_PX = 16;

type Row = Record<string, number | string | null> & { t: number };

function useCssVars(names: string[]): Record<string, string> {
  const [vars, setVars] = useState<Record<string, string>>({});
  const key = names.join(",");
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      setVars(Object.fromEntries(key.split(",").map((n) => [n, cs.getPropertyValue(n).trim()])));
    };
    read();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [key]);
  return vars;
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { v: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-card p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          className={`rounded-md px-3 py-1 ${value === o.v ? "bg-ink text-surface" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Rânduri de etichete pentru evenimente: cele apropiate în timp coboară pe rândul următor, ca să nu se suprapună. */
function labelRows(events: CalendarEvent[], domain: [number, number]): Map<CalendarEvent, number> {
  const minGap = (domain[1] - domain[0]) * 0.11;
  const lastStart: number[] = [];
  const rows = new Map<CalendarEvent, number>();
  for (const e of [...events].sort((a, b) => a.start.localeCompare(b.start))) {
    const x = Math.max(new Date(e.start).getTime(), domain[0]);
    let row = lastStart.findIndex((s) => x - s >= minGap);
    if (row === -1) row = lastStart.length;
    lastStart[row] = x;
    rows.set(e, row);
  }
  return rows;
}

function EventLabel(props: { viewBox?: { x: number; y: number }; text: string; row: number; color: string }) {
  const { viewBox, text, row, color } = props;
  if (!viewBox) return null;
  return (
    <text x={viewBox.x + 3} y={viewBox.y - 6 - row * LABEL_ROW_PX} fontSize={11} fill={color}>
      {text}
    </text>
  );
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" });

function TooltipBox({
  active,
  payload,
  label,
  weekly,
  events,
  shopNames,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey: string; payload: Row }[];
  label?: number;
  weekly: boolean;
  events: CalendarEvent[];
  shopNames: Record<string, string>;
}) {
  if (!active || label === undefined) return null;
  const row = payload?.[0]?.payload;
  const items = (payload ?? [])
    .filter((p) => typeof p.value === "number" && p.dataKey !== "market_min")
    .sort((a, b) => a.value - b.value);
  const min = typeof row?.market_min === "number" ? row.market_min : null;
  const minShop = row?.min_shop ? shopNames[String(row.min_shop)] : null;
  // sărbătorile în care cade ziua (sau săptămâna) de sub cursor, cu începutul și sfârșitul exact
  const end = label + (weekly ? 6 * DAY : 0);
  const inEvents = events.filter((e) => new Date(e.start).getTime() <= end && new Date(e.end).getTime() + DAY > label);
  return (
    <div className="max-w-xs rounded-lg border border-line bg-card px-3 py-2 text-xs text-ink shadow-lg">
      <p className="mb-1 font-semibold text-ink">
        {weekly
          ? `Săptămâna din ${formatShortDate(label)}`
          : new Date(label).toLocaleDateString("ro-RO", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
      </p>
      {inEvents.map((e) => (
        <p key={`${e.slug}-${e.date}`} className="mb-1 rounded bg-surface px-1.5 py-1">
          <strong>{e.name}</strong>: {fmtDay(e.start)} – {fmtDay(e.end)}
        </p>
      ))}
      {items.length === 0 && (
        <p className="text-muted">Fără date în această zi (scraperul nu a rulat / nicio captură în arhivă).</p>
      )}
      {min !== null && (
        <p className="flex items-center justify-between gap-4 border-b border-line pb-1 font-semibold">
          <span>Minim piață{minShop ? ` (${minShop})` : ""}</span>
          <span className="tabular-nums">{formatLei(min)}</span>
        </p>
      )}
      {items.map((p) => (
        <p key={p.dataKey} className="mt-0.5 flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
            {row?.[`${p.dataKey}__wb`] ? <span className="text-muted">· arhivă</span> : null}
          </span>
          <span className="tabular-nums">{formatLei(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

/** Tick-uri rotunde pe axa Y + MSRP-ul exact (evidențiat), fără tick-uri prea apropiate de el. */
function yTicks(min: number, max: number, msrp: number | null): number[] {
  const raw = (max - min) / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  if (msrp === null) return ticks;
  return [...ticks.filter((t) => Math.abs(t - msrp) > step * 0.45), msrp].sort((a, b) => a - b);
}

function YTick(props: {
  x?: number;
  y?: number;
  payload?: { value: number };
  msrp: number | null;
  color: string;
  strong: string;
}) {
  const { x = 0, y = 0, payload, msrp, color, strong } = props;
  if (!payload) return null;
  const isMsrp = msrp !== null && payload.value === msrp;
  return (
    <g transform={`translate(${x},${y})`}>
      {isMsrp && (
        <text x={-4} y={-9} textAnchor="end" fontSize={9} fontWeight={600} fill={strong}>
          MSRP
        </text>
      )}
      <text x={-4} y={4} textAnchor="end" fontSize={11} fontWeight={isMsrp ? 700 : 400} fill={isMsrp ? strong : color}>
        {new Intl.NumberFormat("ro-RO").format(payload.value)}
      </text>
    </g>
  );
}

export default function PriceChart({
  initial,
  slug,
  source,
  msrp,
  msrpVerified,
}: {
  initial: History;
  slug: string;
  source?: string;
  msrp?: number | null;
  msrpVerified?: boolean;
}) {
  const [data, setData] = useState(initial);
  const [range, setRange] = useState(initial.range);
  const [granularity, setGranularity] = useState(initial.granularity);
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showMsrp, setShowMsrp] = useState(true);
  const [showMin, setShowMin] = useState(true);

  useEffect(() => {
    if (range === data.range && granularity === data.granularity) return;
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ range, granularity, ...(source ? { source } : {}) });
    setLoading(true);
    const url = IS_STATIC ? dataUrl(`history/${slug}/${range}-${granularity}.json`) : `/api/products/${slug}/history?${qs}`;
    fetch(url, { signal: ctrl.signal })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [range, granularity, slug, source, data.range, data.granularity]);

  const slotOf = (key: string, i: number) => SHOP_SLOT[key] ?? 6 + (i % 3);
  const cssNames = useMemo(
    () => [
      "--chart-ink",
      "--chart-grid",
      "--chart-event",
      "--chart-muted",
      ...data.shops.map((s, i) => `--series-${slotOf(s.key, i)}`),
    ],
    [data.shops],
  );
  const css = useCssVars(cssNames);

  const visible = data.shops.filter((s) => !hidden.has(s.key));
  const toggle = (key: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // minimul pieței se recalculează doar din magazinele selectate
  const rows: Row[] = useMemo(
    () =>
      data.points.map((p) => {
        let min: number | null = null;
        let minShop: string | null = null;
        for (const s of visible) {
          const v = p[s.key];
          if (typeof v === "number" && (min === null || v < min)) [min, minShop] = [v, s.key];
        }
        return { ...p, market_min: min, min_shop: minShop, t: new Date(p.date).getTime() };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.points, hidden],
  );

  const mins = rows.map((r) => r.market_min).filter((v): v is number => typeof v === "number");
  const sortedMins = [...mins].sort((a, b) => a - b);
  const stats = mins.length
    ? { min: sortedMins[0], median: sortedMins[Math.floor(sortedMins.length / 2)], max: sortedMins[sortedMins.length - 1] }
    : null;

  const values = rows.flatMap((r) => visible.map((s) => r[s.key]).filter((v): v is number => typeof v === "number"));
  if (msrp && showMsrp) values.push(msrp);
  const yMin = values.length ? Math.floor((Math.min(...values) * 0.97) / 50) * 50 : 0;
  const yMax = values.length ? Math.ceil((Math.max(...values) * 1.02) / 50) * 50 : 1;
  const domain: [number, number] = rows.length ? [rows[0].t, rows[rows.length - 1].t] : [0, 1];

  const eventRows = labelRows(data.events, domain);
  const labelRowCount = Math.max(0, ...Array.from(eventRows.values()).map((r) => r + 1));

  // o zi cu date între două zile fără date (ex. azi, după un gol) nu desenează segment -> o arătăm ca punct
  const isolated = (key: string, i: number) =>
    typeof rows[i]?.[key] === "number" && typeof rows[i - 1]?.[key] !== "number" && typeof rows[i + 1]?.[key] !== "number";

  return (
    <section aria-labelledby="chart-title" className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="chart-title" className="text-lg font-semibold">Istoric preț final</h2>
          <p className="text-xs text-muted">
            Preț + transport + penalizare garanție, per magazin. Benzile gri = perioade de reduceri.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented label="Interval" options={RANGES} value={range} onChange={setRange} />
          <Segmented label="Granularitate" options={GRANULARITIES} value={granularity} onChange={setGranularity} />
        </div>
      </div>

      {/* selector magazine — funcționează și ca legendă */}
      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Magazine afișate">
        {data.shops.map((s, i) => {
          const on = !hidden.has(s.key);
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${
                on ? "border-line bg-surface text-ink" : "border-dashed border-line text-muted line-through opacity-60"
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: on ? css[`--series-${slotOf(s.key, i)}`] : "transparent", border: `2px solid ${css[`--series-${slotOf(s.key, i)}`]}` }}
              />
              {s.name}
            </button>
          );
        })}
        <button
          onClick={() => setShowMin((v) => !v)}
          aria-pressed={showMin}
          title="Banda lată din spatele liniilor: cel mai mic preț final dintre magazinele selectate"
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${showMin ? "border-line text-ink" : "border-dashed border-line text-muted line-through opacity-60"}`}
        >
          <span className="inline-block h-1.5 w-4 rounded opacity-40" style={{ background: css["--chart-ink"] }} />
          Minim piață
        </button>
        {msrp ? (
          <button
            onClick={() => setShowMsrp((v) => !v)}
            aria-pressed={showMsrp}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${showMsrp ? "border-line text-ink" : "border-dashed border-line text-muted opacity-60"}`}
          >
            <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: css["--chart-muted"] }} />
            MSRP{msrpVerified ? "" : " (estimat)"}
          </button>
        ) : null}
        <span className="ml-auto flex gap-3 text-xs">
          <button className="text-muted underline hover:text-ink" onClick={() => setHidden(new Set())}>
            Toate
          </button>
          <button className="text-muted underline hover:text-ink" onClick={() => setHidden(new Set(data.shops.map((s) => s.key)))}>
            Niciunul
          </button>
        </span>
      </div>

      {stats && (
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          {(
            [
              ["Minim", stats.min],
              ["Median", stats.median],
              ["Maxim", stats.max],
            ] as const
          ).map(([label, v]) => (
            <div key={label} className="rounded-lg bg-surface px-2 py-2">
              <dt className="text-xs text-muted">{label} piață</dt>
              <dd className="font-semibold tabular-nums">{formatLei(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      {data.coverage.days_with_data < data.coverage.days_total && (
        <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted">
          Date pentru <strong className="text-ink">{data.coverage.days_with_data}</strong> din {data.coverage.days_total} zile.
          Golurile din linii = zile fără date (scraperul nu a rulat, de ex. calculator oprit); nu le completăm prin
          presupuneri. Punctele = capturi din arhiva Wayback Machine.
        </p>
      )}

      <div className={`mt-4 h-[420px] sm:h-[540px] ${loading ? "opacity-50" : ""}`}>
        {rows.length === 0 || visible.length === 0 ? (
          <p className="pt-24 text-center text-sm text-muted">
            {visible.length === 0 ? "Selectează cel puțin un magazin." : "Nu există istoric pentru acest interval."}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 12 + labelRowCount * LABEL_ROW_PX, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={css["--chart-grid"]} vertical={false} />
              {data.events.map((e) => {
                const x1 = Math.max(new Date(e.start).getTime(), domain[0]);
                const x2 = Math.min(new Date(e.end).getTime(), domain[1]);
                return (
                  <ReferenceArea
                    key={`${e.slug}-${e.date}`}
                    x1={x1}
                    x2={Math.max(x2, x1 + DAY)}
                    fill={css["--chart-event"]}
                    fillOpacity={0.15}
                    ifOverflow="hidden"
                    label={<EventLabel text={EVENT_SHORT[e.slug] ?? e.name} row={eventRows.get(e) ?? 0} color={css["--chart-ink"]} />}
                  />
                );
              })}
              {data.events
                .filter((e) => {
                  const t = new Date(e.date).getTime();
                  return t >= domain[0] && t <= domain[1];
                })
                .map((e) => (
                  <ReferenceLine
                    key={`line-${e.slug}-${e.date}`}
                    x={new Date(e.date).getTime()}
                    stroke={css["--chart-muted"]}
                    strokeDasharray="3 3"
                  />
                ))}
              {msrp && showMsrp ? (
                <ReferenceLine y={msrp} stroke={css["--chart-muted"]} strokeDasharray="6 4" strokeWidth={1.5} />
              ) : null}
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={domain}
                tickFormatter={formatShortDate}
                tick={{ fontSize: 11, fill: css["--chart-muted"] }}
                stroke={css["--chart-grid"]}
                minTickGap={28}
              />
              <YAxis
                domain={[yMin, yMax]}
                ticks={yTicks(yMin, yMax, msrp && showMsrp ? msrp : null)}
                interval={0}
                tick={<YTick msrp={msrp && showMsrp ? msrp : null} color={css["--chart-muted"]} strong={css["--chart-ink"]} />}
                stroke={css["--chart-grid"]}
                width={56}
              />
              <Tooltip
                content={
                  <TooltipBox
                    weekly={data.granularity === "week"}
                    events={data.events}
                    shopNames={Object.fromEntries(data.shops.map((s) => [s.key, s.name]))}
                  />
                }
                cursor={{ stroke: css["--chart-muted"], strokeWidth: 1 }}
              />
              {showMin && (
                <Line
                  dataKey="market_min"
                  name="Minim piață"
                  type="stepAfter"
                  stroke={css["--chart-ink"]}
                  strokeOpacity={0.3}
                  strokeWidth={9}
                  dot={(props: { cx?: number; cy?: number; index?: number }) =>
                    isolated("market_min", props.index ?? -1) ? (
                      <circle key={`min-${props.index}`} cx={props.cx} cy={props.cy} r={8} fill={css["--chart-ink"]} fillOpacity={0.3} />
                    ) : (
                      <g key={`min-${props.index}`} />
                    )
                  }
                  activeDot={false}
                  isAnimationActive={false}
                />
              )}
              {visible.map((s) => {
                const i = data.shops.indexOf(s);
                const color = css[`--series-${slotOf(s.key, i)}`];
                return (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    name={s.name}
                    type="stepAfter"
                    stroke={color}
                    strokeWidth={2}
                    dot={(props: { cx?: number; cy?: number; payload?: Row; index?: number }) =>
                      props.payload?.[`${s.key}__wb`] || isolated(s.key, props.index ?? -1) ? (
                        <circle key={`${s.key}-${props.index}`} cx={props.cx} cy={props.cy} r={4.5} fill={color} stroke={css["--chart-ink"]} strokeWidth={1} />
                      ) : (
                        <g key={`${s.key}-${props.index}`} />
                      )
                    }
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
