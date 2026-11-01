"use client";

import { useCallback, useEffect, useState } from "react";

type Shop = { slug: string; name: string; kind: string; status: string; feed_url: string | null };

/** Când un magazin ne trimite linkul feed-ului: îl lipești aici și magazinul se citește din feed la rulările
 *  programate (intră în program în cel mult 30 de minute). Magazinele noi se adaugă din același loc. */
export default function FeedLinks({ token }: { token: string }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [slug, setSlug] = useState("");
  const [url, setUrl] = useState("");
  const [vat, setVat] = useState(true);
  const [newName, setNewName] = useState("");
  const [newSite, setNewSite] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const headers = { "x-admin-token": token, "content-type": "application/json" };
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/shops", { headers: { "x-admin-token": token } });
    if (res.ok) setShops((await res.json()).filter((s: Shop) => s.kind === "retail"));
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const pick = (s: string) => {
    setSlug(s);
    setUrl(shops.find((x) => x.slug === s)?.feed_url ?? "");
  };

  const save = async () => {
    const res = await fetch(`/api/admin/shops/${slug}/feed`, { method: "POST", headers, body: JSON.stringify({ url, vat_included: vat }) });
    const r = await res.json().catch(() => null);
    setMsg(res.ok ? (url ? "Salvat. Feed-ul se citește la următoarea rulare programată." : "Feed scos.") : (r?.detail ?? `Eroare ${res.status}`));
    load();
  };

  const add = async () => {
    const res = await fetch("/api/admin/shops", { method: "POST", headers, body: JSON.stringify({ name: newName, base_url: newSite }) });
    const r = await res.json().catch(() => null);
    if (!res.ok) return setMsg(r?.detail ?? `Eroare ${res.status}`);
    setMsg(`Magazin adăugat: ${newName}. Pune-i acum linkul feed-ului.`);
    setNewName("");
    setNewSite("");
    await load();
    pick(r.slug);
  };

  const field = "rounded-lg border border-line bg-surface px-2 py-1.5";
  return (
    <section className="mb-8 rounded-xl border border-line bg-card p-4">
      <h2 className="font-semibold">Feed-uri de la magazine (link permanent)</h2>
      <p className="mt-1 text-sm text-muted">
        Linkul primit de la magazin (formatul compari.ro, Pricy, Google Merchant sau 2Performant). Are prioritate față de
        citirea paginilor. Magazine cu feed:{" "}
        {shops.filter((s) => s.feed_url).map((s) => s.name).join(", ") || "niciunul încă"}.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <select value={slug} onChange={(e) => pick(e.target.value)} className={field} aria-label="Magazin">
          <option value="">— magazinul —</option>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
              {s.feed_url ? " (are feed)" : s.status === "blocked" ? " (blocat)" : ""}
            </option>
          ))}
        </select>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://magazin.ro/feed.xml (gol = scoate)"
          aria-label="Link feed"
          className={`${field} min-w-0 flex-[1_1_280px]`}
        />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!vat} onChange={(e) => setVat(!e.target.checked)} />
          fără TVA
        </label>
        <button disabled={!slug} onClick={save} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-brand-ink disabled:opacity-50">
          Salvează
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
        <span className="text-muted">Magazin nou:</span>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nume (ex. QuickMobile)" aria-label="Nume magazin" className={field} />
        <input value={newSite} onChange={(e) => setNewSite(e.target.value)} placeholder="quickmobile.ro" aria-label="Site magazin" className={field} />
        <button disabled={!newName || !newSite} onClick={add} className="rounded-lg border border-line px-3 py-1.5 hover:bg-soft disabled:opacity-50">
          Adaugă
        </button>
      </div>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </section>
  );
}
