import { legalDocuments, supervisoryAuthority } from '@pretoscop/config/legal-texts';
import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { Callout, DataTable, InfoCard } from '@/components/legal/prose';
import { serverEnv } from '@/lib/db';
import { operatorFrom } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Politica de confidențialitate',
  description: 'Ce date personale prelucrează Pretoscop, de ce, pe ce temei legal, cât timp le păstrăm, cine ne ajută și ce drepturi ai.',
  alternates: { canonical: '/confidentialitate', languages: { 'ro-RO': '/confidentialitate' } },
};

const GDPR_F = 'art. 6 alin. (1) lit. f) GDPR';

export default function PrivacyPage() {
  const operator = operatorFrom(serverEnv());
  const privacyMail = <a href={`mailto:${operator.privacyEmail}`}>{operator.privacyEmail}</a>;
  return (
    <LegalPage
      eyebrow="Legal"
      title="Politica de confidențialitate"
      lead="Ce date personale prelucrăm, de ce și cât timp, cine ne ajută și ce drepturi ai. Am încercat să păstrăm doar datele de care chiar avem nevoie."
      doc={legalDocuments.privacy}
      sections={[
        {
          id: 'operator',
          title: 'Cine răspunde de datele tale',
          content: (
            <>
              <p>
                Operatorul datelor este <strong>{operator.name}</strong>, {operator.address}. Datele complete de identificare ale societății vor fi publicate
                aici după înregistrarea ei, înainte de lansarea publică a site-ului.
              </p>
              <p>
                Pentru orice întrebare despre datele personale, scrie-ne la {privacyMail}. Nu am numit un responsabil cu protecția datelor (DPO), deoarece
                activitatea noastră nu impune acest lucru (art. 37 din Regulamentul (UE) 2016/679, „GDPR”).
              </p>
            </>
          ),
        },
        {
          id: 'pe-scurt',
          title: 'Pe scurt',
          content: (
            <Callout icon={<ShieldCheck />}>
              <ul>
                <li>Nu folosim cookie-uri pentru vizitatori, în mod implicit.</li>
                <li>Nu salvăm adresa ta IP în baza noastră de date.</li>
                <li>Statisticile de trafic Plausible pornesc doar dacă apeși „Accept”.</li>
                <li>Nu vindem și nu închiriem date personale și nu le folosim pentru publicitate personalizată.</li>
                <li>De pe site-urile magazinelor preluăm doar date comerciale despre oferte.</li>
              </ul>
            </Callout>
          ),
        },
        {
          id: 'prelucrari',
          title: 'Ce date prelucrăm și de ce',
          content: (
            <>
              <p>
                Pretoscop este în faza de prototip. Unele activități de mai jos (de exemplu, alertele de preț) vor începe abia după lansarea publică; le
                descriem de acum, ca să știi dinainte ce vom face.
              </p>
              <InfoCard
                id="vizite"
                title="Vizitarea site-ului"
                items={[
                  ['Ce date', 'Adresa IP, tipul de browser și de dispozitiv, pagina cerută, data și ora cererii.'],
                  ['De ce', 'Ca să îți afișăm paginile, să protejăm site-ul împotriva atacurilor și a abuzurilor și să găsim erorile tehnice.'],
                  ['Temeiul legal', `Interesul nostru legitim de a oferi un site sigur și funcțional (${GDPR_F}).`],
                  ['Cât timp', 'Jurnalele tehnice ale serverului: cel mult 30 de zile. În baza noastră de date nu salvăm adresa IP.'],
                ]}
              />
              <InfoCard
                id="evenimente"
                title="Statistici interne de utilizare, fără cookie-uri"
                items={[
                  [
                    'Ce date',
                    'Evenimente precum o căutare, deschiderea unei pagini de produs sau un clic spre un magazin, cu pagina și domeniul site-ului de pe care ai venit. În locul adresei IP păstrăm un identificator de sesiune calculat din adresa IP și din browser cu o cheie care se schimbă zilnic; identificatorii din zile diferite nu pot fi legați între ei.',
                  ],
                  ['De ce', 'Ca să înțelegem ce funcționează, cât de des sunt folosite ofertele și ce trebuie îmbunătățit.'],
                  ['Temeiul legal', `Interes legitim (${GDPR_F}). Pentru aceste statistici nu stocăm și nu citim nimic de pe dispozitivul tău.`],
                  ['Cât timp', 'Cel mult 13 luni; după 90 de zile păstrăm doar totaluri.'],
                ]}
              />
              <InfoCard
                id="statistici"
                title="Statistici de trafic Plausible, doar cu acordul tău"
                items={[
                  [
                    'Ce date',
                    'Pagina vizitată, site-ul de pe care ai venit, tipul de dispozitiv și de browser și țara. Plausible calculează un identificator zilnic din adresa IP și din browser, fără să rețină adresa IP și fără cookie-uri.',
                  ],
                  ['De ce', 'Statistici agregate de trafic, de exemplu câți vizitatori vin din motoarele de căutare.'],
                  [
                    'Temeiul legal',
                    <>
                      Consimțământul tău (art. 6 alin. (1) lit. a) GDPR și art. 4 alin. (5) din Legea nr. 506/2004), pe care îl poți retrage oricând din pagina{' '}
                      <Link href="/cookies">Cookie-uri</Link>.
                    </>,
                  ],
                  ['Cât timp', 'Statisticile agregate se păstrează cât funcționează site-ul. Cheia zilnică se șterge după 24 de ore, așa că vizitele nu mai pot fi legate de o persoană.'],
                ]}
              />
              <InfoCard
                id="contact"
                title="Formularul de contact și mesajele trimise pe email"
                items={[
                  [
                    'Ce date',
                    'Tipul solicitării, numele (opțional), adresa de email (obligatorie pentru cererile magazinelor și pentru solicitările privind datele personale), adresa paginii, mesajul și un identificator de sesiune calculat zilnic, fără adresa IP. Pentru mesajele trimise direct pe email: adresa ta și conținutul mesajului.',
                  ],
                  [
                    'De ce',
                    'Ca să îți răspundem, să corectăm erorile de preț, să oprim colectarea la cererea unui magazin, să tratăm sesizările privind conținut ilegal și solicitările privind datele personale și să păstrăm dovada că le-am tratat.',
                  ],
                  [
                    'Temeiul legal',
                    `Interes legitim (${GDPR_F}); pentru sesizările privind conținut ilegal și pentru solicitările privind datele personale, o obligație legală (art. 6 alin. (1) lit. c) GDPR, împreună cu Regulamentul (UE) 2022/2065 și art. 12 GDPR).`,
                  ],
                  [
                    'Cât timp',
                    '12 luni de la rezolvare; 3 ani pentru cererile magazinelor, sesizările privind conținut ilegal și solicitările privind datele personale, ca dovadă a modului în care le-am tratat.',
                  ],
                ]}
              />
              <InfoCard
                id="alerte"
                title="Alertele de preț (după lansare)"
                items={[
                  [
                    'Ce date',
                    'Adresa de email, produsul ales, pragul de preț, alertele trimise și dovada acordului tău: data și ora, versiunea textului acceptat și o amprentă criptografică (hash) a adresei IP.',
                  ],
                  ['De ce', 'Ca să îți trimitem alertele cerute și să putem dovedi că ți-ai dat acordul.'],
                  [
                    'Temeiul legal',
                    'Consimțământul tău (art. 6 alin. (1) lit. a) GDPR și art. 12 din Legea nr. 506/2004), dat în formular și confirmat din emailul de confirmare (dublă confirmare). Te poți dezabona oricând, din linkul aflat în fiecare email.',
                  ],
                  [
                    'Cât timp',
                    'Cât timp alerta este activă; conturile inactive se șterg după 24 de luni. Dovada acordului se păstrează cât durează acordul și încă 3 ani după retragerea lui. După dezabonare păstrăm doar o amprentă (hash) a adresei de email, ca să nu îți mai scriem.',
                  ],
                ]}
              />
              <InfoCard
                id="conturi"
                title="Conturile de administrare"
                items={[
                  [
                    'Ce date',
                    'Adresa de email, sesiunile de autentificare (fără adresa IP și fără browser) și acțiunile făcute în panoul de administrare. În prezent, doar fondatorii au astfel de conturi.',
                  ],
                  ['De ce', 'Acces securizat la administrarea site-ului și evidența modificărilor.'],
                  ['Temeiul legal', `Interes legitim (${GDPR_F}).`],
                  ['Cât timp', 'Cât timp contul este activ. Sesiunile expiră după 30 de zile; jurnalul acțiunilor se păstrează cel mult 3 ani.'],
                ]}
              />
              <InfoCard
                id="magazine"
                title="Date preluate de pe site-urile magazinelor"
                items={[
                  [
                    'Ce date',
                    'Doar date comerciale despre oferte: prețuri, disponibilitate, titluri și coduri de produs și, pentru ofertele din marketplace, numele comercial al vânzătorului. Dacă un vânzător este o persoană fizică autorizată care vinde sub propriul nume, acest nume poate fi o dată personală.',
                  ],
                  ['De ce', 'Compararea prețurilor, istoricul prețurilor și informarea cumpărătorilor despre vânzătorul unei oferte.'],
                  [
                    'Temeiul legal',
                    `Interes legitim (${GDPR_F}), pe baza unei evaluări documentate. Nu preluăm alte date personale și nu includem anunțuri ale persoanelor fizice. Te informăm prin această politică, deoarece nu avem datele tale de contact (art. 14 alin. (5) lit. b) GDPR).`,
                  ],
                  ['Cât timp', 'Cât timp păstrăm istoricul ofertei. Dacă ești un astfel de vânzător, te poți opune oricând, scriindu-ne la adresa de mai sus.'],
                ]}
              />
            </>
          ),
        },
        {
          id: 'furnizori',
          title: 'Cine ne ajută',
          content: (
            <>
              <p>
                Furnizorii de mai jos prelucrează date în numele nostru, doar după instrucțiunile noastre. Unii vor fi folosiți abia de la lansarea publică;
                înainte de lansare semnăm cu fiecare un contract de prelucrare a datelor.
              </p>
              <DataTable
                caption="Furnizorii care prelucrează date în numele Pretoscop"
                head={['Furnizor', 'Ce face pentru noi', 'Ce date', 'Unde']}
                tableClassName="min-w-[44rem]"
                rows={[
                  ['Hetzner Online GmbH', 'Găzduiește serverul: site-ul, baza de date și statisticile Plausible', 'Toate datele de mai sus', 'Germania (UE)'],
                  [
                    'Cloudflare',
                    'DNS, livrarea rapidă a paginilor, protecție împotriva atacurilor, stocarea copiilor de siguranță',
                    'Adresa IP și datele cererilor; copiile de siguranță ale bazei de date',
                    'Rețea globală; companie din SUA',
                  ],
                  ['Resend', 'Trimite emailurile: autentificare, alerte, notificări din formularul de contact', 'Adresa destinatarului și conținutul emailului', 'SUA'],
                  ['Sentry', 'Raportează erorile tehnice ale site-ului', 'Detalii tehnice despre erori, fără adresa IP', 'SUA sau UE'],
                  ['Anthropic', 'Ajută la recunoașterea automată a produselor din titlurile ofertelor', 'Doar titluri și caracteristici de produse, fără date personale', 'SUA'],
                  ['Furnizorul căsuțelor de email (în curs de alegere)', 'Primește mesajele trimise la adresele noastre', 'Adresa ta și mesajul', 'Va fi precizat aici'],
                ]}
              />
              <p>
                Plausible Community Edition este un program open-source pe care îl rulăm pe serverul nostru: datele de statistică nu ajung la compania care îl
                dezvoltă. Putem dezvălui date autorităților doar când legea ne obligă.
              </p>
            </>
          ),
        },
        {
          id: 'transferuri',
          title: 'Transferuri în afara Spațiului Economic European',
          content: (
            <p>
              Unii furnizori sunt companii din SUA. Când datele ajung în afara Spațiului Economic European, transferul se bazează pe decizia de adecvare a Comisiei
              Europene privind Cadrul UE-SUA pentru protecția datelor (Data Privacy Framework), pentru furnizorii certificați, sau pe clauzele contractuale standard
              aprobate de Comisia Europeană. Ne poți cere o copie a garanțiilor aplicabile la {privacyMail}.
            </p>
          ),
        },
        {
          id: 'drepturi',
          title: 'Drepturile tale',
          content: (
            <ul>
              <li>
                <strong>Acces:</strong> să afli ce date avem despre tine și să primești o copie (art. 15 GDPR).
              </li>
              <li>
                <strong>Rectificare:</strong> să corectăm datele inexacte sau incomplete (art. 16).
              </li>
              <li>
                <strong>Ștergere:</strong> să ștergem datele când nu mai avem un motiv legal să le păstrăm (art. 17).
              </li>
              <li>
                <strong>Restricționare:</strong> să limităm folosirea datelor, de exemplu cât timp verificăm o contestație (art. 18).
              </li>
              <li>
                <strong>Portabilitate:</strong> să primești datele pe care ni le-ai dat într-un format structurat, folosit în mod curent, sau să le transmitem
                altcuiva (art. 20).
              </li>
              <li>
                <strong>Opoziție:</strong> să te opui prelucrărilor bazate pe interesul nostru legitim; ne oprim, cu excepția cazului în care avem motive
                legitime și imperioase (art. 21).
              </li>
              <li>
                <strong>Retragerea consimțământului:</strong> oricând, la fel de ușor cum l-ai dat; retragerea nu afectează prelucrarea făcută înainte (art. 7
                alin. (3)).
              </li>
              <li>Nu luăm decizii bazate exclusiv pe prelucrare automată care să producă efecte juridice asupra ta (art. 22).</li>
            </ul>
          ),
        },
        {
          id: 'exercitare',
          title: 'Cum îți exerciți drepturile',
          content: (
            <>
              <p>
                Scrie-ne la {privacyMail} sau folosește <Link href="/contact?subiect=privacy">formularul de contact</Link>, cu subiectul „Date personale”.
                Exercitarea drepturilor este gratuită.
              </p>
              <p>
                Răspundem fără întârzieri nejustificate, în cel mult o lună de la primire; pentru cereri complexe termenul se poate prelungi cu încă două luni, iar
                în acest caz te anunțăm. Putem să îți cerem informații suplimentare, ca să confirmăm că cererea vine de la tine.
              </p>
              <p>
                Pentru datele pseudonimizate (identificatorii de sesiune calculați zilnic) de cele mai multe ori nu putem stabili cui aparțin; în acest caz îți
                spunem (art. 11 GDPR).
              </p>
            </>
          ),
        },
        {
          id: 'plangere',
          title: 'Dreptul de a depune o plângere',
          content: (
            <p>
              Dacă ești nemulțumit de felul în care prelucrăm datele tale, te rugăm să ne scrii întâi nouă. Ai oricând dreptul să depui o plângere la{' '}
              {supervisoryAuthority.name}, {supervisoryAuthority.address},{' '}
              <a href={supervisoryAuthority.website}>{supervisoryAuthority.website.replace('https://', '')}</a>.
            </p>
          ),
        },
        {
          id: 'securitate',
          title: 'Cum protejăm datele',
          content: (
            <p>
              Folosim conexiuni criptate (HTTPS). Accesul la administrare este permis doar fondatorilor, prin linkuri de autentificare de unică folosință, fără
              parole stocate, iar fiecare acțiune administrativă este înregistrată. Nu salvăm adrese IP în baza noastră de date: unde avem nevoie de o legătură
              cu o sesiune, păstrăm doar o amprentă calculată cu o cheie care se schimbă zilnic.
            </p>
          ),
        },
        {
          id: 'copii',
          title: 'Copii',
          content: (
            <p>
              Serviciul nu se adresează copiilor sub 16 ani și nu colectăm intenționat datele lor. Dacă afli că un copil ne-a trimis date personale, scrie-ne și le
              ștergem.
            </p>
          ),
        },
        {
          id: 'modificari',
          title: 'Modificări ale acestei politici',
          content: (
            <p>
              Când schimbăm această politică, actualizăm data și versiunea de la începutul paginii. Despre schimbările importante te anunțăm pe site și, dacă ai o
              alertă activă, pe email.
            </p>
          ),
        },
      ]}
    />
  );
}
