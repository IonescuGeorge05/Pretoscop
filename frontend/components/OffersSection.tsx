"use client";

import { useEffect, useMemo, useState } from "react";

import { formatLei } from "@/lib/format";
import { compareOffers } from "@/lib/compare";
import { IS_STATIC } from "@/lib/static";
import type { Compare, Offer } from "@/lib/types";

function Estimated({ show, title }: { show: boolean; title: string }) {
  if (!show) return null;
  return (
    <span title={title} className="ml-1 cursor-help whitespace-nowrap text-[10px] font-medium uppercase text-amber-700 dark:text-amber-400">
      estimat
    </span>
  );
}

function ShippingCell({ o }: { o: Offer }) {
  if (o.condition === "used") {
    return (
      <span title="Persoană fizică: predare personală sau livrare plătită separat (cost variabil, neinclus în prețul final)">
        Neinclus
      </span>
    );
  }
  return (
    <>
      {o.breakdown.shipping === 0 ? "Gratuit" : formatLei(o.breakdown.shipping)}
      <Estimated show={o.shipping_estimated} title="Transport estimat — regulile magazinului nu sunt încă verificate" />
    </>
  );
}

function WarrantyCell({ o }: { o: Offer }) {
  const b = o.breakdown;
  return (
    <>
      {b.warranty_months > 0 ? (
        `${b.warranty_months} luni`
      ) : (
        <span
          className="inline-block whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          title="Vânzătorul nu oferă garanție (de obicei persoane fizice). Prețul afișat nu include nicio ajustare."
        >
          ⚠ Fără garanție
        </span>
      )}
      {b.warranty_months > 0 && (
        <Estimated show={o.warranty_estimated} title="Garanția standard a magazinului (nu apare pe pagina produsului)" />
      )}
      {b.warranty_penalty > 0 && (
        <div className="text-xs text-red-700 dark:text-red-400">+{formatLei(b.warranty_penalty)} penalizare</div>
      )}
    </>
  );
}

function PriceCell({ o }: { o: Offer }) {
  return (
    <>
      <span className="whitespace-nowrap tabular-nums">{formatLei(o.breakdown.price)}</span>
      {o.old_price && <div className="whitespace-nowrap text-xs text-muted line-through tabular-nums">{formatLei(o.old_price)}</div>}
      {o.fake_discount && (
        <div className="text-xs font-semibold text-red-700 dark:text-red-400">⚠ reducere falsă</div>
      )}
    </>
  );
}

/** Detalii sub numele magazinului: vânzător marketplace, grad refurbished, titlul anunțului. */
function OfferDetails({ o, isBest }: { o: Offer; isBest: boolean }) {
  return (
    <>
      {isBest && <div className="text-xs font-normal text-brand">cel mai bun preț final</div>}
      {o.is_marketplace && (
        <div
          className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          title="Vândut de un terț prin marketplace-ul magazinului. Nu intră în minimul pieței și în recomandare."
        >
          Marketplace · {o.seller}
        </div>
      )}
      {o.suspicious_price && (
        <div
          className="mt-0.5 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-900 dark:bg-red-950 dark:text-red-200"
          title="Prețul e sub 40% din prețul recomandat de producător. Verifică atent: poate fi țeapă, consolă defectă sau o greșeală în anunț."
        >
          ⚠ Preț suspect de mic
        </div>
      )}
      {o.price_outlier && (
        <div
          className="mt-0.5 inline-block rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-medium text-orange-900 dark:bg-orange-950 dark:text-orange-200"
          title={`Prețul e ${o.price_outlier}. Nu intră în minimul pieței și în recomandare.`}
        >
          Preț neobișnuit de mare
        </div>
      )}
      {o.grade && <div className="text-xs font-normal text-muted">Stare estetică: <strong className="text-ink">{o.grade}</strong></div>}
      {o.condition === "used" && (
        <div className="text-xs font-normal text-muted">
          {o.location && <strong className="text-ink">{o.location}</strong>}
          {o.location && o.posted_label && " · "}
          {o.posted_label && `postat ${o.posted_label.toLowerCase().startsWith("azi") || o.posted_label.toLowerCase().startsWith("ieri") ? o.posted_label.toLowerCase() : `pe ${o.posted_label}`}`}
          {!o.location && !o.posted_label && o.seller}
        </div>
      )}
      {(o.is_bundle || o.condition === "used" || o.source === "real") && o.title && (
        <div className="max-w-xs text-xs font-normal text-muted">{o.title}</div>
      )}
    </>
  );
}

