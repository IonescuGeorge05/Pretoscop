import { legalDocuments } from '@pretoscop/config/legal-texts';
import { ListOrdered, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { Callout, DataTable } from '@/components/legal/prose';
import { COVERAGE_WINDOW_HOURS, countCoveredShops, coverageSentence, listNotYetIncludedShops, notYetIncludedSentence } from '@/lib/coverage';
import { formatDateTime } from '@/lib/format';

// The coverage statement is live: regenerated at most once an hour (ISR).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Cum funcționează clasamentul',
  description:
    'Ce stabilește ordinea ofertelor pe Pretoscop și cât contează fiecare criteriu: prețul total cu livrarea, disponibilitatea, momentul ultimei verificări. Plus magazinele pe care le acoperim acum.',
  alternates: { canonical: '/cum-functioneaza', languages: { 'ro-RO': '/cum-functioneaza' } },
};

interface Coverage {
  covered: Awaited<ReturnType<typeof countCoveredShops>>;
  notYet: string[];
  at: Date;
}

/** Never lets a slow or unreachable database break the page (e.g. a build without a database). */
async function loadCoverage(): Promise<Coverage | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('coverage query timed out')), 5000);
    });
    const [covered, notYet] = await Promise.race([Promise.all([countCoveredShops(), listNotYetIncludedShops()]), timeout]);
    return { covered, notYet, at: new Date() };
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'web.coverage', error: err instanceof Error ? err.message : String(err) }));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function CoverageStatement({ coverage }: { coverage: Coverage | null }) {
  if (!coverage) {
    return <p data-testid="coverage">Lista magazinelor acoperite nu poate fi afișată acum. Revino în câteva minute.</p>;
  }
  const notYet = notYetIncludedSentence(coverage.notYet);
  return (
    <div data-testid="coverage">
      <Callout tone="neutral" icon={<Store className="text-brand-700" />}>
        <p className="font-semibold text-ink">{coverageSentence(coverage.covered)}</p>
        <p className="text-sm">
          Numărăm magazinele din care avem cel puțin o ofertă verificată în ultimele {COVERAGE_WINDOW_HOURS} de ore. Lista se actualizează automat; ultima
          actualizare: {formatDateTime(coverage.at)}.
        </p>
      </Callout>
      {notYet && (
        <p data-testid="not-yet-included">
          {notYet} Pentru aceste magazine nu avem încă o sursă de date potrivită (de exemplu, un feed de produse de la magazin sau acces pentru robotul
          nostru).
        </p>
      )}
      <p>
        Nu acoperim toate magazinele online din România, așa că pot exista oferte mai ieftine în afara listei noastre. Ai un magazin și vrei să apară aici?
        Vezi <Link href="/pentru-magazine">Pentru magazine</Link>.
      </p>
    </div>
  );
}

