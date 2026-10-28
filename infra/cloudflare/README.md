# Cloudflare configuration (M18)

Free plan. Everything here is clicked in the dashboard once (about 30 minutes); the server's
firewall admits HTTP/HTTPS from Cloudflare's ranges only (`infra/server/bootstrap.sh`), so every
visitor goes through these rules.

## DNS (zone pretoscop.ro)

| Record | Value | Proxy |
|---|---|---|
| `A pretoscop.ro` | server IPv4 | proxied (orange) |
| `A www` | server IPv4 | proxied (Caddy redirects to the apex) |
| `A staging` | server IPv4 | proxied |
| `A stats` | server IPv4 (Plausible, compose profile `analytics`; public: script and event endpoint) | proxied |
| `A crawl-1.bot` | server IPv4 (the crawler's egress; PTR set at Hetzner) | **DNS only** (grey): `dig -x` must match for verified-bot programs (M21) |
| `MX`, `TXT` (SPF, DKIM, DMARC) | from Resend (B2) | DNS only |

## SSL/TLS

- Mode **Full (strict)**; Edge certificates: Always Use HTTPS on, minimum TLS 1.2, TLS 1.3 on,
  HSTS left to the origin (Caddy sends `max-age=31536000`; add `includeSubDomains; preload` only once
  every subdomain is HTTPS-only for good).
- Origin Server → Create certificate for `pretoscop.ro, *.pretoscop.ro` (RSA, 15 years) →
  `infra/caddy/certs/origin.pem` / `origin.key` on the server, `CADDY_TLS` as in `.env.example`.

## Caching (Rules → Cache Rules; Free allows 10)

The app already sends the right `Cache-Control` (ISR pages `s-maxage`, dynamic pages `private,
no-store`); these rules make HTML cacheable at the edge where it is safe. Anonymous responses carry
no `Set-Cookie` (M12/M13), otherwise Cloudflare would not cache them.

| # | When | Then |
|---|---|---|
| 1 | URI path starts with `/admin` or `/api/` or `/out/` or `/auth` | Bypass cache |
| 2 | Hostname equals `staging.pretoscop.ro` or `stats.pretoscop.ro` | Bypass cache |
| 3 | URI path starts with `/p/` | Eligible for cache; Edge TTL: override, 2 hours (the Free minimum); Browser TTL: respect origin |
| 4 | URI path starts with `/c/` or `/b/` or `/magazin/` or equals `/` or `/reduceri` | Eligible for cache; Edge TTL: use origin `s-maxage` (10–60 min) |
| 5 | URI path starts with `/_next/static/` | Eligible for cache; Edge TTL 1 year (immutable assets) |

Price changes reach visitors within the edge TTL (≤ 2 h for product pages). Per-URL purge on a
material price change is a follow-up (needs a Cloudflare API token with Cache Purge in the worker:
`docs/09` B3a); until then the 2-hour bound is the documented freshness of cached HTML.

## Security

- **WAF → Rate limiting rules** (Free: 1 rule): `URI path starts with /api/` → 100 requests per
  10 seconds per IP → Block for 10 seconds. The app limits `/api/events` itself as well.
- **WAF → Custom rules**: block `/admin*` for countries other than RO when Access is not yet set up
  (remove once Access protects it).
- **Bots**: leave "Bot Fight Mode" **off** (it challenges uptime monitors and our own health checks);
  "Block AI bots" per the Icecat terms decision (M16).
- **Access (Zero Trust, free up to 50 users)**: Applications → Self-hosted:
  1. `staging.pretoscop.ro/*` — policy: emails of both founders (one-time PIN).
  2. `pretoscop.ro/admin*` — same policy. Better Auth's admin role remains the second lock.
  Service token for Better Stack's staging monitor (`CF-Access-Client-Id/Secret` headers).

## Checks after setup

```bash
curl -sI https://pretoscop.ro/ | grep -i -E 'cf-cache-status|strict-transport|server'
curl -sI https://pretoscop.ro/p/<slug> | grep -i cf-cache-status      # MISS, then HIT
curl -sI https://staging.pretoscop.ro/ | head -1                       # 302 to the Access login
curl -s --resolve pretoscop.ro:443:<server ip> https://pretoscop.ro/ -m 5 -o /dev/null -w '%{http_code}\n'  # times out: origin closed to non-Cloudflare
```
