import type { Metadata } from "next";
import Link from "next/link";

import DemoBanner from "@/components/DemoBanner";
import { getEventReport } from "@/lib/api";
import { formatDate, formatLeiShort, productHref } from "@/lib/format";
import { IS_STATIC } from "@/lib/static";
import type { EventReportRow } from "@/lib/types";

export const metadata: Metadata = {
  title: "Black Friday: reduceri reale sau doar etichete?",
  description:
    "Prețul de referință din cele 30 de zile dinaintea Black Friday, comparat cu cel mai mic preț din timpul reducerilor, pentru fiecare produs.",
};

const VERDICT: Record<EventReportRow["verdict"], { label: string; cls: string }> = {
  pending: { label: "Referință salvată", cls: "bg-soft text-muted" },
  real: { label: "Reducere reală", cls: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200" },
  small: { label: "Reducere mică (sub 5%)", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  none: { label: "Nicio reducere", cls: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" },
  no_data: { label: "Date insuficiente", cls: "bg-soft text-muted" },
};

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`;

export default async function BlackFridayPage({ searchParams }: { searchParams: { source?: string } }) {
  const source = IS_STATIC ? undefined : searchParams.source;
  const data = await getEventReport("black_friday", source);
  const ev = data.event;
  const rows = data.rows;
  const counts = Object.fromEntries((["real", "small", "none"] as const).map((k) => [k, rows.filter((r) => r.verdict === k).length]));

  return (
    <>
      <DemoBanner isDemo={data.is_demo} path="/black-friday" />
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-[46px]">
        {ev.name} {ev.start.slice(0, 4)}: reduceri reale sau doar etichete?
      </h1>
      <p className="mt-3 max-w-3xl text-lg leading-relaxed text-muted">
        Pentru fiecare produs ținem minte cât costa în mod normal — mediana celui mai mic preț din piață în cele{" "}
        {data.baseline_days} de zile dinainte — și o comparăm cu cel mai mic preț din timpul reducerilor. Prețul tăiat
        afișat de magazin nu contează: dacă produsul a fost scumpit înainte, se vede aici.
      </p>

      <div className="mt-5 rounded-3xl bg-warm p-5 text-[15px]">
        {data.status === "upcoming" ? (
          <>
            Începe în <strong>{data.days_until}</strong> {data.days_until === 1 ? "zi" : "zile"} ({formatDate(ev.start)} –{" "}
            {formatDate(ev.end)}, după calendarul nostru). Prețurile de referință sunt deja salvate mai jos; în timpul
            reducerilor completăm coloana „cel mai mic în {ev.name}”.
          </>
        ) : (
          <>
            {data.status === "running" ? "În desfășurare" : "Încheiat"} ({formatDate(ev.start)} – {formatDate(ev.end)}):{" "}
            <strong>{counts.real}</strong> produse cu reducere reală, <strong>{counts.small}</strong> cu reducere mică și{" "}
            <strong>{counts.none}</strong> fără nicio reducere față de luna dinainte.
          </>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-3xl border border-line bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-3">Produs</th>
              <th className="px-4 py-3 text-right">Referință (30 zile)</th>
              <th className="px-4 py-3 text-right">Cel mai mic în {ev.name}</th>
              <th className="px-4 py-3 text-right">Diferență</th>
              <th className="px-4 py-3">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.product.slug} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <Link href={productHref(r.product, source)} className="font-medium hover:underline">
                    {r.product.name}
                  </Link>
                  <div className="text-xs text-muted">{r.product.family}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r.baseline ? formatLeiShort(r.baseline) : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.event_low ? formatLeiShort(r.event_low) : "—"}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">{r.change_pct !== null ? pct(r.change_pct) : "—"}</td>
                <td className="px-4 py-3">
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${VERDICT[r.verdict].cls}`}>
                    {VERDICT[r.verdict].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Prețuri finale (cu transport), doar oferte noi vândute direct de magazine, fără pachete. „Date insuficiente” = sub 7
        zile cu preț în stoc înainte de eveniment. Vezi și{" "}
        <Link href="/reduceri" className="underline">
          reducerile reale de azi
        </Link>
        .
      </p>
    </>
  );
}
