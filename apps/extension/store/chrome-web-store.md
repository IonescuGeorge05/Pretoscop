# Chrome Web Store listing (draft, M26)

Texts to paste into the Developer Dashboard once the account exists (human task D1). Listing in
Romanian; the privacy-practices answers follow what the code does (`apps/extension/README.md`). Keep
them in step with the code and with `/confidentialitate#extensie`: a mismatch is a rejection reason.

## Store listing

- **Name** (≤ 75): `Pretoscop – istoricul prețului`
- **Summary** (≤ 132): `Istoricul prețului și cel mai mic preț total din alte magazine, direct pe paginile de produs eMAG, Altex, Flanco, PC Garage și evoMAG.`
- **Category**: Shopping. **Language**: Romanian.
- **Description**:

> Deschizi un produs pe eMAG, Altex, Flanco, PC Garage sau evoMAG și vrei să știi dacă prețul e bun?
> Pretoscop îți arată, într-un panou mic în colțul paginii:
>
> • cel mai mic preț total de acum (preț + livrare cunoscută) și magazinul care îl are;
> • istoricul prețului observat de Pretoscop, zi de zi (zilele fără observații rămân goale: nu
>   inventăm prețuri);
> • minimul din ultimele 30 de zile, minimul istoric și mediana pe 30 de zile;
> • o evaluare simplă: „Preț bun”, „Preț obișnuit”, „Peste obișnuit” sau „Istoric insuficient”
>   (sub 14 zile de observații);
> • reducerile verificate de noi, față de prețurile pe care le-am observat noi, nu față de prețul
>   tăiat afișat de magazin;
> • un link către pagina produsului pe Pretoscop, cu toate ofertele.
>
> Ce nu face: nu schimbă paginile și linkurile magazinelor, nu adaugă coduri de afiliere, nu
> citește coșul sau contul tău, nu are reclame și nu trimite statistici despre tine.
>
> Ce trimite: doar pe paginile de produs ale acestor cinci magazine, adresa paginii (fără
> parametri) și codurile produsului din pagină (EAN, marca și codul producătorului), ca să găsim
> produsul la noi. Pe alte pagini nu trimite nimic. Detalii: https://pretoscop.ro/confidentialitate#extensie
>
> Prețul final este cel afișat de magazin la plasarea comenzii.

- **Screenshots** (1280×800): the panel on an eMAG product page with a verified drop; the panel with
  "Istoric insuficient". Take them from the local e2e set-up or a real page; never show personal
  data (account name, cart).
- **Icon**: `apps/extension/icons/icon-128.png`.
- **Official URL / support**: https://pretoscop.ro, https://pretoscop.ro/contact

## Privacy practices tab

- **Single purpose**: "Shows Pretoscop's price history and the lowest total price at other shops on
  the product page of a supported Romanian shop that the user has open."
- **Permission justification**: the extension requests no permissions. Content scripts run only on
  `www.emag.ro`, `altex.ro`/`www.altex.ro`, `www.flanco.ro`, `www.pcgarage.ro` and `www.evomag.ro`, to
  recognise a product page and show the panel there. Remote code: none (all code is in the package).
- **Data collected** (tick exactly these): *Website content* (product identifiers read from the
  open product page: GTIN, brand, manufacturer part number) and *Web history* (the address of that
  product page, without query or fragment). Nothing else: no personally identifiable information,
  health, financial, authentication, personal communications, location or user activity data.
- **Certifications** (all three): not sold or transferred to third parties outside the approved
  use; not used or transferred for purposes unrelated to the single purpose; not used or
  transferred to determine creditworthiness or for lending.
- **Privacy policy URL**: https://pretoscop.ro/confidentialitate#extensie

## Before submitting

- `pnpm --filter @pretoscop/db ext:resolution emag altex` above 70 % on the production database
  (release gate, docs/13 X2); flag `extension.lookup.enabled` on in production.
- Bump `apps/extension/package.json` `version`, build (`pnpm --filter @pretoscop/extension build`), zip
  the *contents* of `dist/chrome`.
- Run `scripts/verify/M26.checklist.md` on the zip loaded unpacked.
