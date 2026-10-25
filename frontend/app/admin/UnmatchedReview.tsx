"use client";

import { useCallback, useEffect, useState } from "react";

import { formatLei } from "@/lib/format";
import type { Unmatched } from "@/lib/types";

const TOKEN_KEY = "pretoscop-admin-token";

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function Row({
  u,
  products,
  onDone,
  token,
}: {
  u: Unmatched;
  products: { slug: string; name: string }[];
  onDone: (id: number) => void;
  token: string;
}) {
  const [slug, setSlug] = useState("");
  const [bundle, setBundle] = useState(/\+|bundle|pachet|joc|controller/i.test(u.title));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (action: "assign" | "ignore") => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/unmatched/${u.id}/${action}`, {
      method: "POST",
      headers: { "x-admin-token": token, "content-type": "application/json" },
      body: action === "assign" ? JSON.stringify({ product_slug: slug, is_bundle: bundle }) : "{}",
    });
    setBusy(false);
    if (res.ok) onDone(u.id);
    else setError(`Eroare ${res.status}`);
  };

  return (
    <li className="rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <a href={u.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
            {u.title}
          </a>
          <p className="mt-0.5 text-xs text-muted">
            {u.shop}
            {u.seller ? ` · vânzător: ${u.seller}` : ""} · {u.price !== null ? formatLei(u.price) : "fără preț"}
            {u.in_stock === false ? " · stoc epuizat" : ""}
          </p>
          {u.reason && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">De ce nu s-a potrivit: {u.reason}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <select
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2 py-1.5"
          aria-label="Model"
        >
          <option value="">— alege modelul —</option>
          {products.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={bundle} onChange={(e) => setBundle(e.target.checked)} />
          Pachet (cu jocuri / accesorii)
        </label>
        <button
          disabled={!slug || busy}
          onClick={() => send("assign")}
          className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-40"
        >
          Asociază
        </button>
        <button disabled={busy} onClick={() => send("ignore")} className="rounded-lg border border-line px-3 py-1.5 text-muted hover:text-ink">
          Ignoră
        </button>
        {error && <span className="text-red-700 dark:text-red-400">{error}</span>}
      </div>
    </li>
  );
}

export default function UnmatchedReview({ products }: { products: { slug: string; name: string }[] }) {
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");
  const [items, setItems] = useState<Unmatched[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setToken(readToken()), []);

  const load = useCallback(async (t: string) => {
    setError(null);
    const res = await fetch("/api/admin/unmatched", { headers: { "x-admin-token": t } });
    if (res.status === 401) return setError("Token greșit.");
    if (res.status === 503) return setError("ADMIN_TOKEN nu e setat în .env pe server.");
    if (!res.ok) return setError(`Eroare ${res.status}`);
    setItems(await res.json());
  }, []);

  useEffect(() => {
    if (token) load(token);
  }, [token, load]);

  const saveToken = () => {
    try {
      localStorage.setItem(TOKEN_KEY, input);
    } catch {
      /* fără localStorage: tokenul rămâne doar în pagina curentă */
    }
    setToken(input);
  };

  if (!token || error === "Token greșit.") {
    return (
      <div className="mt-6 max-w-md rounded-xl border border-line bg-card p-4">
        <label className="text-sm font-medium" htmlFor="token">
          Token de admin (ADMIN_TOKEN din .env)
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="token"
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
          />
          <button onClick={saveToken} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
            Intră
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-6">
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {items === null && !error && <p className="text-sm text-muted">Se încarcă…</p>}
      {items && (
        <>
          <p className="text-sm text-muted">{items.length} anunțuri de verificat</p>
          <ul className="mt-3 space-y-3">
            {items.map((u) => (
              <Row key={u.id} u={u} products={products} token={token} onDone={(id) => setItems((xs) => xs!.filter((x) => x.id !== id))} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