/** Orașul din locația anunțului: „Sector 3, Bucuresti” -> București, „Floresti, Cluj” -> Floresti. */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
function cityOf(location: string | null): string | null {
  if (!location) return null;
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.some((p) => /^sector\s*\d/i.test(p)) || fold(parts[0]) === "bucuresti") return "București";
  return parts[0];
}

function GoButton({ o }: { o: Offer }) {
  return (
    <a
      href={IS_STATIC ? o.shop_url : o.out_url}
      target="_blank"
      rel="nofollow noopener sponsored"
      className="inline-block whitespace-nowrap rounded-full bg-brand px-4 py-2 text-xs font-bold text-brand-ink hover:opacity-90"
    >
      Mergi la magazin
    </a>
  );
}

export default function OffersSection({
  offers: allOffers,
  title = "Oferte",
  locationFilter = false,
}: {
  offers: Offer[];
  title?: string;
  locationFilter?: boolean; // second hand: filtru după oraș
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [city, setCity] = useState("");
  // orașele, după numărul de anunțuri (cheie fără diacritice: „Iasi” și „Iași” sunt același oraș)
  const cities = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const o of allOffers) {
      const c = cityOf(o.location);
      if (!c) continue;
      const cur = counts.get(fold(c)) ?? { name: c, n: 0 };
      counts.set(fold(c), { ...cur, n: cur.n + 1 });
    }
    return Array.from(counts, ([key, v]) => ({ key, ...v })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [allOffers]);
  const offers = city ? allOffers.filter((o) => fold(cityOf(o.location) ?? "") === city) : allOffers;
  const [comparison, setComparison] = useState<Compare | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]));

  useEffect(() => {
    setComparison(null);
    setError(null);
    if (selected.length !== 2) return;
    if (IS_STATIC) {
      const [a, b] = selected.map((id) => offers.find((o) => o.id === id)!);
      setComparison(compareOffers(a, b));
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/compare?offer_a=${selected[0]}&offer_b=${selected[1]}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setComparison)
      .catch((e) => e.name !== "AbortError" && setError("Nu am putut compara ofertele."));
    return () => ctrl.abort();
  }, [selected, offers]);

  if (!allOffers.length) {
    return (
      <section>
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
        <p className="mt-3 rounded-3xl border border-line bg-card p-4 text-sm text-muted">Nicio ofertă disponibilă.</p>
      </section>
    );
  }

  // „cel mai bun” = primul în stoc vândut de magazin (ofertele marketplace sunt doar afișate)
  const best = (
    offers.find((o) => o.in_stock && !o.is_marketplace && !o.suspicious_price) ??
    offers.find((o) => o.in_stock && !o.suspicious_price)
  )?.id;

  return (
    <section aria-labelledby="offers-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="offers-title" className="font-display text-2xl font-extrabold tracking-tight">
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {locationFilter && cities.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-muted">
              Oraș
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm text-ink"
              >
                <option value="">Toate ({allOffers.length})</option>
                {cities.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name} ({c.n})
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-xs text-muted">Sortate după preț final · bifează 2 oferte pentru comparație</p>
        </div>
      </div>

      {/* mobil: carduri */}
      <ul className="mt-3 space-y-3 sm:hidden">
        {offers.map((o) => (
          <li key={o.id} className={`rounded-3xl border bg-card p-4 ${o.id === best ? "border-brand" : "border-line"}`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} aria-label={`Compară ${o.shop.name}`} />
                <span>
                  {o.shop.name}
                  <OfferDetails o={o} isBest={o.id === best} />
                </span>
              </label>
              <span className={`text-xs ${o.in_stock ? "text-green-700 dark:text-green-400" : "text-muted"}`}>
                {o.in_stock ? "În stoc" : "Stoc epuizat"}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Preț</dt>
              <dd className="text-right"><PriceCell o={o} /></dd>
              <dt className="text-muted">Transport</dt>
              <dd className="text-right"><ShippingCell o={o} /></dd>
              <dt className="text-muted">Garanție</dt>
              <dd className="text-right"><WarrantyCell o={o} /></dd>
              <dt className="font-semibold">Preț final</dt>
              <dd className="text-right text-lg font-bold tabular-nums">{formatLei(o.breakdown.final_price)}</dd>
            </dl>
            <div className="mt-3 text-right"><GoButton o={o} /></div>
          </li>
        ))}
      </ul>

      {/* desktop: tabel */}
      <div className="mt-3 hidden overflow-x-auto rounded-3xl border border-line bg-card sm:block">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-8 px-3 py-2"><span className="sr-only">Compară</span></th>
              <th className="px-3 py-2">Magazin</th>
              <th className="px-3 py-2 text-right">Preț</th>
              <th className="px-3 py-2 text-right">Transport</th>
              <th className="px-3 py-2 text-right">Garanție</th>
              <th className="px-3 py-2 text-right">Preț final</th>
              <th className="px-3 py-2">Stoc</th>
              <th className="px-3 py-2"><span className="sr-only">Link</span></th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id} className={`border-b border-line last:border-0 ${o.id === best ? "bg-brand/5" : ""}`}>
                <td className="px-3 py-3">
                  <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} aria-label={`Compară ${o.shop.name}`} />
                </td>
                <td className="px-3 py-3 font-medium">
                  {o.shop.name}
                  <OfferDetails o={o} isBest={o.id === best} />
                </td>
                <td className="px-3 py-3 text-right"><PriceCell o={o} /></td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums"><ShippingCell o={o} /></td>
                <td className="whitespace-nowrap px-3 py-3 text-right"><WarrantyCell o={o} /></td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-base font-bold tabular-nums">
                  {formatLei(o.breakdown.final_price)}
                  <div className="text-xs font-normal text-muted">
                    {o.breakdown.warranty_months > 0
                      ? `${formatLei(o.breakdown.cost_per_warranty_month)} / lună garanție`
                      : "fără garanție"}
                  </div>
                </td>
                <td className={`whitespace-nowrap px-3 py-3 text-xs ${o.in_stock ? "text-green-700 dark:text-green-400" : "text-muted"}`}>
                  {o.in_stock ? "În stoc" : "Epuizat"}
                </td>
                <td className="px-3 py-3 text-right"><GoButton o={o} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {comparison && <ComparePanel c={comparison} onClose={() => setSelected([])} />}
    </section>
  );
}

