import type { Metadata } from "next";
import Link from "next/link";

import { appName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Cum câștigăm bani",
  description: "Cum se finanțează comparatorul, ce înseamnă un link de afiliere și de ce nu schimbă ordinea ofertelor.",
};

// pagina cerută de principiile UE pentru instrumentele de comparare: modelul de afaceri trebuie spus clar
export default function CumCastigamBani() {
  const name = appName();
  return (
    <article className="max-w-2xl text-[15px] leading-relaxed">
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-[46px]">Cum câștigăm bani</h1>

      <h2 className="mt-8 font-display text-2xl font-extrabold tracking-tight">Acum: niciun ban</h2>
      <p className="mt-3">
        {name} e un prototip. Nu primim bani de la magazine, nu avem reclame și nu vindem date. Niciun magazin nu plătește
        ca să apară în listă sau mai sus în ea.
      </p>

      <h2 className="mt-8 font-display text-2xl font-extrabold tracking-tight">Mai târziu: linkuri de afiliere</h2>
      <p className="mt-3">
        Unele magazine au programe de afiliere: dacă ajungi la ele de pe {name} și cumperi, ne pot plăti un mic comision
        (de obicei 1–3% la electronice). <strong>Tu plătești același preț.</strong> Asemenea linkuri vor fi marcate „Link
        afiliat” lângă buton.
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>
          <strong>Nu schimbă ordinea.</strong> Ofertele sunt sortate după prețul final, indiferent dacă magazinul ne
          plătește sau nu (vezi{" "}
          <Link href="/despre#ordonare" className="underline">
            cum ordonăm ofertele
          </Link>
          ).
        </li>
        <li>
          <strong>Nu ascundem magazinele care nu plătesc.</strong> eMAG, de exemplu, nu plătește comparatoarele și apare
          oricum, cu link normal.
        </li>
        <li>
          Dacă vom avea vreodată oferte promovate, vor fi marcate „Promovat” chiar lângă ele și nu vor trece înaintea
          prețului mai mic al altui magazin.
        </li>
      </ul>

      <h2 className="mt-8 font-display text-2xl font-extrabold tracking-tight">Ce nu facem</h2>
      <p className="mt-3">
        Nu vindem datele tale și nu folosim cookie-uri de urmărire. Ce reținem când apeși „Mergi la magazin” e scris în{" "}
        <Link href="/confidentialitate" className="underline">
          confidențialitate
        </Link>
        .
      </p>
    </article>
  );
}
