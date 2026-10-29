import type { Metadata } from "next";
import Link from "next/link";

import { appName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Metodologie",
  description:
    "Cum calculăm prețul final real, de unde vin prețurile, cum detectăm reducerile false și cum generăm recomandările.",
};

function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-10 scroll-mt-6 font-display text-2xl font-extrabold tracking-tight">
      {children}
    </h2>
  );
}

export default function Despre() {
  const name = appName();
  return (
    <article className="max-w-2xl text-[15px] leading-relaxed">
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-[46px]">Cum funcționează {name}</h1>
      <p className="mt-3 text-muted">
        Comparăm prețurile din cât mai multe magazine — nu doar din cele care ne plătesc — și le comparăm corect, cu tot
        ce plătești de fapt. Acum urmărim consolele <strong className="text-ink">PlayStation 5</strong> (toate modelele) și
        telefoanele <strong className="text-ink">iPhone 18 Pro / Pro Max</strong> (toate stocările; culorile sunt oferte ale
        aceluiași produs).
      </p>

      <H2>Prețul final real</H2>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-card p-4 text-sm">
        {`transport  = 0 dacă prețul ≥ pragul de livrare gratuită al magazinului, altfel taxa lui
penalizare = preț × 0,5% × (24 − luni de garanție)   — doar dacă există garanție
preț final = preț + transport + penalizare garanție`}
      </pre>
      <p className="mt-3">
        Penalizarea transformă o garanție mai scurtă într-un cost: 12 luni în loc de 24 înseamnă +6% din preț. Astfel,
        3.499 lei cu transport gratuit și 24 de luni <strong>bate</strong> 3.449 lei + 29,99 lei transport + 12 luni
        (3.685,93 lei). La anunțurile <strong>fără garanție</strong> (de obicei persoane fizice) nu adăugăm nimic la preț,
        dar le marcăm vizibil cu „Fără garanție”.
      </p>
      <p className="mt-3">
        Produsele noi vândute de magazine au prin lege minimum 24 de luni de garanție (OUG 140/2021). Costurile de livrare
        sunt luate din condițiile publicate de fiecare magazin; unde nu le-am putut verifica, apare eticheta „estimat”.
      </p>

      <H2>De unde vin prețurile</H2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>
          <strong>Magazine</strong> — robotul nostru,{" "}
          <Link href="/bot" className="underline">
            PretoscopBot
          </Link>
          , citește paginile publice de produs (preț, stoc, preț tăiat) respectând robots.txt și un ritm de maximum o
          cerere la câteva secunde. Magazinele care blochează accesul automat nu sunt ocolite: pe pagina fiecărui produs
          scriem care magazine lipsesc și punem un link să verifici singur. Pentru ele cerem un feed de produse.
        </li>
        <li>
          <strong>Feed-uri</strong> — unde un magazin sau o rețea de afiliere ne dă un fișier cu produsele, îl folosim în
          locul paginilor.
        </li>
        <li>
          <strong>Marketplace</strong> — ofertele vândute de terți prin marketplace-ul unui magazin apar marcate și nu
          intră în minimul pieței și în recomandare, ca să nu distorsioneze prețul real.
        </li>
        <li>
          <strong>Refurbished</strong> (produse verificate și revândute de o firmă, cu garanție) și{" "}
          <strong>second hand</strong> (anunțuri ale persoanelor fizice: Publi24, alerte OLX) — în secțiuni separate, nu în
          comparația principală. Anunțurile cu preț sub 40% din MSRP sunt marcate „preț suspect de mic”.
        </li>
      </ul>

      <H2 id="ordonare">Cum ordonăm ofertele</H2>
      <p className="mt-3">Ordinea ofertelor noi de pe pagina unui produs depinde doar de criteriile de mai jos, în ordinea asta:</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>
          <strong>În stoc înainte de epuizat.</strong> Precomenzile contează ca disponibile și sunt marcate „Precomandă”.
        </li>
        <li>
          <strong>Prețul final</strong>, de la mic la mare: preț + transport + penalizarea pentru garanție mai scurtă
          (calculul de mai sus).
        </li>
        <li>
          <strong>Ce nu intră în „cel mai bun preț”:</strong> ofertele de pe marketplace (vândute de terți), pachetele cu
          jocuri sau accesorii și prețurile neobișnuit de mari. Ele apar în listă, marcate, dar nu stabilesc minimul
          pieței.
        </li>
      </ol>
      <p className="mt-3">
        <strong>Nimeni nu plătește ca să apară mai sus.</strong> Dacă vreodată vom avea oferte promovate, vor fi marcate
        „Promovat” chiar lângă ele și nu vor schimba ordinea după prețul final. Vezi și{" "}
        <Link href="/cum-castigam-bani" className="underline">
          cum câștigăm bani
        </Link>
        .
      </p>

      <H2>MSRP</H2>
      <p className="mt-3">
        Prețul recomandat de producător e cel din zona euro (Sony, respectiv Apple), convertit în lei. Producătorii nu
        publică un preț oficial în lei, de aceea apare ca „estimat”. Îl folosim doar ca reper, nu în verdict.
      </p>

      <H2>Istoricul de preț</H2>
      <p className="mt-3">
        Salvăm un punct nou doar când se schimbă prețul, prețul tăiat sau stocul, iar fiecare preț e valabil doar până la
        ultima confirmare. Dacă într-o perioadă nu am putut verifica prețurile, graficul arată un gol — nu completăm prin
        presupuneri. Unele prețuri din trecut vin din arhiva Wayback Machine (puncte pe grafic). „Minim piață” e cel mai mic
        preț final dintre magazinele cu stoc; perioadele de reduceri (Black Friday, 11.11, Crăciun, Paște, back-to-school)
        sunt marcate pe grafic.
      </p>

      <H2>Recomandarea</H2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>
          <strong>Date insuficiente</strong> — sub 14 zile cu date. Arătăm totuși poziția față de MSRP și diferența dintre
          magazine.
        </li>
        <li>
          <strong>Cumpără acum</strong> — cel mai bun preț final e sub percentila 10 a ultimelor 90 de zile. Excepție:
          produsele noi care se ieftinesc constant (peste 3% în 30 de zile, fără o reducere afișată) primesc „Preț
          obișnuit”, pentru că pot scădea în continuare.
        </li>
        <li>
          <strong>Urmează o reducere</strong> — prețul e peste percentila 70 și un eveniment de reduceri începe în mai
          puțin de 45 de zile. Spunem cât a scăzut prețul la edițiile anterioare, doar dacă avem date.
        </li>
        <li><strong>Așteaptă</strong> — prețul e peste percentila 90, fără eveniment apropiat.</li>
        <li><strong>Preț obișnuit</strong> — în rest.</li>
      </ul>
      <p className="mt-3">
        Încrederea scade când istoricul e scurt, are goluri sau prețul a fost volatil. Fiecare verdict vine cu motivele,
        cu cifre. Recomandările sunt informative, nu sfaturi financiare.
      </p>

      <H2>Reduceri false</H2>
      <p className="mt-3">
        Marcăm o reducere ca suspectă dacă prețul „redus” nu e sub mediana ultimelor 30 de zile, sau dacă prețul a urcat
        cu peste 8% în cele 30 de zile dinainte de „reducere”. Unde magazinul afișează „cel mai mic preț din ultimele 30
        de zile” (obligatoriu prin directiva UE Omnibus), îl folosim ca preț tăiat.
      </p>

      <H2>Cum identificăm produsul</H2>
      <p className="mt-3">
        După EAN sau codul de model, apoi după titlu (ediție, stocare, model). Pachetele cu jocuri sau accesorii apar
        separat, la „Pachete”; accesoriile, consolele modificate și cele cu SSD mărit de revânzători sunt ignorate. Dacă nu
        putem identifica sigur modelul, nu ghicim: anunțul merge la verificare manuală.
      </p>

      <H2>Linkuri și bani</H2>
      <p className="mt-3">
        Butonul „Mergi la magazin” duce direct pe pagina produsului. Detalii despre linkurile de afiliere și despre cum ne
        finanțăm:{" "}
        <Link href="/cum-castigam-bani" className="underline">
          Cum câștigăm bani
        </Link>
        . Vezi și{" "}
        <Link href="/confidentialitate" className="underline">
          confidențialitatea
        </Link>
        .
      </p>

      <H2>Limite</H2>
      <p className="mt-3">
        Prețurile pot diferi de cele din magazin în momentul cumpărării — verifică întotdeauna pe site-ul magazinului.
        {` ${name}`} e un prototip; datele se actualizează periodic.
      </p>
    </article>
  );
}
