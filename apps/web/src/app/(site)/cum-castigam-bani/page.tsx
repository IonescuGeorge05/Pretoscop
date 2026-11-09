import { legalDocuments } from '@pretoscop/config/legal-texts';
import { PiggyBank } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { partnerShops } from '@pretoscop/db';
import { LegalPage } from '@/components/legal/legal-page';
import { Callout } from '@/components/legal/prose';
import { db } from '@/lib/db';
import { monetizationState } from '@/lib/promoted';

export const metadata: Metadata = {
  title: 'Cum câștigăm bani',
  description:
    'Modelul de afaceri Pretoscop, spus direct: comisioane de afiliere marcate, oferte promovate etichetate „Promovat” și plătite pe clic, analize de preț pentru firme și, poate, reclame marcate. Nu vindem date personale.',
  alternates: { canonical: '/cum-castigam-bani', languages: { 'ro-RO': '/cum-castigam-bani' } },
};

// The partner list below is read from affiliate_programs (M24); refreshed hourly.
export const revalidate = 3600;

const NETWORK: Record<string, string> = { '2performant': '2Performant', profitshare: 'Profitshare', awin: 'Awin', cj: 'CJ', tradedoubler: 'Tradedoubler' };

export default async function MoneyPage() {
  const [partners, money] = await Promise.all([partnerShops(db()).catch(() => []), monetizationState()]);
  const sources = [
    partners.length > 0 ? `comisioanele de afiliere de la ${partners.length === 1 ? 'un magazin partener' : `${partners.length} magazine partenere`}` : null,
    money.promoted ? 'ofertele promovate, plătite pe clic de magazinele listate' : null,
    money.ads ? 'o reclamă marcată „Publicitate”, afișată doar cu acordul tău' : null,
  ].filter((x): x is string => x !== null);
  return (
    <LegalPage
      eyebrow="Transparență"
      title="Cum câștigăm bani"
      lead="Pe scurt: în prezent, deloc. Mai jos, cum plănuim să ne finanțăm și regulile pe care le respectăm oricare ar fi sursa banilor."
      doc={legalDocuments.money}
      sections={[
        {
          id: 'azi',
          title: 'Situația de azi',
          content: (
            <Callout icon={<PiggyBank />}>
              {sources.length === 0 ? (
                <p>
                  Pretoscop este în faza de prototip și nu are venituri: nu avem linkuri afiliate active, nu vindem oferte promovate și nu afișăm reclame.
                  Proiectul este finanțat din resursele proprii ale celor doi fondatori.
                </p>
              ) : (
                <p>
                  Sursele de venit de azi: {sources.join('; ')}
                  {partners.length > 0 && (
                    <>
                      {' '}
                      (<a href="#parteneri">lista partenerilor</a>)
                    </>
                  )}
                  .{!money.promoted && ' Nu vindem oferte promovate.'}
                  {!money.ads && ' Nu afișăm reclame.'}
                </p>
              )}
            </Callout>
          ),
        },
        {
          id: 'afiliere',
          title: 'Comisioane de afiliere',
          content: (
            <>
              <p>
                Unele magazine au programe de afiliere: dacă ajungi pe site-ul lor de la noi și cumperi, magazinul ne poate plăti un comision. Prețul pentru tine
                nu se schimbă.
              </p>
              <ul>
                <li>
                  Folosim linkuri afiliate doar acolo unde programul magazinului permite participarea comparatoarelor de prețuri. Către celelalte magazine folosim
                  linkuri obișnuite, iar ofertele lor sunt tratate exact la fel.
                </li>
                <li>
                  Fiecare link afiliat este marcat „Link afiliat”, cu explicația „putem primi un comision dacă cumperi, fără cost suplimentar pentru tine”, și are
                  atributul <code>rel=&quot;sponsored nofollow&quot;</code>, care le arată motoarelor de căutare că este un link comercial.
                </li>
                <li>
                  Comisioanele nu influențează niciodată ordinea ofertelor (vezi <Link href="/cum-functioneaza">Cum funcționează clasamentul</Link>).
                </li>
              </ul>
              <p id="parteneri">
                <strong>Magazine partenere acum:</strong>{' '}
                {partners.length === 0
                  ? 'niciunul — nu folosim încă linkuri afiliate.'
                  : partners.map((p) => `${p.name} (${NETWORK[p.network] ?? p.network})`).join(', ') + '.'}{' '}
                Lista se actualizează automat din programele de afiliere aprobate care permit comparatoarele.
              </p>
            </>
          ),
        },
        {
          id: 'promovare',
          title: 'Oferte promovate',
          content: (
            <>
              <p>
                Magazinele listate pot plăti pentru spațiul marcat „Promovat”: cel mult unul pe pagina unui produs, deasupra listei de oferte, și unul pe paginile de
                categorie. Plătesc pe clic, dintr-un sold alimentat în avans, cât rezultă dintr-o licitație între ele (câștigătorul plătește oferta următoare plus
                0,01 lei). Regulile:
              </p>
              <ul>
                <li>spațiul plătit este marcat vizibil „Promovat” și spune că magazinul plătește pentru el;</li>
                <li>
                  este afișat separat de lista ordonată după prețul total și nu îi schimbă ordinea; dacă oferta promovată costă mai mult decât cea mai ieftină,
                  spațiul spune cu cât (<Link href="/cum-functioneaza#promovat">detalii</Link>);
                </li>
                <li>
                  un clic pe oferta promovată duce direct la magazin, fără link de afiliere: magazinul plătește vizita o singură dată, iar noi nu încasăm și un comision
                  pentru același clic;
                </li>
                <li>un comision mai mare plătit pentru fiecare vânzare este tot o plată și ar fi marcat la fel;</li>
                <li>verdictele de preț și verificările reducerilor nu se vând.</li>
              </ul>
              <p>{money.promoted ? 'Ofertele promovate sunt pornite pe Pretoscop.' : 'În prezent nu afișăm oferte promovate pe Pretoscop.'}</p>
            </>
          ),
        },
        {
          id: 'firme',
          title: 'Analize de preț pentru firme (în viitor)',
          content: (
            <p>
              Plănuim să oferim magazinelor și producătorilor rapoarte despre prețurile din piață, construite din baza noastră de date: doar prețuri și
              disponibilitate, agregate, fără date personale și fără specificații sau imagini din catalogul Open Icecat.
            </p>
          ),
        },
        {
          id: 'publicitate',
          title: money.ads ? 'Publicitate' : 'Publicitate (poate, mai târziu)',
          content: (
            <p>
              {money.ads
                ? 'Pe unele pagini putem afișa o reclamă Google AdSense, marcată „Publicitate”, în afara listei de oferte. Ea se încarcă doar după ce accepți, în spațiul reclamei; fără acord nu se încarcă nimic de la Google. '
                : 'Dacă vom afișa reclame, ele vor fi marcate „Publicitate”, nu vor apărea în lista de oferte și se vor încărca doar cu acordul tău. '}
              Reclamele nu influențează ordinea ofertelor (<Link href="/cookies#publicitate">detalii despre acord</Link>).
            </p>
          ),
        },
        {
          id: 'niciodata',
          title: 'Ce nu facem niciodată',
          content: (
            <ul>
              <li>Nu vindem și nu închiriem date personale.</li>
              <li>Nu ascundem și nu coborâm o ofertă mai ieftină pentru că magazinul nu ne plătește.</li>
              <li>Nu cerem bani magazinelor pentru a fi listate: listarea prin feed este gratuită.</li>
              <li>Nu acceptăm bani pentru a șterge sau a schimba o verificare a unei reduceri; corectăm doar erorile dovedite.</li>
            </ul>
          ),
        },
        {
          id: 'intrebari',
          title: 'Întrebări',
          content: (
            <p>
              Dacă ceva nu e clar sau vezi ceva care contrazice regulile de mai sus, <Link href="/contact">scrie-ne</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
