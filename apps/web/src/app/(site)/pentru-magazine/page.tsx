import { legalContacts, legalDocuments } from '@pretoscop/config/legal-texts';
import { ArrowRight, Rss } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { Callout, DataTable } from '@/components/legal/prose';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export const metadata: Metadata = {
  title: 'Pentru magazine',
  description:
    'Listare gratuită pe Pretoscop cu feed-ul de produse pe care îl ai deja (Google Merchant, compari.ro, CSV): ce afișăm, cum ordonăm ofertele și cum controlezi accesul robotului nostru.',
  alternates: { canonical: '/pentru-magazine' },
};

export default function MerchantsPage() {
  return (
    <LegalPage
      eyebrow="Pentru magazine"
      title="Pentru magazine"
      lead="Listare gratuită pe Pretoscop, cu feed-ul de produse pe care îl ai deja. Ofertele tale apar lângă celelalte magazine, ordonate cinstit după prețul total."
      doc={legalDocuments.merchants}
      intro={
        <Callout icon={<Rss />}>
          <p>
            <strong>Pe scurt:</strong> ne trimiți adresa feed-ului (Google Merchant, compari.ro sau CSV), noi îl citim regulat și îți afișăm ofertele, cu link
            direct către pagina produsului de pe site-ul tău. Listarea nu costă nimic. Pretoscop este acum în faza de prototip; ofertele vor fi vizibile public
            de la lansare, plănuită la începutul anului 2027.
          </p>
          <p className="mt-3">
            <Link href="/pentru-magazine/cont" className={cn(buttonVariants({ size: 'md' }), 'font-semibold! text-white! no-underline!')}>
              Înregistrează magazinul
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </p>
        </Callout>
      }
      sections={[
        {
          id: 'listare',
          title: 'Cum funcționează listarea gratuită',
          content: (
            <>
              <ol>
                <li>
                  Îți creezi <Link href="/pentru-magazine/cont">contul magazinului</Link> cu un link primit pe email și completezi datele firmei (inclusiv CUI-ul).
                </li>
                <li>
                  Dovedești că administrezi domeniul site-ului: cu o adresă de email pe domeniu, cu o înregistrare DNS sau cu un fișier de verificare. Așa nimeni nu
                  poate lista produsele altui magazin.
                </li>
                <li>Adaugi adresa feed-ului (sau încarci fișierul); îl verificăm pe loc și îți arătăm primele 20 de oferte exact cum le-am afișa.</li>
                <li>Trimiți cererea; după aprobare citim feed-ul de 6 ori pe zi, gratuit, și potrivim produsele cu catalogul după EAN, codul producătorului și titlu.</li>
              </ol>
              <p>
                În cont vezi ofertele afișate, cât de multe sunt potrivite cu produse, clicurile din ultimele 30 de zile și sugestii pentru feed. Preferi să te ajutăm
                noi? <Link href="/contact?subiect=merchant">Scrie-ne</Link>. Condițiile sunt în <Link href="/pentru-magazine/termeni">Termenii pentru magazine</Link>.
              </p>
            </>
          ),
        },
        {
          id: 'feed',
          title: 'Ce trebuie să conțină feed-ul',
          content: (
            <>
              <p>Acceptăm formatele pe care probabil le folosești deja: Google Merchant Center (XML), compari.ro (XML) sau un fișier CSV.</p>
              <DataTable
                caption="Câmpurile feed-ului de produse"
                head={['Câmp', 'Obligatoriu', 'Observații']}
                tableClassName="min-w-[32rem]"
                rows={[
                  ['Titlul produsului', 'da', 'Cât mai complet: marcă, model, variantă (de exemplu, capacitate, culoare).'],
                  ['Prețul cu TVA, în lei', 'da', 'Prețul de vânzare de acum; prețul tăiat, separat, dacă există.'],
                  ['Disponibilitatea', 'da', 'În stoc, la comandă sau stoc epuizat.'],
                  ['Adresa paginii produsului', 'da', 'Pagina de pe site-ul tău pe care o deschide cumpărătorul.'],
                  ['Codul EAN / GTIN', 'recomandat', 'Cel mai sigur mod de a potrivi produsul corect.'],
                  ['Codul producătorului și marca', 'recomandat', 'Ajută la potrivire când lipsește codul EAN.'],
                  ['Costul livrării', 'opțional', 'Dacă lipsește, îl calculăm din regulile tale de livrare și îl marcăm „livrare estimată”.'],
                  ['Imaginea produsului', 'opțional', 'Folosim imaginile doar din feed, niciodată de pe paginile site-ului.'],
                ]}
              />
            </>
          ),
        },
        {
          id: 'afisare',
          title: 'Ce afișăm despre ofertele tale',
          content: (
            <ul>
              <li>Prețul total: prețul produsului plus livrarea, cu detalierea calculului.</li>
              <li>Disponibilitatea și momentul ultimei verificări („verificat acum N ore”).</li>
              <li>Istoricul prețului observat de noi și verificarea reducerilor, după regulile din <Link href="/metodologie">Metodologie</Link>.</li>
              <li>Un link direct către pagina produsului de pe site-ul tău. Folosim un link afiliat doar dacă participi la un program de afiliere care permite comparatoarele de prețuri.</li>
            </ul>
          ),
        },
        {
          id: 'clasament',
          title: 'Cum ordonăm ofertele',
          content: (
            <p>
              După prețul total, de la cel mai mic la cel mai mare. Nimeni nu poate plăti pentru a urca în clasamentul implicit, iar faptul că ne trimiți un feed nu
              îți schimbă poziția. Toate regulile sunt pe pagina <Link href="/cum-functioneaza">Cum funcționează clasamentul</Link>.
            </p>
          ),
        },
        {
          id: 'robot',
          title: 'Robotul nostru pe site-ul tău',
          content: (
            <>
              <p>
                Dacă nu ai un feed, PretoscopBot poate citi paginile publice ale magazinului, cu respectarea robots.txt și cu cel puțin 5 secunde între cereri.
                Dacă folosești un serviciu anti-bot și vrei să ne permiți accesul, adaugă o regulă pentru User-Agent-ul PretoscopBot. Toate detaliile sunt pe
                pagina <Link href="/bot">PretoscopBot</Link>.
              </p>
              <p>
                Nu vrei să apari pe Pretoscop? Poți bloca PretoscopBot din robots.txt sau ne poți scrie la{' '}
                <a href={`mailto:${legalContacts.bot}`}>{legalContacts.bot}</a> ori prin{' '}
                <Link href="/contact?subiect=shop_objection">formularul de contact</Link>. Oprim colectarea în cel mult o zi lucrătoare.
              </p>
            </>
          ),
        },
        {
          id: 'contact',
          title: 'Hai să vorbim',
          content: (
            <p>
              Scrie-ne prin <Link href="/contact?subiect=merchant">formularul de contact</Link>, cu subiectul „Colaborare magazin”. Îți răspundem cu pașii
              următori și cu tot ce ai nevoie pentru listare.
            </p>
          ),
        },
      ]}
    />
  );
}
