import { legalDocuments } from '@pretoscop/config/legal-texts';
import { Cookie } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdsPreferences } from '@/components/ads/ads-preferences';
import { ConsentPreferences } from '@/components/consent/consent-preferences';
import { LegalPage } from '@/components/legal/legal-page';
import { Callout, DataTable } from '@/components/legal/prose';
import { ADS_CONSENT_KEY, CONSENT_KEY } from '@/lib/consent-storage';

export const metadata: Metadata = {
  title: 'Cookie-uri și stocare pe dispozitiv',
  description: 'Ce stochează Pretoscop pe dispozitivul tău (aproape nimic), când pornesc statisticile Plausible și cum îți schimbi oricând preferințele.',
  alternates: { canonical: '/cookies', languages: { 'ro-RO': '/cookies' } },
};

export default function CookiesPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Cookie-uri și stocare pe dispozitiv"
      lead="Ce păstrăm pe dispozitivul tău, de ce și cum îți schimbi alegerea."
      doc={legalDocuments.cookies}
      sections={[
        {
          id: 'pe-scurt',
          title: 'Pe scurt',
          content: (
            <Callout icon={<Cookie />}>
              <p>
                Nu folosim cookie-uri pentru vizitatori, în mod implicit. Statisticile de trafic (Plausible) pornesc doar dacă apeși „Accept” și nici ele nu
                folosesc cookie-uri. Site-ul funcționează la fel, indiferent de alegerea ta.
              </p>
            </Callout>
          ),
        },
        {
          id: 'preferinte',
          title: 'Preferințele tale',
          content: (
            <>
              <p>Îți poți schimba oricând alegerea privind statisticile anonime. Bannerul de jos se redeschide și poți alege din nou.</p>
              <ConsentPreferences />
            </>
          ),
        },
        {
          id: 'ce-stocam',
          title: 'Ce stocăm pe dispozitivul tău',
          content: (
            <>
              <DataTable
                caption="Ce stochează Pretoscop pe dispozitivul tău"
                head={['Nume', 'Tip', 'La ce folosește', 'Cât timp', 'Când']}
                tableClassName="min-w-[46rem]"
                rows={[
                  [
                    <code key="k">{CONSENT_KEY}</code>,
                    'Stocare locală (localStorage)',
                    'Reține alegerea ta privind statisticile (Accept sau Refuz), versiunea textului pe care l-ai văzut și momentul alegerii. Nu este trimisă serverului.',
                    'Până o ștergi tu; dacă schimbăm textul bannerului, te întrebăm din nou',
                    'Strict necesar; doar după ce alegi',
                  ],
                  [
                    <code key="s">better-auth.session_token</code>,
                    'Cookie',
                    <span key="session-what">
                      Te menține autentificat în cont. Pe HTTPS se numește <code>__Secure-better-auth.session_token</code>.
                    </span>,
                    '30 de zile',
                    'Strict necesar; doar dacă te autentifici (pagina Alertele mele, administratori și magazine partenere)',
                  ],
                  [
                    <code key="tg">pretoscop_tg_link</code>,
                    'Cookie',
                    'Duce linkul de conectare la Telegram, de unică folosință, din formular în pagina Alertele mele, ca să nu apară în adresa paginii.',
                    '15 minute',
                    'Strict necesar; doar după ce apeși „Conectează Telegram”',
                  ],
                  [
                    'Notificări în browser',
                    'Service worker (/sw.js) și abonarea browserului la notificări',
                    'Afișează pe acest dispozitiv alertele de preț trimise prin serviciul de notificări al browserului. Nu salvează pagini și nu urmărește navigarea.',
                    'Până oprești notificările în pagina Alertele mele sau în setările browserului',
                    'Doar cu acordul tău: bifa de lângă „Activează notificările” și permisiunea dată browserului',
                  ],
                  [
                    <code key="ads">{ADS_CONSENT_KEY}</code>,
                    'Stocare locală (localStorage)',
                    'Ține minte dacă ai acceptat sau ai refuzat reclama din spațiul „Publicitate”, ca să nu te întrebăm la fiecare pagină.',
                    'Până o ștergi tu; dacă schimbăm textul întrebării, te întrebăm din nou',
                    'Strict necesar; doar după ce alegi (și doar dacă spațiul de reclamă este pornit)',
                  ],
                  [
                    'Google AdSense',
                    'Script și cookie-uri ale Google (terță parte)',
                    'Afișarea și măsurarea reclamei din spațiul „Publicitate” (reclame nepersonalizate). Google decide durata cookie-urilor sale.',
                    'Conform politicii Google',
                    'Opțional; doar după „Accept reclama” în spațiul reclamei, și doar dacă spațiul este pornit',
                  ],
                  [
                    'Plausible',
                    'Script de statistică, fără cookie',
                    'Statistici agregate de trafic: pagini vizitate, sursa vizitei, tipul de dispozitiv, țara. Nu stochează nimic pe dispozitiv.',
                    '—',
                    'Opțional; doar după „Accept”',
                  ],
                ]}
              />
              <p>
                Dacă activăm protecții anti-abuz la Cloudflare, furnizorul nostru de securitate, acesta poate seta un cookie tehnic strict necesar (de exemplu,{' '}
                <code>__cf_bm</code>) care ajută la deosebirea vizitatorilor de roboții abuzivi. Nu îl folosim pentru statistici sau publicitate.
              </p>
            </>
          ),
        },
        {
          id: 'publicitate',
          title: 'Publicitate',
          content: (
            <>
              <p>
                Putem afișa, în afara listei de oferte, un spațiu marcat „Publicitate” cu o reclamă Google AdSense. Spațiul te întreabă întâi; fără „Accept reclama”
                nu se încarcă nimic de la Google și nu se stochează nimic pe dispozitiv în afara alegerii tale. Alegerea pentru reclamă este separată de cea pentru
                statistici. Cât timp spațiul nu este pornit pe site, nu apare nicio întrebare.
              </p>
              <AdsPreferences />
            </>
          ),
        },
        {
          id: 'fara-cookie',
          title: 'Ce măsurăm fără să stocăm nimic pe dispozitiv',
          content: (
            <p>
              Serverul nostru înregistrează evenimente de utilizare (de exemplu, o căutare sau un clic spre un magazin) cu un identificator de sesiune calculat
              zilnic, fără adresa IP și fără să stocheze ceva pe dispozitivul tău. Detalii în{' '}
              <Link href="/confidentialitate#evenimente">Politica de confidențialitate</Link>.
            </p>
          ),
        },
        {
          id: 'temei',
          title: 'Temeiul legal',
          content: (
            <p>
              Conform art. 4 alin. (5) din Legea nr. 506/2004, stocarea de informații pe dispozitivul tău sau accesul la ele se fac doar cu acordul tău, cu
              excepția celor strict necesare pentru serviciul pe care îl ceri (art. 4 alin. (6)). De aceea, elementele opționale, statisticile Plausible și, dacă
              este pornită, reclama Google, pornesc doar după „Accept”, fiecare cu acordul ei, iar butoanele de acceptare și de refuz au aceeași greutate.
            </p>
          ),
        },
        {
          id: 'stergere',
          title: 'Cum ștergi ce am stocat',
          content: (
            <p>
              Folosește butonul „Schimbă preferințele” de mai sus sau șterge datele site-ului din setările browserului (de regulă, în secțiunea „Confidențialitate”
              sau „Date site-uri”).
            </p>
          ),
        },
      ]}
    />
  );
}
