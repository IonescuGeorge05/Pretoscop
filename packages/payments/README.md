# @pretoscop/payments

The payment-provider contract of Pretoscop and its Stripe implementation (M25 merchant wallet
top-ups; M28 B2B plans reuse it). Amounts are integer bani, currency RON. No card data ever reaches
our servers: the payer pays on the provider's hosted page, and money is credited **only** from the
provider's signed webhook, never from a redirect back to our site.

## Contract (`src/types.ts`)

```ts
interface PaymentProvider {
  readonly name: string; // 'stripe'
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  parseWebhook(rawBody: string, headers: HeaderSource, now?: Date): PaymentEvent;
}
```

- `CheckoutRequest`: `reference` (our id, e.g. `topup:42`; the idempotency key of the provider
  call, echoed in every webhook), `amountBani` (gross, VAT included), `currency: 'RON'`,
  `description`, `customerEmail?`, `successUrl`, `cancelUrl`, `expiresInMinutes?` (31–1,440),
  `metadata?` (no personal data).
- `CheckoutSession`: `{ provider, id, url, expiresAt }`; send the payer to `url`, store `id`.
- `PaymentEvent`: `checkout.paid` (with the amount and currency actually paid: the caller must
  compare them with what it asked for), `checkout.failed`, `checkout.expired`, or `ignored`.
- Errors: `PaymentProviderError` (refused or unreachable; `status`, `code`) and
  `WebhookSignatureError` (`missing`, `malformed`, `mismatch`, `expired`, `unconfigured`,
  `payload`).
- `paymentProviderFromEnv(env)`: the Stripe provider when `STRIPE_SECRET_KEY` is set, else null.

## Stripe (`src/stripe.ts`)

Stripe Checkout Sessions over the REST API with `fetch` (no SDK): `POST /v1/checkout/sessions` in
`mode=payment`, one line item in `ron`, `client_reference_id` and metadata `reference`,
`Idempotency-Key: <reference>`, `locale=ro`. Webhook signatures are checked by hand
(`verifyStripeSignature`: HMAC-SHA256 of `<t>.<raw body>` with the endpoint secret, every `v1`
accepted during a secret rotation, 300 s tolerance). Events handled: `checkout.session.completed`
(paid only when `payment_status = 'paid'`), `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`. The API version is the
account's default; the fields read are stable across versions.

## Testing (`@pretoscop/payments/testing`)

`startStripeMock()` answers `POST /v1/checkout/sessions` like Stripe (idempotent per key) and
serves a fake hosted page; `stripeEvent()` and `signedStripeHeaders()` build and sign webhook
deliveries exactly as Stripe sends them. Used by the unit tests and the M25 e2e, never by the apps.

## For M28 (subscriptions)

Add optional methods (e.g. `createSubscriptionCheckout`) and new `PaymentEvent` variants rather
than changing the existing ones, so M25 callers keep compiling; keep the rule that only verified
webhooks change billing state.
