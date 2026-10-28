import { request } from 'undici';
import { afterEach, describe, expect, it } from 'vitest';
import { CappedDispatcher, RequestCapError } from '../src/capped';
import { classifyTransportError } from '../src/detect';
import { mockAgent, ROBOTS_ALLOW_ALL, testFetcher } from './helpers';

describe('CappedDispatcher', () => {
  const agents: ReturnType<typeof mockAgent>[] = [];
  afterEach(async () => {
    await Promise.all(agents.splice(0).map((a) => a.close()));
  });

  it('lets at most N requests through, starting them at least the gap apart whatever the host', async () => {
    const agent = mockAgent();
    agents.push(agent);
    const starts: number[] = [];
    for (const origin of ['https://a.test', 'https://b.test', 'https://c.test', 'https://d.test']) agent.get(origin).intercept({ path: '/' }).reply(200, 'ok');
    // Record when each request is handed to the transport.
    const dispatch = agent.dispatch.bind(agent);
    agent.dispatch = (opts, handler) => {
      starts.push(Date.now());
      return dispatch(opts, handler);
    };
    const capped = new CappedDispatcher(agent, { maxRequests: 3, minGapMs: 120 });
    for (const origin of ['https://a.test', 'https://b.test', 'https://c.test']) {
      const res = await request(`${origin}/`, { dispatcher: capped });
      await res.body.text();
    }
    expect(capped.requests).toBe(3);
    expect(starts).toHaveLength(3);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(118);

    const err = await request('https://d.test/', { dispatcher: capped }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RequestCapError);
    expect(starts).toHaveLength(3);
    expect(classifyTransportError(err)).toMatchObject({ code: 'request_cap', block: false, countsAsFailure: false, transient: false });
  });

  it('through the polite fetcher: the capped call fails as request_cap, no pause, no cached robots.txt failure', async () => {
    const agent = mockAgent();
    agents.push(agent);
    agent.get('https://magazin.ro').intercept({ path: '/robots.txt' }).reply(200, ROBOTS_ALLOW_ALL, { headers: { 'content-type': 'text/plain' } });
    agent.get('https://magazin.ro').intercept({ path: '/p/1' }).reply(200, '<html></html>', { headers: { 'content-type': 'text/html' } });
    const capped = new CappedDispatcher(agent, { maxRequests: 2, minGapMs: 0 });
    const { fetcher, store } = testFetcher({ dispatcher: capped });
    expect((await fetcher.fetchPolite('https://magazin.ro/p/1', { purpose: 'product' })).ok).toBe(true);
    // A third request (robots.txt of another host) is over the cap.
    const res = await fetcher.fetchPolite('https://www.magazin.ro/p/2', { purpose: 'product' });
    expect(res).toMatchObject({ ok: false, blocked: false });
    expect(res.error).toMatch(/robots\.txt not available/);
    expect(await store.getPause('www.magazin.ro')).toBeNull();
    expect(await store.getRobots('https://www.magazin.ro')).toBeNull();
    expect(await store.getFailures('www.magazin.ro')).toBe(0);
  });
});
