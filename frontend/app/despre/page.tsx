import type { Metadata } from "next";

import { appName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Metodologie",
  description: "Cum calculăm prețul final real și cum generăm recomandările „Cumpără acum” / „Așteaptă”.",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-lg font-semibold">{children}</h2>;
}

export default function Despre() {
  const name = appName();
  return (
    <article className="max-w-2xl text-[15px] leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Cum funcționează {name}</h1>
      <p className="mt-3 text-muted">
        Colectăm prețurile publice de la toate magazinele relevante — nu doar de la cele care ne plătesc — și le
        comparăm corect, cu tot ce plătești de fapt.
      </p>

      <H2>Prețul final real</H2>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-card p-4 text-sm">
        {`transport  = 0 dacă prețul ≥ pragul de livrare gratuită, altfel taxa fixă
penalizare = preț × 0,5% × (24 − luni de garanție)
preț final = preț + transport + penalizare garanție`}
      </pre>
      <p className="mt-3">
        Penalizarea transformă o garanție mai scurtă într-un cost: 12 luni în loc de 24 înseamnă +6% din preț. Astfel,
        3.499 lei cu transport gratuit și 24 luni de garanție <strong>bate</strong> 3.449 lei + 29,99 lei transport + 12
        luni (3.685,93 lei). Afișăm separat fiecare componentă și costul pe lună de garanție. Când regulile de transport
        ale unui magazin nu sunt încă verificate manual, apare eticheta „estimat”.
      </p>

      <H2>Istoricul de preț</H2>
      <p className="mt-3">
        Salvăm un punct nou doar când se schimbă prețul, prețul tăiat sau stocul. „Minim piață” e cel mai mic preț
        final dintre magazinele cu stoc, în fiecare zi. Pe grafic marcăm perioadele de reduceri: Black Friday, Singles&apos;
        Day (11.11), Crăciun, Paște, back-to-school.
      </p>

      <H2>Recomandarea</H2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li><strong>Date insuficiente</strong> — sub 14 zile de istoric.</li>
        <li><strong>Cumpără acum</strong> — cel mai bun preț final e sub percentila 10 a ultimelor 90 de zile.</li>
        <li>
          <strong>Urmează o reducere</strong> — prețul e peste percentila 70 și un eveniment de reduceri începe în mai
          puțin de 45 de zile. Spunem cât a scăzut prețul la edițiile anterioare, doar dacă avem date.
        </li>
        <li><strong>Așteaptă</strong> — prețul e peste percentila 90, fără eveniment apropiat.</li>
        <li><strong>Preț obișnuit</strong> — în rest.</li>
      </ul>
      <p className="mt-3">
        Încrederea scade când istoricul e scurt sau prețul a fost volatil. Fiecare verdict vine cu motivele, cu cifre.
        Recomandările sunt informative, nu sfaturi financiare.
      </p>

      <H2>Reduceri false</H2>
      <p className="mt-3">
        Marcăm o reducere ca suspectă dacă prețul „redus” nu e sub mediana ultimelor 30 de zile, sau dacă prețul a urcat
        cu peste 8% în cele 30 de zile dinainte de „reducere”.
      </p>

      <H2>Ce comparăm</H2>
      <p className="mt-3">
        Doar console noi. Pachetele cu jocuri sau controllere apar separat, la „Pachete”. Produsele resigilate,
        recondiționate sau second hand sunt excluse, iar accesoriile sunt ignorate. Dacă nu putem identifica sigur
        modelul dintr-un anunț, nu ghicim: anunțul merge la verificare manuală.
      </p>

      <H2>Surse și limite</H2>
      <p className="mt-3">
        Respectăm robots.txt și limităm ritmul cererilor. Magazinele care blochează accesul automat nu sunt ocolite; le
        marcăm ca indisponibile. Prețurile pot diferi de cele din magazin — verifică întotdeauna înainte de cumpărare.
      </p>
    </article>
  );
}
