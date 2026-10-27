# Pretoscop — prototip comparator de prețuri (PlayStation 5, iPhone 18 Pro)

> Numele e de lucru și se schimbă dintr-un singur loc: `APP_NAME` / `APP_SLUG` în `.env`
> (UI, title/meta, User-Agent-ul scraperului, numele containerelor).

Comparator de prețuri IT&C pentru România. Prototipul acoperă un singur produs — PlayStation 5, toate cele 5 modele — și are:

- **preț final real** = preț + transport + penalizare pentru garanție mai scurtă (anunțurile fără garanție nu sunt penalizate, ci marcate vizibil „Fără garanție”);
- **istoric de preț** pe zile sau săptămâni, cu perioadele de reduceri marcate (Black Friday, 11.11, Crăciun, Paște, back-to-school);
- **detectarea reducerilor false**;
- **recomandare** (Cumpără acum / Urmează o reducere / Așteaptă / Preț obișnuit / Date insuficiente) explicată cu cifre;
- câmpul `affiliate_url` pregătit pentru monetizare.

## Pornire

```bash
cp .env.example .env      # opțional: fără .env merg valorile implicite din docker-compose.yml
docker compose up --build
```

- UI: http://localhost:3000
- API + documentație OpenAPI: http://localhost:8000/docs

La pornire, serviciul `api` rulează migrațiile Alembic, încarcă `models.yaml` și `shops.yaml` și generează istoricul demo (doar dacă lipsește sau nu e generat azi). Serviciul `worker` pornește scraperii reali la 1–10 minute după start, apoi la fiecare 6 ore, cu jitter aleator.

| Serviciu | Rol |
|---|---|
| `db` | PostgreSQL 16 |
| `api` | FastAPI (`backend/app`) |
| `worker` | APScheduler + scraperi (`backend/app/worker.py`) |
| `web` | Next.js (App Router, SSR) |

## Date demo (`--mock`)

```bash
docker compose exec api python -m app.seed.mock_history   # regenerează istoricul pe 12 luni
```

Generează 365 de zile pentru 5 modele × 5 magazine. Ofertele au `source = "mock"`, iar UI-ul afișează bannerul **„Date demo”**. Datele mock și cele reale nu se amestecă niciodată în aceeași ofertă. UI-ul arată implicit sursa din `DATA_MODE` (`mock` sau `real`); o poți schimba per pagină cu `?source=real` / `?source=mock` (există link și în banner).

Scenarii incluse intenționat:

| Unde | Ce vezi |
|---|---|
| PS5 Slim Digital @ Flanco | **reducere falsă**: preț urcat cu ~13% cu 3 săptămâni înainte de „-12%”. Apare alertă roșie și eticheta în tabel. |
| evoMAG (toate modelele) | cel mai mic preț afișat, dar **garanție 12 luni** → pierde la preț final |
| PC Garage (toate modelele) | preț afișat puțin mai mic, dar **transport plătit** → pierde la preț final |
| PS5 Digital 825 GB | promoție curentă la eMAG → **Cumpără acum** |
| Pro / Slim Disc / Disc 825 GB | prețuri urcate înainte de Black Friday → **Urmează o reducere** |
| PS5 Slim Digital | **Preț obișnuit** |

Bifează două oferte în tabel ca să vezi comparatorul side-by-side (ex.: eMAG vs evoMAG).

## Site public (GitHub Pages)

O copie **statică** a site-ului, cu datele reale din baza locală, se publică pe GitHub Pages:

```bash
bash scripts/publish-pages.sh        # din Git Bash, cu stack-ul pornit
```

Scriptul:
1. exportă datele din API în JSON (`app.services.snapshot`);
2. construiește frontend-ul în mod static (`STATIC_EXPORT=1`), cu `basePath` = numele repo-ului;
3. publică rezultatul pe branch-ul `gh-pages`.

Prima dată, în GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `gh-pages` / `(root)`**.

Diferențe față de aplicația locală:
- datele sunt cele de la ultima publicare;
- comparatorul calculează în browser;
- „Mergi la magazin” duce direct la magazin, fără logarea click-ului;
- `/admin` nu există.

Site-ul are `noindex` (nu apare în Google) până la lansare. Îl scoți cu `NOINDEX=0 bash scripts/publish-pages.sh`. Datele se actualizează doar când rulezi scriptul, de exemplu zilnic, cu o sarcină programată în Windows.