function ComparePanel({ c, onClose }: { c: Compare; onClose: () => void }) {
  const money = (component: string, v: number) => (component === "warranty_months" ? `${v} luni` : formatLei(v));
  const winner = (o: Offer) => c.winner_offer_id === o.id;
  return (
    <div className="mt-4 rounded-3xl border-2 border-brand bg-card p-4" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">Comparație</h3>
        <button onClick={onClose} className="text-sm text-muted hover:text-ink">Închide ✕</button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-1 pr-2 font-normal text-muted">Componentă</th>
              {[c.a, c.b].map((o) => (
                <th key={o.id} className="py-1 pr-2 text-right">
                  {o.shop.name} {winner(o) && <span className="text-green-700 dark:text-green-400">✓ câștigă</span>}
                </th>
              ))}
              <th className="py-1 text-right font-normal text-muted">Diferență</th>
            </tr>
          </thead>
          <tbody>
            {c.diffs.map((d) => (
              <tr key={d.component} className={`border-t border-line ${d.component === "final_price" ? "font-bold" : ""}`}>
                <td className="py-1.5 pr-2">{d.label}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{money(d.component, d.a)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{money(d.component, d.b)}</td>
                <td className="py-1.5 text-right tabular-nums text-muted">
                  {d.diff > 0 ? "+" : ""}
                  {money(d.component, Math.round(d.diff * 100) / 100)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm">{c.explanation}</p>
    </div>
  );
}
