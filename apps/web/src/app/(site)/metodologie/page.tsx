import { legalDocuments } from '@pretoscop/config/legal-texts';
import { Construction } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { Callout, DataTable } from '@/components/legal/prose';

export const metadata: Metadata = {
  title: 'Metodologie',
  description:
    'De unde vin datele Pretoscop, cum construim istoricul prețurilor fără să completăm golurile, cum stabilim verdictul de preț și cum verificăm reducerile.',
  alternates: { canonical: '/metodologie' },
};

export default function MethodologyPage() {
  return (
    <LegalPage
      eyebrow="Transparență"
      title="Metodologie"
      lead="De unde vin prețurile pe care le afișăm, cum construim istoricul și după ce reguli spunem că un preț este bun sau că o reducere nu se sprijină pe observațiile noastre."
      doc={legalDocuments.methodology}
      intro={
        <Callout tone="info" icon={<Construction />}>
          <p>
            Pagina va fi completată înainte de lansare cu exemple concrete și cu metodologia rapoartelor despre reduceri. Regulile de mai jos sunt cele pe care le
            aplicăm deja.
          </p>
        </Callout>
      }
      sections={[
        {
          id: 'surse',
          title: 'De unde vin datele',
          content: (
            <>
              <ul>
                <li>
                  <strong>Robotul nostru, PretoscopBot</strong>, citește paginile publice ale magazinelor care permit acest lucru, după regulile descrise pe
                  pagina <Link href="/bot">PretoscopBot</Link>.
                </li>
                <li>
                  <strong>Feed-uri de produse</strong>, puse la dispoziție de magazine direct sau prin rețele de afiliere, acolo unde termenii lor permit
                  folosirea de către comparatoarele de prețuri.
                </li>
                <li>Pentru unele magazine, prețurile pot fi colectate printr-un serviciu terț de colectare a datelor, cu aceleași reguli de politețe.</li>
              </ul>
              <p>
                Când citim site-ul unui magazin, indiferent de canal, accesăm doar pagini publice de produs, de categorie și sitemap-uri. Nu accesăm pagini de
                cont, coș sau comandă, nu folosim API-uri interne ale magazinelor și nu preluăm imagini, descrieri de produs, recenzii sau date de contact. Despre
                persoane păstrăm cel mult numele comercial al unui vânzător din marketplace, afișat lângă oferta lui. Imaginile de produs provin doar din surse
                care permit folosirea lor: feed-urile magazinelor și catalogul Open Icecat, cu mențiunea sursei.
              </p>
              <p>
                Un magazin ne poate cere oricând să oprim colectarea prețurilor de pe site-ul lui; o facem în cel mult o zi lucrătoare (
                <Link href="/contact?subiect=shop_objection">formularul de contact</Link>).
              </p>
            </>
          ),
        },
        {
          id: 'istoric',
          title: 'Cum construim istoricul',
          content: (
            <ul>
              <li>Istoricul prețurilor conține doar observațiile noastre: fiecare punct are data și ora la care am văzut prețul.</li>
              <li>Nu completăm golurile prin interpolare și nu preluăm istorice de la alte site-uri.</li>
              <li>
                Înregistrăm o observație nouă când se schimbă prețul, prețul tăiat, livrarea sau disponibilitatea; când nimic nu s-a schimbat, actualizăm doar
                momentul ultimei verificări.
              </li>
              <li>
                Un preț este considerat valabil până la ultima verificare care l-a confirmat. Perioadele în care nu am putut verifica un magazin apar ca goluri în
                grafic.
              </li>
              <li>
                Prețurile neobișnuite (de exemplu, de peste trei ori mai mari sau mai mici decât de obicei) sunt reținute pentru verificare și publicate doar
                după ce o a doua observație le confirmă.
              </li>
              <li>
                Seria „cel mai mic preț” din grafic folosește ofertele noi, în stoc, ale magazinelor (nu ale vânzătorilor din marketplace) și nu include
                pachetele cu alte produse.
              </li>
              <li>Datele și orele sunt afișate în ora României.</li>
            </ul>
          ),
        },
        {
          id: 'verdicte',
          title: 'Cum stabilim verdictul de preț',
          content: (
            <>
              <p>Verdictul compară cel mai bun preț total de azi cu prețurile observate de noi pentru același produs:</p>
              <DataTable
                caption="Regulile verdictului de preț"
                head={['Verdict', 'Când îl afișăm']}
                tableClassName="min-w-[30rem]"
                rows={[
                  ['Preț bun', 'Cel mai bun preț total de azi este cel mult cu 1% peste cel mai mic preț din ultimele 30 de zile.'],
                  ['Peste prețul obișnuit', 'Cel mai bun preț total de azi este cu cel puțin 8% peste prețul median din ultimele 90 de zile.'],
                  ['Preț obișnuit', 'În celelalte cazuri.'],
                  ['Istoric insuficient', 'Avem mai puțin de 14 zile de observații sau nicio ofertă în stoc.'],
                ]}
              />
              <p>
                Afișăm „−X% față de minimul ultimelor 30 de zile” doar după cel puțin 14 zile de observații. Prețul tăiat al magazinului îl arătăm separat, ca
                „preț de referință afișat de magazin”.
              </p>
            </>
          ),
        },
        {
          id: 'reduceri',
          title: 'Cum verificăm reducerile',
          content: (
            <>
              <p>
                Pentru o ofertă cu reducere anunțată, verificăm patru fapte. Le calculăm doar după primele 30 de zile ale ofertei și doar dacă am observat cel
                puțin 70% din zilele perioadei analizate:
              </p>
              <ol>
                <li>
                  <strong>Prețul de referință este peste minimul observat de noi:</strong> prețul tăiat afișat de magazin este cu peste 2% mai mare decât cel
                  mai mic preț observat de noi la același magazin în cele 30 de zile dinaintea reducerii.
                </li>
                <li>
                  <strong>Preț crescut înainte de reducere:</strong> în perioada de acum 30 până acum 3 zile, prețul a urcat la cel puțin 115% din prețul median
                  al celor 30 de zile dinainte (de acum 60 până acum 31 de zile), iar prețul de acum este de cel puțin 97% din acea mediană.
                </li>
                <li>
                  <strong>Preț tăiat neobservat ca preț de vânzare:</strong> în ultimele 90 de zile nu am văzut produsul vândut la acel magazin la prețul tăiat
                  afișat acum.
                </li>
                <li>
                  <strong>Reducere mare, preț peste mediana pieței:</strong> reducerea anunțată depășește 30%, dar prețul este egal cu sau mai mare decât prețul
                  median din toate magazinele.
                </li>
              </ol>
              <p>
                Aceste mențiuni descriu fapte, cu cifrele și datele pe care se sprijină, de exemplu: „Prețul de referință afișat de magazin (X lei) este mai mare
                decât cel mai mic preț observat de Pretoscop în ultimele 30 de zile (Y lei, la data Z)”. Nu sunt acuzații și nu spun nimic despre intențiile
                magazinului. Păstrăm observațiile pe care se sprijină fiecare mențiune.
              </p>
            </>
          ),
        },
        {
          id: 'corecturi',
          title: 'Corecturi și drept la replică',
          content: (
            <p>
              Ai văzut un preț greșit sau o mențiune pe care o consideri incorectă? <Link href="/contact?subiect=price_error">Scrie-ne</Link>: verificăm pe pagina
              magazinului și corectăm. Magazinele pot cere corectarea unei mențiuni și ne pot trimite punctul lor de vedere.
            </p>
          ),
        },
      ]}
    />
  );
}
