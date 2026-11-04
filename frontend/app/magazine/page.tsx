import type { Metadata } from "next";
import Link from "next/link";

import DemoBanner from "@/components/DemoBanner";
import { getShopTrust } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { IS_STATIC } from "@/lib/static";
import type { ShopTrust } from "@/lib/types";

export const metadata: Metadata = {
  title: "Cât de cinstite sunt reducerile magazinelor",
  description:
    "Pentru fiecare magazin: câte dintre reducerile afișate în ultimele 90 de zile au fost reale, după istoricul nostru de prețuri.",
};

function Score({ s, min }: { s: ShopTrust; min: number }) {
  if (s.fake_pct === null)
    return (
      <p className="text-sm text-muted">
        Prea puține reduceri verificate ({s.judged} din minimum {min})
        {s.unjudged > 0 && `; încă ${s.unjudged} ${s.unjudged === 1 ? "a" : "au"} început înainte să avem destul istoric`}.
      </p>
    );
  const cls =
    s.fake_pct === 0
      ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200"
      : s.fake_pct < 25
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        : "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200";
  return (
    <div>
      <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${cls}`}>
        {s.fake === 0 ? `Nicio reducere falsă din ${s.judged}` : `${s.fake} din ${s.judged} reduceri false (${s.fake_pct}%)`}
      </span>
      {s.examples.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm text-muted">
          {s.examples.map((e) => (
            <li key={`${e.product_slug}-${e.start}`}>
              {e.product}: −{Math.round(e.claimed_pct)}% afișat, din {formatDate(e.start)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function ShopsTrustPage({ searchParams }: { searchParams: { source?: string } }) {
  const source = IS_STATIC ? undefined : searchParams.source;
  const data = await getShopTrust(source);
  const seen = data.shops.filter((s) => s.judged + s.unjudged > 0);
  const none = data.shops.filter((s) => s.judged + s.unjudged === 0);

  return (
    <>
      <DemoBanner isDemo={data.is_demo} path="/magazine" />
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-[46px]">
        Cât de cinstite sunt reducerile magazinelor
      </h1>
      <p className="mt-3 max-w-3xl text-lg leading-relaxed text-muted">
        Pentru fiecare reducere afișată (preț tăiat) în ultimele {data.window_days} de zile verificăm, din istoricul
        nostru, dacă prețul chiar era mai mic decât de obicei. Socotim doar ofertele noi vândute direct de magazin, fără
        pachete și fără vânzătorii din marketplace.
      </p>

      {seen.length > 0 ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {seen.map((s) => (
            <li key={s.slug} className="rounded-3xl border border-line bg-card p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold">{s.name}</h2>
                <span className="text-xs text-muted">
                  {s.offers === 1 ? "1 ofertă urmărită" : `${s.offers} oferte urmărite`}
                </span>
              </div>
              <div className="mt-2">
                <Score s={s} min={data.min_judged} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-3xl border border-line bg-card p-4 text-sm text-muted">
          Încă nu am văzut destule reduceri afișate ca să dăm un scor. Prețurile tăiate se adună odată cu istoricul; primele
          scoruri apar după ce o reducere începe la un produs pe care îl urmărim de cel puțin 14 zile.
        </p>
      )}
      {none.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          Fără prețuri tăiate văzute în {data.window_days} de zile (sau afișate într-un mod pe care nu-l putem citi):{" "}
          {none.map((s) => s.name).join(", ")}.
        </p>
      )}

      <div className="mt-8 max-w-3xl space-y-2 text-sm text-muted">
        <p>
          <strong className="text-ink">Ce numim reducere falsă:</strong> prețul „redus” nu era sub mediana prețului din
          ultimele 30 de zile, sau produsul fusese scumpit cu peste 8% în luna dinaintea reducerii. Aceeași regulă apare
          pe pagina fiecărui produs, cu explicația exactă.
        </p>
        <p>
          O reducere e verificată doar dacă aveam cel puțin 14 zile de istoric când a început. Scorul arată ce am văzut
          noi; nu e o constatare juridică. Un magazin care crede că am greșit ne poate scrie (vezi{" "}
          <Link href="/pentru-magazine" className="underline">
            Pentru magazine
          </Link>
          ).
        </p>
      </div>
    </>
  );
}
