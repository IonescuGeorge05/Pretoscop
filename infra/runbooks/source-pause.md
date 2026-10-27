# Runbook: pause, stop or resume a source

Use this when a shop objects, a source misbehaves (wrong prices, parse errors, blocks), or before
maintenance. Every step is reversible and leaves history intact.

## Levels of stopping (fastest first)

| Scope | How | Effect |
|---|---|---|
| Everything, immediately | Set `CRAWL_ENABLED=false` in the server `.env` and restart the worker | No request reaches any shop. |
| Everything, without restart | `make psql` → `update feature_flags set enabled=false where key='crawl.enabled';` | Scheduler stops queueing; running jobs stop at their next gate check (next source run). |
| eMAG only (ADR-013) | `update feature_flags set enabled=false where key='source.emag.enabled';` | All eMAG sources stop; other shops continue. |
| One source | `update shop_sources set kill_switch=true where key='emag:listing:telefoane-mobile';` (admin "Kill" button from M09) | That source stops; `shops:sync` never turns a kill switch off. |
| One shop, permanently | In `packages/config/shops/<slug>.yaml` set `status: paused` (or `blocked`) and `enabled: false` on its sources, then `make shops:sync`; commit with the reason | Configuration change, reviewed in git; audit row written by the sync. |
| One host, temporarily | The fetch layer pauses a host automatically for 24 h after a 403/challenge (≥1 h after 429/503). To pause by hand: `update crawl_domain_state set paused_until = now() + interval '24 hours', pause_reason='manual: <why>' where host='www.example.ro';` | Requests to that host are skipped with `skipped=paused`. |

Running jobs: `select id, name, state, data from pgboss.job where name='source.run' and state='active';`
— a run in progress finishes its current request and stops at the next page when a gate closes
only if it re-checks; to stop it at once, restart the worker (jobs are idempotent and are retried).

## A shop asks us to stop (written objection)

1. Within the hour: kill switch on all of the shop's sources (SQL above) — this is the commitment
   in `docs/12-blocked-shops-strategy.md` §0 (one business day at most).
2. Reply from `contact@pretoscop.ro` confirming the stop and asking whether they prefer a feed
   (template: `docs/08-monetization-playbook.md` §7).
3. Set the YAML to `status: paused`, record the request in `legal.terms_note` with the date, sync,
   commit. Keep the offers and history (they are our observations), but hide the shop's offers on
   the public site if the request covers display (M13 honours `shops.status`).
4. Log the decision in `docs/progress.md` (founder decisions).

## Resume

Reverse the step you took (flag on, kill switch off, YAML back to `active`). Check the first run in
`ingest_runs` (`status`, `stats`, `error_sample`) and the source's `health` in the admin.

## Diagnose a failing source

```sql
select id, status, started_at, stats, left(error_sample, 300) from ingest_runs
where source_id = (select id from shop_sources where key = '<key>') order by id desc limit 5;
select host, paused_until, pause_reason, consecutive_failures, day_count from crawl_domain_state;
select ts, status, blocked, block_reason, skipped, url from request_log where host = '<host>' order by ts desc limit 20;
```

- `blocked` with `http_403`/`challenge`: the shop's protection refused PretoscopBot. Do **not**
  retry harder. Mark the shop `blocked` in the YAML and move it to feeds/outreach (M21).
- `errors` with "no offers parsed on the first page": the page layout changed. Record a new fixture
  (`scripts/record-fixture.sh`), fix the parser, add a test.
- `held`: a full run returned < 70% of the 7-day median; nothing was deactivated. Check the shop.
