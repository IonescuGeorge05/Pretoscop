# Email către magazine: cerere de feed de produse

Pentru departamentul de e-commerce / marketing online al magazinului (PC Garage, Flanco, Altex, cel.ro, QuickMobile etc.).
Înlocuiește `[...]`. Variantă scurtă, de trimis prin formularul de contact sau pe adresa de parteneriate.

---

**Subiect:** Listare gratuită în comparatorul de prețuri [Pretoscop] – feed de produse

Bună ziua,

Mă numesc [Nume Prenume] și dezvolt **[Pretoscop]**, un comparator de prețuri pentru electronice din România, momentan în fază de prototip. Comparăm prețul final real (preț + transport + garanție), afișăm istoricul de preț și semnalăm reducerile reale.

Am dori să includem produsele [magazin.ro], începând cu consolele PlayStation 5 și telefoanele iPhone 18 Pro. Fiecare ofertă trimite cumpărătorul direct pe pagina produsului de pe [magazin.ro].

Pentru că respectăm protecțiile site-ului dumneavoastră, nu colectăm automat date de pe paginile [magazin.ro]. De aceea vă întreb dacă ne puteți oferi **link-ul unui feed de produse** (XML sau CSV). Dacă aveți deja un feed pentru compari.ro sau Google Merchant, îl putem folosi exact așa cum este. Ne ajută câmpurile: denumire, URL, preț (și preț vechi, dacă există), stoc, EAN.

Ce oferim:
- listare gratuită, cu link direct către produsele dumneavoastră;
- actualizare a prețurilor o dată pe zi (sau cum preferați), fără încărcare suplimentară a site-ului;
- dacă aveți un program de afiliere, folosim link-urile de afiliere ale programului.

Puteți vedea prototipul aici: [link GitHub Pages]. Rămân disponibil pentru orice detalii.

Cu stimă,
[Nume Prenume]
[telefon] · [email]

---

## Note

- **Cui:** caută pe site „Parteneriate”, „Marketing”, „Contact companie” sau „Afiliere”. Pe LinkedIn, „E-commerce Manager” sau „Online Marketing Manager” la magazinul respectiv.
- **Ce faci cu răspunsul:** pui link-ul în `backend/app/seed/shops.yaml` la magazin (`feed: {url: ..., explicit_permission: true}`) și repornești `api` și `worker`. Dacă primești un fișier, îl încarci în `/admin` → „Import feed de la magazin”.
- **eMAG:** nu îl contacta pentru afiliere. Programul lor interzice comparatoarele; eMAG rămâne prin scraping (permis de robots.txt), fără link de afiliere.
