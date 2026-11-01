import type { Metadata } from "next";
import Link from "next/link";

import { projectContact } from "@/lib/contact";
import { appName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Pentru magazine",
  description:
    "Cum ajung produsele unui magazin în comparație: listare gratuită, prin feed-ul de produse pe care îl aveți deja (compari.ro, Google Shopping, Pricy, 2Performant).",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed [&_li]:text-muted [&_p]:text-muted [&_strong]:text-ink">{children}</div>
    </section>
  );
}

const FORMATS = [
  ["compari.ro", "XML-ul trimis deja la compari.ro / price.ro"],
  ["Google Shopping", "feed-ul Google Merchant Center (XML sau TSV)"],
  ["Pricy", "CSV-ul încărcat pe seller.pricy.ro"],
  ["2Performant / Profitshare", "feed-ul de produse din rețeaua de afiliere"],
  ["Orice CSV sau XML", "cu titlu, link, preț și stoc; recunoaștem automat numele uzuale de coloane"],
];

export default function ForShopsPage() {
  const name = appName();
  const contact = projectContact();
  return (
    <article className="max-w-3xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-[46px]">Pentru magazine</h1>
      <p className="mt-3 text-lg leading-relaxed text-muted">
        {name} compară prețul final (cu transport și garanție) din magazinele din România și arată istoricul prețului.
        <strong className="text-ink"> Listarea e gratuită</strong> și nimeni nu plătește pentru o poziție mai bună: ordinea
        e dată doar de prețul final (
        <Link href="/despre#ordonare" className="underline">
          cum ordonăm ofertele
        </Link>
        ).
      </p>

      <Section title="Cum intrați în comparație: un link, atât">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Trimiteți-ne linkul feed-ului de produse</strong> pe care îl aveți deja pentru alt comparator sau pentru
            Google Shopping. Nu trebuie să faceți unul nou.
          </li>
          <li>Îl citim de câteva ori pe zi și păstrăm doar produsele din categoriile pe care le comparăm.</li>
          <li>Produsele apar cu link direct spre pagina dumneavoastră. Fără costuri, fără contract.</li>
        </ol>
      </Section>

      <Section title="Formate acceptate">
        <ul className="divide-y divide-line rounded-3xl border border-line bg-card">
          {FORMATS.map(([fmt, what]) => (
            <li key={fmt} className="flex flex-wrap gap-x-3 px-5 py-3">
              <strong className="min-w-[180px]">{fmt}</strong>
              <span>{what}</span>
            </li>
          ))}
        </ul>
        <p>
          Câmpuri necesare: <strong>link spre produs, denumire, preț</strong> (spuneți-ne dacă e fără TVA) și{" "}
          <strong>stoc</strong>. Recomandate: <strong>EAN</strong> sau codul producătorului (potrivim produsul exact, fără
          confuzii între variante), prețul vechi, costul de livrare și garanția.
        </p>
      </Section>

      <Section title="Ce comparăm acum">
        <p>
          Console (PlayStation 5, Nintendo Switch 2, Xbox Series) și telefoane (iPhone 17, iPhone 18 Pro, Samsung Galaxy
          S26 Ultra) — noi, refurbished și second hand. Adăugăm categorii pe parcurs; feed-ul complet ne ajută să le
          includem imediat.
        </p>
      </Section>

      <Section title="De ce un feed și nu citirea paginilor">
        <p>
          Robotul nostru,{" "}
          <Link href="/bot" className="underline">
            PretoscopBot
          </Link>
          , citește pagini publice încet și respectă robots.txt, dar nu trece de protecțiile anti-bot — iar multe magazine
          mari le au activate pentru toți roboții. Cu un feed, prețul de la noi e exact cel din magazin, actualizat des,
          fără nicio cerere în plus către site-ul dumneavoastră.
        </p>
      </Section>

      <Section title="Ce câștigați">
        <ul className="list-disc space-y-2 pl-5">
          <li>Vizitatori care caută deja produsul și compară prețul final — trimiși direct pe pagina produsului.</li>
          <li>
            Când reducerea e reală, o arătăm ca atare: pe pagina{" "}
            <Link href="/reduceri" className="underline">
              Reduceri reale
            </Link>{" "}
            apar doar scăderile față de prețul din luna dinainte.
          </li>
          <li>Prețul greșit se corectează repede: scrieți-ne și reparăm în cel mult o zi lucrătoare.</li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>
          {contact ? (
            <>
              Trimiteți linkul feed-ului (sau întrebări) la{" "}
              <a href={`mailto:${contact}?subject=Feed%20produse`} className="font-medium text-ink underline">
                {contact}
              </a>
              .
            </>
          ) : (
            <>Adresa de contact pentru magazine apare aici la lansarea publică a site-ului.</>
          )}{" "}
          Dacă preferați să nu fiți inclus, ne oprim imediat — vedeți{" "}
          <Link href="/bot" className="underline">
            cum ne opriți
          </Link>
          .
        </p>
      </Section>
    </article>
  );
}
