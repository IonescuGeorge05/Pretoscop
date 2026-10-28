# Comunicat de presă — șablon

*Se completează din `data/reports/<id>/report.json` după aprobare (`report:approve`). Câmpurile
`{{…}}` corespund cheilor din JSON; nu adăugați cifre care nu sunt în raport.*

---

**{{title}}**

București, {{data publicării}} — Pretoscop, comparatorul de prețuri cu istoric pentru magazinele
online din România, a analizat {{headline.offers}} de oferte în stoc între {{window.from}} și
{{window.to}}, la {{numărul de magazine}} magazine.

- Dintre {{headline.claims}} de reduceri afișate (cu preț de referință tăiat), **{{headline.claimsWithoutRealDropShare}}**
  nu au fost și scăderi reale: prețul din perioadă nu a coborât cu cel puțin 2% sub cel mai mic preț
  observat de Pretoscop la același magazin în cele 30 de zile dinainte.
- {{headline.realDrop}} oferte au avut o scădere reală; {{headline.higher}} au fost mai scumpe decât
  minimul celor 30 de zile.
- {{raiseThenCut: număr de cazuri / oferte evaluate, sau „regula nu a putut fi evaluată”}}

„{{citat al fondatorului, aprobat}}”

**Metodologie.** Pretoscop observă zilnic prețurile publice ale magazinelor și păstrează doar
schimbările; zilele fără observații rămân goale. Detalii: https://pretoscop.ro/metodologie#rapoarte.
Datele complete: https://pretoscop.ro/rapoarte/{{id}}.

**Despre Pretoscop.** {{descrierea scurtă din README}}

Contact presă: contact@pretoscop.ro
