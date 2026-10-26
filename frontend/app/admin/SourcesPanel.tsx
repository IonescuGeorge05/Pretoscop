"use client";

import { useCallback, useEffect, useState } from "react";

type Sources = { email_configured: boolean; email_user: string | null; search_configured: boolean };
type Check = {
  verdict?: string;
  robots_status?: number;
  robots_allows_example?: boolean;
  sitemaps?: string[];
  structured_data?: boolean;
  platform?: string | null;
  sample?: { title: string; price: string; in_stock: boolean | null };
  error?: string;
};
type Discovered = { id: number; domain: string; example_url: string; example_title: string | null; hits: number; check: Check | null };

const VERDICT: Record<string, { text: string; cls: string }> = {
  ok: { text: "✓ se poate citi", cls: "text-green-700 dark:text-green-400" },
  partial: { text: "parțial (fără date structurate)", cls: "text-amber-700 dark:text-amber-400" },
  blocked: { text: "⛔ blochează", cls: "text-red-700 dark:text-red-400" },
  robots_disallow: { text: "⛔ interzis în robots.txt", cls: "text-red-700 dark:text-red-400" },
  error: { text: "eroare la verificare", cls: "text-muted" },
  rate_limited: { text: "limitează cererile (429) — reîncearcă mai târziu", cls: "text-amber-700 dark:text-amber-400" },
};

function useAdminFetch(token: string) {
  return useCallback(
    async (path: string, method = "GET") => {
      const res = await fetch(`/api/admin/${path}`, { method, headers: { "x-admin-token": token } });
      const body = res.status === 204 ? null : await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.detail ?? `Eroare ${res.status}`);
      return body;
    },
    [token],
  );
}

function Result({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  return <pre className="mt-2 overflow-x-auto rounded-lg bg-surface p-2 text-xs">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>;
}

export default function SourcesPanel({ token }: { token: string }) {
  const call = useAdminFetch(token);
  const [sources, setSources] = useState<Sources | null>(null);
  const [emailResult, setEmailResult] = useState<unknown>(null);
  const [searchResult, setSearchResult] = useState<unknown>(null);
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const loadDiscovered = useCallback(() => call("discovered").then(setDiscovered).catch(() => {}), [call]);
  useEffect(() => {
    call("sources").then(setSources).catch(() => {});
    loadDiscovered();
  }, [call, loadDiscovered]);

  const run = async (key: string, fn: () => Promise<unknown>, set: (v: unknown) => void) => {
    setBusy(key);
    try {
      set(await fn());
    } catch (e) {
      set((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const btn = "rounded-lg border border-line px-3 py-1.5 text-sm hover:border-brand disabled:opacity-40";

  return (
    <section className="mb-8 space-y-4">
      <h2 className="text-lg font-semibold">Surse automate</h2>

      <div className="rounded-xl border border-line bg-card p-4">
        <h3 className="font-semibold">Alerte OLX pe email</h3>
        {sources && !sources.email_configured ? (
          <p className="mt-1 text-sm text-muted">
            Neconfigurat. Pași: (1) pe olx.ro salvezi căutările (ps5, iphone 18 pro) cu notificări pe email; (2) Gmail →
            Cont Google → Securitate → Verificare în 2 pași → <strong className="text-ink">Parole pentru aplicații</strong>;
            (3) în <code>.env</code>: <code>IMAP_USER=</code> și <code>IMAP_PASSWORD=</code>; (4){" "}
            <code>docker compose up -d api worker</code>.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Configurat pentru <strong className="text-ink">{sources?.email_user}</strong>. Worker-ul verifică la 30 de minute.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btn} disabled={!sources?.email_configured || !!busy} onClick={() => run("et", () => call("email/test", "POST"), setEmailResult)}>
            Testează conexiunea
          </button>
          <button className={btn} disabled={!sources?.email_configured || !!busy} onClick={() => run("er", () => call("email/run", "POST"), setEmailResult)}>
            Citește alertele acum
          </button>
        </div>
        {busy?.startsWith("e") && <p className="mt-2 text-sm text-muted">Se lucrează…</p>}
        <Result value={emailResult} />
      </div>

      <div className="rounded-xl border border-line bg-card p-4">
        <h3 className="font-semibold">Căutare web (Brave Search)</h3>
        {sources && !sources.search_configured ? (
          <p className="mt-1 text-sm text-muted">
            Neconfigurat. Creează o cheie pe <strong className="text-ink">brave.com/search/api</strong> (credit lunar gratuit,
            ~1000 de căutări; cere card) și pune-o în <code>.env</code> la <code>BRAVE_API_KEY=</code>, apoi{" "}
            <code>docker compose up -d api worker</code>.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Configurat. Anunțuri OLX din index la 12 ore (supliment: pot fi vechi), descoperire de magazine săptămânal.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btn} disabled={!sources?.search_configured || !!busy} onClick={() => run("so", () => call("search/run?what=olx", "POST"), setSearchResult)}>
            Caută anunțuri OLX acum
          </button>
          <button
            className={btn}
            disabled={!sources?.search_configured || !!busy}
            onClick={() => run("sd", () => call("search/run?what=discovery", "POST").then((r) => (loadDiscovered(), r)), setSearchResult)}
          >
            Descoperă magazine acum
          </button>
        </div>
        {busy?.startsWith("s") && <p className="mt-2 text-sm text-muted">Se caută…</p>}
        <Result value={searchResult} />
      </div>

      <div className="rounded-xl border border-line bg-card p-4">
        <h3 className="font-semibold">Magazine descoperite ({discovered.length})</h3>
        <p className="mt-1 text-sm text-muted">
          Domenii care apar la căutările produselor urmărite. <strong className="text-ink">Verifică</strong> arată dacă se pot
          citi politicos (robots.txt, sitemap, date structurate) — cele „✓” se pot adăuga ca magazine; cele blocate sunt
          candidați pentru emailul cu cererea de feed (<code>docs/email-magazine.md</code>).
        </p>
        <ul className="mt-3 divide-y divide-line">
          {discovered.map((d) => {
            const v = d.check?.verdict ? VERDICT[d.check.verdict] : null;
            return (
              <li key={d.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <a href={d.example_url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                    {d.domain}
                  </a>
                  <span className="text-muted"> · apariții: {d.hits}</span>
                  {d.example_title && <div className="truncate text-xs text-muted">{d.example_title}</div>}
                  {d.check && (
                    <div className="text-xs">
                      {v && <span className={v.cls}>{v.text}</span>}
                      {d.check.platform && <span className="text-muted"> · {d.check.platform}</span>}
                      {d.check.sitemaps?.length ? <span className="text-muted"> · are sitemap</span> : null}
                      {d.check.sample && (
                        <span className="text-muted">
                          {" "}
                          · ex.: {d.check.sample.title} — {d.check.sample.price} lei
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button className={btn} disabled={!!busy} onClick={() => run(`c${d.id}`, () => call(`discovered/${d.id}/check`, "POST").then(loadDiscovered), () => {})}>
                    {busy === `c${d.id}` ? "Se verifică…" : "Verifică"}
                  </button>
                  <button className={btn} disabled={!!busy} onClick={() => call(`discovered/${d.id}/ignore`, "POST").then(loadDiscovered)}>
                    Ignoră
                  </button>
                </div>
              </li>
            );
          })}
          {!discovered.length && <li className="py-2 text-sm text-muted">Încă nimic — rulează „Descoperă magazine acum”.</li>}
        </ul>
      </div>
    </section>
  );
}
