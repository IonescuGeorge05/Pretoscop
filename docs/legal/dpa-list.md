# Processors and data processing agreements (GDPR Art. 28)

Status: draft v0.1, 2026-10-27 (module M17). Every DPA below is **to sign**: no account exists yet for most services (setup tasks A4, B2 and the M18 deployment). Signed DPAs are kept in `infra/legal/` (outside git, docs/07 §3.6). Entity names, certifications and data regions marked "verify" must be confirmed from the vendor's current DPA at signature. The public list is in `/confidentialitate#furnizori`; keep both consistent with `ropa.md`.

| Processor | Role for Pretoscop | Personal data processed | Location | Transfer basis | DPA status |
|---|---|---|---|---|---|
| Hetzner Online GmbH (Gunzenhausen, Germany) | Dedicated server: web, worker, PostgreSQL, Meilisearch, self-hosted Plausible CE | Everything in the database and server logs (ROPA P1–P11) | Germany (EU) | Not needed (EU) | To sign: DPA available in the Hetzner account (setup A4) |
| Cloudflare, Inc. (US) | DNS, CDN, WAF, Access (admin), Tunnel, R2 (raw snapshots, licensed images, database backups) | Visitor IPs and request metadata; admin identities (Access); backups contain the whole database | Global network; R2 bucket with EU jurisdiction for backups | EU-US Data Privacy Framework (verify certification) and SCCs in the Cloudflare DPA | To sign: accept the Cloudflare DPA for the account; create the backup bucket with EU jurisdiction |
| Resend (US; verify legal entity) | Transactional email: magic links, contact notifications and receipts, price alerts (M19) | Recipient email, message content, delivery events | US (verify whether an EU sending region is available) | DPF (verify) or SCCs | To sign (setup B2) |
| Sentry (Functional Software, Inc., US) | Error monitoring (M18) | Stack traces, URLs, browser type; configure `sendDefaultPii: false` and no IP storage | EU data region if chosen at organisation creation (verify), otherwise US | DPF (verify) or SCCs | To sign (M18) |
| Anthropic (verify contracting entity for EEA customers) | LLM for matching and attribute extraction (M22) | None by design: product titles and attributes only; seller names must stay out of prompts | US | Not needed while no personal data is sent; sign the DPA as a precaution | To sign (before M22 goes live) |
| Zyte Group Ltd (Ireland) | Assisted-access channel for designated shops (M05B, ADR-015) | Public shop pages, which can contain marketplace seller business names (see `lia-crawl.md`) | Ireland (EU); the vendor's proxy network may be worldwide | EU entity; DPA with SCCs offered (docs/13, A3) | To sign before M05B goes live (setup A10) |
| Mailbox provider for contact@, privacy@ and bot@ (to choose) | Receiving and storing messages sent to our addresses | Senders' addresses and messages | Prefer an EU provider | Depends on the provider | To choose, then to sign |

## Not processors, or no personal data of users (for completeness)

| Service | Why no DPA is listed |
|---|---|
| Plausible Community Edition | Open-source software we run on our own Hetzner server; Plausible Insights OÜ receives nothing |
| GitHub (code, CI, container registry) | No personal data of users in the repository (fixtures contain shop business data only) |
| Grafana Cloud, Better Stack or healthchecks.io | Metrics and uptime only; metric labels must never contain IPs or emails. Sign a DPA if logs are ever shipped there |
| Telegram (operations alerts) | Messages to the founders' own chat; no user data |
| Google Search Console, Bing Webmaster Tools | No user data sent by us |
| Affiliate networks (2Performant, Profitshare, Awin, M24) | Independent controllers of their own click tracking; the controller relationship is to be confirmed by the lawyer before M24 |
| Open Icecat | Product data source; no personal data |

## Checklist per signature

1. Download the current DPA and annexes (technical measures, sub-processors) and store them in `infra/legal/dpa/<vendor>-<date>.pdf`.
2. Record the transfer mechanism actually used (DPF certification link or SCC module) in the table above.
3. Set the data region where the vendor offers one (EU), and disable optional personal data collection (IP storage, default PII).
4. Add the vendor's sub-processor notification address to the founders' mailbox and review changes when notified.
