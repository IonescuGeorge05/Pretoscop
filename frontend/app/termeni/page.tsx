import type { Metadata } from "next";
import Link from "next/link";

import { projectContact } from "@/lib/contact";
import { appName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Termeni și condiții",
  description: "Regulile de folosire a site-ului: ce oferim, cât de exacte sunt prețurile, alertele, semnalările și linkurile spre magazine.",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 font-display text-2xl font-extrabold tracking-tight">{children}</h2>;
}

/** Operatorul se completează din .env (OPERATOR_NAME) când proiectul are o persoană sau o firmă declarată public. */
function operatorName(): string | null {
  return process.env.OPERATOR_NAME?.trim() || null;
}

export default function Termeni() {
  const name = appName();
  const contact = projectContact();
  const operator = operatorName();
  return (
    <article className="max-w-2xl text-[15px] leading-relaxed [&_li]:text-muted [&_p]:text-muted [&_strong]:text-ink">
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-[46px]">Termeni și condiții</h1>
      <p className="mt-3">Ultima actualizare: noiembrie 2026. Folosind site-ul, ești de acord cu regulile de mai jos.</p>

      <H2>1. Ce este {name}</H2>
      <p className="mt-3">
        {name} este un serviciu gratuit de comparare a prețurilor pentru produse electronice vândute în România: arătăm
        oferte din mai multe magazine, prețul final estimat (cu transport și garanție), istoricul prețului și o recomandare
        informativă. {operator ? `Serviciul este operat de ${operator}.` : "Este un proiect personal, în fază de prototip."}
      </p>

      <H2>2. Nu vindem nimic</H2>
      <p className="mt-3">
        Nu suntem magazin și nu intermediem plata. Când apeși „Mergi la magazin”, cumperi direct de la acel magazin, pe
        site-ul lui, în condițiile lui: prețul, stocul, livrarea, garanția și returul sunt responsabilitatea magazinului.
      </p>

      <H2>3. Cât de exacte sunt informațiile</H2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>
          Prețurile vin din paginile publice ale magazinelor, din feed-urile trimise de ele sau din anunțuri publice, și se
          actualizează periodic, nu în timp real. <strong>Prețul din magazin la momentul comenzii este cel valabil.</strong>
        </li>
        <li>
          Costurile de livrare marcate „estimat” nu au fost confirmate de magazin. Prețul final este un calcul al nostru
          (explicat pe pagina{" "}
          <Link href="/despre" className="underline">
            Cum calculăm
          </Link>
          ), nu o ofertă a magazinului.
        </li>
        <li>
          Prețul recomandat de producător (MSRP) este convertit din euro și marcat „estimat” dacă producătorul nu publică
          un preț în lei.
        </li>
        <li>Ne străduim să asociem corect fiecare ofertă cu modelul potrivit, dar pot apărea greșeli. Scrie-ne și le corectăm.</li>
      </ul>

      <H2>4. Recomandările sunt informative</H2>
      <p className="mt-3">
        „Cumpără acum”, „Așteaptă” și celelalte verdicte sunt calculate automat din istoricul prețurilor și din calendarul
        reducerilor. Nu sunt sfaturi financiare și nu garantează că prețul va crește sau va scădea. Decizia de cumpărare îți
        aparține.
      </p>

      <H2>5. Linkuri spre magazine și afiliere</H2>
      <p className="mt-3">
        Linkurile duc pe site-uri pe care nu le controlăm. Unele pot fi linkuri de afiliere, marcate ca atare; ele nu
        schimbă ordinea ofertelor. Detalii:{" "}
        <Link href="/cum-castigam-bani" className="underline">
          Cum câștigăm bani
        </Link>{" "}
        și{" "}
        <Link href="/despre#ordonare" className="underline">
          Cum ordonăm ofertele
        </Link>
        .
      </p>

      <H2>6. Alertele pe email</H2>
      <p className="mt-3">
        Alertele sunt gratuite, pornesc doar după confirmarea din email și le poți opri oricând din linkul aflat în fiecare
        mesaj. Le trimitem cât de repede putem după ce observăm schimbarea, dar nu garantăm momentul exact și nici că prețul
        mai e valabil când citești emailul. Cum folosim adresa: vezi{" "}
        <Link href="/confidentialitate" className="underline">
          Confidențialitate
        </Link>
        .
      </p>

      <H2>7. „Am găsit mai ieftin”</H2>
      <p className="mt-3">
        Prețurile semnalate de vizitatori apar doar după ce le verificăm, separat de comparație și pentru cel mult 7 zile.
        Putem respinge orice semnalare fără explicații. Nu trimite în formular date personale. Trimițând o semnalare, ne
        permiți să afișăm linkul și prețul pe site.
      </p>

      <H2>8. Folosirea site-ului</H2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>Poți folosi site-ul gratuit, în scop personal.</li>
        <li>
          Nu încerca să accesezi zona de administrare, să ocolești limitele formularelor sau să trimiți cereri automate în
          volum care încarcă serverul.
        </li>
        <li>
          Numele produselor și mărcile aparțin titularilor lor. Textele, calculele și graficele {name} nu pot fi copiate în
          masă fără acordul nostru.
        </li>
      </ul>

      <H2>9. Pentru magazine</H2>
      <p className="mt-3">
        Un magazin poate cere corectarea unei informații, oprirea citirii site-ului său sau poate trimite un feed de
        produse: vezi{" "}
        <Link href="/pentru-magazine" className="underline">
          Pentru magazine
        </Link>{" "}
        și{" "}
        <Link href="/bot" className="underline">
          PretoscopBot
        </Link>
        .
      </p>

      <H2>10. Răspundere</H2>
      <p className="mt-3">
        Site-ul este oferit „așa cum este”. În limitele permise de lege, nu răspundem pentru pierderi rezultate din
        diferențe de preț, stoc sau condiții între site-ul nostru și magazin, din întreruperi ale serviciului sau din
        deciziile de cumpărare luate pe baza recomandărilor.
      </p>

      <H2>11. Modificări și legea aplicabilă</H2>
      <p className="mt-3">
        Putem actualiza acești termeni; data de sus arată ultima modificare. Se aplică legea română. Drepturile tale de
        consumator prevăzute de lege nu sunt afectate de acești termeni.
      </p>

      <H2>12. Contact</H2>
      <p className="mt-3">
        {contact ? (
          <>
            Scrie-ne la{" "}
            <a href={`mailto:${contact}`} className="font-medium text-ink underline">
              {contact}
            </a>
            .
          </>
        ) : (
          "Adresa de contact apare aici la lansarea publică a site-ului."
        )}
      </p>
    </article>
  );
}
