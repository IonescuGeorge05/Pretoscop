# Report review checklist (founders, before publication)

A report is unapproved until a founder runs `report:approve`. Nothing is published before that.

1. Generate: `pnpm --filter @pretoscop/worker report --from <first day> --to <last day> --id <id> --title "<title>" --label "Black Friday"`.
   Output: `data/reports/<id>/` (report.md, report.json, CSVs, charts in SVG and PNG).
2. Read `report.md` end to end. Check the notes: how many offers lacked history, whether the
   raise-then-cut rule could be evaluated. Coverage below ~60% of offers is a reason to wait or to
   narrow the categories.
3. Spot-check five findings against the charts and the database. For an offer id from `oferte.csv`:
   ```sql
   select observed_at at time zone 'Europe/Bucharest' as ro, price, old_price, availability
   from price_events where offer_id = <id> order by observed_at;
   ```
   The day's price is the last state of that day; `min_30d_before` is the lowest of those states in
   the 30 days before the window; `event_min` the lowest inside it. Open the shop page if it is still
   live and compare.
4. Check `magazine.csv` totals against `select count(*) …` for one shop (the worker test
   `apps/worker/test/report.test.ts` shows the reconciliation queries).
5. Confirm no marketplace seller name appears in any file (`grep -i "srl\|s.r.l" data/reports/<id>/*`
   should only hit product titles, never seller names).
6. Wording: findings state what we observed, never intent ("nu a fost și o scădere reală", not
   "reducere falsă"). Shops get the right of reply (/contact) before a press release that names them.
7. Approve: `pnpm --filter @pretoscop/worker report:approve data/reports/<id> --by "<Your name>"`,
   commit `apps/web/src/content/reports/<id>.json` and `index.ts`, deploy. The page appears at
   `/rapoarte/<id>` and the CSV/JSON downloads at `/rapoarte/<id>/date/…`.
8. Fill `docs/press-kit/comunicat-template.md` from `report.json` only.