## Feed-uri de produse (magazine / afiliere)

Magazinele pot fi citite dintr-un **feed XML/CSV** în loc de scraping. Formatele compari.ro, Google Merchant și 2Performant/Profitshare sunt recunoscute automat (`backend/scrapers/feeds.py`).

- **Link permanent:** în `shops.yaml`, la magazin: `feed: {url: ..., vat_included: true, explicit_permission: true}`. Worker-ul îl citește la fiecare rulare și are prioritate față de scraping.
- **Fișier primit pe email:** `/admin` → „Import feed de la magazin”, sau `python -m app.services.feed_import --shop pcgarage --file feed.xml`.
- **Link-uri de afiliere** din feed (`aff_link`) se folosesc automat la „Mergi la magazin”.
- Email-șablon pentru magazine: [`docs/email-magazine.md`](docs/email-magazine.md).

Ce știm (10.2026) despre programele de afiliere relevante:
- **eMAG** (Profitshare) interzice comparatoarele, deci rămâne prin scraping, fără link de afiliere.
- **evoMAG** (2Performant) are peste 15 feed-uri.
- **PC Garage** e inactiv pe Profitshare.
- **Flanco** și **Altex** și-au închis programele.
- **QuickMobile**, **EuroGSM**, **cel.ro** și **Vexio** au programe; de verificat regulile fiecăruia.

## Teste

```bash
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # Linux/macOS: .venv/bin/pip
.venv/Scripts/python -m pytest
# sau în container:
docker compose exec api pytest
```

Testele acoperă:

- `pricing`: inclusiv exemplul obligatoriu 3 499 / 24 luni vs 3 449 + 29,99 / 12 luni;
- `recommender`: `INSUFFICIENT_DATA`, `BUY_NOW`, `UPCOMING_SALE` cu și fără istoric de eveniment, reducere falsă pe ambele reguli;
- `matcher`: 23 de titluri, majoritatea reale (eMAG, Flanco, PC Garage, evoMAG), cu capcane: pachete, Digital vs Disc, accesorii cu „PS5” în titlu, resigilate;
- extragerea JSON-LD / microdata / OpenGraph;
- scrierea în DB doar la schimbare de preț (pe SQLite).

## Scraping

**Principii.** Scraperul respectă `robots.txt`, face cel mult 1 cerere la 3–5 s per domeniu și folosește un User-Agent onest, cu contact (`SCRAPER_CONTACT`; **pune o adresă reală**). Are timeout-uri și retry cu backoff. Fiecare magazin rulează izolat: dacă unul cade, restul continuă. Logurile sunt JSON (magazin, URL, status, durată, număr de produse).

**Extragerea** se face în ordine: (1) JSON-LD `schema.org/Product`, iar dacă lipsește, microdata `itemprop` cu Product; (2) OpenGraph; (3) selectori CSS ai magazinului.

**Blocare.** La 403, Cloudflare/Akamai sau CAPTCHA, magazinul se marchează `blocked` și scraperul trece mai departe. **Nu ocolim protecțiile.** Worker-ul sare peste magazinele blocate; le reîncerci manual cu endpointul de admin.

Starea magazinelor, testată pe 25.10.2026 cu clientul `httpx` al aplicației:

| Magazin | Stare | Detalii |
|---|---|---|
| eMAG | ✅ funcționează | JSON-LD. Unele oferte sunt de la selleri din marketplace. |
| evoMAG | ✅ funcționează | microdata; EAN (gtin) extras automat |
| PC Garage | ⛔ blocat | Cloudflare 403 pentru clientul httpx (JSON-LD-ul e curat, ar fi primul candidat dacă permit accesul) |
| Flanco | ⛔ blocat | Cloudflare 403 |
| Altex | ⛔ blocat | Akamai 403; listarea e randată client-side |
| Flip (refurbished) | ✅ funcționează | URL-uri din sitemap; toate gradele estetice dintr-o pagină (`__NEXT_DATA__`) |
| Anze, PremiumAV, Dwyn Shop | ✅ funcționează | **scraper generic pe sitemap** (Gomag / WooCommerce), fără cod dedicat |
| Buy2Play, iSTYLE | ⏳ limitează temporar (429) | candidați pentru scraperul generic; de reîncercat |
| PC One, Vexio, GSMnet, Media Galaxy, AV Store, QuickMobile | ⛔ blocat (403/503) | candidați pentru emailul cu cererea de feed |
| Publi24 (second hand) | ✅ funcționează | caută „ps5”, „playstation 5”, „playstation5” în categoria Console, câte 3 pagini; titlu, preț, locație, dată din cardurile listei |
| OLX (second hand) | ⛔ blocat automat | CloudFront 403 pentru clientul aplicației, chiar și la `robots.txt`. Caută „ps5”, „playstation 5”, „playstation5” și reține locația; până la un acord cu OLX se folosește **importul manual** din `/admin` |

