import { legalDocuments } from '@pretoscop/config/legal-texts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { Callout } from '@/components/legal/prose';
import { serverEnv } from '@/lib/db';
import { t } from '@/lib/i18n';
import { operatorFrom } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Termeni și condiții',
  description: 'Condițiile de folosire a site-ului Pretoscop: ce oferim, cum trebuie înțelese prețurile afișate, ce nu este permis și cum ne contactezi.',
  alternates: { canonical: '/termeni', languages: { 'ro-RO': '/termeni' } },
};

export default function TermsPage() {
  const operator = operatorFrom(serverEnv());
  return (
    <LegalPage
      eyebrow="Legal"
      title="Termeni și condiții"
      lead="Regulile de folosire a site-ului Pretoscop, scrise cât mai simplu. Folosind site-ul, ești de acord cu ele."
      doc={legalDocuments.terms}
      sections={[
        {
          id: 'operator',
          title: '1. Cine operează Pretoscop',
          content: (
            <>
              <p>
                Site-ul Pretoscop (pretoscop.ro) este operat de <strong>{operator.name}</strong>, {operator.address} („noi”). Ne poți scrie la{' '}
                <a href={`mailto:${operator.email}`}>{operator.email}</a> sau prin <Link href="/contact">pagina de contact</Link>.
              </p>
              <p>
                Societatea comercială care va opera serviciul este în curs de înființare. Datele ei de identificare (denumirea, codul unic de înregistrare,
                numărul de înregistrare în registrul comerțului și sediul) vor fi publicate aici după înregistrare, înainte de lansarea publică a site-ului.
              </p>
            </>
          ),
        },
        {
          id: 'serviciul',
          title: '2. Ce este serviciul',
          content: (
            <>
              <p>
                Pretoscop este un serviciu gratuit de comparare a prețurilor. Afișăm ofertele magazinelor online din România, prețul total al fiecăreia (prețul
                plus livrarea estimată), istoricul prețurilor observate de noi și verificări ale reducerilor.
              </p>
              <p>
                Nu vindem produse. Când apeși pe o ofertă, ajungi pe site-ul magazinului, iar contractul de vânzare se încheie doar între tine și magazin. Nu
                răspundem pentru produsele, prețurile, livrarea sau serviciile magazinelor.
              </p>
              <p>
                Site-ul se poate folosi fără cont. Funcțiile care vor cere o adresă de email sau un cont (de exemplu, alertele de preț) vor avea condiții
                proprii, pe care le vei vedea înainte să le folosești.
              </p>
            </>
          ),
        },
        {
          id: 'preturi',
          title: '3. Prețurile sunt informative',
          content: (
            <>
              <Callout tone="neutral">
                <p className="font-medium text-ink">{t('footer.disclaimer')}</p>
              </Callout>
              <p>
                Pentru fiecare ofertă afișăm momentul ultimei verificări. Informațiile de pe site-ul magazinului au întotdeauna prioritate față de cele afișate de
                noi. Dacă observi o diferență, <Link href="/contact?subiect=price_error">spune-ne</Link>: verificăm și corectăm.
              </p>
              <p>
                Verdictele de preț și verificările reducerilor descriu fapte calculate din observațiile noastre, cu datele pe care se sprijină. Ele nu sunt
                sfaturi de cumpărare. Regulile sunt explicate în <Link href="/metodologie">Metodologie</Link>.
              </p>
            </>
          ),
        },
        {
          id: 'clasament',
          title: '4. Ordinea ofertelor și linkurile afiliate',
          content: (
            <>
              <p>
                Ordinea ofertelor și importanța fiecărui criteriu sunt explicate în <Link href="/cum-functioneaza">Cum funcționează clasamentul</Link>.
              </p>
              <p>
                Unele linkuri către magazine pot fi linkuri afiliate, marcate „Link afiliat”: dacă cumperi după ce ai apăsat pe ele, magazinul ne poate plăti un
                comision, fără niciun cost suplimentar pentru tine. Comisioanele nu influențează ordinea ofertelor. Detalii în{' '}
                <Link href="/cum-castigam-bani">Cum câștigăm bani</Link>.
              </p>
            </>
          ),
        },
        {
          id: 'folosire',
          title: '5. Ce nu este permis',
          content: (
            <>
              <p>Poți folosi site-ul în scop personal, ca să compari prețuri și să decizi ce cumperi. Nu ai voie:</p>
              <ul>
                <li>
                  să încerci să accesezi fără drept sistemele noastre, să ocolești măsurile de securitate sau de limitare a accesului ori să perturbi
                  funcționarea site-ului;
                </li>
                <li>să trimiți cereri automate într-un volum care încarcă excesiv site-ul;</li>
                <li>să extragi date din site prin mijloace automate, în afara excepțiilor de la punctul 6;</li>
                <li>să folosești site-ul pentru activități ilegale, să te dai drept altcineva sau să trimiți cu bună-știință sesizări ori rapoarte false;</li>
                <li>să prezinți conținutul nostru ca fiind al tău sau să sugerezi o asociere cu Pretoscop care nu există.</li>
              </ul>
            </>
          ),
        },
        {
          id: 'baza-de-date',
          title: '6. Baza de date și extragerea automată',
          content: (
            <>
              <p>
                Baza de date Pretoscop (prețurile observate și istoricul lor, potrivirea ofertelor cu produsele, verdictele și verificările reducerilor) este
                rezultatul unei investiții substanțiale în obținerea, verificarea și prezentarea datelor. Ea este protejată prin dreptul <em>sui generis</em> al
                fabricantului de baze de date, conform art. 140–143 din Legea nr. 8/1996 privind dreptul de autor și drepturile conexe.
              </p>
              <p>
                Fără acordul nostru scris nu este permisă extragerea sau reutilizarea, prin mijloace automate (roboți, scrapere, scripturi) ori manual, a unor
                părți substanțiale din conținutul bazei de date și nici extragerea repetată și sistematică a unor părți nesubstanțiale.
              </p>
              <p>
                Ne rezervăm în mod expres drepturile privind extragerea de text și de date (text and data mining), inclusiv pentru antrenarea sistemelor de
                inteligență artificială, în sensul art. 36² din Legea nr. 8/1996 și al art. 4 alin. (3) din Directiva (UE) 2019/790.
              </p>
              <p>
                Excepții: motoarele de căutare pot indexa paginile în limitele fișierului robots.txt, iar tu poți distribui linkuri către paginile noastre și poți
                cita informații izolate (de exemplu, un preț și data lui), cu indicarea sursei. Pentru acces la date, <Link href="/contact">scrie-ne</Link>.
              </p>
            </>
          ),
        },
        {
          id: 'proprietate',
          title: '7. Proprietate intelectuală',
          content: (
            <>
              <p>Textele, designul, logo-ul și codul site-ului ne aparțin.</p>
              <p>
                Numele și mărcile magazinelor și ale producătorilor aparțin titularilor lor. Le folosim doar ca să identificăm magazinele și produsele; folosirea
                lor nu înseamnă o asociere cu acești titulari sau o recomandare din partea lor.
              </p>
              <p>Specificațiile tehnice preluate din catalogul Open Icecat sunt marcate ca atare și se folosesc conform licenței Open Icecat.</p>
            </>
          ),
        },
        {
          id: 'sesizari',
          title: '8. Sesizări privind conținut ilegal',
          content: (
            <p>
              Poți semnala conținut pe care îl consideri ilegal prin <Link href="/contact?subiect=illegal_content">formularul de contact</Link>, cu subiectul
              „Conținut ilegal (DSA)”. Formularul și adresa {operator.email} sunt punctul unic de contact pentru utilizatori și pentru autorități, conform art. 11 și
              12 din Regulamentul (UE) 2022/2065 privind serviciile digitale. Comunicăm în limba română și în limba engleză.
            </p>
          ),
        },
        {
          id: 'raspundere',
          title: '9. Răspunderea noastră',
          content: (
            <>
              <p>
                Facem eforturi rezonabile ca informațiile să fie corecte și actuale, dar nu garantăm că sunt complete, exacte sau disponibile în permanență.
              </p>
              <p>
                În limitele permise de lege, nu răspundem pentru pierderi rezultate din folosirea informațiilor de pe site, inclusiv din diferențele dintre prețul
                afișat la noi și cel de pe site-ul magazinului, și nici pentru conținutul site-urilor către care trimit linkurile.
              </p>
              <p>
                Nimic din acești termeni nu limitează răspunderea care nu poate fi limitată prin lege (de exemplu, pentru prejudicii cauzate cu intenție sau din
                culpă gravă) și nu îți restrânge drepturile pe care le ai ca consumator.
              </p>
            </>
          ),
        },
        {
          id: 'disponibilitate',
          title: '10. Disponibilitatea serviciului',
          content: (
            <p>
              Putem modifica, suspenda sau opri serviciul, total sau parțial, de exemplu pentru întreținere sau dacă un magazin ne cere să nu-i mai afișăm
              ofertele. Nu garantăm că site-ul va fi disponibil permanent sau fără erori.
            </p>
          ),
        },
        {
          id: 'lege',
          title: '11. Legea aplicabilă și litigii',
          content: (
            <p>
              Acești termeni sunt guvernați de legea română. Dacă ești consumator, păstrezi protecția oferită de prevederile obligatorii ale legii din țara în
              care locuiești. Încercăm să rezolvăm orice neînțelegere pe cale amiabilă; în lipsa unei înțelegeri, litigiile sunt soluționate de instanțele
              competente din România, fără a-ți restrânge dreptul, ca consumator, de a te adresa instanței de la domiciliul tău.
            </p>
          ),
        },
        {
          id: 'modificari',
          title: '12. Modificarea termenilor',
          content: (
            <p>
              Putem actualiza acești termeni, de exemplu când adăugăm funcții noi sau când se schimbă legea. Versiunea și data ultimei actualizări sunt afișate la
              începutul paginii. Modificările importante le anunțăm pe site înainte să intre în vigoare.
            </p>
          ),
        },
        {
          id: 'contact',
          title: '13. Contact',
          content: (
            <p>
              Pentru orice întrebare despre acești termeni, scrie-ne la <a href={`mailto:${operator.email}`}>{operator.email}</a> sau prin{' '}
              <Link href="/contact">pagina de contact</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
