"use client";

import { useCallback, useEffect, useState } from "react";

import { formatLeiShort } from "@/lib/format";

type Report = {
  id: number;
  product_slug: string;
  product_name: string;
  url: string;
  domain: string;
  price: number;
  note: string | null;
  status: "new" | "accepted" | "rejected";
  created_at: string;
  best_price: number | null;
};

/** „Am găsit mai ieftin”: deschizi linkul, verifici prețul și produsul, apoi accepți (apare 7 zile pe pagina
 *  produsului, separat de comparație) sau respingi. */
export default function ReportsPanel({ token }: { token: string }) {
  const [items, setItems] = useState<Report[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/reports", { headers: { "x-admin-token": token } });
    if (res.ok) setItems(await res.json());
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: number, action: "accept" | "reject") => {
    await fetch(`/api/admin/reports/${id}/${action}`, { method: "POST", headers: { "x-admin-token": token } });
    load();
  };

  const pending = items?.filter((r) => r.status === "new") ?? [];
  return (
    <section className="mb-8 rounded-xl border border-line bg-card p-4">
      <h2 className="font-semibold">Prețuri semnalate de cititori</h2>
      {items === null ? (
        <p className="mt-2 text-sm text-muted">Se încarcă…</p>
      ) : !pending.length ? (
        <p className="mt-2 text-sm text-muted">Nimic de verificat ({items.length} semnalări verificate până acum).</p>
      ) : (
        <ul className="mt-3 space-y-3 text-sm">
          {pending.map((r) => (
            <li key={r.id} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <strong className="tabular-nums">{formatLeiShort(r.price)}</strong>
                <a href={r.url} target="_blank" rel="noopener nofollow" className="underline">
                  {r.domain} ↗
                </a>
                <span className="text-muted">{r.product_name}</span>
                {r.best_price !== null && (
                  <span className="text-xs text-muted">
                    noi: {formatLeiShort(r.best_price)} ({r.price < r.best_price ? "mai ieftin" : "nu e mai ieftin"})
                  </span>
                )}
              </div>
              {r.note && <p className="mt-1 text-muted">„{r.note}”</p>}
              <div className="mt-2 flex gap-2">
                <button onClick={() => review(r.id, "accept")} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-brand-ink">
                  Corect, afișează
                </button>
                <button onClick={() => review(r.id, "reject")} className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink">
                  Respinge
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