**Prețul tăiat.** eMAG îl pune într-un obiect JSON din pagină. Dacă există o reducere, e „cel mai mic preț din ultimele 30 de zile” (directiva UE Omnibus); altfel e prețul inițial. La evoMAG apare doar vizual (selector CSS, de verificat pe un produs redus).

**Marketplace.** La eMAG, JSON-LD-ul spune cine vinde efectiv oferta (`seller`). Ofertele de la terți apar în tabel cu eticheta „Marketplace · vânzător”, dar **nu intră** în minimul pieței, în grafic și în recomandare: prețurile resellerilor ar distorsiona istoricul.

**Refurbished și second hand.** Magazinele au `kind: refurbished | secondhand` în `shops.yaml`. Ofertele lor apar în secțiuni separate pe pagina modelului, nu în comparația principală.

**robots.txt.** Folosim un parser propriu conform RFC 9309 (`scrapers/robots.py`). `urllib.robotparser` din Python nu înțelege `*`/`$` și taie `?` final; de exemplu, transforma `Disallow: /anunturi/?` de la Publi24 în „totul interzis”.

**Anunțuri suspecte.** Un anunț second hand / refurbished sub 40% din MSRP e marcat „preț suspect de mic” (posibil țeapă, defect sau greșeală) și nu intră în prețul „de la”. Anunțurile „Cumpăr…”, „Colectez…” și serviciile (curățare, reparații) sunt ignorate.

**Alerte OLX pe email (automat).** Pe olx.ro salvezi căutările (de ex. „ps5”, „iphone 18 pro”) cu notificări pe email, apoi completezi `IMAP_USER` și `IMAP_PASSWORD` în `.env`. La Gmail, parola e o „parolă pentru aplicații”, creată din contul Google după activarea verificării în 2 pași. Worker-ul citește la 30 de minute emailurile necitite de la OLX, extrage anunțurile și le marchează citite. Nu se face nicio cerere către OLX. Formatul emailurilor nu e documentat: parserul caută generic linkurile spre anunțuri și prețul de lângă ele, deci poate avea nevoie de ajustări după primul email real.

**Căutare web (Brave Search API, opțional).** Cu `BRAVE_API_KEY` în `.env`, worker-ul face două lucruri:
- **la 12 ore**, caută anunțuri OLX în indexul motorului de căutare. Nu accesăm OLX; păstrăm doar anunțurile individuale cu preț și mai noi de 30 de zile. E un supliment: rezultatele pot fi vechi sau incomplete.
- **săptămânal**, descoperă magazine: caută produsele urmărite și listează în `/admin` domeniile `.ro` noi. Butonul „Verifică” testează pentru fiecare robots.txt, sitemap și datele structurate de pe pagina de produs.

Brave are un credit lunar gratuit de ~1 000 de căutări, cere card și menționarea Brave pe site. Google Custom Search e închis pentru clienți noi.

`/admin` → „Surse automate” arată dacă emailul și căutarea sunt configurate. Are butoane de test și de rulare imediată.

**Import manual OLX.** În `/admin` încarci o pagină de rezultate OLX salvată din browser (Ctrl+S → „Pagină web, doar HTML”). Aplicația nu face nicio cerere către OLX; anunțurile trec prin același matcher ca la scraping (`ingest_offers`). Anunțurile neimportate din nou dispar după 3 zile, ca să nu rămână în listă unele deja vândute.

**Asocieri manuale.** Pagina http://localhost:3000/admin listează anunțurile ajunse la `unmatched`. Te autentifici cu `ADMIN_TOKEN` din `.env`. Alegi modelul și apeși „Asociază”: oferta apare imediat, iar asocierea e salvată în `manual_matches` și are prioritate la scrape-urile următoare. „Ignoră” scoate anunțul definitiv.

