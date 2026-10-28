# Web Bot Auth: keys, rollout, rotation

PretoscopBot can sign every request with HTTP Message Signatures (RFC 9421) as described by the
web-bot-auth drafts (draft-meunier-web-bot-auth-architecture, draft-meunier-http-message-signatures-directory).
Cloudflare, Akamai and DataDome verify these signatures. Code: `packages/fetch/src/signing.ts`; tests pin
the output to the RFC 9421 B.2.6 vector and to the architecture draft's example byte for byte.

What a signed request carries (one signature per request, made right before it is sent, valid 60 s):

```
Signature-Agent: "https://pretoscop.ro"
Signature-Input: sig1=("@authority" "signature-agent");created=1761645600;keyid="<JWK thumbprint>";alg="ed25519";expires=1761645660;nonce="<64 random bytes, base64>";tag="web-bot-auth"
Signature: sig1=:<Ed25519 signature, base64>:
```

The key directory, `https://pretoscop.ro/.well-known/http-message-signatures-directory`, answers
`{"keys":[{"kty":"OKP","crv":"Ed25519","x":"…"}]}` with `Content-Type:
application/http-message-signatures-directory+json`, signed with the same key (tag
`http-message-signatures-directory`, covering `"@authority";req`), cacheable for 5 minutes.

## Environment

| Variable | Where | Value |
|---|---|---|
| `WEB_BOT_AUTH_PRIVATE_KEY` | web **and** worker | secret: the base64url Ed25519 seed printed by the keygen (or a PKCS#8 PEM, `\n` allowed) |
| `WEB_BOT_AUTH` | worker (web reads it for `/bot`) | `false` until the key is registered, then `true` |
| `BOT_INFO_URL` | both | `https://pretoscop.ro/bot`; its origin is the `Signature-Agent` |

`getEnv()` refuses `WEB_BOT_AUTH=true` without a key, a malformed key, and the public RFC 9421 test key in
staging/production; it never prints the key.

## Rollout

1. `pnpm --filter @pretoscop/fetch bot-auth:keygen` on a trusted machine. Copy
   `WEB_BOT_AUTH_PRIVATE_KEY=…` into the server's secret environment (both services). Do not paste it
   anywhere else; the `keyid` and the JWK printed below it are public.
2. Deploy with `WEB_BOT_AUTH=false`. Check `https://pretoscop.ro/.well-known/http-message-signatures-directory`
   (200, the JWK) and `pnpm --filter @pretoscop/worker bot:check` (`OK … signed by <keyid>`). `/bot` now says
   the key is published and signing starts after registration.
3. Register the directory URL with Cloudflare (verification method "Request Signature",
   [cloudflare-verified-bots.md](cloudflare-verified-bots.md)), Akamai and DataDome.
4. Set `WEB_BOT_AUTH=true` on the worker and restart it. The worker logs
   `crawler requests are signed (Web Bot Auth)`; `bot:check` prints the headers a request carries.
   Cloudflare documents a test endpoint that answers 401 when the key is unknown: run one request against it
   with `pnpm --filter @pretoscop/fetch demo <test URL>` once the registration is accepted.
5. Add a changelog entry on `/bot` ("Cererile PretoscopBot sunt semnate …").

## Rotation

Planned yearly, immediately if the key may have leaked.

1. Generate a new key. The directory serves one key today; for an overlap, extend
   `keyDirectoryResponse` in `apps/web/src/lib/web-bot-auth.ts` to also publish a
   `WEB_BOT_AUTH_PREVIOUS_PUBLIC_JWK` (public part only) and sign with the current key — a small change,
   not built yet.
2. Deploy the new key to the web app first (directory shows it), then to the worker.
3. After 24 hours remove the old key. For a leak, skip the overlap: replace and deploy both services at once.
4. Changelog entry on `/bot`; tell the programmes if they pinned the keyid.

## If the drafts change

The header shapes follow the drafts as of October 2026 (Cloudflare's documentation shows the same
format). If a verifier changes the format (for example the `Signature-Agent` structure), the change is in
`packages/fetch/src/signing.ts` (`createWebBotAuthSigner`, `signDirectoryResponse`) and its tests.
