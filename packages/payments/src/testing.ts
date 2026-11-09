import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { signStripePayload } from './stripe';

/**
 * A local stand-in for the two Stripe surfaces Pretoscop touches, for integration and e2e tests:
 * `POST /v1/checkout/sessions` (answers like Stripe, keeps what it was sent) and a hosted "checkout
 * page" (`GET /pay/<id>`) with a link back to the success URL. Tests then deliver the webhook
 * themselves with `stripeEvent()` + `signStripePayload()`, exactly as Stripe would. Never used by
 * the apps: only `STRIPE_API_BASE` points there during a test.
 */

export interface MockCheckout {
  id: string;
  url: string;
  params: Record<string, string>;
  idempotencyKey: string | null;
  authorization: string | null;
}

export interface StripeMock {
  url: string;
  port: number;
  sessions: MockCheckout[];
  /** M28: customer-portal sessions asked for (`POST /v1/billing_portal/sessions`). */
  portals: Array<{ params: Record<string, string>; authorization: string | null }>;
  /** Next POST answers with this HTTP status and Stripe-style error (once). */
  failNext(status: number, message: string): void;
  close(): Promise<void>;
}

export async function startStripeMock(opts: { port?: number; host?: string } = {}): Promise<StripeMock> {
  const sessions: MockCheckout[] = [];
  const portals: StripeMock['portals'] = [];
  const byKey = new Map<string, MockCheckout>();
  let fail: { status: number; message: string } | null = null;
  let base = '';
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const send = (status: number, body: unknown, type = 'application/json') => {
        res.writeHead(status, { 'content-type': type });
        res.end(typeof body === 'string' ? body : JSON.stringify(body));
      };
      if (req.method === 'POST' && req.url === '/v1/checkout/sessions') {
        if (fail) {
          const f = fail;
          fail = null;
          return send(f.status, { error: { message: f.message, type: 'invalid_request_error', code: 'mock_failure' } });
        }
        const key = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : null;
        const known = key ? byKey.get(key) : undefined;
        if (known) return send(200, { id: known.id, object: 'checkout.session', url: known.url, expires_at: Number(known.params.expires_at) });
        const params = Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
        const id = `cs_test_mock_${sessions.length + 1}_${Date.now().toString(36)}`;
        const s: MockCheckout = { id, url: `${base}/pay/${id}`, params, idempotencyKey: key, authorization: req.headers.authorization ?? null };
        sessions.push(s);
        if (key) byKey.set(key, s);
        return send(200, { id, object: 'checkout.session', url: s.url, expires_at: Number(params.expires_at), payment_status: 'unpaid' });
      }
      if (req.method === 'POST' && req.url === '/v1/billing_portal/sessions') {
        if (fail) {
          const f = fail;
          fail = null;
          return send(f.status, { error: { message: f.message, type: 'invalid_request_error', code: 'mock_failure' } });
        }
        portals.push({ params: Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))), authorization: req.headers.authorization ?? null });
        return send(200, { id: `bps_test_${portals.length}`, object: 'billing_portal.session', url: `${base}/portal/${portals.length}` });
      }
      const pay = /^\/pay\/([\w-]+)$/.exec(req.url ?? '');
      const s = pay ? sessions.find((x) => x.id === pay[1]) : undefined;
      if (req.method === 'GET' && s) {
        const amount = (Number(s.params['line_items[0][price_data][unit_amount]']) / 100).toFixed(2);
        return send(
          200,
          `<!doctype html><meta charset="utf-8"><title>Stripe mock</title><h1>Plată de test (mock Stripe)</h1>` +
            `<p data-testid="mock-amount">${amount} ${s.params['line_items[0][price_data][currency]']}</p>` +
            `<a data-testid="mock-success" href="${s.params.success_url}">Înapoi la magazin</a> <a data-testid="mock-cancel" href="${s.params.cancel_url}">Renunță</a>`,
          'text/html; charset=utf-8',
        );
      }
      send(404, { error: { message: 'not found' } });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, opts.host ?? '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  base = `http://${opts.host ?? '127.0.0.1'}:${port}`;
  return {
    url: base,
    port,
    sessions,
    portals,
    failNext: (status, message) => {
      fail = { status, message };
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** A `checkout.session.*` event body as Stripe sends it (only the fields Pretoscop reads, plus a few). */
export function stripeEvent(
  type: 'checkout.session.completed' | 'checkout.session.async_payment_succeeded' | 'checkout.session.async_payment_failed' | 'checkout.session.expired',
  session: { id: string; reference: string; amountBani: number; currency?: string; paymentStatus?: 'paid' | 'unpaid' | 'no_payment_required' },
  eventId = `evt_test_${Math.random().toString(36).slice(2)}`,
): string {
  return JSON.stringify({
    id: eventId,
    object: 'event',
    type,
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: session.id,
        object: 'checkout.session',
        client_reference_id: session.reference,
        metadata: { reference: session.reference },
        amount_total: session.amountBani,
        currency: session.currency ?? 'ron',
        payment_status: session.paymentStatus ?? (type === 'checkout.session.expired' ? 'unpaid' : 'paid'),
        status: type === 'checkout.session.expired' ? 'expired' : 'complete',
      },
    },
  });
}

/** Headers of a signed delivery of `body` (what the webhook route receives from Stripe). */
export function signedStripeHeaders(secret: string, body: string, timestamp?: number): Record<string, string> {
  return { 'content-type': 'application/json', 'stripe-signature': signStripePayload(secret, body, timestamp) };
}
