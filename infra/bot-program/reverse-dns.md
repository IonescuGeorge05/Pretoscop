# Fixed egress IPs and reverse DNS (setup A4)

Goal: every address PretoscopBot uses is (1) used by nothing else, (2) listed on `/bot` and in
`/bot/ips.json`, and (3) forward-confirmed: `IP → crawl-N.bot.pretoscop.ro → same IP`. Cloudflare's IP
validation, DataDome's static-IP and two-way rDNS methods, Fastly and any shop's own WAF rule rely on this.

## Plan

| Name | Address | Used by |
|---|---|---|
| `crawl-1.bot.pretoscop.ro` | the extra IPv4 on the production host (Hetzner AX41-class, Germany) | worker `crawl` processes only |
| `crawl-2.bot.pretoscop.ro` | one address from the host's IPv6 /64 (optional) | same |
| `crawl-3.bot.pretoscop.ro` | Bucharest VPS `crawler-ro` (only if a shop requires a Romanian IP; docs/03 §12) | same |

The web app, mail and backups keep the host's main address; the crawler binds to the extra one.

## Steps

1. **Order the extra IPv4** in Hetzner Robot (server → IPs → "Order additional IP", justification:
   "dedicated crawler identity, published at https://pretoscop.ro/bot"). Note the IPv6 /64 of the server.
2. **Bind the crawler to it.** On the host, add the address to the interface (netplan), then make the
   worker's outgoing connections use it: run the crawl worker in its own container with
   `--network` on a macvlan/ipvlan bound to that address, or add an SNAT rule for the worker container's
   subnet (`iptables -t nat -A POSTROUTING -s <worker-subnet> -j SNAT --to-source <crawler-ip>`). Check from
   inside the worker container: `curl -s https://ifconfig.co` prints the crawler IP, and from the web
   container it does not.
3. **Forward records** (DNS zone of pretoscop.ro): `crawl-1.bot.pretoscop.ro. A <ipv4>` and, if used,
   `crawl-2.bot.pretoscop.ro. AAAA <ipv6>`. TTL 3600.
4. **PTR records** in Hetzner Robot (IPs → the address → "Reverse DNS entry"): `crawl-1.bot.pretoscop.ro`.
   For IPv6, set the PTR of the single address used, not the whole /64.
5. **Publish**: `BOT_EGRESS_IPS=<ipv4>[,<ipv6>]` in the environment of both the web app and the worker;
   add a changelog entry in `apps/web/src/lib/bot-policy.ts` ("Am publicat adresele IP …"); deploy.
6. **Check**: `pnpm --filter @pretoscop/worker bot:check` (DNS, ips.json, key directory) and by hand:

   ```bash
   dig +short -x <ipv4>                    # crawl-1.bot.pretoscop.ro.
   dig +short crawl-1.bot.pretoscop.ro     # <ipv4>
   curl -s https://pretoscop.ro/bot/ips.json
   ```

## Changing addresses later

Publish first, switch traffic second, remove last: add the new address to `BOT_EGRESS_IPS` with its PTR
and A records, deploy, wait at least 24 hours (WAF lists refresh daily), then move the crawler, then
remove the old address and add a changelog entry. Tell the programmes that validated the IP list
(Cloudflare, DataDome, Fastly) and the shops with a custom allow rule (see `/admin/contactari`).