**Scrape manual:**

```bash
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" "http://localhost:8000/api/admin/scrape?shop=emag"
docker compose exec api python -m app.services.scrape_runner --shop evomag   # sincron, cu log
```

**Product matching** (`backend/scrapers/matcher.py`) merge în ordinea: EAN exact → MPN/cod de model unic (`CFI-7xxx` → Pro) → reguli pe titlu. Ce nu e clar ajunge în tabelul `unmatched_listings`, pentru review manual. Pachetele primesc `is_bundle = true` și apar separat, în secțiunea „Pachete”. Produsele resigilate, refurbished sau second hand sunt excluse, iar accesoriile sunt ignorate.

## API

| Endpoint | Descriere |
|---|---|
| `GET /api/products` | modelele, cu cel mai bun preț final și badge-ul de recomandare |
| `GET /api/products/{slug}` | detalii, oferte sortate după preț final, pachete, recomandare |
| `GET /api/products/{slug}/history?granularity=day\|week&range=30d\|90d\|1y` | serii per magazin + minim piață, min/median/max, evenimentele din interval |
| `GET /api/compare?offer_a=&offer_b=` | diferențe pe componente, câștigător, explicație |
| `GET /api/out/{offer_id}` | redirect către pagina produsului (`affiliate_url` dacă există) + log în `clicks`. Ofertele demo redirecționează spre pagina reală a produsului la același magazin, dacă scraperul a găsit-o; altfel spre căutare. |
| `POST /api/admin/scrape?shop=` | header `X-Admin-Token`; fără `shop` pornește toate magazinele |

Toate endpointurile de citire acceptă `?source=mock|real`.

## Cum adaugi un magazin

**Varianta rapidă (fără cod)**, pentru magazinele pe platforme standard (Shopify, WooCommerce, Gomag, MerchantPro, PrestaShop), care au sitemap și date structurate de produs:

```yaml
- slug: magazin
  name: Magazin
  base_url: https://www.magazin.ro
  search_url_template: https://www.magazin.ro/cauta?q={query}
  crawl: {type: sitemap, max_products: 40}
  shipping_rules: {free_over: 500, flat: 19.99}
  shipping_verified: false
  default_warranty_months: 24
  affiliate_url_template: null
```

Scraperul generic (`scrapers/sitemap_scraper.py`):
1. citește sitemap-urile din robots.txt;
2. păstrează doar paginile de consolă PS5 și iPhone 18 Pro, fără accesorii;
3. citește fiecare pagină cu extractorii comuni.

În `/admin`, „Magazine descoperite” → „Verifică” arată dacă un magazin se potrivește acestei variante.

**Varianta cu cod**, când magazinul are o structură aparte:

1. Adaugă o intrare în `backend/app/seed/shops.yaml` (fără `crawl`) (slug, URL-uri, `shipping_rules`, garanție, `shipping_verified`).
2. Creează `backend/scrapers/<slug>.py`: o subclasă `BaseScraper` care implementează doar `discover_product_urls()` (pagini de listare + selector CSS pentru linkuri). Dacă pagina de produs nu are JSON-LD, microdata sau OpenGraph, setează `css_title` / `css_price` / `css_old_price`.
3. Înregistreaz-o în `backend/scrapers/registry.py`.
4. `docker compose restart api worker` (seed-ul face upsert după slug). Pentru date demo, adaugă slug-ul și în `SHOP_FACTOR` din `mock_history.py`.

## Familii de produse

| Familie | Produse | URL |
|---|---|---|
| PlayStation 5 | 5 modele (Standard, Digital, Slim Disc, Slim Digital, Pro) | `/ps5/<slug>` |
| iPhone 18 Pro | Pro și Pro Max × 256 GB / 512 GB / 1 TB / 2 TB (8 produse; culorile nu sunt produse separate) | `/iphone-18-pro/<slug>` |

MSRP-ul iPhone vine din prețurile Apple din zona euro (Franța: Pro de la 1 479 €, Pro Max de la 1 629 €) × 5,09 lei/€. Apple nu are magazin oficial în România, deci valorile rămân „estimat”.

