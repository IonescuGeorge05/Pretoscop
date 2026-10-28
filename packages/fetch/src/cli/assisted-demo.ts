/**
 * Founder demo for M05B (no vendor account, no live call):
 *
 *   pnpm --filter @pretoscop/fetch assisted:demo
 *
 * Starts a local stand-in for the Zyte API on 127.0.0.1, then reads a fictitious designated shop
 * through `fetchPolite` with the real assisted channel: robots.txt first (through the channel),
 * the per-domain interval (5 s, real time), the cost ledger, and finally the monthly cap, set so
 * low that the last request is refused before reaching the vendor. Prints exactly what was sent
 * to the vendor: there is no User-Agent, no header and no IP type in it.
 */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { defaultDomainPolicy } from '@pretoscop/config/policy';
import { createAssistedChannel } from '../assisted/channel';
import { MemoryAssistedLedger } from '../assisted/ledger';
import { zytePricing } from '../assisted/pricing';
import { createZyteClient } from '../assisted/zyte';
import { createFetcher } from '../fetcher';
import { MemoryDomainStateStore } from '../state/memory';

const PAGE = '<html><head><script type="application/ld+json">{"@type":"Product","name":"Televizor demo","offers":{"price":"1999.99","priceCurrency":"RON"}}</script></head><body>1.999,99 lei</body></html>';

const sent: Array<Record<string, unknown>> = [];
const server = createServer((req, res) => {
  let raw = '';
  req.on('data', (c: Buffer) => (raw += c.toString()));
  req.on('end', () => {
    const body = JSON.parse(raw) as { url: string; browserHtml?: boolean };
    sent.push(body as unknown as Record<string, unknown>);
    const isRobots = body.url.endsWith('/robots.txt');
    const content = isRobots ? 'User-agent: *\nDisallow: /cos\n' : PAGE;
    const answer = body.browserHtml
      ? { url: body.url, statusCode: 200, browserHtml: content }
      : {
          url: body.url,
          statusCode: 200,
          httpResponseHeaders: [{ name: 'Content-Type', value: isRobots ? 'text/plain' : 'text/html; charset=utf-8' }],
          httpResponseBody: Buffer.from(content).toString('base64'),
        };
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer));
  });
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/extract`;

const ledger = new MemoryAssistedLedger();
// Tier 5 browser price is ~1.45 cents per page: with a 3-cent cap the third page is refused.
const channel = createAssistedChannel({
  client: createZyteClient({ apiKey: 'demo-key', endpoint }),
  ledger,
  monthlyCapCents: 3,
  shopSettings: () => ({ pricing: zytePricing(5) }),
});
const fetcher = createFetcher({
  stateStore: new MemoryDomainStateStore(),
  assisted: channel,
  crawlEnabled: true,
  policyFor: (host) => defaultDomainPolicy(host, { shopSlug: 'magazin-demo', accessMode: 'assisted', assistedRender: true }),
});

console.log('Assisted-access demo (local stand-in for the Zyte API; nothing leaves this machine)\n');
for (const path of ['/televizoare/', '/laptopuri/', '/telefoane/']) {
  const started = Date.now();
  const r = await fetcher.fetchPolite(`https://magazin-demo.test${path}`, { purpose: 'listing', shopSlug: 'magazin-demo' });
  const line = r.skipped ? `skipped (${r.skipped}${r.errorCode ? `, ${r.errorCode}` : ''}): ${r.error ?? ''}` : `HTTP ${r.status}, ${r.body?.length ?? 0} chars`;
  console.log(`${path.padEnd(14)} ${line}  [waited ${((Date.now() - started) / 1000).toFixed(1)} s, channel ${r.channel}]`);
}
console.log(`\nRequests sent to the vendor (${sent.length}):`);
for (const b of sent) console.log(`  ${JSON.stringify(b)}`);
console.log('\nLedger (access_costs):');
for (const row of ledger.rows.values()) console.log(`  ${row.day} ${row.shopSlug} ${row.vendor}: ${row.requests} requests, ${row.renderedRequests} rendered, ${row.successes} billable, ${row.costCents} cents`);
console.log(`\nMonth to date: ${await channel.monthToDateCents()} cents of a ${channel.monthlyCapCents}-cent cap.`);
await fetcher.close();
server.close();
