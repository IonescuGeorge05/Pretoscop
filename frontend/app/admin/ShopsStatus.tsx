"use client";

import { useCallback, useEffect, useState } from "react";

type Shop = {
  slug: string;
  name: string;
  kind: string;
  status: string;
  status_reason: string | null;
  method: string;
  last_scraped_at: string | null;
  last_run: { status?: string; matched?: number; unmatched?: number; listings?: number; duration_s?: number; reason?: string } | null;
  active_offers: number;
  unmatched: number;
};

const KIND: Record<string, string> = { retail: "magazin", refurbished: "refurbished", secondhand: "second hand" };

const ago = (iso: string) => {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return h < 1 ? `acum ${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `acum ${Math.round(h)} h` : `acum ${Math.round(h / 24)} zile`;
};

function StatusDot({ s }: { s: Shop }) {
  const ok = s.status === "active" && s.active_offers > 0;
  const cls = s.status === "blocked" ? "bg-red-500" : ok ? "bg-green-500" : "bg-amber-500";
  const text = s.status === "blocked" ? "blocat" : ok ? "activ" : s.method === "—" ? "fără sursă" : "fără oferte";
  return (
    <span className="inline-flex items-center gap-1.5" title={s.status_reason ?? undefined}>
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      {text}
    </span>
  );
}

/** Starea fiecărei surse: cum o citim, când a rulat ultima dată și cu ce rezultat. */
export default function ShopsStatus({ token }: { token: string }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/admin/shops", { headers: { "x-admin-token": token } })
        .then((r) => (r.ok ? r.json() : []))
        .then(setShops)
        .catch(() => {}),
    [token],
  );
  useEffect(() => {
    load();
  }, [load]);

  const scrape = async (slug: string) => {
    setBusy(slug);
    await fetch(`/api/admin/scrape?shop=${slug}`, { method: "POST", headers: { "x-admin-token": token } }).catch(() => {});
    // rularea e în fundal; reîncărcăm după câteva secunde
    setTimeout(() => load().finally(() => setBusy(null)), 8000);
  };

  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <h3 className="font-semibold">Starea surselor</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-medium">Sursă</th>
              <th className="py-2 pr-3 font-medium">Cum citim</th>
              <th className="py-2 pr-3 font-medium">Stare</th>
              <th className="py-2 pr-3 font-medium">Ultima rulare</th>
              <th className="py-2 pr-3 text-right font-medium">Oferte active</th>
              <th className="py-2 pr-3 text-right font-medium">De asociat</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {shops.map((s) => (
              <tr key={s.slug} className="border-b border-line last:border-0 align-top">
                <td className="py-2 pr-3">
                  <strong>{s.name}</strong>
                  <div className="text-xs text-muted">{KIND[s.kind] ?? s.kind}</div>
                </td>
                <td className="py-2 pr-3 text-muted">{s.method}</td>
                <td className="py-2 pr-3">
                  <StatusDot s={s} />
                  {s.status === "blocked" && s.status_reason && (
                    <div className="max-w-[16rem] truncate text-xs text-muted" title={s.status_reason}>
                      {s.status_reason}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3 text-muted">
                  {s.last_scraped_at ? ago(s.last_scraped_at) : "niciodată"}
                  {s.last_run?.listings != null && (
                    <div className="text-xs">
                      {s.last_run.listings} anunțuri · {s.last_run.matched ?? 0} asociate · {s.last_run.duration_s}s
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{s.active_offers}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{s.unmatched || ""}</td>
                <td className="py-2 text-right">
                  {s.method !== "—" && s.method !== "email" && s.method !== "import manual" && (
                    <button
                      className="rounded-lg border border-line px-2 py-1 text-xs hover:border-brand disabled:opacity-40"
                      disabled={!!busy}
                      onClick={() => scrape(s.slug)}
                    >
                      {busy === s.slug ? "rulează…" : "Rulează"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Sursele blocate se reîncearcă automat o dată pe zi. Nu ocolim protecțiile anti-bot: pentru ele rămân feed-ul
        oficial sau acordul magazinului.
      </p>
    </div>
  );
}
