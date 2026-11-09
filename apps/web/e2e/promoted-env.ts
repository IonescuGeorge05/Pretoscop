/**
 * Made-up Stripe test credentials for the M25 e2e: the web server talks to the local Stripe mock
 * (`@pretoscop/payments/testing`) on E2E_PORT + 1, never to Stripe; the spec signs its webhook
 * deliveries with the same secret.
 */
export const E2E_STRIPE = {
  secretKey: 'sk_test_e2emock',
  webhookSecret: 'whsec_e2emock',
  port: (webPort: number) => Number(process.env.E2E_STRIPE_PORT ?? webPort + 1),
} as const;
