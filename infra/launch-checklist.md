# Launch checklist (Gate G2)

From `docs/04-plan-normal.md` §9, with how each item is checked. Tick in a PR before the launch; the
founders approve Gate G2 in `docs/progress.md`. Status on 2026-10-27: nothing ticked (no server,
domain or accounts yet; see `docs/09-external-setup-checklist.md`).

## Data

- [ ] ≥ 20,000 products with ≥ 2 live offers — `/admin` → Produse "cu ≥ 2 oferte"
- [ ] Freshness ≥ 90% of Tier A/B offers observed < 24 h — `/admin` → Prospețime; Grafana panel 1
- [ ] Match precision ≥ 98% on the last audit — M07/M22 audit report
- [ ] Zero-offer product pages are `noindex` — M16 test; spot-check 3 pages
- [ ] Anomalies quarantined (`/admin/carantina` reviewed, no backlog older than a week)
- [ ] Icecat attribution visible on pages with Icecat specs (M11)

## Legal

- [ ] SRL registered (B4)
- [ ] Sender identity in the production `.env`: `COMPANY_LEGAL_NAME` and `COMPANY_POSTAL_ADDRESS` of the SRL
      (printed in every email), and the Resend bounce/complaint webhook `RESEND_WEBHOOK_SECRET` (B2):
      production refuses to start without them (M19)
- [ ] Terms, privacy, cookie policy, ranking page, money page, bot page live (M17)
- [ ] Consent banner: equal Accept/Reject; no third-party request before a choice (M12/M17 e2e)
- [ ] Alert consent flow tested, if alerts ship at launch (M19)
- [ ] Lawyer sign-off on the eMAG decision and the page texts (B5)
- [ ] ANCOM DSA notification: calendar entry for launch + 45 days; evidence of the attempt kept (C1)
- [ ] Processor DPAs collected (Hetzner, Cloudflare, Resend, Zyte, Better Stack, Grafana) — `docs/legal/dpa-list.md` (M17)
- [ ] Accessibility statement (M17)
- [ ] Price-accuracy note and "Raportează o eroare de preț" channel live (M13)
- [ ] Discount-verification wording reviewed for defamation risk (M15)
- [ ] Merchant terms (P2B) ready before any merchant is listed under contract (M20)
- [ ] Written legal opinion on the assisted-access channel filed with its scope; production use
      re-confirmed in writing or the shops moved to feeds/allowlists/link-only (`docs/12` §0.9, A10)

## Tech (M18)

- [ ] Backups: nightly dump and pgBackRest base backups green; **restore tested in the last 7 days**
      (Sunday restore-test heartbeats green; one manual `restore-pitr.sh` rehearsal on staging)
- [ ] Encryption passphrase of the backups in both founders' password managers
- [ ] Better Stack: site, worker, dump, base backup, restore-test monitors; alerts reach both phones
      (test: stop the web replicas for 2 minutes)
- [ ] Ops alerts reach Telegram/email (`node --import tsx src/cli/ops-alert-test.ts` in the worker)
- [ ] Metrics in Grafana Cloud (optional at launch) or `/metrics` checked by hand
- [ ] Analytics: Plausible on `stats.pretoscop.ro` (`COMPOSE_PROFILES=analytics`), both founders registered,
      registration invite-only; the prod web image built with its script URL; loads only after Accept (M17 e2e)
- [ ] Errors: Sentry set up (B3) or the deferral accepted (5xx alert + JSON logs)
- [ ] Cloudflare: Full (strict), cache rules, WAF rate limit, Access on `/admin` and staging (`infra/cloudflare/README.md`)
- [ ] Origin closed to non-Cloudflare traffic (check in `infra/cloudflare/README.md`)
- [ ] HTTPS/HSTS on; 404/500 pages render
- [ ] Two deploys and one rollback done on production (`.deploy-history`)
- [ ] k6 on production: cached product pages p95 TTFB < 400 ms (`scripts/perf/prod-smoke.k6.js`)
- [ ] Sitemaps submitted; Search Console and Bing verified (B6, M16)
- [ ] Core Web Vitals within budget on 20 sampled pages (M16)
- [ ] Staging `noindex` and behind Access; production `SITE_INDEXABLE=true` (web image rebuilt for prod)
- [ ] Recorder moved from the laptop to the server without a gap (`infra/runbooks/server-setup.md` §5)

## Business

- [ ] 2Performant programs approved and links tested end to end (test click visible in the network) (A6, M24)
- [ ] Merchant onboarding email ready (`docs/08-monetization-playbook.md` §7)
- [ ] Press note for the Black Friday 2026 data (M23)
- [ ] Social handles live (A2); support inbox (`contact@`) answered
