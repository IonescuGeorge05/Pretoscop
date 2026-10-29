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

---

## Variantă scurtă pentru magazinele de pe compari.ro (PC Garage, Vexio, evoMAG, cel.ro)

Ei trimit deja un feed către compari.ro, deci cererea e mai mică: doar URL-ul.

**Subiect:** URL-ul feed-ului compari.ro pentru [Pretoscop]

Bună ziua,

Dezvolt **[Pretoscop]**, un comparator de prețuri pentru electronice (preț final cu transport, istoric de preț, reduceri verificate). Știu că trimiteți deja un feed de produse către compari.ro: ne puteți da și nouă **același URL**? Îl citim de câteva ori pe zi, fără să mai încărcăm site-ul, iar fiecare ofertă duce direct pe pagina produsului de pe [magazin.ro]. Listarea e gratuită.

Dacă preferați să nu dați feed-ul, o alternativă e să permiteți robotul nostru, PretoscopBot (descris la [link pagina /bot]), în setările de protecție ale site-ului.

Cu stimă,
[Nume Prenume] · [email]

## evoMAG: cerere de deblocare la firma de hosting

Protecția care ne blochează la evoMAG e a furnizorului lor de hosting („Distinct Traffic Filter”), care are o adresă de deblocare: **captcha@distinct.ro**. Se trimite după ce avem IP fix (până atunci IP-ul de acasă se schimbă).

**Subiect:** Cerere de permitere pentru robotul PretoscopBot (evomag.ro)

Bună ziua,

Robotul comparatorului [Pretoscop], **PretoscopBot**, primește CAPTCHA pe evomag.ro de la prima cerere. Citim doar pagini publice de produs, câte o cerere la 3–5 secunde, respectând robots.txt; detalii la [link pagina /bot]. Vă rugăm să permiteți: IP [IP fix], User-Agent `Mozilla/5.0 (compatible; PretoscopBot/0.2; +[link /bot])`.

Mulțumesc,
[Nume Prenume] · [email]

## Atenție la feed-urile din rețelele de afiliere

Termenii 2Performant (§9) interzic folosirea datelor din feed „pentru a crea o bază de date proprie și/sau un serviciu de informare”. Afișarea prețurilor din feed în comparator e permisă, dar **istoricul de preț** construit din feed s-ar putea să nu fie. Înainte să ne bazăm pe istoric din feed-uri 2Performant, cerem acordul lor în scris; până atunci, istoricul vine din paginile magazinului sau din feed-uri primite direct de la magazin.

