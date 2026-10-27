# Gap closure, round 2: Romanian retailers' terms, robots.txt, platforms, sitemaps, affiliate rules, prior art and Common Crawl status (as of 2026-10-27)

Scope: the gaps listed under `scraping_feasibility_recon.md` §1–§3 and §7, `gaps_bot_legitimacy_and_precedents.md` §3–§7, and the retailer-terms gaps of `gaps_company_tax_trademark.md` §5.

Method and rules followed:
- **Archives first.** Most evidence comes from Wayback Machine raw captures (`web.archive.org/web/<timestamp>id_/<url>`) and the CDX API. Snapshot dates are given as YYYY-MM-DD (UTC). The Internet Archive was intermittently "Temporarily Offline" (HTTP 503) or timed out; failed queries are listed under Gaps.
- **Retailer requests.** 14 direct requests to 12 retailer domains, at most 2 per domain, all with the honest UA `Mozilla/5.0 (compatible; PretoscopResearch/0.1; +mailto:rotariu.daniel.paul@gmail.com)`. No challenge was solved, retried or bypassed. The full log is in §9.
- **Other requests.** 124 to archive.org, 36 to index.commoncrawl.org, 14 to the Arctic Shift Reddit archive, 8 to profitshare.ro, 3 Chrome Web Store package downloads (clients2.google.com), and 2 to distinct.ro. 9 web searches.
- **No logins.** Several pages saved earlier in this session were re-read from the scratchpad and were not fetched again: 378 2Performant program pages (fetched 2026-10-27 ~15:36Z), Chrome Web Store pages (~15:31–15:33Z), and the earlier probe's eMAG product page (15:03Z).
- **Labels.** "O" marks a direct observation from a file. "I" marks an inference. Translations from Romanian are mine.

---

## 1. Terms of use on automated access and republishing prices (Altex, PC Garage, Fashion Days, OLX, Publi24, Media Galaxy, cel.ro, evoMAG, Vexio, iStyle, EuroGSM, Flanco)

### Takeaway
- **Explicit robot or extraction bans** appear only in the eMAG-group template. Fashion Days (operated by Dante International, i.e. eMAG) bans "orice robot, algoritm sau alte mijloace automatizate … pentru a extrage date din Site" (clause 4.2(j)). Its definition of "Conținut" includes the prices charged.
- **Republication bans covering prices**, without a robot clause:
  - iStyle defines "Conținut" to include prices and bans including any of it outside its site.
  - cel.ro, evoMAG, Vexio and EuroGSM ban copying, reproducing or republishing site information without written consent. Vexio adds that breaching its terms "reprezintă o infracțiune" (*is an offence*).
- **Weakest positions:**
  - PC Garage's terms bind only buyers ("Cumpărător").
  - Altex and Media Galaxy have only a general IP-ownership clause.
- **Not readable:** OLX (the archived help-centre page is a JavaScript shell) and Flanco's 2026 text (its new URL `/termene-si-conditii` was never archived).

### Cited Findings

