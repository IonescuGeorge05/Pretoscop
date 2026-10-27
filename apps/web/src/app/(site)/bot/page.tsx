import { legalContacts, legalDocuments } from '@pretoscop/config/legal-texts';
import { Bot } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal/legal-page';
import { Callout, CodeBlock, DataTable } from '@/components/legal/prose';
import { BOT_CHANGELOG, BOT_POLICY, BOT_TOKEN, botUserAgents } from '@/lib/bot-policy';
import { serverEnv } from '@/lib/db';
import { formatLongDate } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'PretoscopBot, robotul Pretoscop',
  description:
    'Cum funcționează PretoscopBot, robotul care citește prețurile pentru Pretoscop: User-Agent, adrese IP, ritmul cererilor, robots.txt, ce colectează și cum îl blochezi sau ne ceri să ne oprim.',
  alternates: { canonical: '/bot' },
};

const ROBOTS_STOP = `# Oprește complet PretoscopBot
User-agent: ${BOT_TOKEN}
Disallow: /`;

const ROBOTS_SLOW = `# Încetinește PretoscopBot (cel mult o cerere la 30 de secunde)
# și ține-l departe de anumite secțiuni
User-agent: ${BOT_TOKEN}
Crawl-delay: 30
Disallow: /cont/
Disallow: /cos/`;

