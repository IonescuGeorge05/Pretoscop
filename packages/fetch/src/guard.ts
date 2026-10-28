import { lookup as dnsLookup, type LookupAddress, type LookupAllOptions, type LookupOneOptions } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { Agent, buildConnector } from 'undici';

/**
 * Server-side request forgery guard (M20). Merchants type feed URLs into the portal, so the worker
 * must never be steered at internal services (Postgres, the metadata endpoint at 169.254.169.254,
 * localhost admin ports). The check runs at connect time, on the addresses DNS actually returned
 * (a host that resolves first to a public and then to a private address cannot slip through), and
 * on IP literals. Inject the result as `createFetcher({ dispatcher })`.
 */

const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED.addSubnet(net, prefix, 'ipv6');
}

/** True for loopback, private, link-local, carrier-grade NAT, documentation, multicast and reserved addresses. */
export function isNonPublicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const family = isIP(ip);
  if (family === 4) return BLOCKED.check(ip, 'ipv4');
  if (family === 6) {
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
    if (mapped) return BLOCKED.check(mapped[1]!, 'ipv4');
    return BLOCKED.check(ip, 'ipv6');
  }
  return true;
}

export class NonPublicAddressError extends Error {
  readonly code = 'ENONPUBLIC';
  constructor(host: string) {
    super(`refused: ${host} is not a public internet address`);
    this.name = 'NonPublicAddressError';
  }
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** `dns.lookup` that drops non-public addresses (and fails when none is left). */
export function publicOnlyLookup(hostname: string, options: LookupOneOptions | LookupAllOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const usable = (addresses as LookupAddress[]).filter((a) => !isNonPublicAddress(a.address));
    if (usable.length === 0) return callback(new NonPublicAddressError(hostname), []);
    if ((options as LookupAllOptions).all) return callback(null, usable);
    return callback(null, usable[0]!.address, usable[0]!.family);
  });
}

export interface GuardedDispatcherOptions {
  /** Development and tests only (local fixture servers): turns the guard off. */
  allowPrivate?: boolean;
  connectTimeoutMs?: number;
  /** Headers and body timeout of the agent. */
  timeoutMs?: number;
}

/** An undici Agent that can only reach public internet addresses (unless `allowPrivate`). */
export function createGuardedDispatcher(opts: GuardedDispatcherOptions = {}): Agent {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const base = buildConnector({ timeout: opts.connectTimeoutMs ?? 10_000, ...(opts.allowPrivate ? {} : { lookup: publicOnlyLookup }) });
  const connect: buildConnector.connector = (options, callback) => {
    const host = options.hostname.replace(/^\[|\]$/g, '');
    if (!opts.allowPrivate && isIP(host) !== 0 && isNonPublicAddress(host)) {
      callback(new NonPublicAddressError(host), null);
      return;
    }
    base(options, callback);
  };
  return new Agent({ connect, headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
}