**Fashion Days — Status: CLOSED.** Source: Wayback snapshot of 2026-03-01 — [web.archive.org/web/20260301224154/https://www.fashiondays.ro/page/terms/](https://web.archive.org/web/20260301224154/https://www.fashiondays.ro/page/terms/). The terms URL comes from the homepage footer — [Wayback 2026-04-18](https://web.archive.org/web/20260418073500/https://www.fashiondays.ro/). The earlier URL guess `/terms-and-conditions` was wrong.
- **Operator:** "Fashion Days este denumirea comerciala al DANTE INTERNATIONAL S.A. … cod unic de inregistrare fiscala RO14399840" (*Fashion Days is the trade name of Dante International S.A.*).
- **"Continut"** includes:
  - "toate informatiile de pe Site care pot fi vizitate, vizualizate sau altfel accesate prin utilizarea unui echipament electronic" (*all information on the Site that can be visited, viewed or otherwise accessed with an electronic device*);
  - "informatii legate de Bunurile si/sau tarifele practicate de Vanzator intr-o anumita perioada" (*information on the goods and/or prices charged by the Seller in a given period*);
  - the same for "un tert cu care Vanzatorul are incheiate contracte de parteneriat" (*a third party with which the Seller has partnership contracts*).
- **4.1:** "Accesul in vederea utilizarii Site-ului … ii este permis oricarui Utilizator/Cumparator, cat timp utilizeaza Site-ul in conformitate cu prezentul Document" (*access is allowed to any User/Buyer who uses the Site in accordance with this Document*).
- **4.2:** "Utilizarea abuziva a Site-ului sau pentru alte scopuri decat cele autorizate expres de Fashion Days este interzisa … Cu precadere, urmatoarele actiuni sunt interzise:" (*abusive use, or use for purposes not expressly authorised, is prohibited; in particular:*)
  - "g. utilizarea oricarui tip de instrument software extern care poate perturba operarea normala a Site-ului" (*using any external software tool that may disrupt the Site's normal operation*);
  - "i. cesionarea, copierea, decompilarea sau incercarea de a descoperi codul sursa al Site-ului sau al continutului acestuia" (*assigning, copying, decompiling or trying to discover the source code of the Site or its content*);
  - **"j. utilizarea oricarui robot, algoritm sau a altor mijloace automatizate pentru a citi codul sursa sau pentru a extrage date din Site"** (*using any robot, algorithm or other automated means to read the source code or to extract data from the Site*);
  - "k. … accesand orice servere sau servicii din Site care nu sunt publice, fara autorizare" (*accessing non-public servers or services without authorisation*).
- **4.5:** "Pentru detectarea incalcarilor, Fashion Days poate folosi software sau tehnologie automata" (*Fashion Days may use automated technology to detect breaches*).
- **6.2:** "nu ii este permisa copierea, distribuirea, publicarea, transferul catre terte parti … includerea oricarui Continut in afara Site-ului … decat cu acordul scris expres al Fashion Days" (*copying, distributing, publishing, transferring to third parties or including any Content outside the Site is not allowed without Fashion Days' express written consent*).
- **6.4:** Content may be used "numai in scopuri personale sau non-comerciale" (*only for personal or non-commercial purposes*).
- **6.7:** "Este interzisa orice utilizare a Continutului in alte scopuri decat cele permise expres" (*any other use of the Content is prohibited*).
- **15.6:** "Prin crearea Contului si/sau utilizarea Continutului si/sau plasarea Comenzilor, Clientul / Utilizatorul / Cumparatorul accepta in mod expres si fara echivoc Termenele si Conditiile" (*by creating an account, using the Content or ordering, the user expressly accepts the T&C*).

**PC Garage — Status: CLOSED.** Source: Wayback snapshot of 2025-11-30, the latest real capture — [web.archive.org/web/20251130124021/https://www.pcgarage.ro/info/comenzi/termeni-si-conditii/](https://web.archive.org/web/20251130124021/https://www.pcgarage.ro/info/comenzi/termeni-si-conditii/).
- **URL:** the terms live under `/info/comenzi/`, not at `/termeni-si-conditii/`, the URL tried earlier.
- **Scope:** Art. 1: "Termenii si conditiile generale de vanzare se vor aplica tuturor vanzarilor de bunuri si servicii de catre PC Garage S.R.L. … catre Cumparator" (*the general terms of sale apply to all sales by PC Garage S.R.L. to the Buyer*). "Cumparator" is defined as "persoana, firma, companie sau alta entitate juridica care emite o Comanda" (*the person or entity that places an Order*).
- **DPI (IP rights)** defined to include "drepturile de baza de date" (*database rights*).
- **Art. 6 "Dreptul de proprietate intelectuala si industriala":** "Cumparatorul intelege dreptul de proprietate intelectuala si nu va dezvalui unei terte parti sau va face publice (pe internet sau media), nici una dintre informarile primite de la Vanzator. De asemenea, numele site-urilor precum si insemnele grafice, sunt marci inregistrate in proprietatea PC Garage S.R.L. si nu pot fi preluate, copiate sau folosite, fara acordul scris al proprietarului." (*The Buyer will not disclose to third parties or make public, on the internet or in media, any information received from the Seller. The site names and graphic marks are PC Garage's registered trademarks and may not be taken, copied or used without written consent.*)
- **No robots, automated-access or visitor clause** among the 21 articles (O).
- **Operator:** PC Garage S.R.L., J2008001207408, CUI RO17612390.

**Altex — Status: CLOSED** (the latest archived text is 2026-05-19; no later capture exists). Source: [web.archive.org/web/20260519043727/https://altex.ro/termeni-conditii/pag/](https://web.archive.org/web/20260519043727/https://altex.ro/termeni-conditii/pag/).
- **Coverage:** the CDX prefix query `altex.ro/termeni*` for 2026 returns only this capture and a 301 on 2026-02-26 — [CDX](https://web.archive.org/cdx/search/cdx?url=altex.ro/termeni&matchType=prefix&from=2026). The live category page footer still links `/termeni-conditii/pag/` — [Wayback 2026-10-10](https://web.archive.org/web/20261010110437/https://altex.ro/telefoane/cpl/).
- **Definitions** (re-read in full):
  - "UTILIZARE ABUZIVĂ: reprezintă utilizarea SITE-ului, conform art. 5 din prezentul document, într-un mod contrar practicii în domeniu, a reglementărilor și a legislației în vigoare, sau în orice alt mod care poate produce prejudicii ALTEX" (*abusive use: use contrary to industry practice or law, or in any other way that may harm ALTEX*);
  - "VIZITATOR: persoana fizică sau juridică ce vizualizează Produsele fără a deține Cont ori fără a fi logat în Cont" (*a visitor views products without an account or without logging in*).
- **2.1.2:** "Informațiile sunt puse la dispoziția Utilizatorilor de regulă, în mod gratuit" (*information is generally provided free of charge*).
- **2.1.3:** "ALTEX și, dacă este cazul, Partenerul este deținătorul tuturor drepturilor de proprietate intelectuală asupra Site-ului, respectiv asupra design-ului și conținutului acestuia … Utilizatorul are obligația de a respecta toate drepturile de proprietate intelectuală" (*ALTEX and its Partner own all IP in the Site, its design and content; the User must respect all IP rights*).
- **No robot, extraction or republication clause** (O; searched for robot, automat, scrap, crawl, spider, extrag, copi, reproduc).

**Media Galaxy — Status: CLOSED** (the latest archived text is 2025-10-17; the 2026 captures are 301/308 redirects only). Source: [web.archive.org/web/20251017052343/https://mediagalaxy.ro/termeni-conditii/pag/](https://web.archive.org/web/20251017052343/https://mediagalaxy.ro/termeni-conditii/pag/).
- **Same template as Altex**, operated by ALTEX: identical clause 2.1.3 ("ALTEX și, dacă este cazul, Partenerul este deținătorul tuturor drepturilor de proprietate intelectuală asupra Site-ului…").
- **No robot or republication clause** (O).

**cel.ro — Status: CLOSED.** Source: Wayback snapshot of 2026-04-03 — [web.archive.org/web/20260403051602/https://www.cel.ro/index.php?main_page=privacy](https://web.archive.org/web/20260403051602/https://www.cel.ro/index.php?main_page=privacy).
- **URL:** the footer link "Termeni si conditii" points to `index.php?main_page=privacy`. A separate "Termeni si conditii MarketPlace" page sits at `main_page=terms_mp` — [Wayback homepage 2026-08-21](https://web.archive.org/web/20260821164227/https://www.cel.ro/).
- **Robots conflict:** robots.txt disallows `/index.php?main_page=privacy` (§2), so the terms page is itself off-limits to crawlers.
- **1:** "Site-ul web CEL.ro este administrat de SC BRAND DESIGN TEAM SRL … J2017015195409, CUI 38170983".
- **2 "Acceptarea conditiilor":** "Utilizarea site-ului CEL.ro, logarea cat si accesul la serviciile oferite reprezinta o acceptare din partea ta a termenilor si conditiilor" (*using the site, logging in and accessing its services constitute acceptance of the terms*).
- **3 "Drepturile de autor":** "Informatiile publicate pe CEL.ro apartin site-ului, prin urmare, aceste informatii nu pot fi publicate, transmise, copiate prin orice metoda fara acordul scris acordat in prealabil al reprezentantului legal al societatii SC BRAND DESIGN TEAM SRL care administreaza site-ul. Nerespectarea acestor conditii se pedepseste conform legii in vigoare." (*Information published on CEL.ro belongs to the site and may not be published, transmitted or copied by any method without the prior written consent of the operator's legal representative. Breaches are punishable by law.*) Infringements go to web@cel.ro.
- **Marketplace terms** (`terms_mp`) cover only the ordering process; no relevant clause — [Wayback 2026-02-01](https://web.archive.org/web/20260201064842/https://www.cel.ro/index.php?main_page=terms_mp).

**evoMAG — Status: CLOSED.** Source: Wayback snapshot of 2026-06-14 — [web.archive.org/web/20260614185816/https://www.evomag.ro/pagini/termeni-de-utilizare/](https://web.archive.org/web/20260614185816/https://www.evomag.ro/pagini/termeni-de-utilizare/). The URL comes from the footer of the [2026-10-13 homepage capture](https://web.archive.org/web/20261013001857/https://www.evomag.ro/).
- **Section 6 "Drepturi de autor":** "Drepturile de autor asupra întregului conţinut aparţin în totalitate Evolution Prest Systems SRL și nu se pot folosi sau copia fără acordul scris al proprietarului." (*Copyright in all content belongs to Evolution Prest Systems SRL; it may not be used or copied without written consent.*)
- **Rights of visitors**, listed next:
  - "explorarea conţinutului www.evoMAG.ro" (*exploring the content*);
  - "reproducerea, traducerea sau utilizarea informaţiilor publicate, numai cu acordul sursei" (*reproducing, translating or using published information only with the source's consent*);
  - "inserarea în paginile proprii a unor legături către acest site web (atunci când legăturile sunt cuprinse în website-uri comerciale sau publicitare se va asigura deschiderea unei noi ferestre…)" (*linking is allowed; commercial sites must open the link in a new window*).
- **No robots clause** (O).

**Vexio — Status: CLOSED.** Source: Wayback snapshot of 2026-01-31; the page says "Ultima actualizare: 08.10.2025" — [web.archive.org/web/20260131120928/https://www.vexio.ro/info/despre-noi/termeni-si-conditii/](https://web.archive.org/web/20260131120928/https://www.vexio.ro/info/despre-noi/termeni-si-conditii/). The URL comes from the [2026-05-30 homepage footer](https://web.archive.org/web/20260530114549/https://www.vexio.ro/).
- **Operator:** "S.C. FANPLACE IT S.R.L. … J23/4437/2022 … RO 31962960".
- **I "Accesul la site":** "Accesul site-ului www.vexio.ro de catre dumneavoastra se supune Termenilor si conditiilor si implica acceptul dumneavoastra cu privire la acestia … Incalcarea acestor Termeni si conditii reprezinta o infractiune." (*Accessing the site is subject to these terms and implies acceptance; breaching them is an offence.*) Also: "Informatiile oferite pe acest site sunt gratuite. Toti utilizatorii Internetului au acces la acestea." (*The information is free and accessible to all internet users.*)
- **II "Copyright":** "Continutul (imagini, texte, elemente de grafica web, scripturi si alte date prezente pe acest site) nu poate fi reprodus, modificat, transferat, publicat, afisat, transmis sau inregistrat fara acordul prealabil, in scris, al FANPLACE IT SRL." (*Content, including "other data present on this site", may not be reproduced, transferred, published, displayed or recorded without prior written consent.*)
- **Data section:** "ORICE INCERCARE DE A ACCESA DATELE PERSONALE ALE ALTUI UTILIZATOR SAU DE A MODIFICA CONTINUTUL SITE-ULUI … SAU DE A AFECTA PERFORMANTELE SERVERULUI … VA FI CONSIDERATA O TENTATIVA DE FRAUDARE A SITE-ULUI" (*any attempt to access other users' personal data, alter the site's content or affect the server's performance will be treated as attempted fraud*).

**iStyle — Status: CLOSED.** Source: Wayback snapshot of 2026-09-03 — [web.archive.org/web/20260903104432/https://istyle.ro/policies/terms-of-service](https://web.archive.org/web/20260903104432/https://istyle.ro/policies/terms-of-service). Earlier 2026 captures: 2026-02-01 and 2026-02-21.
- **Operator:** iSTYLE Retail S.R.L., J40/9507/1999, CUI RO12331709.
- **"Conținut"** includes "informații legate de produsele, serviciile și/sau tarifele practicate de iSTYLE Retail într-o anumită perioadă" (*information on the products, services and/or prices iSTYLE charges in a given period*).
- **"Utilizator"** is "orice persoană fizică ce acceseaza Site-ul … indiferent dacă plasează sau nu o Comandă" (*any natural person who accesses the Site, whether or not they order*), so visitors are covered.
- **3.2:** "Utilizatorului, Utilizatorului înregistrat sau Clientului nu îi este permisă copierea, distribuirea, publicarea, transferul către terțe părți … includerea oricărui Continut în afara Siteului iSTYLE Retail…" (*copying, distributing, publishing, transferring or including any Content outside iSTYLE's site is not permitted*).
- **3.4:** Content may be used "numai în scopuri personale sau non-comerciale … și numai cu acordul scris prealabil al iSTYLE Retail" (*only for personal or non-commercial purposes, and only with iSTYLE's prior written consent*).
- **3.9:** "Orice altă utilizare, inclusiv reproducerea, modificarea, distribuirea, republicarea … nu sunt permise fără obținerea consimțământului prealabil scris" (*any other use, including republication, needs prior written consent*).
- **13.3:** iSTYLE "nu îi conferă dreptul de a descărca … de a reproduce … sau de a exploata orice Conținut" (*does not grant the right to download, reproduce or exploit any Content*).
- **robots.txt:** the Shopify header comment says "Automated scraping, 'buy-for-me' agents, or any end-to-end flow that completes payment without a final human review step is not permitted" (§2).

**EuroGSM — Status: CLOSED.** Source: live page, fetched directly on 2026-10-27 at 17:47:38Z — [eurogsm.ro/termeni-si-conditii](https://eurogsm.ro/termeni-si-conditii). The latest Wayback capture is from 2025-04-30.
- **"Drepturi de autor (Copyright)":** "Intregul continut al site-ului www.eurogsm.ro, incluzand, enumerativ, texte, imagini, grafice, butoane, programe, elemente de grafica web, scripturi si orice alte date, este proprietatea EURO GSM IMPEX S.R.L. … Utlizarea fara acordul scris … se pedepseste conform legislatiei in vigoare." (*All site content, including "any other data", is EURO GSM IMPEX's property; use without written consent is punishable by law.*)
- **Limited access:** "EURO GSM IMPEX S.R.L. garanteaza utilizatorului acces limitat, in interes personal, pe acest site si nu ii confera dreptul de a descarca sau de a modifica partial sau integral site-ul, de a reproduce partial sau integral site-ul, de a copia, de a vinde/revinde sau de a exploata site-ul in orice alta maniera, in scopuri comerciale … fara acordul scris al acesteia." (*Users get limited, personal-interest access. There is no right to download, reproduce, copy, resell or commercially exploit the site without written consent.*)
- **No robots clause** (O).

**Publi24 — Status: CLOSED** (no change from round 1; the saved 2026-10-27 copy was re-read). Source: [ajutor.publi24.ro/termeni-si-conditii/](https://ajutor.publi24.ro/termeni-si-conditii/).
- **"Utilizarea materialelor":** "Publi24.ro vă autorizează să vizualizați și să faceți download la o copie a materialelor de pe site doar în scopuri personale și pentru uz necomercial … Nu aveți permisiunea de a vinde sau a modifica materialul, a-l expune public, a-l distribui sau a-l folosi în orice alt mod, în scopuri publice sau comerciale." (*View and download one copy for personal, non-commercial use only; no selling, modifying, public display, distribution or commercial use.*)
- **Prohibited-actions list** covers publishing behaviour only; no robots clause (O).
- **Tension with robots.txt:** Publi24's robots.txt explicitly allows GPTBot, CCBot, ClaudeBot and others (round 1).

**OLX.ro — Status: NOT PUBLIC** (not readable in any archive or by an automated client).
- **Current URL:** the T&C is a Salesforce help-centre article, `https://ajutor.olx.ro/olxhelpro/s/article/condi%C8%9Bii-de-utilizare-V31`, linked from the OLX homepage — [Wayback 2026-04-28](https://web.archive.org/web/20260428075854/https://www.olx.ro/).
- **Archive copies are empty:** captures exist for 2025-08-19, 2025-08-29, 2025-10-07, 2025-11-11, 2025-12-16, 2025-12-21 and 2026-02-03. The 2025-11-11 and 2026-02-03 copies yield 75 characters of text: a JavaScript shell, with the article body loaded client-side — [Wayback 2026-02-03](https://web.archive.org/web/20260203045842/https://ajutor.olx.ro/olxhelpro/s/article/condi%C8%9Bii-de-utilizare-V31). The 2026-03-10 capture is a 403.
- **Older URLs** (`www.olx.ro/termeni-si-conditii*`, `help.olx.ro/hc/ro/articles*`) have no captures.
- **Web search** found only press coverage of OLX's 2024–2025 rule changes, not the text — [economica.net](https://www.economica.net/olx-are-reguli-noi-de-utilizare-produse-interzise-la-vanzare-olx-renunta-la-anunturi-gratuite-pentru-anumite-produse_846408.html).
- **Founder action:** open the article in a normal browser and save it as a dated PDF. Search it for "automat", "robot", "colect", "extrag", "copia", "reproduc", "comercial" and "baze de date". Store the PDF in `docs/research/evidence/`.

**Flanco (2026 text) — Status: NOT PUBLIC.**
- **URL change:** the 2026-10-17 homepage footer links `/termene-si-conditii` — [Wayback](https://web.archive.org/web/20261017134432/https://www.flanco.ro/). The 2026-02-19 category-page footer still linked `/termeni-si-conditii` — [Wayback](https://web.archive.org/web/20260219122059/https://www.flanco.ro/telefoane-tablete/smartphone.html).
- **No 2026 archive copy:** the CDX has no capture of `/termene-si-conditii`, and `/termeni-si-conditii` has only the 2025-04-06 capture used in round 1 — [CDX](https://web.archive.org/cdx/search/cdx?url=www.flanco.ro/termeni-si-conditii&from=2025).
- **Live page** returned a Cloudflare challenge in round 1. CCBot is disallowed by Flanco's robots.txt, so Common Crawl has no copy.
- **Founder action:** open `https://www.flanco.ro/termene-si-conditii` in a browser and save a dated PDF. Check for a robots or automated-access clause, the definition of "Conținut" (prices), and the Section 7 republication ban seen in the April 2025 text.

### Inferences
- **Three contractual tiers (I):**
  1. **Express robot/extraction ban plus a prices-in-Content definition:** eMAG and Fashion Days (same Dante template). iStyle has the prices-in-Content and republication ban but no robot clause.
  2. **Republication or copy bans without a robot clause:** cel.ro, evoMAG, Vexio, EuroGSM and Publi24. Flanco (2025 text) also belongs here.
  3. **Only a general IP clause:** Altex and Media Galaxy. PC Garage's terms bind only buyers.
- **Price display needs permission in tiers 1–2 (I).** Showing these shops' prices needs written permission, a licensed feed, or a solid legal view that browsewrap terms do not bind a non-registered crawler (see legal_and_regulatory.md).
  - cel.ro and Vexio claim acceptance by mere use of the site ("Utilizarea site-ului … reprezinta o acceptare"; "Accesul site-ului … implica acceptul").
  - eMAG and Fashion Days claim acceptance by "utilizarea Continutului".
- **Recurring wording (I):** Vexio's and EuroGSM's "alte date prezente pe acest site" / "orice alte date" wording, and CEL's "Informatiile publicate pe CEL.ro", are broad enough to cover price data. Vexio's and CEL's "se pedepseste conform legii" is a recurring Romanian boilerplate threat, not a specific legal basis.

### Gaps
- OLX and Flanco 2026: see the founder actions above.
- No later Altex capture than 2026-05-19 and no Media Galaxy capture after 2025-10-17 exist. Both may have changed since; re-check in a browser before launch.

---

## 2. robots.txt of the blocked majors (Altex, Media Galaxy, PC Garage, iStyle, cel.ro), plus evoMAG, Fashion Days and OLX

### Takeaway
- **Product and category pages are allowed for `*` at every shop checked.** None sets a `Crawl-delay` for `*`.
- **What they disallow:** cart, account and search paths, compare pages, multi-filter URLs, and (PC Garage) price alerts.
- **Named bot blocks:**
  - Altex and Media Galaxy fully disallow AhrefsBot, meta-externalagent, meta-WebIndexer, Yandex, Baiduspider and Synthesio.
  - PC Garage fully disallows 58 named bots, including CCBot, ChangeDetection and Amazonbot.
  - cel.ro fully disallows 99 user-agent tokens, including generic substrings such as `bot-`, `bot/`, `crawl`, `robot` and `spider`.
- **Sitemaps:** Altex and Media Galaxy each declare 14 department product sitemaps. PC Garage declares one index (1,419 children in 2024). evoMAG declares `sitemap_index.xml`. cel.ro and iStyle declare none.
- **Live requests:** PC Garage's robots.txt still returns a Cloudflare challenge (403 at 17:47:38Z), and cel.ro still times out.

### Cited Findings
**Altex — Status: CLOSED.** Wayback snapshot of 2026-10-05; origin `Last-Modified: Wed, 30 Sep 2026 02:50:03 GMT`; headers show `server: openresty` and an Akamai Bot Manager cookie `ak_bmsc` — [web.archive.org/web/20261005075704/https://altex.ro/robots.txt](https://web.archive.org/web/20261005075704/https://altex.ro/robots.txt). 13,137 bytes.
```
User-agent: *
Disallow: /cauta/
Disallow: /*/filtru/*/*_*
Disallow: /cont/
Disallow: /cos-cumparaturi/
Disallow: /newsletter/
Disallow: /precomanda/
Disallow: /plateste-comanda/
Disallow: /compara/
User-agent: AhrefsBot | meta-externalagent | meta-WebIndexer | Yandex | Baiduspider | Synthesio   -> Disallow: /
Sitemap: https://altex.ro/sitemaps/products/altex_<department>_sitemap.xml   (14 lines)
Sitemap: https://altex.ro/sitemaps/images/altex_<category>.xml               (156 lines)
Sitemap: https://altex.ro/sitemaps/categories/categories_altex.xml
Sitemap: https://altex.ro/sitemaps/brands/brands_altex-1.xml
Sitemap: https://altex.ro/sitemaps/search/altex_import.xml , .../altex_ugs.xml
```
(The middle group is condensed onto one line; the original has one group per bot.)
- **What is allowed:** product pages (`/…/cpd/<SKU>/`), listings (`/…/cpl/`) and pagination (`/…/cpl/filtru/p/2/`). The pagination path has no underscore, so it does not match `/*/filtru/*/*_*` (I, pattern reading).
- **No `Crawl-delay`.** The 14 product sitemaps are departments, such as `altex_telefoane_tablete_sitemap.xml` and `altex_electrocasnice_mari_sitemap.xml`.

**Media Galaxy — Status: CLOSED.** Wayback snapshot of 2026-05-11; `Last-Modified: Sun, 10 May 2026 02:50:02 GMT` — [web.archive.org/web/20260511020331/https://mediagalaxy.ro/robots.txt](https://web.archive.org/web/20260511020331/https://mediagalaxy.ro/robots.txt).
- **Rules:** identical to Altex: the same 8 disallows and the same 6 fully blocked bots.
- **Sitemaps:** 14 product sitemaps (`mediagalaxy_<department>_sitemap.xml`), 143 image sitemaps, plus category and brand sitemaps. No search sitemaps. No `Crawl-delay`.

**PC Garage — Status: PARTIAL.** The latest archived copy is 2025-02-21; the live file is still blocked.
- **Archived copy:** [web.archive.org/web/20250221200342/https://www.pcgarage.ro/robots.txt](https://web.archive.org/web/20250221200342/https://www.pcgarage.ro/robots.txt), 140 lines, behind Cloudflare.
- **`*` group** disallows, among others: `/cont/`, `/cos/`, `/adaugaincos*`, `/ajax/`, `/files/`, `/docs/`, `/data/` (with `Allow: /data/sitemaps/`), `/alerta-stoc*`, **`/alerta-pret*`**, **`/compara/`**, `/remote/`, `/click/`, `/sort/`, `/*/*,`, `/*pret-*-pana-la-*`, `/*?utm_`, `/*?smode=`, `/*?rating=` and `/*?filter_term=`.
- **One group with 58 user-agents** gets `Disallow: /`. It includes AhrefsBot, SemrushBot, MJ12bot, **CCBot**, **ChangeDetection**, Heritrix, PetalBot, meta-externalagent, **Amazonbot**, Baiduspider and dotbot.
- **`Sitemap: https://www.pcgarage.ro/sitemap.xml`.** No `Crawl-delay`.
- **Live request** on 2026-10-27 at 17:47:38Z: `403`, `cf-mitigated: challenge` (§9).

**iStyle (Shopify) — Status: CLOSED.** Wayback snapshot of 2026-10-16 — [web.archive.org/web/20261016231049/https://istyle.ro/robots.txt](https://web.archive.org/web/20261016231049/https://istyle.ro/robots.txt).
- **Header comment** (Shopify's): "# Checkouts are for humans. * Automated scraping, 'buy-for-me' agents, or any end-to-end flow that completes payment without a final human review step is not permitted. * Legitimate integrators must use the official Checkout Kit … Contact: bots@shopify.com".
- **`*` group** disallows `/cart`, `/checkout*`, `/account`, `/collections/*sort_by*`, filter combinations, `/search`, **`/policies/`** (so the terms page itself is disallowed), `/recommendations/products` and `/sf_private_access_tokens`. Product (`/products/…`) and collection pages are allowed.
- **Crawl-delay** only for AhrefsBot (10), AhrefsSiteAudit (10), MJ12bot (10) and Pinterest (1). Nutch: `Disallow: /`.
- **No `Sitemap:` line** in this capture (O).

**cel.ro — Status: CLOSED** for content (archived 2026-03-28) and **PARTIAL** for reachability (live still times out).
- **Archived copy:** [web.archive.org/web/20260328124113/https://www.cel.ro/robots.txt](https://web.archive.org/web/20260328124113/https://www.cel.ro/robots.txt); origin `Last-Modified: Tue, 13 May 2025`; `server: citadel`; `vary: User-Agent`.
- **Group 1:** 99 user-agent lines with `Disallow: /`. They include tokens such as `bot-`, `bot/`, `crawl`, `robot`, `spider`, `Wget`, `WebFetch`, `HTTrack`, `ia_archiver`, `AhrefsBot`, `MJ12bot`, `Yandex` and `Dotbot`.
- **`*` group** disallows `index.php?main_page=` login, shopping_cart, product_info, create_account, ask_a_question, product_reviews_write and **privacy** (the T&C page). It also disallows `/cumpara/`, `/compara/`, `/refurbished/`, `/resigilate/`, `/ultimele-bucati/`, `/produsele-zilei/`, `/nou/` (but `Allow: /nou/blackfriday/`), `/t/` and `/ajax/`.
- **No `Sitemap:` line and no `Crawl-delay`.**
- **Live request** on 2026-10-27 at 17:47:38Z: TCP connect timeout after 45 s (§9), the same symptom as round 1.

**evoMAG (bonus) — Status: CLOSED.** Wayback snapshot of 2026-10-07 — [web.archive.org/web/20261007222133/https://www.evomag.ro/robots.txt](https://web.archive.org/web/20261007222133/https://www.evomag.ro/robots.txt).
- **Sitemaps:** `https://www.evomag.ro/sitemap_index.xml` and `/blog/sitemap_index.xml`.
- **`*` group:** `Allow: /`. It disallows `/wishlist/`, `/backend`, `/cart/sendOrder`, `/doofinder/`, `/comment/`, `/productFront/*`, `/frontend/*`, `/PushUsDataLayer`, the 2Performant tracking parameters (`/*2pau`, `/*2ptt`, `/*2ptu`, `/*2prp`, `/*2pdlst`) and search (`/*?q=`, `/*?sn.q=`).
- **Filters:** multi-value filters are disallowed (`/*/filtru/*,*`, `/*/filtru/*:*:*`); pagination is allowed (`Allow: */filtru/pagina*`). No `Crawl-delay`.
- **Archive crawler and the Distinct filter:** Wayback received 200 for this file on 2026-02-01, 03-05, 05-03 and 10-07, and a 302 (the captcha redirect) on 2026-04-04 — [CDX](https://web.archive.org/cdx/search/cdx?url=www.evomag.ro/robots.txt&from=2026).

**Fashion Days (bonus) — Status: PARTIAL.** The last readable copy is 2026-03-01.
- **Readable copy:** [web.archive.org/web/20260301224514/https://www.fashiondays.ro/robots.txt](https://web.archive.org/web/20260301224514/https://www.fashiondays.ro/robots.txt).
  - `*` group: `Allow: /`. It disallows `/checkout/`, `/customer/`, `/purchase/`, `/v/`, `*?price=*`, `*&*` (any multi-parameter URL), `*+*`, `/search/?q=*`, the 2P tracking parameters, `/ajax/getApiAuthToken/` and `/products/-`.
  - Crawl-delay only for AhrefsBot (1). `Sitemap: https://www.fashiondays.ro/sitemap/sitemap_ro.xml`.
- **Later captures are HTML, not text:** the captures of 2026-04-06, 2026-05-04 and 2026-10-12 are `text/html`. The 2026-10-12 one, which I fetched, is an obfuscated JavaScript challenge, served even to the Internet Archive — [Wayback 2026-10-12](https://web.archive.org/web/20261012100203/https://www.fashiondays.ro/robots.txt). The two smaller ones (817–826 B) were not fetched; they are presumably the same challenge (I).

**OLX (bonus) — Status: CLOSED.** Wayback snapshot of 2026-10-01 — [web.archive.org/web/20261001233313/https://www.olx.ro/robots.txt](https://web.archive.org/web/20261001233313/https://www.olx.ro/robots.txt).
- `Sitemap: https://www.olx.ro/sitemap.xml`.
- **`*` group** disallows `*/ajax/`, `/api/`, `*/account/`, `*/myaccount/`, `/payment/`, `/searchform/`, `/i2/oferta/contact/*`, `*/i2/*`, `/cont/`, `*/rss/` and others, ending with `Allow: /`. No `Crawl-delay`.
- **Edge block:** our round-1 probe got a CloudFront 403 on this same file.

### Inferences
- **robots.txt is not the barrier.** For every major checked, robots.txt allows product and listing pages for an honest bot; the blocks come from the edge (Akamai, Cloudflare, EdgeOne, Distinct, CEL's own filter) (I). This matches round 1's Common Crawl finding: known bots get 200s where robots allows them.
- **Avoid generic tokens in the UA (I).**
  - cel.ro's group-1 list holds bare tokens (`crawl`, `robot`, `spider`, `bot-`, `bot/`). Under RFC 9309 exact product-token matching, `PretoscopBot` matches none of them.
  - A substring-matching parser or WAF rule would hit any UA containing "bot/" (as in `PretoscopBot/1.0`) or "crawl".
  - Elefant has similar `spider`/`crawler` groups (round 1). Keep the product token `PretoscopBot` and avoid "crawl" or "spider" in it.
- **PC Garage disallows ChangeDetection and `/alerta-pret*`.** That signals hostility to price-monitoring bots. Treat PC Garage as permission-only.
- **iStyle disallows `/policies/`,** which includes its terms page. Read terms for compliance in a browser, not with the crawler.

### Gaps
- Live PC Garage robots.txt after 2025-02-21 (blocked to our client and not archived since). **Founder action:** open `https://www.pcgarage.ro/robots.txt` in a browser and save it.
- cel.ro live reachability from a Romanian IP (§6).

---

## 3. Platform fingerprints and whether listing pages carry prices server-side (Altex, Media Galaxy, PC Garage, evoMAG, cel.ro, Flanco)

### Takeaway
All six render listing prices server-side in the HTML the archive crawler received:

| Shop | Platform (evidence) | Price source in listing HTML | Products per page | Other fields |
|---|---|---|---|---|
| **Altex** | Headless **Magento** data model + **Next.js** (Pages Router, `getInitialProps`, Redux) front end | `__NEXT_DATA__` Redux state | 48 | **EAN** on all 48 sampled |
| **Media Galaxy** | Same build as Altex | `__NEXT_DATA__` Redux state | 48 | EAN on all 48 |
| **PC Garage** | Custom PHP + jQuery | JSON-LD `ItemList` | 20 | `Product` with `AggregateOffer`/`Offer` |
| **evoMAG** | **Yii** (PHP) + jQuery | HTML and a dataLayer impression array | — | — |
| **Flanco** | **Magento 2** | GA4 dataLayer `items` | — | Manufacturer part number in `item_variant` |
| **cel.ro** | **Zen Cart**-derived custom PHP | Server-rendered price spans | — | — |

**cel.ro also serves decoy data under a bot check:** synthetic products with random hex names in JSON-LD. Job postings confirming stacks were not found (3 searches).

### Cited Findings
**Altex — Status: CLOSED.** Category snapshot of 2026-10-10 — [web.archive.org/web/20261010110437/https://altex.ro/telefoane/cpl/](https://web.archive.org/web/20261010110437/https://altex.ro/telefoane/cpl/); 1,519,634 B decoded.
- **Front end (O):**
  - Scripts load from `https://lcdn.altex.ro/render/_next/static/chunks/…` (polyfills, webpack, framework, main, `pages/_app`).
  - `__NEXT_DATA__` has `"page":"/[urlKey]/cpl/[[...filters]]"`, `"gip":true` (getInitialProps, i.e. server-side render) and `buildId` `IXAn3UesclzJsiYWypb6n`.
  - `props.initialReduxState` keys: app, navigation, user, mainmenu, resealed, credex, catalog, stores, contacts, cart, wishlist, cms, support, orders, marketplace.
  - `pageProps.extractedFiltersParams.apiQueryParams` = `?size=48`.
- **Products (O):** `initialReduxState.catalog.currentCategory.products` holds **48 products**. Their fields include `id`, `name`, `sku`, `price`, `regular_price`, `msrp_price`, `lowest_price`, `discount_type`, `brand_name`, **`ean_codes`** (all 48 filled, e.g. 8806097640226), `stock_status`, `price_seller_name` ("Altex"), `seller_ids`, `installments_price`, `url_key` and `family_id`.
- **Magento back end (I):** Magento-style catalog fields (`attribute_set_id`, `type_id: "simple"`, `visibility: 4`, `/media/catalog/product/…` image paths, category path `1/2/19/283`) point to a Magento catalogue behind the Next.js front end. The internal API host `fenrir.altex.ro` was noted in round 1.
- **Visible prices:** the HTML also shows rendered text, e.g. "Telefon SAMSUNG Galaxy A17 5G… PRP: 1.149,00 lei 989,99 lei" (127 visible "lei" strings).
- **Pagination:** `toolbar.pagination` shows "1 / 9" … "9 / 9" with URLs `https://altex.ro/telefoane/cpl/filtru/p/2/`. robots.txt allows these (§2).
- **`lowest_price` (O):** values such as 791.99 against a price of 989.99 run about 80–95% of `price`. They are consistent with resealed or open-box offers, given `resealed_count` 3 (I). This is not the Omnibus 30-day price; its semantics are unverified.

**Media Galaxy — Status: CLOSED.** Category snapshot of 2026-10-10 — [web.archive.org/web/20261010110439/https://mediagalaxy.ro/telefoane/cpl/](https://web.archive.org/web/20261010110439/https://mediagalaxy.ro/telefoane/cpl/).
- **Same codebase:** Next.js chunks from `lcdn.mediagalaxy.ro/render/_next/…` have hashes identical to Altex's for polyfills, framework, main and the shared chunks 1423, 5866 and 1961. Only the `webpack` and `_app` hashes differ. The Redux structure is the same, with 48 products, `ean_codes` on all 48, and `price_seller_name` "Mediagalaxy".
- **Shared platform:** the page `<title>` reads "Telefoane | Cel mai mic pret din Romania! | Altex"; `runtimeConfig.content.websiteTitle` = "Media Galaxy".

**PC Garage — Status: CLOSED.**
- **Category snapshot of 2026-07-26** — [web.archive.org/web/20260726182305/https://www.pcgarage.ro/placi-video/](https://web.archive.org/web/20260726182305/https://www.pcgarage.ro/placi-video/):
  - JSON-LD `ItemList` "PC Garage - Placi video" with **20** `ListItem` → `Product` entries. Each has `name`, `brand`, `mpn` (e.g. NE75080019T2-GB2035S), `sku` and `AggregateOffer` (`lowPrice`, `highPrice`) with an inner `Offer` (`price` 6699.99 RON, `availability`, `priceValidUntil`, `seller` PC Garage).
- **Homepage snapshot of 2026-08-31**, 2.3 MB decoded — [Wayback](https://web.archive.org/web/20260831092935/https://www.pcgarage.ro/):
  - Platform: no framework markers. A jQuery lazy loader (`jQl`) and Matomo on `grgm.ro` (I: custom PHP).
  - Cookies: `pcgsession`, `pcgarage`, `newpcguser`, `c_check`, behind Cloudflare (O, archived headers).

**evoMAG — Status: CLOSED.** Category snapshot of 2026-07-08 — [web.archive.org/web/20260708150501/https://www.evomag.ro/componente-pc-gaming-placi-video/](https://web.archive.org/web/20260708150501/https://www.evomag.ro/componente-pc-gaming-placi-video/).
- **Prices:** an inline `dataLayer.push({"pageType":"subcategory",…})` (102 KB) has impressions such as `{"name":"Placa video ASUS GeForce RTX 3060 DUAL OC V2 12GB…","id":"3817073","price":"1950.99","brand":"ASUS","category":"Produse \\ Componente PC & Gaming \\ Placi Video","list":"Subcategory Listing","position":1}`. There are 56 visible price strings, formatted like "3,638.99 Lei" (comma thousands, dot decimals).
- **Yii evidence (O):**
  - Asset-manager paths `/assets/4581aad7/jquery.min.js` and `/assets/438dda74/js/…`;
  - the `yiiPager` pager class and a `yiiLog` CSS rule;
  - Nosto, Klarna, Cloudflare Turnstile (newsletter form), the 2Performant attribution script `attr-2p.com` and the Profitshare tracker. Doofinder search is disallowed in robots.txt.
- **Homepage of 2026-10-13** — [Wayback](https://web.archive.org/web/20261013001857/https://www.evomag.ro/).

**Flanco — Status: CLOSED.** Smartphone category snapshot of 2026-02-19 — [web.archive.org/web/20260219122059/https://www.flanco.ro/telefoane-tablete/smartphone.html](https://web.archive.org/web/20260219122059/https://www.flanco.ro/telefoane-tablete/smartphone.html).
- **Magento 2 evidence:** `Magento_Customer/js/section-config`, `Magento_PageBuilder/js/widget-initializer` and 150 Magento markers, behind Cloudflare.
- **Prices:** a GA4 dataLayer `items` array, e.g. `"item_name":"Telefon mobil Samsung Galaxy A56 5G, 128GB…","item_id":"267293","ref_id":"678640","item_variant":"SM-A566BZKAEUE","item_brand":"Samsung","price":1799.99,"days_to_shipping":"1 day","warranty":"24 luni"`.
- **Homepage of 2026-10-17:** 137 Magento markers and 62 JSON `price` keys — [Wayback](https://web.archive.org/web/20261017134432/https://www.flanco.ro/).

**cel.ro — Status: CLOSED.**
- **Platform:**
  - Zen Cart URL scheme in robots.txt and links: `index.php?main_page=product_info`, `shopping_cart`, `create_account_success`, `privacy`, `terms_mp`.
  - Templates under Zen Cart's directory layout, `https://s1.cel.ro/includes/templates/responsive/…`.
  - `server: citadel` (O; I: a heavily customised Zen Cart-derived PHP stack).
- **Server-side prices:** the real homepage (Wayback 2026-08-21) renders tiles such as `<span class="price"><span class="value">1549</span> <span class="currency">lei</span></span>` — [Wayback](https://web.archive.org/web/20260821164227/https://www.cel.ro/). Product URLs look like `/samsung-galaxy-a16-…-pOCsxNTMuMg-l/`.
- **Bot check and decoy data:**
  - The 2026-07-20 homepage capture is an in-house "celcaptcha" page: "Verificare rapida — Facem aceasta verificare pentru a ne asigura ca accesul este facut de o persoana, nu de un robot." (*Quick check: we verify that access is by a person, not a robot.*) It is a POST form with `action=validate_celcaptcha`, a Google reCAPTCHA v2 widget and a `cel_id` cookie — [Wayback](https://web.archive.org/web/20260720145659/https://www.cel.ro/).
  - The 2026-02-01 capture of `/placi-video/` shows the same "Verificare rapida" text plus JSON-LD with **15 synthetic Product records**, such as "Husa Pro b6fc26eb" (sku "8dd554e7ba", 945 RON, brand "oem") and "Carcasa Elegance f58373a6" (1059 RON). The first six run 912–1,426 RON, all under a "Placi video › Geforce RTX 3050" breadcrumb — [Wayback](https://web.archive.org/web/20260201162729/https://www.cel.ro/placi-video/).
- **Other shops:** Fashion Days is a custom eMAG-group stack (`/webui/js-assets/`, a versioned `/i18n/…/ro_RO.js` Translator) behind Tencent EdgeOne — [Wayback 2026-04-18](https://web.archive.org/web/20260418073500/https://www.fashiondays.ro/). OLX is a custom React single-page app (`/app/static/js/main.*.js`, `window.__INIT_CONFIG__`) behind CloudFront — [Wayback 2026-04-28](https://web.archive.org/web/20260428075854/https://www.olx.ro/).
- **Job postings:** searches for Altex, evoMAG and PC Garage stack postings returned only unrelated or old listings — e.g. [hipo.ro Altex 2017](https://www.hipo.ro/locuri-de-munca/locuri_de_munca/71253/ALTEX-Romania/Senior-Software-Developer-).

### Inferences
- **Listing pages are cheap if allowlisted (I).** For Altex and Media Galaxy, one listing request returns 48 products with price, regular price, MSRP, stock, seller and EAN. That is about 400 phones in 9 requests. Altex's EAN exposure is unusually rich for matching.
  - **Extract from `__NEXT_DATA__` (HTML), never from `fenrir.altex.ro`** (an internal API).
  - This needs Akamai allowlisting first, since unknown bots get stream resets (round 1).
- **Generic adapters fit (I):** JSON-LD `ItemList` (PC Garage) and GA4/UA dataLayer arrays (evoMAG, Flanco) are generic and stable extractor targets. Flanco's `item_variant` carries the manufacturer part number, which helps matching.
- **CEL's decoy data is a data-quality risk (I).** A crawler that saved JSON-LD from a challenge page would ingest fake products and prices. The fetch layer must classify the "Verificare rapida"/`celcaptcha` markup and any page whose visible text starts with a bot check as `challenge`, and discard its structured data.
- **Archive copies prove nothing about our access (I).** The archive crawler obtained real HTML from Altex, Media Galaxy, PC Garage, evoMAG and Flanco, but this does not mean our bot would. The Internet Archive's identified, reputable IP space is the likely reason.

### Gaps
- Whether Altex and Media Galaxy serve the same SSR HTML to a non-allowlisted client cannot be tested without challenging their edge (not done by policy).
- The semantics of Altex's `lowest_price` are unverified. **Founder action:** compare the field with the on-page resealed price in a browser.

---

## 4. Child-sitemap sizing, per-URL lastmod, eMAG delta indexes, and eMAG "Alte oferte"

### Takeaway
- **Per-URL lastmod is meaningful only at Elefant** (17,365 distinct timestamps over 205 days) and partly at Carrefour (612 distinct days). Everywhere else lastmod is either absent or equals the generation date.
- **Files cap** at 1,000 (Auchan), 2,000 (Libris), ~5,000 (eMAG), ~7,900 (Dedeman, split by size), ~23–30k (IT Galaxy, forit) and 50,000 (Elefant, Carrefour, Bonami ≈ 49.9k).
- **eMAG delta indexes:** `offers-latest` has 9 files (≤45k URLs) and `offers-unavailable` has 27 (≤135k). The unavailable set was 3,991 files (~20M URLs) in January 2026.
- **Altex's 14 product sitemaps** hold roughly 0.5–0.7M product URLs (estimate). One file has 228,270 URLs, above the 50,000-URL protocol limit.
- **eMAG other-seller offers are in the product HTML** as a dataLayer `secondary_offers` array: vendor, offer id and price.

### Cited Findings
**Status: CLOSED** for the listed shops except where marked. Live child files were fetched once per shop on 2026-10-27 between 17:47:30Z and 17:47:37Z (§9).

| Shop | File fetched | URLs in file | lastmod | Files of this type in index (round 1) | Size implication |
|---|---|---|---|---|---|
| Dedeman | [sitemap-products0.xml](https://www.dedeman.ro/media/sitemap/sitemap-products0.xml) (10,493,021 B) | 7,920 | On all URLs, all `2026-10-27` (generation date); `changefreq daily`, `priority 1.0`; 20,154 `image:image` | 25 product files | ≈198k product URLs if files are similar (I). The file size sits just above Magento's default 10 MB split (I) |
| Libris | [sitemap-carte.xml page 1](https://www.libris.ro/sitemap-carte.xml?nofilename=on&page=1) | 2,000 | **None**; `changefreq daily` | 396 product-type files (27 carte, 360 carte-engleza, 3 ebook, 3 joc, 3 produs) | ≤792k product URLs (bound) |
| Elefant | [sitemap-product-sitemapRO-0](https://www.elefant.ro/sitemap-product-sitemapRO-0) (gzip, 9.4 MB) | **50,000** | **Real per item:** 17,365 distinct values over 205 days, 2022-02-07 → 2026-10-24; bulk clusters (9,746 on 2026-09-03; 6,326 on 2026-07-04) | 23 product files | ≤1.15M (bound) |
| Bonami | [product_0.xml](https://www.bonami.ro/sitemap/product_0.xml) | 49,863 | All `2026-10-27T05:00:05+01:00` (generation time); `changefreq weekly` | 1 product file + 2 `product_dead` | ≈49.9k live products |
| Carrefour | [sitemap_001.xml](https://carrefour.ro/pub/sitemap/sitemap_001.xml) | 50,000 (categories + products) | 612 distinct days, 2017-12-13 → 2026-10-27; 25,677 dated 2024-08-23 and 15,184 dated 2026-10-27 | 2 files | ≤100k URLs |
| Auchan | [product-0.xml](https://www.auchan.ro/sitemap/product-0.xml) | 1,000 | All `2026-10-27` | 64 product files | ≤64k product URLs |
| IT Galaxy | [products-0.xml](https://www.itgalaxy.ro/data/sitemaps/products-0.xml) | 23,501 | **None** | 4 product files (+ products-latest-0) | ≈94k (I) |
| forit | [sitemap_30000.xml](https://www.forit.ro/sitemap_30000.xml) (16.7 MB) | 29,999 | All `2026-10-27T12:04:08–12+02:00` (5 distinct seconds = generation); `changefreq daily`; 64,806 images | 6 numbered files + `sitemap_fin` | ≈180k+ (I) |
| Flip | `sitemap.xml` (earlier probe file, re-read) | 8,116 (6,869 `/magazin/` products) | **None** | single file | 6,869 products |

**eMAG delta indexes — Status: CLOSED.**
- **Live `offers-latest-index.xml`** (17:47:38Z): **9** children, `offers-latest-0.xml` … `-8.xml`, all with index lastmod 2026-10-27 — [link](https://www.emag.ro/sitemaps/offers-latest-index.xml).
- **Live `offers-unavailable-index.xml`** (17:49:03Z): **27** children, `offers-unavailable-0.xml` … `-26.xml`, all with lastmod **2026-07-27** — [link](https://www.emag.ro/sitemaps/offers-unavailable-index.xml).
- **Historical unavailable index** (Wayback 2026-01-22): **3,991** children (`-0` … `-3990`), all lastmod 2025-08-31 — [Wayback](https://web.archive.org/web/20260122230917/https://www.emag.ro/sitemaps/offers-unavailable-index.xml).
- **Archived child files:**
  - `offers-unavailable-1016.xml` (Wayback 2026-01-03): **4,995** URLs, all lastmod 2025-08-31, 13,201 images — [Wayback](https://web.archive.org/web/20260103085703/https://www.emag.ro/sitemaps/offers-unavailable-1016.xml).
  - `offers-latest-0.xml` (Wayback 2026-01-02): **5,000** URLs, all lastmod 2025-12-30, `changefreq daily` — [Wayback](https://web.archive.org/web/20260102005927/https://www.emag.ro/sitemaps/offers-latest-0.xml).

**Altex product sitemaps — Status: PARTIAL** (measured files plus an estimate).
- **Measured:**
  - `altex_telefoane_tablete_sitemap.xml` (Wayback 2026-10-07): **3,724** `/cpd/` URLs — [Wayback](https://web.archive.org/web/20261007044337/https://altex.ro/sitemaps/products/altex_telefoane_tablete_sitemap.xml).
  - `altex_gaming_jocuri_carti_sitemap.xml` (Wayback 2026-10-05): **29,321** URLs — [Wayback](https://web.archive.org/web/20261005080142/https://altex.ro/sitemaps/products/altex_gaming_jocuri_carti_sitemap.xml).
  - `altex_bricolaj_sanitare_mobila__sitemap.xml` (Wayback 2026-05-04): **228,270** URLs in 54.7 MB — [Wayback](https://web.archive.org/web/20260504040931/https://altex.ro/sitemaps/products/altex_bricolaj_sanitare_mobila__sitemap.xml).
  - In every file, lastmod equals the generation date, with `changefreq weekly` and `priority 0.6`.
- **Estimate:** the CDX lists all 14 product files for 2026-10-05..07 with a summed record length of 13.09 MB — [CDX](https://web.archive.org/cdx/search/cdx?url=altex.ro/sitemaps/products/&matchType=prefix&from=202609). Calibrating with the two October files (17.9 and 27.2 compressed bytes per URL) gives **≈0.48–0.73M product URLs** (I). Many URLs carry hex marketplace-style SKUs, e.g. `/cpd/682EAAF377B0A/`.

**PC Garage sitemaps — Status: PARTIAL.**
- The index (Wayback 2024-05-04) has **1,419** children under `/data/sitemaps/1/`, with no lastmod: 283 `cat_<id>_products.xml`, 229 `cat_<id>_products_comments.xml`, 282/282/339 `cat_<id>_1filter|2filter|3filter`, plus categories, manufacturers and wishlist — [Wayback](https://web.archive.org/web/20240504065310/https://www.pcgarage.ro/sitemap.xml).
- No child file is archived for 2025–2026 (CDX empty or timed out).

**Flanco sitemaps — Status: NOT PUBLIC.**
- `https://www.flanco.ro/sitemap.xml` returned **404** to the Wayback crawler on every 2025–2026 capture, from 2025-03-09 to 2026-05-16 — [CDX](https://web.archive.org/cdx/search/cdx?url=www.flanco.ro/sitemap&matchType=prefix&from=2025). It returned a 403 challenge to us in round 1. No `/media/sitemap*` captures exist.
- **Founder action:** ask Flanco (or open robots.txt and sitemap paths in a browser) for the sitemap location, or obtain catalogue size from a feed.

**eMAG "Alte oferte" — Status: CLOSED.**
- **Visible widget is client-side:** the "Alte oferte" section is a placeholder, `<section class="js-alternative-offers-section …"> … <div class="fastest-cheapest-item …" data-offer-id="" data-vendor-id="">`.
- **Offers are in the server HTML:** the dataLayer event `"event":"productPageView", "secondary_offers": [ {"name":…, "id":<offer_id>, "vendor":"<seller>", "price":<RON>} … ]` lists the other sellers.
- **Archived example** (iPhone 16 128GB Black, Wayback 2026-03-03): 10 secondary offers — GREEN MOBIL FBE 3990.99, ROTEL 4097.99, Amco 3918.32, **evomag 4086.01**, **Flanco 4199.99**, **VEXIO 4082.99**, Atu IT 4463.77, TELEFON 4293.45, Dwyn Shop 4614, Smartfoni 4498.06. The main JSON-LD offer is eMAG at 3899.99. `EM.flags.has_multiple` = true — [Wayback](https://web.archive.org/web/20260303131744/https://www.emag.ro/telefon-mobil-apple-iphone-16-128gb-5g-black-mye73zd-a/pd/DHY67LYBM/).
- **Live confirmation** (earlier probe file, 2026-10-27 15:03Z, Samsung S26 FE, main seller TelefonulTau): 8 secondary offers, including eMAG 3313.5, **evomag 3199.99**, **VEXIO 3250.99**, Shop4you, Mobi Store, Dwyn Shop, **Flanco 4199** and FINE ART STREET 14 — [page](https://www.emag.ro/telefon-mobil-samsung-galaxy-s26-fe-dual-sim-8gb-ram-128gb-5g-blueberry-sm-s741bzvdeue/pd/DF1MLR2BM/).

### Inferences
- **Change detection is mostly on us (I).** Only Elefant's lastmod can drive incremental recrawls, and its bulk clusters mean "changed" is coarse. Everywhere else, diff URL sets day over day and use listing pages for prices.
- **The eMAG unavailable sitemap is not a reliable delisting feed (I).** It went from 3,991 files dated 2025-08-31 (January 2026) to 27 files dated 2026-07-27 (October 2026), and was stale in both states. Use the absence from `offers-available` plus a product-page 404/410 instead. `offers-latest` (≤45k, regenerated daily) is a useful new-item feed.
- **Altex's oversized file needs streaming (I).** The 228k-URL bricolaj file breaks the protocol limit, so a sitemap parser must stream and must not assume 50k caps. Altex's catalogue (~0.5–0.7M URLs) is dominated by marketplace and home categories; electronics is a small share (telefoane/tablete 3.7k).
- **eMAG's `secondary_offers` exposes other shops' marketplace prices (I).** It shows evoMAG, Flanco and Vexio prices on eMAG Marketplace, which may differ from their own sites. Reading them is still extraction from eMAG (clause 4.2(j)). Do not use it as a back door for blocked shops.

### Gaps
- Middle-file sampling for Dedeman, IT Galaxy and forit (one file each); estimates assume similar file sizes.
- PC Garage per-category product file sizes.
- Flanco catalogue size (Pricy lists "peste 50.000 produse", round 1).
- How eMAG sitemap URLs map to variant pages is unresolved (not tested).

---

## 5. Affiliate-program rule texts: comparator/aggregator clauses, feeds, cookies, commissions, closure notices, "istoric prețuri"

### Takeaway
- **No program allows or forbids price-history sites in its 2P page or the 8 Profitshare pages read.** None of the 378 public 2Performant program pages mentions "istoric preț". Fashion Days' Profitshare ban (round 1) remains the only explicit price-history rule found.
- **None of the 2P electronics programs checked says anything about comparators:** F64, GSMnet, spy-shop, bitmi, conectica, a2t, vonmag, evoMAG.
- **Profitshare IT&C programs ban Google CSS** in several cases (ITGalaxy, ForIT, Dualstore) and are otherwise silent on comparators.
- **Explicit comparator mentions on 2P** (16 programs): Decathlon pays 5% to "comparatoare de produse" but closes on 31.10.2026. ASUS eShop refuses price aggregators. Krista, Libris, Arthur, Femieko, Trada, Bagno, Aqualine, Depozitsolar and others accept them.
- **Flanco's 2P closure is confirmed:** "SE VA ÎNCHIDE ÎNCEPÂND CU DATA DE 29.06.2026".
- **Profitshare's unlabelled header figures are now decoded:** value-weighted approval rate, average approval period, a no-phone flag and a feed flag. Vexio does offer feeds.

### Cited Findings
**2Performant electronics programs — Status: CLOSED.** Pages were saved from `2performant.com/affiliate-programs/<category>/<slug>/` on 2026-10-27 (~15:36Z) and re-read.

| Program (listed since) | Rank | Commission | Cookie | Time to payment | Feed | Rules relevant to Pretoscop (verbatim) | Source |
|---|---|---|---|---|---|---|---|
| **F64** (July 2017) | 56th | "1% pentru comenzile valide din categoriile: Aparate Foto, Obiective Foto, Camere Video, Camere de acțiune și Drone"; "3% … toate celelalte categorii" | 30 days; "posibilitatea extinderii până la 64 de zile, la cerere" | 64 days | Template label | Aimed at "creatorilor de conținut, publicațiilor și comunităților"; encourages "review-uri și teste … comparații și recomandări" (editorial comparisons). "Fiecare solicitare de înscriere este analizată individual." No comparator or price-history rule | [2P – f64.ro](https://2performant.com/affiliate-programs/electronics/f64-ro/) |
| **GSMnet** (January 2026) | 16th | "un comision de 12% pentru comenzile plasate de utilizatori finali … calculează exclusiv din valoarea netă a produselor, fără a include TVA-ul sau costurile de livrare" | 30 days | 16 days | Template label | Only 2P banners. Bans "website-uri … clona, realizeaza URL masking sau contin în domeniul … cuvintele cheie gsmnet sau sunt contrare intereselor … GSMnet.ro"; brand keywords; spam. Only dedicated coupons are paid. No comparator rule | [2P – gsmnet.ro](https://2performant.com/affiliate-programs/electronics/gsmnet-ro/) |
| **spy-shop** (Nov 2012) | 29th | "Comisionul general este de 5%"; 5% "Optica de noapte"; 2% "Sisteme solare fotovoltaice" | 31 days | 81 days | Template label | No promotion rules beyond contacting them for campaigns | [2P – spy-shop.ro](https://2performant.com/affiliate-programs/electronics/spy-shop-ro/) |
| **bitmi** (June 2023) | 72nd | 5% standard; monthly top-3 tiers 7.5/7/6.5% (≥15,000 lei and ≥15 orders) | 30 days | 22 days | **"Oferim feed de produse actualizat o data la 24h"** | Approval time set to 60 days. No comparator rule | [2P – bitmi.ro](https://2performant.com/affiliate-programs/electronics/bitmi-ro/) |
| **conectica** (April 2019) | 145th | "Comision 6%" | 30 days | 10 days | Template label | Allowed: blogs, Facebook organic and paid, and "Google Adwords, excepție Search si DSA … doar prin intermediul campaniilor de Google Display". No comparator rule | [2P – conectica.ro](https://2performant.com/affiliate-programs/electronics/conectica-ro/) |
| **a2t (Atu Tech)** (Jan 2022) | 58th | 5% | 30 days | 30 days | Template label | "Nu acceptam promovare prin Adwords" ("Incepand cu data de 7 iulie 2017"). Reduced commission for B2B and installer clients. Must use "Atu Tech – A2T.ro". No comparator rule | [2P – a2t.ro](https://2performant.com/affiliate-programs/electronics/a2t-ro/) |
| **vonmag** (Nov 2014) | 86th | 3% | 31 days | 56 days | Template label | No rules | [2P – vonmag.ro](https://2performant.com/affiliate-programs/electronics/vonmag-ro/) |
| **evoMAG** (May 2009) | 15th | "In perioada 1.10.2026 – 31.10.2026 … comisionul standard va fi de 1,5%"; grid PDF `https://www.evomag.ro/upload/files/file-1675862845.pdf` | "10 zile cookie life" | 48 days | **"Avem peste 15 feed-uri de produse"** | "aproba comisioanele automat in cel mult 15 zile … facturile se platesc saptamanal". No comparator, PPC or price-history rule | [2P – evomag.ro](https://2performant.com/affiliate-programs/electronics/evomag-ro/) |
| **Decathlon** (July 2019) | 70th | 5% | 10 days | 46 days | Template label | **"Vă informăm că programul de afiliere Decathlon se va închide începând cu data de 31.10.2026. Până la această dată, programul va funcționa în condițiile actuale."** Earlier: "5% pentru vânzările generate de catre creatori de content (Blog, YouTube etc) + comparatoare de produse" | [2P – decathlon.ro](https://2performant.com/affiliate-programs/sports-outdoors/decathlon-ro/) |

**Flanco's 2P closure notice — Status: CLOSED.** Wayback snapshot of 2026-06-15 — [web.archive.org/web/20260615145227/https://ro.2performant.com/affiliate-programs/electronics/flanco-ro/](https://web.archive.org/web/20260615145227/https://ro.2performant.com/affiliate-programs/electronics/flanco-ro/).
- **Notice:** "PROGRAMUL DE AFILIERE flanco.ro SE VA ÎNCHIDE ÎNCEPÂND CU DATA DE 29.06.2026. Vă mulțumim pentru colaborare și pentru implicarea voastră în campania flanco.ro. Uneltele de promovare vor deveni inactive. Prin urmare, vă rugăm să nu le mai folosiți începând cu data de 29.06.2026." (*The flanco.ro program closes from 29.06.2026; promotional tools will become inactive; do not use them from that date.*)
- **Header:** listed April 2023; rank "31st General, 4th Categorie"; "Comision variable"; "Cookie life 10 zile"; "Timp de plata 91 zile"; tools "Bannere, Feed-uri de produse".
- **Body text** (older) says "un comision între 1 și 10% … pe o perioadă de recurență de 45 zile", which contradicts the 10-day header.
- **Link rules:** links are not accepted on sites that "sunt concurentii Flanco Smart Discounter". No comparator clause.
- **Live page:** 404 (round 1).

**Profitshare IT&C programs — Status: CLOSED.** Fetched 2026-10-27 between 17:51:51Z and 17:52:31Z. The header icons' tooltips decode the unlabelled figures:
- "Rata medie de aprobare valorică a comisioanelor … este de X% din valoarea comisioanelor înregistrate" (*average value-weighted approval rate*);
- "Perioada medie pentru aprobarea comisioanelor … este de N zile" (*average approval period*);
- "Advertiserul nu afiseaza numar de telefon pentru vizite Profitshare" (*no phone number shown to Profitshare visitors*; this is the "No" icon);
- "Advertiserul ofera feed-uri de produse" (*feeds offered*).

| Program | Approval rate / period | Feed | Commission; commission period | Rules (verbatim; "Ultima modificare") | Source |
|---|---|---|---|---|---|
| **ITGalaxy** | 88% / 11 days; no phone | Yes | "2% … Exceptie fac produsele marca NEX … 10%"; 60 days | Allowed: "Facebook Ads, … Google Adwords, Google Shopping Ads". **"Este interzisa promovarea prin Google CSS."** Brand keywords must be negative. Only official materials (18/04/2023) | [Profitshare – ITGalaxy](https://profitshare.ro/affiliate-programs/it-c/itgalaxy) |
| **ForIT** | 71.76% / 31 days | Yes | 2%; 30 days | Facebook Ads, Timeline, Twitter and LinkedIn allowed. **"Este interzisa promovarea prin Google CSS."** (18/04/2023) | [Profitshare – ForIT](https://profitshare.ro/affiliate-programs/it-c/forit) |
| **Techstar** | 85.93% / 31 days; no phone | Yes | "15% (incepand cu 12.02.2017)"; 30 days (marketing text says 90-day recurrence) | No Google-spam sites. Brand keyword "techstar" and its variants banned in ads and domains. Any promo material allowed (14/01/2025) | [Profitshare – Techstar](https://profitshare.ro/affiliate-programs/it-c/techstar) |
| **Dualstore** | 100% / 31 days | Yes | 5% (marketing text says 3%); 30 days | **"din data de 13.11.2024 Nu mai acceptam promovarea prin css, google ads, facebook ads, tiktok ads"** (15/11/2024) | [Profitshare – Dualstore](https://profitshare.ro/affiliate-programs/it-c/dualstore) |
| **Vonmag** | 90.23% / 31 days; no phone | Yes | "3 % (incepand cu 19.03.2026)"; 30 days; nothing for installer partners | No sites "care promoveaza coduri de reducere sau informatii eronate privind ofertele". Keywords VonMag and Vonrep banned (18/03/2026) | [Profitshare – Vonmag](https://profitshare.ro/affiliate-programs/it-c/vonmag) |
| **PCMadd** | (not shown) | Yes | 6% excl. VAT and shipping; 30 days | "Nu este permisa licitarea in Google AdWords pe cuvintele cheie 'pc madd', 'pcmadd'". Only platform materials (10/11/2016) | [Profitshare – PCMadd](https://profitshare.ro/affiliate-programs/it-c/pcmadd) |
| **Vexio** | 98.7% / 31 days; no phone | **Yes** (corrects round 1's "No Feed" reading) | 2%; **5 days** | "Este interzisa promovarea prin Google Ads incepand cu 16 iunie 2020". No commission on "clientii de distributie". Brand keywords negative (15/11/2023) | [Profitshare – Vexio](https://profitshare.ro/affiliate-programs/it-c/vexio) |
| **evoMAG** | 64.18% / 61 days; **inactive** | Yes | "1.00% - 10.00%"; 14 days | "Promovarea pe Google Adwors este permisa doar cu acord scris in prealabil; Promovarea prin Goolge Shopping este perimsa doar cu acord scris in prealabil"; feeds are an accepted tool (23/06/2022; typos in original) | [Profitshare – evoMAG](https://profitshare.ro/affiliate-programs/retail/evomag) |

**Comparator and price-history clauses across all 378 2P programs — Status: CLOSED.** Text scan of the saved descriptions:
- **"istoric pre[tț]": 0 hits.**
- **"comparat(o|oa)r": 26 hits in 16 programs.** Policy-relevant examples:
  - **ASUS eShop:** "În acest moment nu putem accepta promovarea prin listarea pe agregatoarele de prețuri si de produse." (*we currently cannot accept promotion by listing on price and product aggregators*) — [2P – asus.com](https://2performant.com/affiliate-programs/electronics/asus-com/).
  - **Krista** lists among "Canalele de promovare acceptate": "Comparatoare de prețuri – Agregatoare de produse (site-uri de feed-uri)" — [2P – krista.ro](https://2performant.com/affiliate-programs/babies-kids-toys/krista-ro/).
  - **Libris:** "Comparatoare de preturi … Campanii Google CSS – doar cu acord prealabil" (round 1).
  - **Others accepting comparators or aggregators:** Editura Arthur, Femieko, Trada, Bagno, Aqualine, Depozitsolar, Atelier49, Printrecarti, Magazinul de Șah and JoJo Fashion ("feed de produse … pentru integrarea ușoară în site-uri, comparatoare"). Detoxmed's feed is "gata de folosit în Google Shopping, CSS și comparatoare de prețuri".
  - FERA cites comparators only as evidence of low prices.

### Inferences
- **"Silent" electronics programs are the realistic feed pool (I):** evoMAG (15+ feeds, 1.5%, 10-day cookie), GSMnet (12%), bitmi (daily feed), F64 (application reviewed individually) and the Profitshare IT&C group. Each still needs written confirmation that a comparator plus price-history use is acceptable, since silence is not permission (round 1).
- **Google CSS bans constrain only CSS monetisation (I).** ITGalaxy, ForIT and Dualstore ban CSS; this does not restrict a comparator listing itself.
- **Closures (I).** With Decathlon (31.10.2026) and Flanco (29.06.2026) gone, no large general retailer on 2P explicitly welcomes comparators. Libris (books) remains the only major explicit "yes".

### Gaps
- **2P feed field lists and comparator permission per advertiser:** NOT PUBLIC (requires a 2P affiliate account). **Founder action:** open a 2P affiliate account (Business League). Message evoMAG, GSMnet, F64 and bitmi: "Pretoscop is a price-comparison and price-history site; may we list your feed products with price history and affiliate links?" Store the replies.
- The evoMAG commission grid PDF (`file-1675862845.pdf`) was not fetched (retailer domain).

---

## 6. Prior art: GitHub scrapers, Chrome extensions' data collection, Romanian write-ups, hosting blocks, Distinct New Media

### Takeaway
- **GitHub:** most Romanian shop scrapers carry no licence (81 of 107 repos found). None documents eMAG rate-limit thresholds.
- **Chrome extensions — three different data models:**
  - **Istoric Preturi** crowdsources prices: its content script posts the price, price HTML, stock status and schema.org data from pages users view to `api.istoric-preturi.info/checkPrice`.
  - **Pricy** sends only visited product URLs to its lookup API.
  - **Pret Alert** looks up URLs. Its v1.4.1 code contains an unwired Flanco crowd-report path with the comment "flanco.ro blochează serverul nostru" (*flanco.ro blocks our server*).
- **Romanian forums:** r/programare threads discuss IP bans and legality in general. No report names eMAG, Altex or Flanco blocking specific hosting providers.
- **Distinct New Media** publishes no bot-allowlisting policy beyond its captcha FAQ.

### Cited Findings
**GitHub licences and rate limits — Status: CLOSED** (licences; no thresholds documented) **/ PARTIAL** (whether the scrapers still work).
- **Licences** across 107 unique repos in the round-1 search results (saved API JSON; licence = GitHub-detected SPDX): 81 no licence, 18 MIT, 5 GPL-3.0, 1 Apache-2.0, 1 GPL-2.0, 1 NOASSERTION.
  - **None of the 10 most recent eMAG/Altex/PC Garage scrapers has a licence**, so all rights are reserved by default: bf-price-monitor, Price-monitor-spring, Price-tracker, Price_Tracker, emag-scraper (Cresteanu), eMAG-scraper (AlinCqe), PriceTracker (ros-antonio), BridgeAI-Database-Scraper, Emag-Scraper (KolevAristocracy), emag-altex-scraper.
  - **Licensed ones are old:** [Tedyst/Scraper](https://github.com/Tedyst/Scraper) MIT (2019), [marinoffDev/emag-price-scraper](https://github.com/marinoffDev/emag-price-scraper) GPL-3.0 (2023), [roby-rodriguez/emag-score](https://github.com/roby-rodriguez/emag-score) MIT (2016) and [chawel/python-emag](https://github.com/chawel/python-emag) MIT (2018).
  - Search used: [api.github.com/search/repositories?q=emag+scraper](https://api.github.com/search/repositories?q=emag+scraper&sort=updated).
- **No eMAG rate thresholds:** a grep of the 16 archived repos for rate-limit, 429, throttle and captcha strings found no documented eMAG threshold.
- **[NaviAndrei/bf-price-monitor](https://github.com/NaviAndrei/bf-price-monitor)** (pushed 2026-10-27) shows the most operational detail:
  - "4–9s watch jitter, 5s per-store floor, Chrome 131/130 UA rotation";
  - a per-site cooldown when a run's 403/429 rate exceeds 5%;
  - a logged live run "eMAG 59 parsed / 0 failures, PC Garage 20 / 0, Flanco 12 / 1";
  - it reads eMAG's `is_marketplace` as always None because "robots.txt blocks the only page with real seller text".
  - It uses UA rotation and stealth browsers, which Pretoscop must not copy.

**Chrome extension data-collection disclosures, plus code-level behaviour — Status: CLOSED.** Disclosures come from CWS pages saved 2026-10-27 15:31–15:33Z. Code comes from packages downloaded via the public CRX endpoint (`https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3D<ID>%26uc`). Only `manifest.json` and the JS sources were read; nothing was executed.

| Extension (version, updated) | CWS "handles the following" | Manifest | What the code sends | Source |
|---|---|---|---|---|
| **Istoric Preturi** (2.41, Apr 3 2026) | "Personally identifiable information", "Location", **"Website content"** | MV3; permissions tabs, scripting, contextMenus, alarms, storage; host_permissions `http://*/*`, `https://*/*` | `js/inPage.js` builds `params = { link, price, priceHTML, cacheId, cacheIdV2, stockStatus, schemaData, isSubsequentRequest, variant }` from the viewed page (regex over `document.documentElement.outerHTML`, deflated with pako). It sends them through `API("checkPrice", …)` → `POST https://api.istoric-preturi.info/checkPrice`. Other commands: `selectorsNotFound`, `selectorsFoundTooMany`, `selectorsExtraPatterns` | [CWS](https://chromewebstore.google.com/detail/istoric-preturi/hdhclckbeelgahmklefjjnpmhbljhcmd) |
| **Pricy** (7.0.0, Jun 30 2026; PRICY LIMITED) | PII, "Authentication information", "Location" | MV3; tabs, scripting, alarms, storage; all hosts | The service worker calls `https://www.pricy.ro/api/extension/pricechanges?url=<visited URL>&v=…` for supported sites and refreshes `getsupportedsites`. `supported_sites.js` lists **926** shops with `InPagePopupXPath` anchors for placing the popup, e.g. emag.ro `div.product-page-pricing p.product-new-price span`, altex.ro `.Price-current .Price-currency`, flanco.ro `div.produs-price > span[itemprop='price']`, pcgarage.ro `.ps_sell_price span.price_text`. No code path uploads page content (O) | [CWS](https://chromewebstore.google.com/detail/pricy/jnpfnacconjipomhfkphknjfmcnhagpb) |
| **Pret Alert** (1.4.1, Oct 19 2026) | **"Web history"** | MV3; permission storage; host_permissions `https://pretalert.ro/*`; the content script matches **138** shop domains (incl. altex.ro, decathlon.ro, dedeman.ro, drmax.ro, a2t.ro, conectica.ro, dualstore.ro, dwyn.ro) | The background sends `GET https://pretalert.ro/api/ext/lookup?url=<URL>` and `POST https://pretalert.ro/api/ext/lot {urls:[≤24]}`. The content script reads JSON-LD and eMAG selectors. It contains `// flanco.ro blochează serverul nostru: prețul văzut de utilizator, trimis anonim (fără cookie/cont)` and sends `{type:'raport', url, pret, in_stoc}`, but the service worker has no `raport` handler in 1.4.1, so nothing is transmitted (O) | [CWS](https://chromewebstore.google.com/detail/infgkooonmilglligeaffingljedfoab) |

**Romanian developer write-ups — Status: PARTIAL.** Retrieved via the Arctic Shift archive API, e.g. [posts search](https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=programare&query=scraper&limit=100). Keyword searches for "emag", "altex", "scraping" and "hetzner" timed out server-side ("Timeout. Maybe slow down a bit").
- **[r/programare 1un3ik7](https://www.reddit.com/r/programare/comments/1un3ik7/)** (2026-07-04, 25 comments): a Romanian developer building a gold/silver price aggregator asks: "Am dat peste vreo două site-uri unde scrie clar că n-ai voie acces automatizat sau să le iei prețurile … ceri voie? renunți la ele?" (*I found two sites whose terms clearly forbid automated access or taking their prices; do you ask permission or drop them?*). Replies:
  - "Am luat ban pe Ip. … dupa daca tot incerci … posibil sa te contacteze legal sa te opresti" (17 points) (*I got an IP ban; if you keep trying, they may contact you legally to stop*);
  - "Problemele pe care le poti avea tin de rate limit-uri, ban-uri pe IP sau sistemele anti-bot … 1-2 request-uri pe secunda" (7 points);
  - one reply cites the database sui generis right (Directive 96/9/EC). No shop is named.
- **[r/programare 1jje7ch](https://www.reddit.com/r/programare/comments/1jje7ch/)** (2025-03-25, 101 comments): a real-estate listings scraper abandoned over terms-of-service and load concerns. Comments split on legality (e.g. "Scraping in Europa e legal cata vreme iei date publice, fara login" versus "E ilegal scrapping-ul"). One notes that eMAG product content is "create de third-party sellers".
- **[r/programare 1vslxgv](https://www.reddit.com/r/programare/comments/1vslxgv/)** (2026-08-19, 86 comments): a user complains that an AI assistant set an identifying UA and refused to bypass anti-bot systems. It is evidence of the norm, not of shop behaviour.
- **No post or comment names** eMAG, Altex or Flanco blocking Hetzner, OVH, DigitalOcean or Romanian hosting IPs. Web searches ("scraping emag blocat IP hetzner"; Reddit, Cloudflare and Akamai variants) returned only generic vendor content — e.g. [webscraping.ai](https://webscraping.ai/faq/domain-com-scraping/what-are-the-signs-that-my-ip-has-been-blacklisted-from-scraping-domain.com).

**Hosting-provider blocks — Status: NOT PUBLIC** (no public evidence).
- **Strongest indirect evidence:**
  - Pret Alert's code comment that Flanco blocks its server (above);
  - bf-price-monitor's note that GitHub's shared runner IPs are blocked (round 1);
  - our own results: CEL TCP timeouts from a UK ISP IP (AS5631) on 2026-10-27 at 14:49Z and again at 17:47Z, while Wayback captured CEL pages and challenges in 2026.
- **Founder action:** rent a one-month Bucharest VPS (e.g. M247-based) and a Hetzner instance, set PTR records, and send one robots.txt request per shop from each with the PretoscopBot UA. Record the status, `server`, `cf-mitigated` and timing. Repeat from a Romanian residential line.

**Distinct New Media's filter — Status: NOT PUBLIC.**
- **No public policy:** Distinct's site lists hosting products (dedicated, VPS, colocation, SaaS) and no traffic-filter, allowlisting or bot-policy page — [distinct.ro](https://www.distinct.ro/), fetched 2026-10-27 18:05:26Z.
- **Client list:** the public list (undated; "peste 10 ani de activitate") names media, telecom and food-delivery clients and no other large shops (e.g. Libertatea, Evenimentul Zilei, TAROM, Jerry's Pizza, Eurokids). It is not current — [distinct.ro/clienti/lista-clienti](https://www.distinct.ro/clienti/lista-clienti). The homepage mentions a 2014 talk: "Studiu de caz: Cum a ajutat Distinct pe evoMAG.ro sa faca fata varfului de trafic Blackfriday 2013".
- **Unblock route:** the only published channel remains the captcha FAQ (round 1): automatic unblock "în următoarele zile", or email captcha@distinct.ro with your IP and reason. The Internet Archive's crawler mostly passes (§2: 4 of 5 robots captures in 2026 got 200).
- **Searches** for "captcha.distinct.ro" and the Distinct traffic filter returned nothing relevant — [search result example](https://docs.prosopo.io/en/advanced/traffic-filter/) (unrelated vendor).
- **Founder action:** email captcha@distinct.ro and evoMAG, quoting PretoscopBot's UA, bot page, fixed IPs, PTR and rate (≤1 request per 5 s). Ask for (a) a whitelist entry and (b) whether Distinct's filter honours rDNS or IP lists. Ask Distinct which other shops use the filter.

### Inferences
- **Crowdsourcing price capture is established Romanian prior art (I).** Istoric Preturi's design reads prices in the user's own browser and declares "Website content". It sidesteps server-side blocks but processes page content and visited URLs, and it falls under eMAG's affiliate exclusion of "plugin-uri de browsere" (round 1).
- **A Pretoscop extension needs care (I).** It would need explicit consent, a precise CWS disclosure and a legal view on retailers' terms. Pret Alert's half-built Flanco report path shows competitors weighing the same trade-off.
- **Pricy's per-shop selector list (926 shops) is a market signal (I):** comparators index hundreds of mid-sized shops. Pretoscop's long tail can come from feeds plus polite crawling of open shops.

### Gaps
- GitHub code search for internal endpoints (`sapi.emag.ro`, `fenrir.altex.ro`): NOT PUBLIC without a login. **Founder action:** run GitHub code search while logged in, if needed.
- PyPI keyword search sits behind a Fastly JavaScript challenge: NOT PUBLIC for automated clients. **Founder action:** search pypi.org in a browser for "emag", "altex", "romania price".
- Reddit full-text search was unavailable (archive API timeouts).

---

## 7. Common Crawl status codes (CC-MAIN-2026-39, retried at host level and in CC-MAIN-2026-43)

### Takeaway
- **CCBot gets mostly 200s from Hornbach (97% on www) and OLX (82%),** even though both block unknown clients at the edge. This repeats round 1's Akamai pattern: identified bots are let through.
- **CCBot is mostly refused or absent at:** Flanco (robots disallows CCBot; 2 captures), PC Garage (robots disallows CCBot; 4 of 5 www captures are 403), Dr. Max, Cărturești, Noriel (54 of 64 403), Notino, Leroy Merlin's www (85 of 100 403) and Decathlon's www (103 of 130 403).
- **cel.ro's www host has no captures at all;** only `stiri.cel.ro` is crawled. iStyle is 429-throttled (11 of 23).

### Cited Findings
**Status: CLOSED** (12 of 12 shops answered; 4 needed a host-level retry or CC-43). Query pattern: `https://index.commoncrawl.org/CC-MAIN-2026-39-index?url=<domain>&matchType=domain&output=json&limit=2500&fl=url,status,mime,timestamp`; host-level retries used `matchType=host`. Run 2026-10-27 17:56–18:10Z.

| Shop | CC-MAIN-2026-39 (by host: count {status}) | Retry / CC-MAIN-2026-43 | Reading (I) |
|---|---|---|---|
| Flanco | domain query: 504 ×3; host `www.flanco.ro`: 2 {403:1, 301:1} | CC-43: 2 {403:1, 301:1} | robots disallows CCBot; nearly absent |
| PC Garage | www 5 {403:4, 301:1}; blog 289 {200:255, 302:21, 304:13}; task 1 {403} | — | robots disallows CCBot; the shop host refuses |
| cel.ro | domain: 504 ×3; host `www.cel.ro`: **no captures (404)** | CC-43: `stiri.cel.ro` 197 {200:196}, `api-mp.cel.ro` 1 {200} | the shop host is not crawled at all |
| iStyle | `istyle.ro` 23 {**429:11**, 200:8, 404:2, 500:2}; www 4 {301:3, 400:1} | — | rate-limited by Shopify/Cloudflare |
| Notino | domain: 504 ×3; host `www.notino.ro`: 20 {403:18, 200:2}; apex 5 {301} | CC-43: www 71 {403:60, 200:11}; career 157; partner 47 | mostly refused |
| Dr. Max | www 6 {403}, apex 1 {403}, backend 1 {403} | — | refused |
| Noriel | domain: 504 ×3; host query: `noriel.ro` 64 {**403:54**, 200:10}, www 13 {301:7, 403:6} | CC-43: no captures | mostly refused |
| Cărturești | apex 2 {403}; blog 6 {403:3, 301:3}; librarie 4 {301:2, 403:2} | — | refused |
| Leroy Merlin | www 100 {**403:85**, 200:15}; job 24 {200:23} | — | refused (DataDome) |
| Hornbach | www **1,838 {200:1,783**, 301:29, 404:26}; media 101 {200} | — | **CCBot served**, despite our "Client Challenge" |
| Decathlon | www 130 {**403:103**, 200:17, 404:8}; sfaturi 217 {200:183}; support 76 {200} | — | the shop host refuses CCBot (Cloudflare) |
| OLX | www **2,500 (query limit) {200:2,038**, 410:355, 404:55, 301:51} | — | **CCBot served**, despite our CloudFront 403; 410s are expired ads |

### Inferences
- **Hornbach and OLX allowlist known bots (I).** They block an unknown honest bot at the edge but serve a reputable known crawler (CCBot, which uses dedicated IP ranges with rDNS). Ask them directly for allowlisting; the route is verified-bot or allowlist status.
- **Shops whose robots or edge refuse CCBot as well (I).** Flanco, PC Garage, Dr. Max, Cărturești, Noriel, Notino and Decathlon refuse CCBot too, which is consistent with Cloudflare "block AI crawlers" settings or explicit robots rules. Allowlisting there needs a per-shop conversation, not just bot verification.

### Gaps
- None for the assigned list. CC-43 values are given only where CC-39 needed a retry.

---

## 8. Summary table of all gaps in this cluster

| # | Gap (source) | Status | Finding (short) | Founder action if not closed |
|---|---|---|---|---|
| 1 | No browser-like comparison on blocked domains (recon §1) | PARTIAL (not tested by policy) | Archive copies show identified crawlers get real HTML at Altex, Media Galaxy, PC Garage, evoMAG and Flanco; CEL challenges even the Internet Archive and serves decoy JSON-LD | None; do not test impersonation |
| 2 | UK-only vantage; CEL timeout (recon §1, bot §5) | PARTIAL | CEL still TCP-times out (17:47Z); no ASN-specific block reports found | Test from a Bucharest VPS, Hetzner and an RO residential line (1 robots request per shop each) |
| 3 | Content fields of Altex, Media Galaxy, Flanco and PC Garage unknown (recon §1) | CLOSED | Altex/Media Galaxy: 48 products with EAN in `__NEXT_DATA__`; PC Garage: JSON-LD ItemList; Flanco: GA4 items with MPN | — |
| 4 | Product URL not found for EuroGSM (recon §1) | PARTIAL | Both declared EuroGSM sitemaps are the same 24 content URLs; no product sitemap. Petmart and Vivre not re-checked | Ask EuroGSM for a feed |
| 5 | Child sitemaps: URLs per file and lastmod (recon §1/§3) | CLOSED | See the §4 table (9 shops); only Elefant has real per-URL lastmod | — |
| 6 | eMAG "Alte oferte" in HTML (recon §1) | CLOSED | dataLayer `secondary_offers` (vendor, offer id, price); widget is client-side | — |
| 7 | Platforms of Altex, Media Galaxy, PC Garage, evoMAG and CEL (recon §2) | CLOSED | Magento+Next.js ×2, custom PHP, Yii, Zen Cart-derived; Flanco Magento 2 | — |
| 8 | Product counts: Altex, Flanco, PC Garage (recon §3) | PARTIAL | Altex ≈0.48–0.73M (estimate; files of 3,724, 29,321 and 228,270 measured); PC Garage index of 1,419 children (2024); Flanco unknown | Flanco: ask for sitemap or feed |
| 9 | SSR prices on listings of blocked shops (recon §3) | CLOSED | Yes at all six | — |
| 10 | r/programare and blog write-ups (recon §7) | PARTIAL | General IP-ban and legality threads; nothing shop- or ASN-specific | — |
| 11 | CWS data-collection disclosures (recon §7) | CLOSED | Istoric Preturi: website content (uploads price data); Pricy: URLs; Pret Alert: web history | — |
| 12 | Altex full terms text (bot §3) | CLOSED | 2026-05-19 snapshot; general IP clause only | Re-check live text in a browser before launch |
| 13 | Flanco full terms text, 2026 (bot §3, company §5) | NOT PUBLIC | New URL `/termene-si-conditii` never archived; live page challenged | Save a browser PDF of the page |
| 14 | eMAG English T&C (bot §3) | NOT PUBLIC | No archived `/help/terms*` or `/info/terms*`; Romanian text only | None needed |
| 15 | eMAG partner crawler guidance / Marketplace docs (bot §3) | NOT PUBLIC | No archived `marketplace-api.emag.ro/api-doc`; eMAG request cap reached | Read the Marketplace docs in a browser; ask eMAG partner support whether a comparator feed or crawl agreement exists |
| 16 | Repo licences and working status (bot §4) | CLOSED / PARTIAL | 81 of 107 unlicensed; bf-price-monitor live run logged | — |
| 17 | eMAG rate thresholds in repos (bot §4) | CLOSED | None documented | — |
| 18 | GitHub code search (bot §4) | NOT PUBLIC | Needs login | Run a logged-in code search if needed |
| 19 | PyPI keyword search (bot §4) | NOT PUBLIC | Fastly JavaScript challenge | Search in a browser |
| 20 | Hetzner/OVH/DO/RO IP tests and forum reports (bot §5) | NOT PUBLIC | No public reports; Pret Alert's code says Flanco blocks its server | See #2 |
| 21 | Bucharest VPS GeoIP, PTR, M247 reputation; Digi/Hostico/Zitec prices (bot §5) | OPEN (not attempted; outside priorities 1–7) | — | Buy a test VPS; check ipinfo and MaxMind; request quotes |
| 22 | evoMAG feed field list (bot §6) | NOT PUBLIC | Needs a 2P affiliate login | Open a 2P affiliate account; download one feed |
| 23 | Written evoMAG position on comparators and price history (bot §6) | PARTIAL | 2P page silent; terms: "reproducerea … numai cu acordul sursei"; old Profitshare: Google Shopping with consent | Message evoMAG via 2P |
| 24 | Distinct filter policy and other shops behind it (bot §6) | NOT PUBLIC | Captcha FAQ only; dated client list | Email captcha@distinct.ro (see §6) |
| 25 | eMAG middle files / 5,000 cap (bot §7) | CLOSED | Archived files of 4,995 and 5,000 URLs | — |
| 26 | eMAG offers-latest and offers-unavailable index sizes (bot §7) | CLOSED | 9 and 27 children; unavailable was 3,991 in January 2026 | — |
| 27 | eMAG file shrink/split; variant mapping (bot §7) | PARTIAL | Unavailable index shrank 3,991 → 27; variants unresolved | — |
| 28 | PC Garage terms (company §5) | CLOSED | Buyer-only; Art. 6 non-disclosure and trademark clause | — |
| 29 | Fashion Days terms (company §5) | CLOSED | Robot ban 4.2(j); prices in Content; 6.2 republication ban | — |
| 30 | OLX terms (company §5) | NOT PUBLIC | Salesforce JavaScript shell in all archives | Save a browser PDF (see §1) |
| 31 | Robots of these sites not re-checked (company §5) | CLOSED | Altex, Media Galaxy, PC Garage (2025), iStyle, CEL, evoMAG, Fashion Days (Mar 2026), OLX | Live PC Garage robots: open in a browser |
| 32 | Terms: Media Galaxy, cel.ro, evoMAG, Vexio, iStyle, EuroGSM (task P1) | CLOSED | See §1 | — |
| 33 | Affiliate rule texts: F64, GSMnet, spy-shop, bitmi, conectica, a2t, Profitshare IT&C, evoMAG, Vexio (task P5) | CLOSED | See §5 | — |
| 34 | Decathlon closure notice (P5) | CLOSED | "…se va închide începând cu data de 31.10.2026" | — |
| 35 | Flanco 2P closure date (affiliate notes; P5) | CLOSED | "…SE VA ÎNCHIDE ÎNCEPÂND CU DATA DE 29.06.2026" (Wayback 2026-06-15) | — |
| 36 | Any program allowing or forbidding "istoric prețuri" (P5) | CLOSED | 0 of 378 2P programs mention it; only Fashion Days (Profitshare) forbids it | — |
| 37 | Common Crawl CC-39 for 12 shops (P7) | CLOSED | See §7 | — |
| 38 | Profitshare unlabelled figures (affiliate notes, bonus) | CLOSED | Approval rate, approval period, no-phone flag, feed flag; Vexio has feeds | — |

---

## 9. Appendix — request log (retailer domains) and other traffic

### Takeaway
14 direct requests to 12 retailer domains, at most 2 per domain. Same-domain requests were at least 85 s apart (eMAG) and 26 minutes apart (EuroGSM). No retries or challenge handling. All used curl 8.7.1 with UA `Mozilla/5.0 (compatible; PretoscopResearch/0.1; +mailto:rotariu.daniel.paul@gmail.com)` and `Accept-Language: ro-RO,ro;q=0.9,en;q=0.5`, from the same vantage as round 1 (London, AS5631).

### Cited Findings
| # | UTC start | Domain | URL | Result | Bytes (wire / decoded) | Key headers |
|---|---|---|---|---|---|---|
| 1 | 2026-10-27T17:47:30Z | dedeman.ro | https://www.dedeman.ro/media/sitemap/sitemap-products0.xml | 200 | 688,631 / 10,493,021 | server: nginx; text/xml; x-cache: MISS |
| 2 | 2026-10-27T17:47:31Z | libris.ro | https://www.libris.ro/sitemap-carte.xml?nofilename=on&page=1 | 200 | 81,712 / 326,119 | server: Jetty(12.0.35) |
| 3 | 2026-10-27T17:47:35Z | elefant.ro | https://www.elefant.ro/sitemap-product-sitemapRO-0 | 200 | 9,407,321 (application/x-gzip body) | server: cloudflare |
| 4 | 2026-10-27T17:47:35Z | bonami.ro | https://www.bonami.ro/sitemap/product_0.xml | 200 | 610,434 / 10,237,939 | server: openresty |
| 5 | 2026-10-27T17:47:36Z | carrefour.ro | https://carrefour.ro/pub/sitemap/sitemap_001.xml | 200 | 619,479 / 8,962,379 | server: cloudflare |
| 6 | 2026-10-27T17:47:36Z | auchan.ro | https://www.auchan.ro/sitemap/product-0.xml | 200 | 6,186 / 84,414 | x-cache: Miss from cloudfront |
| 7 | 2026-10-27T17:47:37Z | itgalaxy.ro | https://www.itgalaxy.ro/data/sitemaps/products-0.xml | 200 | 436,817 / 2,708,230 | server: nginx |
| 8 | 2026-10-27T17:47:37Z | forit.ro | https://www.forit.ro/sitemap_30000.xml | 200 | 1,042,822 / 16,660,205 | server: cloudflare |
| 9 | 2026-10-27T17:47:38Z | emag.ro | https://www.emag.ro/sitemaps/offers-latest-index.xml | 200 | 310 / 1,618 | server: nginx; x-cache: Miss from cloudfront |
| 10 | 2026-10-27T17:47:38Z | eurogsm.ro | https://eurogsm.ro/termeni-si-conditii | 200 | 46,611 / 267,049 | server: Apache |
| 11 | 2026-10-27T17:47:38Z | pcgarage.ro | https://www.pcgarage.ro/robots.txt | **403** | 3,265 / 5,596 | server: cloudflare; **cf-mitigated: challenge** (stopped) |
| 12 | 2026-10-27T17:47:38Z | cel.ro | https://www.cel.ro/robots.txt | **No response** (curl 28, connect timeout 45 s) | 0 | — (stopped) |
| 13 | 2026-10-27T17:49:03Z | emag.ro | https://www.emag.ro/sitemaps/offers-unavailable-index.xml | 200 | 375 / 4,200 | server: nginx; x-cache: Miss from cloudfront |
| 14 | 2026-10-27T18:14:28Z | eurogsm.ro | https://eurogsm.ro/sitemap | 200 | 664 / 2,231 | server: Apache |

**Non-retailer requests** (same UA unless noted):
- web.archive.org: 124 CDX and raw-snapshot requests (108 × 200, 6 × 503 "Temporarily Offline", 9 timeouts, 1 × 302).
- index.commoncrawl.org: 36 (14 × 200, 15 × 504, 4 × 502, 2 × 404, 1 × 400).
- arctic-shift.photon-reddit.com: 14 (several 422 "Timeout").
- profitshare.ro: 8 program pages.
- clients2.google.com: 3 CRX downloads.
- distinct.ro: 2.
- 9 web searches.

**Not contacted:** altex.ro, mediagalaxy.ro, flanco.ro, fashiondays.ro, olx.ro, publi24.ro, evomag.ro, vexio.ro, istyle.ro, flip.ro, notino.ro, drmax.ro, noriel.ro, carturesti.ro, leroymerlin.ro, hornbach.ro and decathlon.ro; their evidence came from archives. Machine-readable log: `/private/tmp/claude-501/-Users-rotariudanielpaul-Documents-CodingBusiness-Pretoscop/99deaed1-462b-4d3a-b452-53223b56dce1/scratchpad/gaps2/requests_log.jsonl`. Raw bodies and headers are in the `out/` subfolders of the same `gaps2` directory.

### Inferences
- **Protocol deviation:** requests to different retailer domains ran back-to-back (one sequential stream). The 5 s spacing rule was applied per domain, as instructed.

### Gaps
- None.