export default function BotPage() {
  const env = serverEnv();
  const ua = botUserAgents(env.BOT_INFO_URL);
  const ips = env.BOT_EGRESS_IPS;
  const botEmail = legalContacts.bot;
  return (
    <LegalPage
      eyebrow="Pentru magazine și administratori de site-uri"
      title="PretoscopBot"
      lead="Robotul (crawlerul) cu care Pretoscop citește prețurile publice ale magazinelor online. Aici afli cum îl recunoști, cât de des te vizitează și cum îl oprești."
      doc={legalDocuments.bot}
      sections={[
        {
          id: 'ce-este',
          title: 'Ce este PretoscopBot',
          content: (
            <>
              <p>
                PretoscopBot este robotul Pretoscop, un comparator de prețuri pentru magazinele online din România, aflat în faza de prototip. Citește pagini
                publice de categorie și de produs, sitemap-uri și feed-uri de produse, ca să putem afișa prețul total al fiecărei oferte și istoricul prețurilor
                observate de noi. Fiecare ofertă afișată trimite cumpărătorul direct pe site-ul magazinului.
              </p>
              <Callout tone="neutral" icon={<Bot className="text-brand-700" />}>
                <p>
                  Această pagină descrie doar PretoscopBot. Toate sursele noastre de date, inclusiv feed-urile primite de la magazine, sunt descrise în{' '}
                  <Link href="/metodologie#surse">Metodologie</Link>.
                </p>
              </Callout>
            </>
          ),
        },
        {
          id: 'identificare',
          title: 'Cum îl recunoști',
          content: (
            <>
              <p>Fiecare cerere se prezintă cu unul dintre aceste User-Agent-uri:</p>
              <CodeBlock label="Pagini, sitemap-uri și robots.txt">{ua.page}</CodeBlock>
              <CodeBlock label="Feed-uri de produse">{ua.feed}</CodeBlock>
              <p>
                PretoscopBot nu trimite cookie-uri, nu se autentifică, nu trimite antetul Referer și nu imită un browser. Nu folosește alt nume și nu își
                schimbă identitatea.
              </p>
              <h3 id="ip">Adrese IP</h3>
              {ips.length > 0 ? (
                <>
                  <p>Cererile PretoscopBot pornesc doar de pe aceste adrese:</p>
                  <ul>
                    {ips.map((ip) => (
                      <li key={ip}>
                        <code>{ip}</code>
                      </li>
                    ))}
                  </ul>
                  <p>
                    Aceeași listă, în format citibil automat: <a href="/bot/ips.json">/bot/ips.json</a>. O cerere cu numele PretoscopBot venită de pe altă adresă
                    nu este a noastră și o poți bloca.
                  </p>
                </>
              ) : (
                <p data-testid="bot-ips-pending">
                  Lista adreselor IP fixe va fi publicată aici și în <a href="/bot/ips.json">/bot/ips.json</a> la lansare; în faza de prototip cererile pornesc
                  temporar de pe infrastructura fondatorilor.
                </p>
              )}
              <p>
                La lansare, fiecare adresă va avea și un nume reverse DNS de forma <code>crawl-N.bot.pretoscop.ro</code>, confirmat și în sens direct, ca să ne
                poți verifica fără să te bazezi pe User-Agent. Ulterior vom semna criptografic cererile (Web Bot Auth), ca identitatea robotului să poată fi
                verificată automat.
              </p>
            </>
          ),
        },
        {
          id: 'ritm',
          title: 'Cât de des ne vezi',
          content: (
            <ul>
              <li>
                Cel puțin {BOT_POLICY.minIntervalSeconds} secunde între două cereri către același site, mai mult dacă robots.txt cere un <code>Crawl-delay</code>{' '}
                mai mare.
              </li>
              <li>O singură cerere odată către un site; nu deschidem conexiuni în paralel.</li>
              <li>Un buget zilnic de pagini pentru fiecare magazin, pe care îl putem reduce la cerere.</li>
              <li>Colectarea în volum mare o facem de preferință noaptea, în intervalul {BOT_POLICY.offPeakWindow} (ora României).</li>
              <li>Preferăm paginile de categorie, unde o singură cerere arată multe produse, în locul vizitării fiecărei pagini de produs.</li>
              <li>
                După o eroare temporară a serverului reîncercăm de cel mult {BOT_POLICY.maxRetries} ori, la intervale tot mai mari; după trei eșecuri la rând
                facem o pauză.
              </li>
            </ul>
          ),
        },
        {
          id: 'robots',
          title: 'robots.txt',
          content: (
            <ul>
              <li>
                Respectăm fișierul robots.txt conform standardului RFC 9309. Căutăm un grup scris pentru <code>{BOT_TOKEN}</code>; dacă nu există, aplicăm
                regulile pentru toți roboții (<code>User-agent: *</code>).
              </li>
              <li>
                Robotul de feed-uri caută întâi un grup pentru <code>PretoscopBot-Feed</code>, apoi pentru <code>{BOT_TOKEN}</code>: dacă blochezi PretoscopBot,
                blochezi și feed-urile.
              </li>
              <li>
                Respectăm <code>Crawl-delay</code>, deși nu face parte din standard (până la o oră între cereri).
              </li>
              <li>Recitim robots.txt cel puțin o dată la {BOT_POLICY.robotsCacheHours} de ore.</li>
              <li>Dacă robots.txt nu poate fi citit (eroare de server, timeout sau blocare), nu accesăm nimic de pe acel site.</li>
            </ul>
          ),
        },
        {
          id: 'refuzuri',
          title: 'Când ne oprim singuri',
          content: (
            <>
              <ul>
                <li>
                  La un răspuns 403, la o pagină de verificare (challenge) sau CAPTCHA ori la o conexiune întreruptă, oprim cererile către acel site timp de{' '}
                  {BOT_POLICY.blockPauseHours} de ore.
                </li>
                <li>
                  La un răspuns 429 („prea multe cereri”) așteptăm cât cere antetul <code>Retry-After</code>, dar cel puțin o oră.
                </li>
              </ul>
              <p>
                PretoscopBot nu încearcă niciodată să ocolească o restricție: nu rezolvă CAPTCHA, nu trece de paginile de verificare, nu își schimbă adresa IP și
                nu se dă drept browser. Nu accesează pagini de cont, coș sau comandă și nu folosește API-uri interne ale magazinelor.
              </p>
            </>
          ),
        },
        {
          id: 'date',
          title: 'Ce colectăm',
          content: (
            <>
              <p>Doar informații despre oferte, așa cum sunt afișate public:</p>
              <ul>
                <li>prețul și, dacă există, prețul tăiat afișat de magazin;</li>
                <li>disponibilitatea și costul livrării, când apare pe pagină;</li>
                <li>titlul produsului, marca, codurile de identificare (EAN/GTIN, codul producătorului) și categoria;</li>
                <li>adresa paginii;</li>
                <li>pentru ofertele din marketplace, numele comercial al vânzătorului.</li>
              </ul>
              <p>
                Nu preluăm imagini, descrieri de produs, texte ale recenziilor, date de contact sau alte informații despre persoane. Imaginile pe care le afișăm
                provin doar din surse care permit acest lucru, cum sunt feed-urile magazinelor.
              </p>
            </>
          ),
        },
        {
          id: 'blocare',
          title: 'Cum ne blochezi sau ne încetinești',
          content: (
            <>
              <p>Cel mai simplu este fișierul robots.txt al site-ului tău. Câteva exemple:</p>
              <CodeBlock label="Oprire completă">{ROBOTS_STOP}</CodeBlock>
              <CodeBlock label="Ritm mai lent și secțiuni excluse">{ROBOTS_SLOW}</CodeBlock>
              <p>
                Schimbările din robots.txt se aplică în cel mult {BOT_POLICY.robotsCacheHours} de ore. Pentru efect imediat, scrie-ne (vezi mai jos). Dacă
                folosești un serviciu anti-bot (de exemplu, Cloudflare, Akamai sau DataDome) și vrei să ne permiți accesul, adaugă o regulă pentru User-Agent-ul
                nostru și, după lansare, pentru adresele IP publicate.
              </p>
            </>
          ),
        },
        {
          id: 'oprire',
          title: 'Cum ne ceri să ne oprim',
          content: (
            <>
              <p>
                Scrie-ne la <a href={`mailto:${botEmail}`}>{botEmail}</a> sau folosește{' '}
                <Link href="/contact?subiect=shop_objection">formularul de contact</Link>, cu subiectul „Magazin: cerere de oprire a colectării”. Îți răspundem și
                oprim colectarea în cel mult o zi lucrătoare.
              </p>
              <p>
                Cererea de oprire se aplică întregii colectări de prețuri de pe site-ul tău, nu doar lui PretoscopBot. Dacă vrei doar un ritm mai lent sau ca
                anumite secțiuni să fie excluse, spune-ne și ajustăm.
              </p>
            </>
          ),
        },
        {
          id: 'feed',
          title: 'Alternativa: feed gratuit',
          content: (
            <p>
              Preferi să ne trimiți direct prețurile? Folosește feed-ul de produse pe care îl ai deja (Google Merchant, compari.ro sau CSV). Listarea este
              gratuită, datele sunt exact cele pe care le alegi tu și putem renunța la vizitarea paginilor tale. Detalii pe pagina{' '}
              <Link href="/pentru-magazine">Pentru magazine</Link>.
            </p>
          ),
        },
        {
          id: 'modificari',
          title: 'Istoricul modificărilor',
          content: (
            <DataTable
              caption="Istoricul modificărilor PretoscopBot"
              head={['Data', 'Ce s-a schimbat']}
              tableClassName="min-w-[28rem]"
              rows={BOT_CHANGELOG.map((entry) => [<time key={entry.date} dateTime={entry.date}>{formatLongDate(entry.date)}</time>, entry.change])}
            />
          ),
        },
      ]}
    />
  );
}
