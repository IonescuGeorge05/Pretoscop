# Records of processing activities (GDPR Art. 30)

Status: draft v0.1, 2026-10-27 (module M17). Not yet reviewed by the lawyer (setup task B5). Owner: founders. Review: every quarter, and whenever a module adds, changes or removes a processing activity (the module report says so and updates this file). The public version of this information is `/confidentialitate`; keep the two consistent.

## Controller

| Item | Value |
|---|---|
| Controller | `COMPANY_LEGAL_NAME` (today: "Pretoscop (în curs de înființare)"). Until the SRL is registered (setup B4) the controller is the founder who operates the project as a natural person; add the SRL's name, CUI, registry number and registered office here and on `/termeni` and `/confidentialitate` as soon as it exists. |
| Postal address | `COMPANY_POSTAL_ADDRESS` (today: "România"; to be completed) |
| Contact for data protection | privacy@pretoscop.ro (mailbox to be created, see `dpa-list.md`) |
| Data protection officer | None. Assessment (2026-10-27): no large-scale regular and systematic monitoring and no special-category data as core activity (Art. 37(1)). Re-assess before introducing behavioural profiling, retargeting or personalised prices. |
| Representative (Art. 27) | Not applicable (established in the EU). |
| Supervisory authority | ANSPDCP, B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, București, www.dataprotection.ro |

The Art. 30(5) exemption for organisations under 250 employees does not apply: the processing below is not occasional.

## Activities

Legend for status: **live** = runs in the prototype today; **planned** = designed, starts with the named module. Retention periods marked "(job pending)" are policy decisions that still need an automated deletion or aggregation job.

### P1. Website delivery and security

| Field | Record |
|---|---|
| Status | live in development; public from launch (M18) |
| Purpose | Serve pages and APIs, protect against attacks and abuse, debug errors |
| Legal basis | Art. 6(1)(f), legitimate interest in a secure, working service |
| Data subjects | Visitors of pretoscop.ro |
| Personal data | IP address, User-Agent, requested URL, referrer, timestamp (transient in the web server and at the CDN; never written to the database) |
| Recipients | Hetzner (hosting), Cloudflare (CDN, WAF) |
| Transfers | Cloudflare, Inc. (US): EU-US Data Privacy Framework and SCCs in the Cloudflare DPA |
| Retention | Server and proxy logs: at most 30 days (configure in M18); Cloudflare: per its DPA |
| Security | TLS, Cloudflare WAF, rate limits, no raw IP in the database |
| Implementation | `apps/web`, `infra/` (M12, M18) |

### P2. Product analytics event log (no cookies)

| Field | Record |
|---|---|
| Status | live (M12) |
| Purpose | Understand use of the service (searches, product views, click-outs) to improve it |
| Legal basis | Art. 6(1)(f), legitimate interest; no storage of or access to information on the device, so Law 506/2004 art. 4(5) consent is not triggered |
| Data subjects | Visitors |
| Personal data | Event name, path, referrer host, up to 20 short properties, session hash = sha256(daily salt derived from `HASH_SALT_SECRET`, IP, User-Agent), truncated; pseudonymous within one day, unlinkable across days |
| Recipients | Hetzner (hosting) |
| Transfers | None |
| Retention | 13 months; after 90 days the session hash is removed, so only per-event counts remain (job `alerts.retention`, M19) |
| Security | No raw IP or UA stored; payload size and rate limits on `POST /api/events` |
| Implementation | `events` table, `apps/web/src/app/api/events/route.ts`, `apps/web/src/lib/privacy.ts` |

### P3. Web analytics with Plausible (consent)

| Field | Record |
|---|---|
| Status | planned: container in `infra/docker-compose.dev.yml` (profile `analytics`, M17), production in M18 |
| Purpose | Aggregated traffic statistics (pages, sources, device types, countries) |
| Legal basis | Consent: Art. 6(1)(a) GDPR and Law 506/2004 art. 4(5); the script loads only after "Accept" in the banner (`analyticsConsent.v1`), withdrawal on `/cookies` |
| Data subjects | Visitors who accepted |
| Personal data | IP and User-Agent are used transiently by Plausible CE to compute a daily visitor hash (daily salt, deleted after 24 h); page URL, referrer, country, device and browser type |
| Recipients | Hetzner (self-hosted Plausible Community Edition; no data goes to Plausible Insights OÜ) |
| Transfers | None |
| Retention | Aggregated statistics for the life of the site; salts deleted daily |
| Security | Self-hosted, admin-only dashboard |
| Implementation | `apps/web/src/components/consent/consent.tsx`, `NEXT_PUBLIC_PLAUSIBLE_*` |

