import Link from "next/link";

import { formatDate } from "@/lib/format";
import type { EventReport } from "@/lib/types";

/** Pe prima pagină, cu cel mult 21 de zile înainte de Black Friday și până la final: trimite la raportul cu
 *  prețurile de referință (ca nimeni să nu fie păcălit de „reducerile” din prețuri umflate). */
export default function EventBanner({ report }: { report: EventReport | null }) {
  if (!report || report.status === "ended" || report.days_until > 21) return null;
  const ev = report.event;
  const real = report.rows.filter((r) => r.verdict === "real").length;
  return (
    <Link
      href="/black-friday"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border-2 border-accent bg-card px-5 py-4 hover:bg-soft"
    >
      <span>
        <strong className="font-display text-xl font-extrabold">
          {report.status === "upcoming"
            ? `${ev.name} începe în ${report.days_until} ${report.days_until === 1 ? "zi" : "zile"} (${formatDate(ev.start)})`
            : `${ev.name} e în desfășurare`}
        </strong>
        <span className="block text-sm text-muted">
          {report.status === "upcoming"
            ? "Am salvat deja prețurile de referință: după start vezi care reduceri sunt reale și care sunt doar etichete."
            : `${real} produse au acum o reducere reală față de luna dinainte. Restul: verifică înainte să cumperi.`}
        </span>
      </span>
      <span className="font-bold text-accent">Vezi raportul →</span>
    </Link>
  );
}
