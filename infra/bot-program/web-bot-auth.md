# Web Bot Auth: keys, rollout, rotation

PretoscopBot can sign every request with HTTP Message Signatures (RFC 9421) as specified by the IETF
Web Bot Auth working group draft **draft-ietf-webbotauth-httpsig-protocol-00** (1 September 2026; it
replaced draft-meunier-web-bot-auth-architecture and draft-meunier-http-message-signatures-directory).
Cloudflare, Akamai and DataDome verify these signatures. Code: `packages/fetch/src/signing.ts`; its tests
reproduce RFC 9421 Appendix B.2.6 and the draft's Appendix E.2 vectors (E.2.1 request, E.2.2 legacy
request, E.2.3 signed directory) byte for byte.

**Off by default.** Nothing is signed until `WEB_BOT_AUTH=true` is set on the worker; the key exists only in
the servers' secret environment, never in git.

What a signed request carries (one signature per request and per redirect hop, made right before it is
sent, valid 60 s):

```
Signature-Agent: sig1="https://pretoscop.ro"
Signature-Input: sig1=("@authority" "signature-agent";key="sig1");created=1761645600;keyid="<JWK thumbprint>";alg="ed25519";expires=1761645660;nonce="<64 random bytes, base64>";tag="web-bot-auth"
Signature: sig1=:<Ed25519 signature, base64>:
```

`Signature-Agent` is a structured-field dictionary; its member for our signature label names the origin
that serves the key directory and is itself covered by the signature (draft §5.2.1: signers must send this
dictionary form; the bare-string form of the earlier drafts is legacy). The signature covers the authority,
not the path: it proves who sends the request, and a captured header could be replayed against the same site
for at most 60 s.

The key directory, `https://pretoscop.ro/.well-known/http-message-signatures-directory`, answers

```
Content-Type: application/http-message-signatures-directory+json
Content-Digest: sha-256=:<base64 SHA-256 of the body>:
Signature-Input: binding=("@authority";req "content-digest");created=…;expires=…;keyid="<thumbprint>";tag="http-message-signatures-directory"
Signature: binding=:<Ed25519 signature>:
Cache-Control: public, max-age=300

{"keys":[{"kty":"OKP","crv":"Ed25519","kid":"<thumbprint>","x":"…","use":"sig"}]}
```

The response proves possession of the key for the authority it was requested from (draft Appendix B.1).
Only public members are served; the private key never leaves the environment.

**No redirect on the directory.** Verifiers must not follow redirects when they fetch it (draft §5.5), so
`https://pretoscop.ro/.well-known/http-message-signatures-directory` must answer 200 itself: keep any
`pretoscop.ro` ↔ `www.pretoscop.ro` redirect away from `/.well-known/` and from `/bot/ips.json`.
`bot:check` reports a redirect as a failure.

## Environment

| Variable | Where | Value |
|---|---|---|
| `WEB_BOT_AUTH_PRIVATE_KEY` | web **and** worker | secret: the base64url Ed25519 seed printed by the keygen (or a PKCS#8 PEM, `\n` allowed) |
| `WEB_BOT_AUTH` | worker (web reads it for `/bot`) | `false` until the key is registered, then `true` |
| `BOT_INFO_URL` | both | `https://pretoscop.ro/bot`; its origin is the `Signature-Agent` (https required when signing) |

`getEnv()` refuses `WEB_BOT_AUTH=true` without a key, a malformed key, a plain-http `BOT_INFO_URL` and, in
staging/production, the public RFC 9421 test key; it never prints the key.

## Rollout

1. `pnpm --filter @pretoscop/fetch bot-auth:keygen` on a trusted machine. Copy
   `WEB_BOT_AUTH_PRIVATE_KEY=…` into the server's secret environment (both services). Do not paste it
   anywhere else; the `keyid` and the JWK printed below it are public.
2. Deploy with `WEB_BOT_AUTH=false`. Check `https://pretoscop.ro/.well-known/http-message-signatures-directory`
   (200, the JWK, no redirect) and `pnpm --filter @pretoscop/worker bot:check` (`OK … signed by <keyid>`).
   `/bot` now says the key is published and that signing starts after registration.
3. Register the directory URL with Cloudflare (verification method "Request Signature",
   [cloudflare-verified-bots.md](cloudflare-verified-bots.md)), Akamai and DataDome (setup C2, founders).
4. Set `WEB_BOT_AUTH=true` on the worker and restart it. The worker logs
   `crawler requests are signed (Web Bot Auth)`; `bot:check` prints the headers a request would carry
   without sending one. If a programme offers a signature test endpoint, a founder may send it one request
   once the registration is accepted; it is not a shop, but it is still a live request, so do it by hand.
5. Add a changelog entry on `/bot` (`BOT_CHANGELOG` in `apps/web/src/lib/bot-policy.ts`).

## Rotation

Planned yearly, immediately if the key may have leaked.

1. Generate a new key. The directory serves one key today; for an overlap, extend
   `keyDirectoryResponse` in `apps/web/src/lib/web-bot-auth.ts` to publish the previous key too
   (`signDirectoryResponse` already signs with every key it is given, one `binding…` label per key) —
   a small change, not built yet.
2. Deploy the new key to the web app first (directory shows it), then to the worker.
3. After 24 hours remove the old key. For a leak, skip the overlap: replace and deploy both services at once.
4. Changelog entry on `/bot`; tell the programmes if they pinned the keyid.

## If the draft changes

Header shapes, parameters and vectors are pinned to draft-ietf-webbotauth-httpsig-protocol-00
(`WEB_BOT_AUTH_SPEC` in the code). A later version is a change in `packages/fetch/src/signing.ts`
(`createWebBotAuthSigner`, `signDirectoryResponse`, the verifiers) and its tests, plus this page.