The consent choice itself is stored only in the visitor's browser (`localStorage` key `pretoscop.consent`: choice, text version, timestamp) and is never sent to us, so it is not a processing activity on our side.

### P4. Contact requests, DSA notices, shop objections and data subject requests

| Field | Record |
|---|---|
| Status | live (M17) |
| Purpose | Answer questions; correct price errors; stop collection when a shop objects (one business day); handle notices of illegal content (DSA arts 11, 12, 16) and data subject requests (GDPR arts 12–22); keep evidence of how each was handled |
| Legal basis | Art. 6(1)(f) for general messages; Art. 6(1)(c) for DSA notices (Reg. 2022/2065) and data subject requests (GDPR Art. 12) |
| Data subjects | People and businesses who write to us |
| Personal data | Kind, name (optional), email (required for shop objections and privacy requests), page URL, message (incl. the DSA good-faith statement), daily-salted session hash, timestamps, status and resolution; copies in the team mailbox; delivery metadata at the email provider |
| Recipients | Hetzner (database), Resend (notification to the team, receipt to the sender for shop objections and DSA notices), mailbox provider (to be chosen) |
| Transfers | Resend (US): DPF or SCCs (verify at signature) |
| Retention | 12 months after resolution; 3 years after resolution for shop objections, DSA notices and data subject requests (evidence; general limitation period). Job pending; until then delete by hand in the quarterly review |
| Security | 5 requests per hour per session hash, honeypot, cross-site posts refused, 16 KB body cap; no raw IP stored |
| Implementation | `contact_requests` (migration 0008), `apps/web/src/app/api/contact/route.ts`, `/contact` |

### P5. Price alerts

| Field | Record |
|---|---|
| Status | built (M19); off until `alerts.email.enabled` is turned on (with the public launch) |
| Purpose | Send the email alerts a person asked for; prove consent |
| Legal basis | Consent: Art. 6(1)(a) GDPR and Law 506/2004 art. 12 (direct marketing), double opt-in, text `alertConsent.v1` |
| Data subjects | Alert subscribers |
| Personal data | Email, product, target price, alert history, consent evidence (timestamp, text version, IP hash), unsubscribe events |
| Recipients | Hetzner, Resend |
| Transfers | Resend (US): DPF or SCCs |
| Retention | While the alert is active; inactive accounts deleted after 24 months; consent evidence for the duration of consent plus 3 years; suppression list as email hashes indefinitely |
| Security | Double opt-in, `List-Unsubscribe` in every email, export and delete tools (M19) |
| Implementation | `users`, `alerts`, `alert_sends`, `consent_records` (evidence ledger keyed by an HMAC of the address, kept 3 years after withdrawal), `email_suppressions` (hashes only); retention job `alerts.retention`: pending requests deleted after 7 days, accounts inactive 24 months warned then deleted 30 days later, evidence pruned after 3 years, sent alerts after 13 months; self-service export and deletion on `/alerte`, admin tool on `/admin/alerte`; complaints and bounces from Resend stop alerts (`/api/webhooks/resend`) |

### P6. Admin accounts and audit log

| Field | Record |
|---|---|
| Status | live (M09) |
| Purpose | Secure access to the admin; accountability for changes |
| Legal basis | Art. 6(1)(f) |
| Data subjects | Founders (and future staff) |
| Personal data | Email, magic-link tokens (hashed, 10 minutes), sessions without IP or User-Agent (30 days), audit rows (actor, action, before/after) |
| Recipients | Hetzner, Resend (magic links), Cloudflare (Access, from M18) |
| Transfers | Resend and Cloudflare (US): DPF or SCCs |
| Retention | While the account is active; sessions 30 days; audit log at most 3 years (job pending) |
| Security | Magic link only (no passwords), `ADMIN_EMAILS` allowlist, Cloudflare Access in production |
| Implementation | `users`, `sessions`, `verifications`, `audit_log`, `apps/web/src/lib/auth.ts` |

### P7. Offer data collected from shops (incidental personal data)

