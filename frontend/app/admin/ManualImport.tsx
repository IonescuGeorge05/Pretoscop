"use client";

import { useState } from "react";

import { fromHtml, fromText } from "@/lib/pasteImport";

type Shop = { slug: string; name: string; kind: string; status: string };
type Row = {
  title: string;
  url: string | null;
  product_slug: string | null;
  product_name: string | null;
  price: number | null;
  old_price: number | null;
  in_stock: boolean;
  preorder: boolean;
  is_bundle: boolean;
  selected: boolean;
  note: string | null;
};

/** Pagina de căutare a unui magazin blocat, deschisă de tine în browser: Ctrl+A, Ctrl+C, lipești aici. Recunoaștem
 *  produsele și prețurile, tu bifezi ce e corect. Se salvează ca prețuri verificate manual. */
export default function ManualImport({ token, shops, onSaved }: { token: string; shops: Shop[]; onSaved: () => void }) {
  const [shop, setShop] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onPaste = async (e: React.ClipboardEvent) => {
    e.preventDefault();
    if (!shop) return setMsg("Alege întâi magazinul.");
    const html = e.clipboardData.getData("text/html");
    const raw = html ? fromHtml(html) : fromText(e.clipboardData.getData("text/plain"));
    if (!raw.length) return setMsg("N-am găsit produse cu preț în ce ai lipit. Ai copiat pagina de căutare (Ctrl+A, Ctrl+C)?");
    setBusy(true);
    const res = await fetch("/api/admin/manual-import/preview", {
      method: "POST",
      headers: { "x-admin-token": token, "content-type": "application/json" },
      body: JSON.stringify({ shop_slug: shop, page_url: pageUrl || null, rows: raw }),
    });
    setBusy(false);
    if (!res.ok) return setMsg(`Eroare ${res.status}`);
    const r: Row[] = await res.json();
    setRows(r);
    setMsg(`${r.filter((x) => x.selected).length} produse recunoscute din ${r.length} rânduri. Verifică și salvează.`);
  };

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.selected && r.product_slug && r.url && r.price);

  const save = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/manual-import/save", {
      method: "POST",
      headers: { "x-admin-token": token, "content-type": "application/json" },
      body: JSON.stringify({
        shop_slug: shop,
        rows: chosen.map((r) => ({
          title: r.title, product_slug: r.product_slug, url: r.url, price: String(r.price),
          old_price: r.old_price ? String(r.old_price) : null, in_stock: r.in_stock, preorder: r.preorder, is_bundle: r.is_bundle,
        })),
      }),
    });
    setBusy(false);
    const out = await res.json().catch(() => null);
    if (!res.ok) return setMsg(out?.detail ?? `Eroare ${res.status}`);
    setMsg(`Salvate: ${out.saved}.${out.errors.length ? ` Respinse: ${out.errors.join("; ")}` : ""}`);
    setRows([]);
    onSaved();
  };

  const field = "rounded-lg border border-line bg-surface px-2 py-1.5";
  return (
    <div className="mt-4 rounded-lg border border-line p-3 text-sm">
      <h3 className="font-medium">Import rapid din pagina magazinului</h3>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted">
        <li>Deschide în browserul tău căutarea la magazin (ex. „playstation 5” pe emag.ro) și derulează până jos.</li>
        <li>Ctrl+A, apoi Ctrl+C. Alege magazinul aici și lipește (Ctrl+V) în caseta de mai jos.</li>
        <li>Verifică rândurile bifate (produs, preț) și apasă Salvează. La eMAG debifează ce e vândut de alții (Marketplace).</li>
      </ol>
      <div className="mt-2 flex flex-wrap gap-2">
        <select value={shop} onChange={(e) => setShop(e.target.value)} className={field} aria-label="Magazinul paginii">
          <option value="">— magazinul —</option>
          {shops.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
              {s.status === "blocked" ? " (blocat)" : ""}
            </option>
          ))}
        </select>
        <input
          value={pageUrl}
          onChange={(e) => setPageUrl(e.target.value)}
          placeholder="adresa paginii (opțional, pentru rândurile fără link)"
          aria-label="Adresa paginii"
          className={`${field} min-w-0 flex-[1_1_260px]`}
        />
      </div>
      <textarea
        onPaste={onPaste}
        readOnly
        placeholder={busy ? "Se citește…" : "Lipește aici pagina copiată (Ctrl+V)"}
        aria-label="Lipește pagina"
        className={`${field} mt-2 h-16 w-full resize-none`}
      />
      {msg && <p className="mt-1">{msg}</p>}

      {rows.length > 0 && (
        <>
          <ul className="mt-2 divide-y divide-line">
            {rows.map((r, i) => (
              <li key={`${r.url}-${r.title}`} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 ${r.product_slug ? "" : "text-muted"}`}>
                <input
                  type="checkbox"
                  checked={r.selected}
                  disabled={!r.product_slug || !r.price || !r.url}
                  onChange={(e) => update(i, { selected: e.target.checked })}
                  aria-label="Salvează rândul"
                />
                <span className="min-w-0 flex-[1_1_280px]">
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener" className="hover:underline">
                      {r.title}
                    </a>
                  ) : (
                    r.title
                  )}
                  <span className="block text-xs text-muted">
                    {r.product_name ? `→ ${r.product_name}` : ""}
                    {r.note ? `${r.product_name ? " · " : ""}${r.note}` : ""}
                    {!r.in_stock ? " · fără stoc" : ""}
                    {r.preorder ? " · precomandă" : ""}
                  </span>
                </span>
                {r.product_slug && (
                  <>
                    <input
                      value={r.price ?? ""}
                      onChange={(e) => update(i, { price: Number(e.target.value.replace(",", ".")) || null })}
                      aria-label="Preț"
                      className={`${field} w-24 tabular-nums`}
                    />
                    <input
                      value={r.old_price ?? ""}
                      onChange={(e) => update(i, { old_price: Number(e.target.value.replace(",", ".")) || null })}
                      placeholder="tăiat"
                      aria-label="Preț tăiat"
                      className={`${field} w-24 tabular-nums`}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
          <button
            disabled={busy || !chosen.length}
            onClick={save}
            className="mt-2 rounded-lg bg-brand px-3 py-1.5 font-semibold text-brand-ink disabled:opacity-50"
          >
            Salvează bifate ({chosen.length})
          </button>
        </>
      )}
    </div>
  );
}
