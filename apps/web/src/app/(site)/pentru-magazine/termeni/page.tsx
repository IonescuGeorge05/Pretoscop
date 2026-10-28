import { legalDocuments } from '@pretoscop/config/legal-texts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { Callout } from '@/components/legal/prose';
import { serverEnv } from '@/lib/db';
import { operatorFrom } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Termeni pentru magazine',
  description:
    'Condițiile listării gratuite pe Pretoscop: feed-ul și exactitatea datelor, cum ordonăm ofertele, ce date folosim, suspendarea cu motivare și reclamațiile.',
  alternates: { canonical: '/pentru-magazine/termeni' },
};

export default function MerchantTermsPage() {
  const operator = operatorFrom(serverEnv());
  return (
    <LegalPage
      eyebrow="Pentru magazine"
      title="Termeni pentru magazine"
      lead="Condițiile în care un magazin își listează ofertele pe Pretoscop prin feed. Le accepți când trimiți magazinul spre aprobare."
      doc={legalDocuments.merchantTerms}
      intro={
        <Callout tone="neutral">
          <p>
            Pe scurt: listarea este gratuită; garantezi că feed-ul spune adevărul despre prețuri, stoc și livrare; ordonăm ofertele după prețul total, fără ca
            cineva să poată plăti pentru o poziție mai bună; dacă suspendăm sau încetăm listarea, îți spunem de ce.
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
                Serviciul este oferit de <strong>{operator.name}</strong>, {operator.address} („Pretoscop”), magazinului care se înregistrează prin contul pentru
                magazine („magazinul”). Societatea care va opera serviciul este în curs de înființare; datele ei de identificare vor fi publicate aici după
                înregistrare.
              </p>
              <p>
                Serviciul constă în afișarea gratuită a ofertelor magazinului pe paginile de produs Pretoscop, pe baza feed-ului de produse trimis de magazin, cu
                link direct către pagina produsului de pe site-ul magazinului. Pretoscop nu vinde produse și nu intervine în contractele dintre magazin și
                cumpărători.
              </p>
            </>
          ),
        },
        {
          id: 'eligibilitate',
          title: '2. Cine se poate lista',
          content: (
            <ul>
              <li>magazinele online care vând consumatorilor din România, operate de o firmă înregistrată;</li>
              <li>care dovedesc că administrează domeniul site-ului (email pe domeniu, înregistrare DNS sau fișier de verificare);</li>
              <li>cu un feed în format Google Merchant, compari.ro sau CSV, cu prețuri în lei și TVA inclus.</li>
            </ul>
          ),
        },
        {
          id: 'feed',
          title: '3. Feed-ul și exactitatea datelor',
          content: (
            <>
              <p>Magazinul garantează că datele din feed:</p>
              <ul>
                <li>corespund celor de pe site-ul său în momentul citirii (preț, preț vechi, disponibilitate, cost de livrare);</li>
                <li>conțin doar produse pe care le vinde efectiv și ale căror adrese sunt pe domeniul verificat;</li>
                <li>
                  respectă legea, inclusiv regulile privind anunțarea reducerilor (prețul de referință este cel mai mic preț din ultimele 30 de zile, conform art.
                  4¹ din HG nr. 947/2000);
                </li>
                <li>nu conțin produse interzise sau conținut ilegal.</li>
              </ul>
              <p>
                Un feed dat prin adresă îl citim de șase ori pe zi cu robotul PretoscopBot-Feed, cu respectarea robots.txt. Un fișier încărcat îl citim o
                singură dată, la încărcare: ofertele lui apar ca verificate în acel moment și sunt marcate ca neactualizate după trei zile, dacă nu încarci
                altul. Dacă un preț din feed diferă de cel de pe site, pe Pretoscop rămâne valabilă mențiunea că prețul final este cel afișat de magazin la
                plasarea comenzii.
              </p>
            </>
          ),
        },
        {
          id: 'clasament',
          title: '4. Cum afișăm și ordonăm ofertele',
          content: (
            <>
              <p>
                Ofertele magazinului sunt ordonate după aceleași reguli ca toate celelalte: disponibilitatea și prospețimea ofertei, apoi prețul total (preț plus
                livrare), apoi momentul ultimei verificări. Regulile complete sunt pe pagina <Link href="/cum-functioneaza">Cum funcționează clasamentul</Link>.
              </p>
              <p>
                Faptul că magazinul ne trimite un feed, are sau nu un program de afiliere ori ne plătește nu îi schimbă poziția în lista implicită. Dacă vom introduce
                plasări plătite, ele vor fi marcate „Promovat”, vor fi afișate separat de lista ordonată, iar condițiile lor vor fi publicate înainte (vezi{' '}
                <Link href="/cum-castigam-bani">Cum câștigăm bani</Link>).
              </p>
              <p>
                Verificăm reducerile față de prețurile observate de noi și afișăm mențiuni factuale, după regulile din <Link href="/metodologie">Metodologie</Link>.
                Magazinul poate cere corectarea unei mențiuni.
              </p>
            </>
          ),
        },
        {
          id: 'date',
          title: '5. Ce date folosim',
          content: (
            <>
              <p>
                Folosim datele din feed pentru a afișa ofertele, pentru istoricul prețurilor și pentru statistici agregate despre piață. Imaginile și descrierile
                din feed le folosim doar pentru afișarea produselor magazinului; numele și marca magazinului, doar pentru a-l identifica.
              </p>
              <p>
                În contul magazinului vezi ofertele afișate, cât de multe sunt potrivite cu produse din catalog, clicurile din ultimele 30 de zile și problemele
                găsite în feed. Nu vindem datele magazinului și nu le dăm altor magazine la nivel individual.
              </p>
            </>
          ),
        },
        {
          id: 'suspendare',
          title: '6. Suspendare și încetare',
          content: (
            <>
              <p>
                Putem refuza, restricționa sau suspenda listarea dacă datele din feed sunt în mod repetat greșite, dacă se încalcă acești termeni sau legea ori
                dacă ne obligă o autoritate. Îi transmitem magazinului motivele, cel târziu când decizia produce efecte, cu faptele și regulile pe care se sprijină
                (conform art. 4 din Regulamentul (UE) 2019/1150). Suspendarea produce efecte imediat: ofertele magazinului nu mai sunt afișate și feed-ul nu mai
                este citit până la reluare; la reluare, ofertele revin după prima citire a feed-ului.
              </p>
              <p>
                Putem înceta definitiv listarea cu un preaviz de 30 de zile, cu excepția cazurilor în care legea ne obligă sau a încălcărilor repetate ale acestor
                termeni. Magazinul poate renunța oricând, scriindu-ne sau oprind feed-ul; ofertele dispar după ce nu mai sunt confirmate.
              </p>
            </>
          ),
        },
        {
          id: 'reclamatii',
          title: '7. Reclamații',
          content: (
            <p>
              Reclamațiile (inclusiv împotriva unei decizii de respingere sau suspendare) se trimit prin{' '}
              <Link href="/contact?subiect=merchant">formularul de contact</Link>, cu subiectul „Colaborare magazin”, sau la {operator.email}. Răspundem în cel mult
              15 zile lucrătoare. Dacă nu ajungem la o înțelegere, putem încerca de comun acord o mediere.
            </p>
          ),
        },
        {
          id: 'modificari',
          title: '8. Modificarea termenilor',
          content: (
            <p>
              Anunțăm orice modificare a acestor termeni prin email, cu cel puțin 15 zile înainte să intre în vigoare (conform art. 3 din Regulamentul (UE)
              2019/1150). În acest timp, magazinul poate renunța la listare.
            </p>
          ),
        },
        {
          id: 'lege',
          title: '9. Răspundere și legea aplicabilă',
          content: (
            <p>
              Fiecare parte răspunde pentru datele și obligațiile proprii, în limitele legii. Acești termeni sunt guvernați de legea română; litigiile se
              soluționează de instanțele competente din România.
            </p>
          ),
        },
      ]}
    />
  );
}