**Produse noi pe piață.** Un produs lansat recent se ieftinește de obicei constant, deci prețul de azi e mereu „minimul istoric”. Dacă produsul are sub 90 de zile de istoric și prețul a scăzut cu peste 3% în 30 de zile, fără o reducere afișată, verdictul e „Preț obișnuit”, nu „Cumpără acum”, cu explicația cifrată.

## Cum adaugi un produs nou

1. Adaugă variantele în `backend/app/seed/models.yaml` și familia în `backend/app/seed/families.yaml` (slug pentru URL, titlu, descriere).
2. Matcher (`backend/scrapers/matcher.py`): o funcție `_<familie>(t, allow_used)` care întoarce slug-ul produsului din titlu, plus o ramură în `match_title`. EAN/MPN funcționează deja generic.
3. Scraperi: adaugă pagina de listare a familiei în `listings` / `SEARCHES` la fiecare magazin.
4. Frontend: nimic. Ruta `/[family]/[slug]` și prima pagină se adaptează singure; doar eticheta variantei (`variantLabel` din `lib/format.ts`) poate avea nevoie de un nume nou.

Restul (prețul final, istoricul, recomandările, API-ul) nu depinde de familia de produse.

## Decizii luate (unde specificația era ambiguă)

- **`seed` stă în `backend/app/seed/`**, nu în `backend/seed/`, ca să funcționeze comanda cerută `python -m app.seed.mock_history`.
- **`price_points` primește rând nou și când se schimbă prețul tăiat** (`old_price`), nu doar prețul sau stocul. E necesar ca să se vadă când începe o „reducere”, pentru detectarea reducerilor false.
- **„Slim, 1TB” fără „Digital”/„Disc” rămâne `unmatched`.** eMAG folosește des acest format pentru Slim cu disc, dar specificația cere să nu ghicim. EAN-ul, odată cunoscut, rezolvă potrivirea automat.
- **Slim Digital are în prezent și o revizie de 825 GB** (CFI-2116). Matcher-ul o atribuie la `ps5-slim-digital-1tb` (Slim + Digital, indiferent de stocare). De revizuit dacă vrem un produs separat.
- **SSD-uri neoficiale.** Ofertele cu 2 TB / 3 TB fără „Slim” sau „Pro” sunt console cu SSD upgradat de reseller și ajung la `unmatched`.
- **`model_code`** e un prefix verificat la nivel de generație, cu wildcard `x` (`CFI-2xxx`). Codurile exacte variază pe regiune și nu le-am inventat.
- **Ferestrele de reduceri** din `backend/recommender/calendar.yaml` (Black Friday 2026-11-27 conform specificației, Paște ortodox) sunt marcate „TODO verify”.
- **Recomandarea** pornește de la regula din specificație (peste percentila 70 + eveniment în < 45 de zile → `UPCOMING_SALE`). Am adăugat `WAIT` (peste percentila 90, fără eveniment apropiat) și menționez toate evenimentele din orizontul de 45 de zile, nu doar primul.
- **Ofertele reale** nevăzute de peste 3 zile dispar din tabelul curent; istoricul lor rămâne.
- **Garanția** vine din pagina produsului dacă există (rar). Altfel se folosește default-ul magazinului, cu eticheta „estimat”.

## MSRP

Fiecare produs are `msrp_ron` (preț recomandat de producător), afișat sub titlu, pe carduri și ca linie punctată pe grafic. Recomandarea îl folosește doar ca **context**: nu schimbă verdictul.

