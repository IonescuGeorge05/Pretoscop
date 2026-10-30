"use client";

import { useState } from "react";

import { formatLeiShort } from "@/lib/format";

/** „Anunță-mă când scade sub X” sau, dacă nu e nimic în stoc, „când apare în stoc”. Emailul de confirmare
 *  (double opt-in) vine de la server; fără SMTP configurat sau pe site-ul static, formularul e doar informativ. */
export default function PriceAlertForm({
  slug,
  bestPrice,
  enabled,
}: {
  slug: string;
  bestPrice: number | null;
  enabled: boolean;
}) {
  const kind = bestPrice === null ? "stock" : "price";
  const [email, setEmail] = useState("");
  const [target, setTarget] = useState(bestPrice ? String(Math.floor((bestPrice * 0.95) / 10) * 10) : "");
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setState(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, product_slug: slug, kind, target_price: kind === "price" ? Number(target) : null }),
      });
      if (res.ok) setState({ ok: true, text: "Ți-am trimis un email. Apasă linkul din el ca să pornești alerta." });
      else setState({ ok: false, text: (await res.json().catch(() => null))?.detail ?? `Eroare ${res.status}` });
    } catch {
      setState({ ok: false, text: "Nu am putut trimite cererea. Încearcă din nou." });
    } finally {
      setBusy(false);
    }
  };

  const field = "min-h-11 min-w-0 rounded-full border border-line bg-surface px-4 text-[15px]";
  return (
    <section className="rounded-[28px] border border-line bg-card p-6">
      <h2 className="font-display text-2xl font-extrabold tracking-tight">
        {kind === "price" ? "Anunță-mă când scade" : "Anunță-mă când apare în stoc"}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {kind === "price"
          ? `Îți scriem o dată când prețul final (cu transport) coboară sub suma aleasă. Acum: de la ${formatLeiShort(bestPrice!)}.`
          : "Îți scriem o singură dată, când îl găsim în stoc la un magazin."}{" "}
        Folosim adresa doar pentru asta; o ștergem când te dezabonezi.
      </p>
      {enabled ? (
        <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="alert-email">
            Email
          </label>
          <input
            id="alert-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="adresa ta de email"
            className={`${field} flex-[1_1_220px]`}
          />
          {kind === "price" && (
            <label className={`${field} flex flex-[0_1_170px] items-center gap-2`}>
              <span className="text-muted">sub</span>
              <input
                type="number"
                min={1}
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full min-w-0 bg-transparent tabular-nums outline-none"
                aria-label="Prețul țintă în lei"
              />
              <span className="text-muted">lei</span>
            </label>
          )}
          <button disabled={busy} className="min-h-11 rounded-full bg-brand px-5 font-bold text-brand-ink disabled:opacity-60">
            {busy ? "Se trimite…" : "Pornește alerta"}
          </button>
        </form>
      ) : (
        <p className="mt-4 rounded-2xl bg-soft px-4 py-3 text-sm text-muted">Alertele pe email pornesc la lansarea site-ului.</p>
      )}
      {state && (
        <p className={`mt-3 text-sm ${state.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{state.text}</p>
      )}
    </section>
  );
}
