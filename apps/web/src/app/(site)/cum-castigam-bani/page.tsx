import { legalDocuments } from '@pretoscop/config/legal-texts';
import { PiggyBank } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { partnerShops } from '@pretoscop/db';
import { LegalPage } from '@/components/legal/legal-page';
import { Callout } from '@/components/legal/prose';
import { db } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Cum câștigăm bani',
  description:
    'Modelul de afaceri Pretoscop, spus direct: azi nu avem venituri; pe viitor, comisioane de afiliere marcate, plasări promovate etichetate și analize de preț pentru firme. Nu vindem date personale.',
  alternates: { canonical: '/cum-castigam-bani', languages: { 'ro-RO': '/cum-castigam-bani' } },
};

// The partner list below is read from affiliate_programs (M24); refreshed hourly.
export const revalidate = 3600;

const NETWORK: Record<string, string> = { '2performant': '2Performant', profitshare: 'Profitshare', awin: 'Awin', cj: 'CJ', tradedoubler: 'Tradedoubler' };

export default async function MoneyPage() {
  const partners = await partnerShops(db()).catch(() => []);
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
              {partners.length === 0 ? (
                <p>
                  Pretoscop este în faza de prototip și nu are venituri: nu avem linkuri afiliate active, nu vindem plasări promovate și nu afișăm reclame.
                  Proiectul este finanțat din resursele proprii ale celor doi fondatori.
                </p>
              ) : (
                <p>
                  Singura sursă de venit de azi sunt comisioanele de afiliere de la {partners.length === 1 ? 'un magazin partener' : `${partners.length} magazine partenere`}{' '}
                  (<a href="#parteneri">lista</a>). Nu vindem plasări promovate și nu afișăm reclame.
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
          title: 'Plasări promovate (posibil, în viitor)',
          content: (
            <>
              <p>Este posibil ca, în viitor, magazinele să poată plăti pentru o poziție promovată. Regulile sunt stabilite de acum:</p>
              <ul>
                <li>pozițiile plătite sunt marcate vizibil „Promovat”;</li>
                <li>sunt afișate separat de lista ordonată după prețul total și nu îi schimbă ordinea;</li>
                <li>un comision mai mare plătit pentru fiecare vânzare este tot o plată și ar fi marcat la fel;</li>
                <li>verdictele de preț și verificările reducerilor nu se vând.</li>
              </ul>
              <p>În prezent nu există plasări promovate pe Pretoscop.</p>
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
          title: 'Publicitate (poate, mai târziu)',
          content: (
            <p>
              Dacă vom afișa vreodată reclame, ele vor fi marcate „Publicitate”, nu vor apărea în lista de oferte și se vor încărca doar cu acordul tău, acolo
              unde legea îl cere.
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
