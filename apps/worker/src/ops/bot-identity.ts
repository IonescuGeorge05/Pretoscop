import { isIP } from 'node:net';
import { DIRECTORY_MEDIA_TYPE, DIRECTORY_PATH, loadEd25519Key, verifyDirectoryResponse } from '@pretoscop/fetch';

/**
 * Self-checks of PretoscopBot's public identity (M21), run by `pnpm --filter @pretoscop/worker
 * bot:check` after setup A4 and after every change of IPs or keys: forward-confirmed reverse DNS
 * of each egress IP, /bot/ips.json listing them, and a key directory whose signature verifies.
 * Talks only to DNS and to our own site, never to a shop.
 */

export const RDNS_DOMAIN = 'bot.pretoscop.ro';

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface Resolver {
  reverse(ip: string): Promise<string[]>;
  resolve4(name: string): Promise<string[]>;
  resolve6(name: string): Promise<string[]>;
}

/** FCrDNS: the PTR name ends in `.<domain>` and resolves back to the same address. */
export async function checkReverseDns(ip: string, resolver: Resolver, domain = RDNS_DOMAIN): Promise<Check> {
  const name = `reverse DNS ${ip}`;
  const family = isIP(ip);
  if (family === 0) return { name, ok: false, detail: 'not an IP address (CIDR prefixes are checked per address, list them one by one)' };
  let ptrs: string[];
  try {
    ptrs = (await resolver.reverse(ip)).map((n) => n.replace(/\.$/, '').toLowerCase());
  } catch (err) {
    return { name, ok: false, detail: `no PTR record (${(err as NodeJS.ErrnoException).code ?? (err as Error).message}); set it at the hosting provider (A4)` };
  }
  const ours = ptrs.filter((p) => p === domain || p.endsWith(`.${domain}`));
  if (ours.length === 0) return { name, ok: false, detail: `PTR is ${ptrs.join(', ') || 'empty'}, expected crawl-N.${domain}` };
  for (const host of ours) {
    let forward: string[] = [];
    try {
      forward = family === 4 ? await resolver.resolve4(host) : await resolver.resolve6(host);
    } catch {
      forward = [];
    }
    if (forward.some((a) => sameAddress(a, ip))) return { name, ok: true, detail: `${ip} → ${host} → ${ip}` };
  }
  return { name, ok: false, detail: `${ours.join(', ')} does not resolve back to ${ip} (add the A/AAAA record)` };
}

function sameAddress(a: string, b: string): boolean {
  if (isIP(a) === 6 && isIP(b) === 6) return expandV6(a) === expandV6(b);
  return a === b;
}

function expandV6(ip: string): string {
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const missing = ip.includes('::') ? 8 - h.length - t.length : 0;
  return [...h, ...Array<string>(missing).fill('0'), ...t].map((p) => p.padStart(4, '0')).join(':');
}

/** /bot/ips.json lists exactly the configured egress entries. */
export function checkIpsJson(body: unknown, configured: readonly string[]): Check {
  const name = '/bot/ips.json';
  if (!body || typeof body !== 'object') return { name, ok: false, detail: 'not a JSON object' };
  const b = body as { ipv4?: unknown; ipv6?: unknown; prefixes?: unknown };
  const listed = [...(Array.isArray(b.ipv4) ? b.ipv4 : []), ...(Array.isArray(b.ipv6) ? b.ipv6 : [])].map(String).sort();
  const want = [...configured].sort();
  if (JSON.stringify(listed) !== JSON.stringify(want)) return { name, ok: false, detail: `lists ${listed.join(', ') || 'nothing'}, configured ${want.join(', ') || 'nothing'}` };
  if (!Array.isArray(b.prefixes) || b.prefixes.length !== want.length) return { name, ok: false, detail: 'prefixes (googlebot.json format) missing or incomplete' };
  return { name, ok: true, detail: want.length > 0 ? `${want.length} address(es) published` : 'no address published yet (A4 pending)' };
}

/**
 * The key directory (draft-ietf-webbotauth-httpsig-protocol-00): media type, a JWK Set of public Ed25519 keys whose
 * Content-Digest matches, a possession proof per key for the site's authority, and our key in it.
 */
export function checkDirectory(input: {
  siteOrigin: string;
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
  privateKey?: string;
  now?: number;
}): Check {
  const name = DIRECTORY_PATH;
  if (input.status === 404) return { name, ok: false, detail: 'not published (WEB_BOT_AUTH_PRIVATE_KEY is not set on the web app)' };
  if (input.status !== 200) return { name, ok: false, detail: `HTTP ${input.status}` };
  if (!(input.headers['content-type'] ?? '').startsWith(DIRECTORY_MEDIA_TYPE)) return { name, ok: false, detail: `content-type ${input.headers['content-type'] ?? 'missing'}` };
  const url = `${input.siteOrigin}${DIRECTORY_PATH}`;
  const v = verifyDirectoryResponse({ requestUrl: url, headers: input.headers, body: input.body, now: input.now });
  if (!v.ok) {
    if (v.reason === 'bad_body') return { name, ok: false, detail: 'body is not a JWK Set of public Ed25519 keys ({"keys":[…]})' };
    if (v.reason === 'bad_digest') return { name, ok: false, detail: 'Content-Digest missing or does not match the body' };
    return { name, ok: false, detail: `response signature does not verify (${v.reason}${v.keyid ? `, key ${v.keyid}` : ''})` };
  }
  if (input.privateKey) {
    const ours = loadEd25519Key(input.privateKey).keyid;
    if (!v.keyids.includes(ours)) return { name, ok: false, detail: `our key ${ours} is not in the directory` };
  }
  return { name, ok: true, detail: `${v.keyids.length} key(s), signed by ${v.keyids.join(', ')}` };
}
