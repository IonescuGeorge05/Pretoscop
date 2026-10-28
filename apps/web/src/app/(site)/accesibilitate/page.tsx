import { legalDocuments } from '@pretoscop/config/legal-texts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { formatLongDate } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Declarație de accesibilitate',
  description: 'Cât de accesibil este Pretoscop, ce standard urmărim (WCAG 2.2 nivel AA), ce am făcut, ce limitări cunoaștem și cum ne semnalezi o problemă.',
  alternates: { canonical: '/accesibilitate', languages: { 'ro-RO': '/accesibilitate' } },
};

export default function AccessibilityPage() {
  const doc = legalDocuments.accessibility;
  return (
    <LegalPage
      eyebrow="Legal"
      title="Declarație de accesibilitate"
      lead="Vrem ca Pretoscop să poată fi folosit de cât mai mulți oameni, inclusiv de persoanele cu dizabilități, pe orice dispozitiv."
      doc={doc}
      sections={[
        {
          id: 'standard',
          title: 'Standardul urmărit',
          content: (
            <p>
              Ținta noastră este nivelul AA al ghidului WCAG 2.2 (Web Content Accessibility Guidelines), pe care se sprijină standardul european EN 301 549
              (versiunea 3.2.1 se aplică până la publicarea versiunii 4.1.1, aliniate la WCAG 2.2, în Jurnalul Oficial al Uniunii Europene). Un comparator de
              prețuri fără vânzare directă probabil nu intră sub incidența Legii nr. 232/2022 privind cerințele de accesibilitate ale produselor și serviciilor;
              urmăm totuși aceleași cerințe.
            </p>
          ),
        },
        {
          id: 'stare',
          title: 'Stadiul conformității',
          content: (
            <p>
              <strong>Parțial conform.</strong> Site-ul este în dezvoltare și nu a fost încă evaluat de un auditor independent. Această declarație se bazează pe
              o autoevaluare.
            </p>
          ),
        },
        {
          id: 'masuri',
          title: 'Ce am făcut',
          content: (
            <ul>
              <li>Structură semantică: titluri ierarhice, zone de pagină marcate (antet, conținut, subsol) și un link „Sari la conținut”.</li>
              <li>Navigare completă din tastatură, cu indicator de focus vizibil.</li>
              <li>Formulare cu etichete vizibile, explicații și mesaje de eroare legate de câmpuri.</li>
              <li>Fonturile sistemului și text care poate fi mărit fără să se piardă conținut; pagini care se adaptează ecranelor mici.</li>
              <li>Regula noastră de design: nicio informație nu este transmisă doar prin culoare (de exemplu, verdictele de preț au și un text).</li>
              <li>Butoane de aceeași mărime și greutate pentru „Accept” și „Refuz” în bannerul pentru statistici.</li>
              <li>Verificări automate: reguli de accesibilitate în verificarea codului și teste Lighthouse.</li>
            </ul>
          ),
        },
        {
          id: 'limitari',
          title: 'Limitări cunoscute',
          content: (
            <ul>
              <li>Nu am testat încă site-ul cu toate cititoarele de ecran folosite pe scară largă (NVDA, JAWS, VoiceOver, TalkBack).</li>
              <li>Graficul istoricului de preț, aflat în dezvoltare, va avea și o alternativă în text pentru cititoarele de ecran.</li>
              <li>Unele tabele lungi din paginile legale trebuie derulate orizontal pe ecranele foarte mici.</li>
            </ul>
          ),
        },
        {
          id: 'feedback',
          title: 'Semnalează o problemă',
          content: (
            <p>
              Dacă ai întâmpinat o barieră de accesibilitate sau ai nevoie de o informație într-un alt format, scrie-ne prin{' '}
              <Link href="/contact">pagina de contact</Link>. Îți răspundem în cel mult 5 zile lucrătoare.
            </p>
          ),
        },
        {
          id: 'data',
          title: 'Data declarației',
          content: (
            <p>
              Declarație întocmită la {formatLongDate(doc.updatedAt)}, pe baza unei autoevaluări. O revizuim cel puțin o dată pe an și la fiecare schimbare
              importantă a site-ului.
            </p>
          ),
        },
      ]}
    />
  );
}