export default async function RankingPage() {
  const coverage = await loadCoverage();
  return (
    <LegalPage
      eyebrow="Transparență"
      title="Cum funcționează clasamentul"
      lead="Ce decide ordinea ofertelor pe Pretoscop, cât contează fiecare criteriu și ce nu influențează niciodată clasamentul."
      doc={legalDocuments.ranking}
      sections={[
        {
          id: 'pe-scurt',
          title: 'Pe scurt',
          content: (
            <>
              <Callout icon={<ListOrdered />}>
                <p>
                  Ordinea implicită a ofertelor este dată de <strong>disponibilitate</strong> și de <strong>prețul total</strong> (prețul produsului plus livrarea
                  cunoscută): întâi ofertele în stoc verificate recent, de la cel mai mic preț total la cel mai mare, apoi ofertele în stoc pe care nu le-am mai
                  putut confirma recent, apoi cele fără stoc. Nimeni nu poate plăti pentru a urca în această listă.
                </p>
              </Callout>
              <p className="text-sm text-muted">
                Pretoscop este în faza de prototip: acestea sunt regulile după care vor fi ordonate ofertele pe paginile de produs de la lansarea publică.
              </p>
            </>
          ),
        },
        {
          id: 'parametri',
          title: 'Parametrii clasamentului, în ordinea importanței',
          content: (
            <>
              <DataTable
                caption="Parametrii care stabilesc ordinea implicită a ofertelor, în ordinea importanței"
                head={['Ordine', 'Parametru', 'Cum contează']}
                tableClassName="min-w-[34rem]"
                rows={[
                  [
                    '1',
                    'Disponibilitatea și prospețimea',
                    'Întâi ofertele în stoc verificate recent; apoi ofertele în stoc pe care nu le-am mai putut confirma recent (afișate cu gri); la final ofertele fără stoc, la precomandă sau cu stoc necunoscut.',
                  ],
                  ['2', 'Prețul total = prețul produsului + livrarea cunoscută', 'În fiecare dintre aceste grupuri, ofertele sunt ordonate crescător după prețul total.'],
                  ['3', 'Momentul ultimei verificări', 'La disponibilitate și preț total egale, apare întâi oferta verificată cel mai recent.'],
                ]}
              />
              <p>
                Acești trei parametri sunt singurii care stabilesc ordinea implicită. Pe pagina produsului poți schimba ordonarea sau poți filtra lista (de
                exemplu, doar ofertele în stoc); filtrele tale nu schimbă regulile de mai sus.
              </p>
              <p>
                Ofertele pentru produse resigilate, recondiționate sau folosite sunt ascunse implicit atunci când există oferte pentru produsul nou, ca să compari
                același lucru; le poți afișa cu filtrul „Include resigilate și folosite”. Eticheta „Cel mai mic preț total” merge la oferta nouă, în stoc și
                verificată recent cu cel mai mic preț total, inclusiv când vânzătorul este din marketplace.
              </p>
              <p className="text-sm text-muted">
                Publicăm aceste informații conform art. 7 alin. (4¹) din Legea nr. 363/2007 privind combaterea practicilor incorecte ale comercianților în
                relația cu consumatorii.
              </p>
            </>
          ),
        },
        {
          id: 'pret-total',
          title: 'Prețul total și livrarea',
          content: (
            <>
              <p>
                Prețul total este prețul unei bucăți din produs plus costul livrării standard la o adresă din România. Toate prețurile sunt în lei, cu TVA
                inclus.
              </p>
              <p>Pentru livrare folosim, în această ordine:</p>
              <ol>
                <li>costul livrării afișat de magazin pentru oferta respectivă, pe pagina produsului sau în feed-ul de produse;</li>
                <li>
                  regulile de livrare ale magazinului: livrare gratuită peste un anumit prag, tariful de curierat sau, când produsul poate fi livrat la locker și
                  e mai ieftin așa, tariful pentru locker.
                </li>
              </ol>
              <p>
                Când costul livrării nu este afișat de magazin pentru oferta respectivă, ci îl calculăm noi din regulile lui, îl marcăm „livrare estimată”. Dacă
                nu cunoaștem deloc costul livrării, prețul total este doar prețul produsului și îți spunem asta lângă ofertă. Costul final al livrării este cel
                afișat de magazin în coș.
              </p>
            </>
          ),
        },
        {
          id: 'prospetime',
          title: 'Prospețimea ofertelor',
          content: (
            <>
              <p>Fiecare ofertă arată când am verificat-o ultima dată, de exemplu „verificat acum 3 ore”.</p>
              <p>
                Pentru fiecare magazin stabilim un prag de prospețime, în funcție de cât de des îl verificăm (de regulă între o zi și trei zile). O ofertă mai
                veche decât acest prag rămâne în listă, dar apare cu gri, după ofertele verificate recent, și nu poate primi eticheta „cel mai mic preț total”.
              </p>
              <p>Prețurile se pot schimba între două verificări. Prețul final este cel afișat de magazin la plasarea comenzii.</p>
            </>
          ),
        },
        {
          id: 'marketplace',
          title: 'Vânzătorii din marketplace',
          content: (
            <>
              <p>
                Unele magazine găzduiesc și oferte ale altor vânzători (de exemplu, eMAG Marketplace). Le afișăm cu mențiunea „vândut de … prin … Marketplace”,
                ca să știi de la cine cumperi.
              </p>
              <p>
                Ofertele din marketplace sunt ordonate după aceleași reguli și pot primi eticheta „cel mai mic preț total”, dar în graficul istoricului au o serie
                separată: seria principală urmărește prețurile magazinelor înseși.
              </p>
            </>
          ),
        },
        {
          id: 'ce-nu-conteaza',
          title: 'Ce nu influențează ordinea',
          content: (
            <ul>
              <li>
                <strong>Comisioanele de afiliere.</strong> Un magazin care ne plătește un comision nu urcă în listă, iar unul care nu ne plătește nu coboară.
                Linkurile afiliate sunt marcate „Link afiliat”.
              </li>
              <li>
                <strong>Plățile pentru promovare.</strong> În prezent nu există plasări promovate. Dacă le vom introduce, vor fi marcate vizibil „Promovat”, vor
                fi afișate separat de lista ordonată și nu vor schimba ordinea acesteia.
              </li>
              <li>
                <strong>Relația noastră cu magazinul.</strong> Faptul că un magazin ne trimite un feed, are un program de afiliere sau ne-a scris nu îi schimbă
                poziția.
              </li>
              <li>
                <strong>Garanția și alte caracteristici ale ofertei.</strong> Le afișăm când le cunoaștem, dar nu intră în clasament.
              </li>
            </ul>
          ),
        },
        {
          id: 'acoperire',
          title: 'Magazinele acoperite',
          content: <CoverageStatement coverage={coverage} />,
        },
        {
          id: 'detalii',
          title: 'Mai multe detalii',
          content: (
            <ul>
              <li>
                <Link href="/metodologie">Metodologie</Link>: de unde vin datele, cum construim istoricul și cum verificăm reducerile.
              </li>
              <li>
                <Link href="/cum-castigam-bani">Cum câștigăm bani</Link>: linkuri afiliate, plasări promovate și ce nu facem niciodată.
              </li>
              <li>
                <Link href="/bot">PretoscopBot</Link>: robotul nostru și regulile după care vizitează magazinele.
              </li>
            </ul>
          ),
        },
      ]}
    />
  );
}
