"use client";

import { useState } from "react";

import { formatLeiShort } from "@/lib/format";
import type { CommunityReport } from "@/lib/types";

/** „Am găsit mai ieftin”: semnalările verificate de noi (ultimele 7 zile) + formularul. Un preț semnalat nu intră în
 *  comparație: l-a văzut un om, nu robotul nostru, și poate expira oricând. */
export default function ReportCheaper({
  slug,
  reports,
  canSubmit,
}: {
  slug: string;
  reports: CommunityReport[];
  canSubmit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // capcană pentru roboți, ascunsă
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product_slug: slug, url, price, note, website }),
      });
      if (res.ok) {
        setMsg({ ok: true, text: "Mulțumim! Verificăm linkul și, dacă prețul e corect, îl afișăm aici." });
        setUrl("");
        setPrice("");
        setNote("");
      } else setMsg({ ok: false, text: (await res.json().catch(() => null))?.detail ?? `Eroare ${res.status}` });
    } catch {
      setMsg({ ok: false, text: "Nu am putut trimite. Încearcă din nou." });
    } finally {
      setBusy(false);
    }
  };

  if (!reports.length && !canSubmit) return null;
  const field = "min-h-11 min-w-0 rounded-full border border-line bg-surface px-4 text-[15px]";
  return (
    <section className="rounded-3xl border border-line bg-card p-5 text-sm">
      {reports.length > 0 && (
        <>
          <h2 className="font-bold">Semnalate de cititori, verificate de noi</h2>
          <ul className="mt-2 space-y-1">
            {reports.map((r) => (
              <li key={r.url} className="flex flex-wrap items-baseline gap-x-2">
                <strong className="tabular-nums">{formatLeiShort(r.price)}</strong>
                <a href={r.url} target="_blank" rel="nofollow noopener" className="underline underline-offset-4">
                  {r.domain} ↗
                </a>
                <span className="text-xs text-muted">verificat {new Date(r.reviewed_at).toLocaleDateString("ro-RO")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Nu intră în comparația de mai sus: prețul poate expira oricând.</p>
        </>
      )}
      {canSubmit && (
        <div className={reports.length ? "mt-4 border-t border-line pt-4" : ""}>
          {!open ? (
            <button onClick={() => setOpen(true)} className="font-bold underline underline-offset-4">
              Ai găsit mai ieftin? Spune-ne
            </button>
          ) : (
            <form onSubmit={submit} className="flex flex-wrap gap-2">
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="linkul produsului (https://…)"
                aria-label="Linkul produsului"
                className={`${field} flex-[1_1_260px]`}
              />
              <input
                required
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="preț (lei)"
                aria-label="Prețul găsit, în lei"
                className={`${field} flex-[0_1_130px]`}
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="detalii (opțional): cupon, culoare…"
                aria-label="Detalii"
                maxLength={300}
                className={`${field} flex-[1_1_220px]`}
              />
              <input
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="hidden"
                aria-hidden
              />
              <button disabled={busy} className="min-h-11 rounded-full bg-brand px-5 font-bold text-brand-ink disabled:opacity-60">
                Trimite
              </button>
            </form>
          )}
          {msg && (
            <p className={`mt-2 ${msg.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{msg.text}</p>
          )}
        </div>
      )}
    </section>
  );
}
