"use client";

import { useCallback, useEffect, useState } from "react";

import { formatLeiShort } from "@/lib/format";

import ProductOptions, { type AdminProduct } from "./ProductOptions";

type Manual = {
  offer_id: number;
  product_slug: string;
  product_name: string;
  shop: string;
  url: string;
  price: number;
  in_stock: boolean;
  preorder: boolean;
  checked_at: string;
  expired: boolean;
};
type Shop = { slug: string; name: string; kind: string; status: string };

const EMPTY = {
  product_slug: "",
  shop_slug: "",
  url: "",
  price: "",
  old_price: "",
  in_stock: true,
  preorder: false,
  gift_title: "",
  gift_value: "",
};

/** Prețurile verificate de mână la magazinele care nu ne lasă robotul (eMAG, Altex, Flanco, PC Garage…).
 *  Rutina zilnică: deschizi linkul, iar dacă prețul e același apeși „Același preț”; altfel completezi formularul. */
export default function ManualPrices({ token, products }: { token: string; products: AdminProduct[] }) {
  const [items, setItems] = useState<Manual[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const auth = { "x-admin-token": token };
    const [m, s] = await Promise.all([fetch("/api/admin/manual-prices", { headers: auth }), fetch("/api/admin/shops", { headers: auth })]);
    if (m.ok) setItems(await m.json());
    if (s.ok) {
      const all: Shop[] = (await s.json()).filter((x: Shop) => x.kind === "retail");
      // magazinele blocate (cele pentru care există rutina asta) întâi
      setShops(all.sort((a, b) => Number(b.status === "blocked") - Number(a.status === "blocked")));
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const res = await fetch("/api/admin/manual-price", {
      method: "POST",
      headers: { "x-admin-token": token, "content-type": "application/json" },
      body: JSON.stringify({ ...form, old_price: form.old_price || null, gift_title: form.gift_title || null, gift_value: form.gift_value || null }),
    });
    const r = await res.json().catch(() => null);
    if (!res.ok) return setMsg(r?.detail ?? `Eroare ${res.status}`);
    setMsg("Salvat: apare pe site 24 de ore.");
    setForm((f) => ({ ...f, url: "", price: "", old_price: "", preorder: false, gift_title: "", gift_value: "" }));
    load();
  };

  const confirm = async (id: number) => {
    await fetch(`/api/admin/manual-price/${id}/confirm`, { method: "POST", headers: { "x-admin-token": token } });
    load();
  };

  const set = (k: keyof typeof EMPTY, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const field = "rounded-lg border border-line bg-surface px-2 py-1.5";
  return (
    <section className="mb-8 rounded-xl border border-line bg-card p-4">
      <h2 className="font-semibold">Prețuri verificate manual</h2>
      <p className="mt-1 text-sm text-muted">
        Pentru magazinele care nu ne lasă robotul. Copiezi prețul de pe pagina produsului (vândut de magazin, nu de pe
        marketplace). Apare pe site marcat „Verificat manual” și dispare după 24 de ore dacă nu-l reconfirmi.
      </p>

      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {items.map((m) => (
            <li key={m.offer_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  m.expired ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-soft text-muted"
                }`}
              >
                {m.expired ? "expirat" : "activ"}
              </span>
              <strong>{m.shop}</strong>
              <span className="text-muted">{m.product_name}</span>
              <span className="tabular-nums">{formatLeiShort(m.price)}</span>
              {m.preorder && <span className="text-xs text-muted">precomandă</span>}
              <a href={m.url} target="_blank" rel="noopener" className="underline">
                verifică ↗
              </a>
              <button onClick={() => confirm(m.offer_id)} className="ml-auto rounded-lg border border-line px-2.5 py-1 hover:bg-soft">
                Același preț
              </button>
              <button
                onClick={() =>
                  setForm({ ...EMPTY, product_slug: m.product_slug, shop_slug: shops.find((s) => s.name === m.shop)?.slug ?? "", url: m.url })
                }
                className="rounded-lg border border-line px-2.5 py-1 hover:bg-soft"
              >
                Alt preț
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
        <select value={form.shop_slug} onChange={(e) => set("shop_slug", e.target.value)} className={field} aria-label="Magazin">
          <option value="">— magazinul —</option>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
              {s.status === "blocked" ? " (blocat)" : ""}
            </option>
          ))}
        </select>
        <select value={form.product_slug} onChange={(e) => set("product_slug", e.target.value)} className={field} aria-label="Produs">
          <option value="">— produsul —</option>
          <ProductOptions products={products} />
        </select>
        <input
          value={form.url}
          onChange={(e) => set("url", e.target.value)}
          placeholder="link pagina produsului"
          aria-label="Link"
          className={`${field} min-w-0 flex-[1_1_240px]`}
        />
        <input value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="preț" aria-label="Preț" className={`${field} w-28`} />
        <input
          value={form.old_price}
          onChange={(e) => set("old_price", e.target.value)}
          placeholder="preț tăiat (opț.)"
          aria-label="Preț tăiat"
          className={`${field} w-32`}
        />
        <input
          value={form.gift_title}
          onChange={(e) => set("gift_title", e.target.value)}
          placeholder="cadou (opț.), ex. Marvel's Wolverine"
          aria-label="Cadou"
          className={`${field} w-56`}
        />
        <input
          value={form.gift_value}
          onChange={(e) => set("gift_value", e.target.value)}
          placeholder="valoare cadou"
          aria-label="Valoarea cadoului"
          className={`${field} w-28`}
        />
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={form.in_stock} onChange={(e) => set("in_stock", e.target.checked)} /> în stoc
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={form.preorder} onChange={(e) => set("preorder", e.target.checked)} /> precomandă
        </label>
        <button
          disabled={!form.shop_slug || !form.product_slug || !form.url || !form.price}
          onClick={save}
          className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-brand-ink disabled:opacity-50"
        >
          Salvează
        </button>
      </div>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </section>
  );
}
