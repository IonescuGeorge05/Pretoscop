# Retailer outreach templates (setup C3)

Romanian emails the founders send to shops that block or limit PretoscopBot (first wave: PC Garage,
Vexio, evoMAG, cel.ro, Altex, Flanco, Media Galaxy, Notino, Douglas — `docs/09` C3). They supersede the
drafts in `docs/08-monetization-playbook.md` §7 (same intent; the exact User-Agent and the self-serve
portal from M20 are now in them). Log every message in `/admin/contactari` with the template key below;
set "Revenim la" to ten working days later.

Rules: write from a `@pretoscop.ro` address; one shop per email; address a role mailbox (marketing,
e-commerce, parteneriate) or the contact form, never a guessed personal address; never claim that we
are already collecting their prices if the shop blocks us; never imply an endorsement. For a shop read
through the assisted channel (M05B), never write as if we had no prices from it either: say that PretoscopBot
is blocked and that a feed or an allowlist would replace the third-party collection service used today
(docs/12 §0, point 7), and answer plainly if asked how prices are collected. Send
`allowlist-v1` and `antibot-rule-v1` only once `bot:check` is all `OK` (published IPs with reverse DNS,
key directory): they point the shop at those proofs. `feed-listing-v1` can go out today.

Placeholders: `{Magazin}`, `{Nume}`, `{Funcție}`, `{telefon}`.

## `feed-listing-v1` — free listing through a feed

> **Subiect:** Listare gratuită pe Pretoscop pentru {Magazin}
>
> Bună ziua,
>
> sunt {Nume}, {Funcție} la Pretoscop (pretoscop.ro), un comparator de prețuri pentru magazinele online din
> România, cu istoric de preț. Listăm gratuit ofertele magazinelor, ordonate după prețul total (preț plus
> livrare), cu link direct către pagina produsului de pe site-ul dumneavoastră.
>
> Dacă aveți deja un feed de produse (pentru compari.ro, Google Merchant sau CSV), îl puteți înregistra
> singuri în câteva minute la https://pretoscop.ro/pentru-magazine/cont: verificăm feed-ul, vă arătăm
> exact cum vor apărea ofertele, iar după aprobare îl citim de câteva ori pe zi. Prețurile rămân cele din
> feed-ul dumneavoastră; nu folosim imaginile decât dacă feed-ul ni le pune la dispoziție.
>
> Cum colectăm datele și cum ne puteți opri oricând: https://pretoscop.ro/bot.
>
> Mulțumesc,
> {Nume}, {telefon}

## `allowlist-v1` — access for PretoscopBot

> **Subiect:** Acces pentru robotul PretoscopBot pe {Magazin}
>
> Bună ziua,
>
> Pretoscop (pretoscop.ro) este un comparator de prețuri care trimite cumpărători direct către paginile
> de produs ale magazinelor. Robotul nostru se identifică întotdeauna cu User-Agent-ul
> `Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)`, respectă robots.txt (inclusiv
> Crawl-delay), face cel mult o cerere la 5 secunde către un site și se oprește singur la orice blocare sau
> verificare. Citește doar pagini publice de produs și de categorie; nu folosește conturi, coșuri, căutarea
> internă sau API-uri interne.
>
> În prezent cererile noastre către {Magazin} sunt blocate. Vă rugăm să permiteți accesul robotului (pe
> pagina https://pretoscop.ro/bot găsiți adresele IP, numele reverse DNS și semnătura Web Bot Auth după
> care îl puteți recunoaște) sau, dacă preferați, să ne indicați un feed de produse — atunci nu vă mai
> vizităm deloc paginile.
>
> Răspundem la orice cerere de oprire sau de încetinire în cel mult o zi lucrătoare, la bot@pretoscop.ro.
>
> Mulțumesc,
> {Nume}, {telefon}

## `antibot-rule-v1` — instructions for the shop's anti-bot service

Send after the shop agrees, to whoever administers Cloudflare, Akamai, DataDome or Fastly.

> **Subiect:** Regula de acces pentru PretoscopBot ({Magazin})
>
> Bună ziua,
>
> mulțumim pentru acord. Ca să fie recunoscut doar robotul nostru (și nu cineva care îi copiază numele),
> regula ar trebui să combine User-Agent-ul cu una dintre dovezile de identitate:
>
> - **User-Agent** care conține `PretoscopBot/` **și** adresa IP din lista https://pretoscop.ro/bot/ips.json
>   (numele reverse DNS: `crawl-N.bot.pretoscop.ro`); sau
> - semnătura **Web Bot Auth** (RFC 9421), cu cheia publicată la
>   https://pretoscop.ro/.well-known/http-message-signatures-directory.
>
> Pe scurt, pentru fiecare serviciu:
>
> - **Cloudflare**: regulă WAF personalizată cu acțiunea „Skip” pentru expresia
>   `(http.user_agent contains "PretoscopBot/" and ip.src in {<adresele din ips.json>})`; dacă PretoscopBot
>   apare ca bot verificat, este suficient să permiteți categoria „Data Collection” sau botul în sine.
> - **Akamai Bot Manager**: o categorie de boți proprie (custom bot category) cu adresele noastre și
>   User-Agent-ul, setată pe „Allow” sau „Monitor”.
> - **DataDome**: permiteți categoria în care DataDome ne clasifică (comparatoare de prețuri) sau adăugați o
>   excepție pentru adresele noastre și User-Agent.
> - **Fastly**: o regulă care permite cererile cu User-Agent-ul nostru de pe adresele publicate.
>
> Dacă vă este mai simplu, putem conveni și un antet suplimentar trimis doar către site-ul dumneavoastră.
>
> Mulțumesc,
> {Nume}

## `follow-up-v1` — after ten working days without an answer

> **Subiect:** Re: {subiectul inițial}
>
> Bună ziua,
>
> revin la mesajul de mai jos. Dacă nu sunteți persoana potrivită, vă rog să-mi spuneți cui ar trebui să
> mă adresez. Dacă preferați să nu apăreți pe Pretoscop, ne puteți spune la fel de simplu și respectăm
> decizia.
>
> Mulțumesc,
> {Nume}

Send at most one follow-up; then set the status to "Fără răspuns".

## `stop-confirmation-v1` — confirming an opt-out

> **Subiect:** Confirmare: am oprit colectarea de pe {Magazin}
>
> Bună ziua,
>
> vă confirmăm că din {data, ora} nu mai colectăm prețuri de pe site-ul {Magazin}: am oprit atât robotul
> PretoscopBot, cât și, acolo unde era cazul, serviciul de colectare pe care îl folosim. {Ce se întâmplă cu ofertele deja afișate.} Dacă vă răzgândiți sau preferați să ne trimiteți
> un feed, scrieți-ne oricând la bot@pretoscop.ro.
>
> Cu stimă,
> {Nume}

In the system: stop every channel before sending: the shop's sources off (admin → Surse, kill switch) and its
access mode `off` (also ends the assisted channel; the bot page promises that a stop request covers all
collection), and set the
outreach status to "Refuz" with the date. What happens to offers already shown (hidden at once, or left
to age out as stale) is a founder decision to make once and then state the same way every time; it is
not decided in code yet.
