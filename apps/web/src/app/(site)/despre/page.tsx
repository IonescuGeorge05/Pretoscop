import { legalDocuments } from '@pretoscop/config/legal-texts';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Despre Pretoscop',
  description:
    'Cine construiește Pretoscop, comparatorul de prețuri pentru magazinele online din România, ce vrea să rezolve și principiile după care funcționează.',
  alternates: { canonical: '/despre' },
};

const PRINCIPLES = [
  ['Prețul total, nu doar prețul afișat.', 'Ordonăm ofertele după preț plus livrare și arătăm mereu cum am calculat totalul.'],
  [
    'Istoricul vine doar din observațiile noastre.',
    'Nu inventăm date, nu completăm golurile prin interpolare, iar fiecare punct din grafic are data la care l-am văzut.',
  ],
  [
    'Un robot cinstit și un site cinstit.',
    'Robotul nostru se prezintă cu numele lui, respectă robots.txt, merge într-un ritm politicos și se oprește la cerere în cel mult o zi lucrătoare; adresele lui IP vor fi publicate la lansare. Spunem deschis cum ordonăm ofertele și cum câștigăm bani, iar când prețurile unui magazin sunt colectate printr-un serviciu terț, spunem asta în metodologie.',
  ],
  [
    'Reducerile sunt verificate sau nu le afișăm.',
    'Arătăm „−X%” doar față de cel mai mic preț observat de noi în ultimele 30 de zile, iar prețul tăiat al magazinului îl numim „preț de referință afișat de magazin”.',
  ],
  [
    'Prospețimea contează.',
    'Fiecare ofertă arată când am verificat-o ultima dată; ofertele care nu au mai fost verificate de prea mult timp sunt marcate și nu pot primi eticheta „cel mai mic preț”.',
  ],
  ['În limba română, corect.', 'Diacritice corecte, prețuri în lei cu TVA inclus, scrise așa cum le citim: 1.234,56 lei.'],
] as const;

export default function AboutPage() {
  return (
    <LegalPage
      eyebrow="Despre noi"
      title="Despre Pretoscop"
      lead="Un comparator de prețuri pentru magazinele online din România: prețul total al fiecărei oferte, din toate magazinele pe care le acoperim, și istoricul prețurilor observate de noi."
      doc={legalDocuments.about}
      sections={[
        {
          id: 'cine-suntem',
          title: 'Cine suntem',
          content: (
            <>
              <p>
                Suntem doi fondatori care construim Pretoscop din resurse proprii. Proiectul este acum în faza de prototip: înregistrăm prețuri, construim
                catalogul de produse și pregătim site-ul pentru lansarea publică, pe care o plănuim la începutul anului 2027.
              </p>
              <p>
                Societatea comercială care va opera serviciul este în curs de înființare. Până atunci, Pretoscop nu are venituri (vezi{' '}
                <Link href="/cum-castigam-bani">Cum câștigăm bani</Link>).
              </p>
            </>
          ),
        },
        {
          id: 'misiune',
          title: 'Ce vrem să rezolvăm',
          content: (
            <>
              <p>
                Când vrei să cumperi un telefon, un laptop sau o mașină de spălat, ajungi să deschizi cinci-șase file cu magazine diferite și tot nu știi sigur
                unde costă mai puțin cu livrare cu tot sau dacă reducerea de azi este reală. Pretoscop vrea să răspundă într-o singură pagină:
              </p>
              <ul>
                <li>unde costă cel mai puțin produsul, cu livrarea inclusă;</li>
                <li>cum a evoluat prețul, după observațiile noastre;</li>
                <li>dacă o reducere anunțată se sprijină pe prețurile din ultimele 30 de zile.</li>
              </ul>
              <p>Începem cu electronice, IT și electrocasnice, unde diferențele de preț dintre magazine sunt cele mai vizibile.</p>
            </>
          ),
        },
        {
          id: 'principii',
          title: 'Principiile noastre',
          content: (
            <ol>
              {PRINCIPLES.map(([title, body]) => (
                <li key={title}>
                  <strong>{title}</strong> {body}
                </li>
              ))}
            </ol>
          ),
        },
        {
          id: 'ce-nu-facem',
          title: 'Ce nu facem',
          content: (
            <ul>
              <li>Nu vindem produse și nu suntem parte la contractul dintre tine și magazin.</li>
              <li>Nu vindem și nu închiriem date personale.</li>
              <li>Nu ascundem un magazin mai ieftin pentru că nu ne plătește.</li>
              <li>Nu copiem imagini sau descrieri de pe site-urile magazinelor.</li>
              <li>Nu publicăm recenzii sau comentarii ale utilizatorilor.</li>
            </ul>
          ),
        },
        {
          id: 'nume',
          title: 'De unde vine numele',
          content: (
            <p>
              „Pretoscop” vine de la „preț” și „-scop” (din grecescul <em>skopein</em>, „a privi cu atenție”), ca în microscop sau telescop: un instrument cu
              care te uiți atent la prețuri.
            </p>
          ),
        },
        {
          id: 'scrie-ne',
          title: 'Scrie-ne',
          content: (
            <p>
              Ai o întrebare, o idee sau ai găsit o greșeală? Scrie-ne prin <Link href="/contact">pagina de contact</Link>. Dacă reprezinți un magazin, vezi{' '}
              <Link href="/pentru-magazine">Pentru magazine</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
