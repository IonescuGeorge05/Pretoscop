import { legalDocuments } from '@pretoscop/config/legal-texts';
import { B2B_PLANS } from '@pretoscop/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { Callout } from '@/components/legal/prose';
import { serverEnv } from '@/lib/db';
import { formatEur } from '@/lib/format';
import { operatorFrom } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Termeni pentru clienții B2B',
  description:
    'Condițiile serviciului Pretoscop de analiză a prețurilor pentru magazine și branduri: ce date primești, cum le poți folosi (doar intern, fără revânzare), API, planuri și facturare.',
  alternates: { canonical: '/pentru-companii/termeni' },
};

const price = (cents: number | null) => (cents === null ? 'gratuit, în baza unui acord pilot' : `${formatEur(cents / 100)} pe lună, fără TVA`);

export default function B2bTermsPage() {
  const operator = operatorFrom(serverEnv());
  return (
    <LegalPage
      eyebrow="Pentru companii"
      title="Termeni pentru clienții B2B"
      lead="Condițiile în care o firmă folosește analizele de preț Pretoscop (spațiul de lucru, rezumatul zilnic, exportul CSV și API-ul). Proprietarul spațiului de lucru le acceptă în numele firmei înainte de a vedea datele."
      doc={legalDocuments.b2bTerms}
      intro={
        <Callout tone="neutral">
          <p>
            Pe scurt: primești prețurile pe care Pretoscop le observă public la magazinele online din România, pentru produsele pe care le urmărești. Le folosești doar
            pentru deciziile firmei tale: nu le revinzi, nu le publici, nu construiești din ele un serviciu concurent și nu antrenezi modele de inteligență artificială
            cu ele. Nu primești date personale ale cumpărătorilor și nici conținut Open Icecat.
          </p>
        </Callout>
      }
      sections={[
        {
          id: 'parti',
          title: '1. Părțile și serviciul',
          content: (
            <>
              <p>
                Serviciul este oferit de <strong>{operator.name}</strong>, {operator.address} („Pretoscop”), firmei care are un spațiu de lucru B2B („clientul”).
                Societatea care va opera serviciul este în curs de înființare; datele ei de identificare vor fi publicate aici după înregistrare.
              </p>
              <p>
                Serviciul cuprinde: lista produselor urmărite (SKU-uri), tabelul cu poziția prețului clientului față de ofertele altor magazine, istoricul prețurilor
                observate, un rezumat zilnic pe email, exportul CSV și, în planurile care îl includ, accesul prin API. Serviciul nu modifică prețurile clientului și
                nu cuprinde repricing automat.
              </p>
            </>
          ),
        },
        {
          id: 'date',
          title: '2. Ce date primești',
          content: (
            <ul>
              <li>prețuri, costuri de livrare, disponibilitate și momentul verificării, așa cum le-a observat Pretoscop pe paginile publice și în feed-urile magazinelor;</li>
              <li>istoricul se construiește doar din observațiile noastre: zilele fără observații rămân goale, nu completăm și nu estimăm prețuri;</li>
              <li>
                nu conține date personale ale cumpărătorilor sau vizitatorilor Pretoscop (clickuri, alerte, conturi) și nici specificații ori imagini din catalogul
                Open Icecat;
              </li>
              <li>
                datele pot avea întârzieri sau erori (un magazin își poate schimba prețul între două verificări); de aceea fiecare preț are ora ultimei verificări.
                Le oferim așa cum sunt, fără garanția că sunt complete.
              </li>
            </ul>
          ),
        },
        {
          id: 'utilizare',
          title: '3. Cum poți folosi datele',
          content: (
            <>
              <p>
                Pretoscop îi acordă clientului, pe durata abonamentului, un drept neexclusiv și netransmisibil de a folosi datele în interesul propriei activități
                (stabilirea prețurilor, a sortimentului și a promoțiilor, analize interne). Datele pot fi văzute de angajații și colaboratorii clientului care au
                nevoie de ele și au obligații de confidențialitate.
              </p>
              <p>Clientului nu îi este permis:</p>
              <ul>
                <li>să vândă, să închirieze, să publice sau să transmită datele altor persoane (cu excepția consultanților proprii, sub obligație de confidențialitate);</li>
                <li>să construiască sau să alimenteze din ele un comparator de prețuri, un serviciu de analiză a prețurilor ori o bază de date oferită altora;</li>
                <li>să le folosească pentru antrenarea sau evaluarea modelelor de inteligență artificială;</li>
                <li>să acceseze serviciul automat altfel decât prin API, să ocolească cotele sau să împartă cheile API cu alte firme;</li>
                <li>
                  să le folosească pentru a coordona prețurile cu concurenții sau în alt mod contrar regulilor de concurență (Legea concurenței nr. 21/1996, art. 101
                  TFUE).
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'api',
          title: '4. Contul, cheile API și cotele',
          content: (
            <ul>
              <li>accesul se face cu adresa de email invitată în spațiul de lucru; proprietarul răspunde de cine are acces;</li>
              <li>
                cheile API sunt secrete; păstrăm doar o amprentă a lor, așa că le afișăm o singură dată. O cheie compromisă se revocă imediat din pagina API a spațiului
                de lucru;
              </li>
              <li>fiecare plan are o limită de SKU-uri și o cotă zilnică de cereri API (ziua după ora României); peste cotă, cererile sunt refuzate până a doua zi.</li>
            </ul>
          ),
        },
        {
          id: 'planuri',
          title: '5. Planuri, prețuri și facturare',
          content: (
            <>
              <ul>
                <li>
                  {B2B_PLANS.starter.label}: {B2B_PLANS.starter.skuLimit} de SKU-uri, fără API — {price(B2B_PLANS.starter.monthlyEurCents)};
                </li>
                <li>
                  {B2B_PLANS.pro.label}: {B2B_PLANS.pro.skuLimit.toLocaleString('ro-RO')} de SKU-uri, API — {price(B2B_PLANS.pro.monthlyEurCents)};
                </li>
                <li>
                  {B2B_PLANS.enterprise.label}: {B2B_PLANS.enterprise.skuLimit.toLocaleString('ro-RO')} de SKU-uri, API cu cotă mare — de la{' '}
                  {price(B2B_PLANS.enterprise.monthlyEurCents)}, prin contract;
                </li>
                <li>Pilot: în condițiile convenite în scris cu Pretoscop.</li>
              </ul>
              <p>
                Abonamentele se plătesc lunar, în avans, prin procesatorul de plăți afișat la abonare; se adaugă TVA. Factura fiscală se emite conform legii
                (inclusiv prin sistemul RO e-Factura) pe datele de facturare din spațiul de lucru. Abonamentul se poate opri oricând și rămâne activ până la sfârșitul
                perioadei plătite.
              </p>
            </>
          ),
        },
        {
          id: 'personale',
          title: '6. Date personale',
          content: (
            <p>
              Pentru conturile membrilor prelucrăm adresa de email, rolul în spațiul de lucru și momentul acceptării termenilor, ca operator, după{' '}
              <Link href="/confidentialitate">Politica de confidențialitate</Link>. Rezumatul zilnic se trimite doar membrilor care îl au activat și se poate opri din
              pagina Setări.
            </p>
          ),
        },
        {
          id: 'suspendare',
          title: '7. Suspendare și încetare',
          content: (
            <p>
              Dacă datele sunt folosite contrar punctului 3, putem suspenda spațiul de lucru și cheile API, cu motivarea deciziei. Clientul poate încheia oricând
              abonamentul. La cererea clientului ștergem lista de SKU-uri după încetare; documentele de facturare se păstrează cât cere legea contabilității.
            </p>
          ),
        },
        {
          id: 'lege',
          title: '8. Răspundere, modificări și legea aplicabilă',
          content: (
            <p>
              Răspunderea Pretoscop față de client este limitată la sumele plătite de client în ultimele 12 luni, cu excepția cazurilor în care legea nu permite
              limitarea. Anunțăm prin email modificările acestor termeni cu cel puțin 30 de zile înainte. Se aplică legea română; litigiile se soluționează de instanțele
              de la sediul Pretoscop. Întrebări: <a href={`mailto:${operator.email}`}>{operator.email}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