| Field | Record |
|---|---|
| Status | live (M03, M05; feeds and the assisted channel use the same fields) |
| Purpose | Price comparison and price history; telling buyers who sells a marketplace offer |
| Legal basis | Art. 6(1)(f); see `lia-crawl.md` |
| Data subjects | Marketplace sellers who trade under a natural person's name (e.g. a PFA); authors or artists named in product titles |
| Personal data | Seller business name as published; product titles |
| Recipients | Hetzner; Cloudflare R2 (raw snapshots, from M18); Zyte (assisted channel, M05B, fetches the public page) |
| Transfers | Zyte Group Ltd is an EU entity (Ireland); Cloudflare: DPF or SCCs |
| Retention | As long as the offer history is kept; suppression on objection (admin action pending) |
| Security | Business names only, no classifieds, no images, descriptions, reviews or contact details; Art. 14(5)(b) public notice on `/confidentialitate#magazine` |
| Implementation | `offers.seller_name`, snapshots `snapshots/{source}/{run}.jsonl.gz` |

### P8. Click-out log

| Field | Record |
|---|---|
| Status | planned (M13) |
| Purpose | Count click-outs per shop and offer; affiliate reconciliation |
| Legal basis | Art. 6(1)(f) |
| Data subjects | Visitors |
| Personal data | Offer, product, shop, timestamp, placement, referrer type, IP hash, UA hash, session hash (daily salt) |
| Recipients | Hetzner |
| Transfers | None (affiliate networks receive the click through their own redirect and act as independent controllers; assess in M24) |
| Retention | 13 months; after 90 days the IP, UA and session hashes are removed (job `alerts.retention`, M19) |
| Implementation | `clicks` (M13) |

### P9. Merchant accounts and feeds

| Field | Record |
|---|---|
| Status | planned (M20) |
| Purpose | Free listing, feed processing, merchant communications, later billing (M25) |
| Legal basis | Art. 6(1)(b) (contract with the merchant); Art. 6(1)(c) for invoicing |
| Data subjects | Merchant contacts |
| Personal data | Contact name, email, company data, feed URL, activity log |
| Recipients | Hetzner, Resend; later the payment provider (M25) |
| Retention | Contract duration; invoices per the accounting law (confirm with the accountant, setup B4) |
| Implementation | `merchants` (M20) |

### P10. Error monitoring

| Field | Record |
|---|---|
| Status | planned (M18) |
| Purpose | Detect and fix errors |
| Legal basis | Art. 6(1)(f) |
| Data subjects | Visitors and admins whose requests fail |
| Personal data | Stack traces, URLs, browser type; configure `sendDefaultPii: false` and IP storage off |
| Recipients | Sentry (Functional Software, Inc.) |
| Transfers | US or EU data region (choose EU at organisation creation); DPF or SCCs |
| Retention | Per the Sentry plan (30–90 days) |

### P11. Backups

| Field | Record |
|---|---|
| Status | planned for production (M18); the prototype keeps snapshots on the local filesystem |
| Purpose | Restore the database after loss |
| Legal basis | Art. 6(1)(f) and Art. 32 (security) |
| Personal data | Everything in the database (P2, P4–P9) |
| Recipients | Cloudflare R2 (use an EU-jurisdiction bucket) |
| Retention | Rolling window (35 days proposed; confirm in M18); deletions propagate when old backups expire |
| Security | Encryption at rest (R2 default), scoped API tokens, weekly restore test |

## Technical and organisational measures (Art. 32, summary)

EU hosting (Hetzner, Germany); TLS everywhere; secrets only in the server `.env`, never in git; admin behind magic-link auth, an email allowlist and (from M18) Cloudflare Access, every admin mutation in `audit_log`; no raw IP addresses in the database (daily-salted hashes); rate limits on public endpoints; least-privilege API keys with spend limits; dependency audit in CI; nightly backups with restore tests (M18); breach playbook in `docs/07-legal-compliance-checklist.md` §9 (ANSPDCP notification within 72 hours where required).

## Open items

- Retention jobs: P4 (12 months / 3 years) and P6 (audit log 3 years) are still pending; P2 and P8 run in `alerts.retention` (M19). Event properties (P2) stay until the 13-month deletion; an `events_daily` aggregate would let raw rows go after 90 days.
- Seller-name suppression action for P7 objections (admin).
- Controller identity once the SRL exists (B4); mailbox provider and its DPA (`dpa-list.md`).
- Lawyer review of this record together with the public pages (B5).
