import type { Metadata } from "next";

import { appName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Confidențialitate",
  description: "Ce date colectează site-ul și cum sunt folosite.",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-lg font-semibold">{children}</h2>;
}

export default function Confidentialitate() {
  const name = appName();
  return (
    <article className="max-w-2xl text-[15px] leading-relaxed">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Confidențialitate</h1>
      <p className="mt-3 text-muted">Ultima actualizare: octombrie 2026. {name} e în fază de prototip.</p>

      <H2>Pe scurt</H2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>Nu ai cont și nu îți cerem date personale.</li>
        <li>Nu folosim cookie-uri de marketing, reclame sau trackere de la terți.</li>
        <li>Nu vindem și nu transmitem date despre vizitatori.</li>
      </ul>

      <H2>Ce date tehnice apar</H2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>
          <strong>Click pe „Mergi la magazin”</strong> (în aplicația completă): înregistrăm oferta pe care ai apăsat, ora,
          pagina de unde ai venit și tipul de browser — fără adresă IP sau alt identificator personal. Folosim asta doar ca
          să știm ce oferte sunt utile.
        </li>
        <li>
          <strong>Găzduirea</strong>: versiunea publică e găzduită pe GitHub Pages; GitHub poate înregistra, ca orice
          server web, date tehnice de acces (de ex. adresa IP) conform politicii sale de confidențialitate.
        </li>
        <li>
          <strong>Preferințe locale</strong>: unele setări (de ex. filtrele graficului) pot fi ținute doar în browserul tău.
        </li>
      </ul>

      <H2>Datele despre prețuri</H2>
      <p className="mt-3">
        Afișăm prețuri publice ale magazinelor și anunțuri publice. La anunțurile persoanelor fizice afișăm doar titlul,
        prețul și orașul, fără nume sau date de contact; pentru restul, linkul duce la platforma unde a fost publicat
        anunțul.
      </p>

      <H2>Linkuri către magazine</H2>
      <p className="mt-3">
        Când pleci spre un magazin, se aplică politica de confidențialitate a acelui magazin. Unele linkuri pot deveni
        linkuri de afiliere (rețelele de afiliere pot seta propriile cookie-uri pe site-ul magazinului).
      </p>

      <H2>Contact</H2>
      <p className="mt-3">Pentru întrebări sau cereri de ștergere a unui anunț afișat, scrie-ne la adresa de contact a proiectului.</p>
    </article>
  );
}
