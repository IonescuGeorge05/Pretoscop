import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";

import { IS_STATIC } from "@/lib/static";

export const metadata: Metadata = {
  title: "PretoscopBot",
  description: "Ce colectează robotul Pretoscop, cum se identifică, cât de des citește și cum îl puteți opri sau încetini.",
};

/** Adresa vine din .env (SCRAPER_CONTACT -> BOT_CONTACT); exemplul implicit nu se afișează. */
function botContact(): string | null {
  if (!IS_STATIC) noStore(); // în containerul web adresa există doar la rulare, nu la build
  const c = process.env.BOT_CONTACT;
  return c && !c.endsWith("@example.com") ? c : null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-muted [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export default function BotPage() {
  const contact = botContact();
  return (
    <article className="max-w-3xl">
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-[46px]">PretoscopBot</h1>
      <p className="mt-3 text-lg text-muted">
        Robotul care citește prețurile pentru Pretoscop, un comparator de prețuri din România. Pe această pagină scriem
        ce colectăm, cum ne recunoașteți și cum ne puteți opri. <span lang="en">English summary below.</span>
      </p>

      <Section title="Cum ne recunoașteți">
        <p>
          User-Agent: <code className="rounded bg-soft px-1.5 py-0.5 text-ink">Mozilla/5.0 (compatible; PretoscopBot/0.2; +…/bot)</code>.
          În <code className="rounded bg-soft px-1.5 py-0.5 text-ink">robots.txt</code> ne găsiți ca{" "}
          <strong>PretoscopBot</strong>.
        </p>
        <p>
          Rulăm deocamdată de pe conexiuni de acasă, cu IP variabil. Când vom avea servere cu IP fix, le publicăm aici,
          ca să ne puteți permite sau bloca după adresă.
        </p>
      </Section>

      <Section title="Ce colectăm">
        <p>
          Doar <strong>prețul, stocul, titlul produsului și costul de livrare</strong> de pe pagini publice de produs și
          de categorie. Nu copiem imagini sau descrieri, nu intrăm în cont, coș sau finalizarea comenzii și nu folosim
          interfețe interne nedocumentate. Nu colectăm date personale.
        </p>
      </Section>

      <Section title="Cât de des și cât de politicos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Respectăm <strong>robots.txt</strong> (RFC 9309), inclusiv regulile scrise pentru PretoscopBot.</li>
          <li>
            O singură cerere odată pe același site, cu <strong>3–5 secunde</strong> între cereri.
          </li>
          <li>Câteva zeci de pagini pe magazin, de obicei la 6 ore.</li>
          <li>
            La <strong>429</strong> respectăm <code>Retry-After</code>. La <strong>401, 403, 511</strong> sau o pagină de
            verificare (CAPTCHA) ne <strong>oprim</strong> și reîncercăm cel mult o dată pe zi. Nu încercăm să trecem de
            astfel de protecții.
          </li>
        </ul>
      </Section>

      <Section title="Cum ne opriți sau ne încetiniți">
        <p>
          Cel mai simplu: în <code>robots.txt</code>, <code>User-agent: PretoscopBot</code> urmat de{" "}
          <code>Disallow: /</code> (sau doar căile pe care nu le doriți citite).
        </p>
        <p>
          Sau scrieți-ne
          {contact ? (
            <>
              {" "}
              la{" "}
              <a href={`mailto:${contact}`} className="font-medium text-ink underline">
                {contact}
              </a>
            </>
          ) : null}
          : <strong>oprim citirea magazinului dumneavoastră în cel mult o zi lucrătoare</strong> de la cererea scrisă.
          Dacă preferați să ne trimiteți un feed de produse (formatul compari.ro sau Google Shopping), îl folosim în locul
          citirii paginilor.
        </p>
      </Section>

      <Section title="English summary">
        <p lang="en">
          PretoscopBot collects only price, stock, product title and delivery cost from public product and category pages
          of Romanian shops, for a price-comparison service. It obeys robots.txt (token <strong>PretoscopBot</strong>),
          sends one request at a time per site with 3–5 s between requests, honours Retry-After, and stops on 401/403/511
          or any challenge page, never attempting to bypass it. To opt out, disallow PretoscopBot in robots.txt or write to
          us{contact ? ` at ${contact}` : ""}; we stop within one business day. A product feed is welcome instead.
        </p>
      </Section>
    </article>
  );
}