Sursa valorilor: prețurile recomandate Sony pentru Europa în vigoare din **2 aprilie 2026** ([PlayStation Blog](https://blog.playstation.com/2026/03/27/new-price-changes-for-ps5-ps5-pro-and-playstation-portal-remote-player/)), convertite la ~5,09 lei/€:

| Model | Preț UE | MSRP |
|---|---|---|
| PS5 cu disc | 649,99 € | 3 309 lei |
| PS5 Digital | 599,99 € | 3 049 lei |
| PS5 Pro | 899,99 € | 4 579 lei |

Sony nu publică un preț separat în lei, deci valorile rămân marcate „estimat”. Modelele originale (CFI-1xxx) nu se mai produc; pentru ele folosim MSRP-ul ediției actuale echivalente.

## Istoric: colectare, goluri și date din trecut

**Goluri.** Fiecare preț salvat are `confirmed_at`, adică ultima dată când scraperul l-a văzut neschimbat. Prețul e considerat valabil până la `confirmed_at` + 1 zi. După aceea, ziua apare ca **gol**: linia se întrerupe pe grafic, iar tooltip-ul spune „fără date”. Nu completăm prin presupuneri. Recomandarea numără doar zilele cu date reale. Pragul e de 14 zile, iar dacă lipsesc zile din ultimele 90 scade încrederea și explică de ce.

**Colectare pe calculatoarele din casă** (fără hosting plătit):

- Docker Desktop → Settings → General → „Start Docker Desktop when you sign in”. Containerele au `restart: unless-stopped`, deci repornesc singure după un restart.
- Worker-ul face primul scrape la 1–10 minute după pornire, apoi la fiecare 6 ore. Cât timp calculatorul e pornit măcar o dată pe zi, istoricul nu are goluri.
- Pentru acoperire maximă, rulează stack-ul pe calculatorul din casă care stă cel mai mult pornit. Nu rula worker-ul pe mai multe calculatoare cu baze de date diferite, pentru că istoricul s-ar împărți între ele.

**Date din trecut (Wayback Machine):**

```bash
docker compose exec api python -m app.services.wayback                 # toate ofertele reale
docker compose exec api python -m app.services.wayback --shop evomag   # un magazin
```

Comanda caută capturile archive.org ale paginilor de produs deja găsite de scraper și le citește cu aceiași extractori. Fiecare captură devine un punct `origin = "wayback"`, valabil doar în ziua capturii. Pe grafic apar ca puncte, iar tooltip-ul le marchează „arhivă”.

Capturile sunt rare (2–6 per pagină în 2 ani), deci dau repere, nu serii zilnice. O captură se păstrează doar dacă titlul arhivat e același model; URL-urile refolosite pentru alt produs sunt ignorate. Comanda se poate rula oricând; capturile deja importate sunt sărite.

## Limitări cunoscute

- Regulile de transport și garanție din `shops.yaml` sunt **placeholdere** (`# TODO verify`). UI-ul arată „estimat” până la `shipping_verified: true`.
- Doar eMAG și evoMAG pot fi colectate acum. Prețul tăiat nu e extras la eMAG/evoMAG (nu apare în JSON-LD/microdata); trebuie selectori CSS dedicați.
- La eMAG, oferta din JSON-LD e a sellerului câștigător, care poate fi un reseller din marketplace, cu preț mult peste cel al eMAG.
- Datele reale abia colectate dau `INSUFFICIENT_DATA` primele 14 zile; e comportamentul corect.
- Worker-ul nu reîncearcă automat magazinele `blocked`.
- Nu există autentificare, alerte, ML, plăți sau reclame (în afara scopului).
- Second hand / refurbished / marketplace: acum sunt excluse; planificate pentru o etapă următoare (secțiune separată, cu `condition` diferit de `new`).

## Viitor: AI / ML / LLM (planificat, neimplementat)

Acum recomandările sunt **reguli** (`backend/recommender/rules.py`), intenționat: sunt verificabile și explicabile. Planul:

1. **ML pentru predicție.** Detaliile sunt mai jos. Are sens după câteva luni de date reale colectate.
2. **LLM pentru explicații și interpretare.** Primește verdictul, metricile și motivele cifrate din reguli și scrie un rezumat natural în română. Nu are voie să inventeze cifre: primește doar `Recommendation.metrics` și `reasons`. Punct de integrare: un serviciu nou lângă `catalog.product_recommendation`, cu rezultatul în cache per produs/zi.
3. **LLM pentru matching.** Titlurile ajunse la `unmatched_listings` sunt clasificate de LLM, cu confirmare manuală înainte de a fi acceptate.

Modelul ML: LightGBM care prezice „prețul minim din următoarele N zile / prețul curent”, cu features din istoric (percentile, volatilitate, zile până la eveniment, scăderi anterioare la evenimente, număr de oferte în stoc, trend). Motorul de reguli rămâne ca baseline și ca sursă de explicații.

## Note legale

Scrapingul respectă robots.txt și limite de ritm. Datele se folosesc doar pentru prețuri publice. Înainte de o lansare publică trebuie verificați Termenii și Condițiile fiecărui magazin și, ideal, consultat un avocat. Pe termen mediu, prioritizează feed-urile oficiale din rețelele de afiliere (2Performant, Profitshare) acolo unde există.
