import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, type KeyObject } from 'node:crypto';

/**
 * Web Bot Auth (M21): PretoscopBot proves its identity cryptographically, on top of the
 * User-Agent and the published IPs. Requests carry HTTP Message Signatures (RFC 9421) made with
 * an Ed25519 key, as described by draft-meunier-web-bot-auth-architecture:
 *
 *   Signature-Agent: "https://pretoscop.ro"
 *   Signature-Input: sig1=("@authority" "signature-agent");created=…;keyid="<JWK thumbprint>";alg="ed25519";expires=…;nonce="…";tag="web-bot-auth"
 *   Signature: sig1=:<base64 Ed25519 signature>:
 *
 * The public key is published at `<Signature-Agent>/.well-known/http-message-signatures-directory`
 * (draft-meunier-http-message-signatures-directory), whose response is itself signed with
 * tag "http-message-signatures-directory". Verifiers (Cloudflare, Akamai, DataDome) fetch that
 * directory once and then check every request.
 *
 * Off by default: the fetcher signs only when `WEB_BOT_AUTH=1` and `WEB_BOT_AUTH_PRIVATE_KEY` is
 * set. The private key lives only in the environment (never in git); `pnpm --filter
 * @pretoscop/fetch bot-auth:keygen` creates one. Pure computation (node:crypto), no I/O, so the
 * web app can import it through `@pretoscop/fetch/signing` to serve the key directory.
 *
 * The header shapes follow the drafts as of 2026-10; the tests pin them to the RFC 9421 B.2.6 and
 * the web-bot-auth architecture examples, so a drift in the drafts is a one-file change here.
 */

export const WEB_BOT_AUTH_TAG = 'web-bot-auth';
export const DIRECTORY_TAG = 'http-message-signatures-directory';
export const DIRECTORY_PATH = '/.well-known/http-message-signatures-directory';
export const DIRECTORY_MEDIA_TYPE = 'application/http-message-signatures-directory+json';
/** Signatures are valid this long; a verifier rejects them afterwards (replay window). */
export const DEFAULT_SIGNATURE_VALIDITY_SECONDS = 300;

/** The public half of an Ed25519 key as a JWK (RFC 8037), without optional members. */
export interface Ed25519PublicJwk {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
}

export interface Ed25519Key {
  privateKey: KeyObject;
  publicKey: KeyObject;
  jwk: Ed25519PublicJwk;
  /** RFC 7638 JWK SHA-256 thumbprint, base64url: the `keyid` of every signature. */
  keyid: string;
}

export class WebBotAuthKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebBotAuthKeyError';
  }
}

// PKCS#8 DER prefix of an Ed25519 private key (RFC 8410): SEQUENCE { version 0, AlgorithmIdentifier
// { id-Ed25519 }, OCTET STRING { OCTET STRING (32 bytes) } }.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** RFC 7638 thumbprint of an Ed25519 JWK: SHA-256 over the required members in lexicographic order. */
export function jwkThumbprint(jwk: Ed25519PublicJwk): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  return createHash('sha256').update(canonical, 'utf8').digest('base64url');
}

function fromPrivateKey(privateKey: KeyObject): Ed25519Key {
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new WebBotAuthKeyError('the key is not an Ed25519 key');
  const publicKey = createPublicKey(privateKey);
  const exported = publicKey.export({ format: 'jwk' });
  if (typeof exported.x !== 'string') throw new WebBotAuthKeyError('could not derive the public key');
  const jwk: Ed25519PublicJwk = { kty: 'OKP', crv: 'Ed25519', x: exported.x };
  return { privateKey, publicKey, jwk, keyid: jwkThumbprint(jwk) };
}

/**
 * Loads the private key from `WEB_BOT_AUTH_PRIVATE_KEY`: either the 32-byte seed as base64url
 * (the JWK `d` member, what `bot-auth:keygen` prints) or a PKCS#8 PEM block.
 */
export function loadEd25519Key(value: string): Ed25519Key {
  const v = value.trim();
  if (v === '') throw new WebBotAuthKeyError('the key is empty');
  try {
    if (v.startsWith('-----BEGIN')) return fromPrivateKey(createPrivateKey(v.replace(/\\n/g, '\n')));
    if (!/^[A-Za-z0-9_-]{43}=?$/.test(v)) throw new WebBotAuthKeyError('expected a base64url Ed25519 seed (43 characters) or a PKCS#8 PEM block');
    const seed = Buffer.from(v.replace(/=$/, ''), 'base64url');
    if (seed.length !== 32) throw new WebBotAuthKeyError('an Ed25519 seed has 32 bytes');
    return fromPrivateKey(createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' }));
  } catch (err) {
    if (err instanceof WebBotAuthKeyError) throw err;
    throw new WebBotAuthKeyError(`unreadable key: ${(err as Error).message}`);
  }
}

/** A fresh key and its seed in the `WEB_BOT_AUTH_PRIVATE_KEY` format. */
export function generateEd25519Key(): { secret: string; key: Ed25519Key } {
  const { privateKey } = generateKeyPairSync('ed25519');
  const d = privateKey.export({ format: 'jwk' }).d;
  if (typeof d !== 'string') throw new WebBotAuthKeyError('key generation failed');
  return { secret: d, key: fromPrivateKey(privateKey) };
}

/** A public key from a directory entry, for verification. */
export function publicKeyFromJwk(jwk: Ed25519PublicJwk): KeyObject {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, format: 'jwk' });
}

// ------------------------------------------------------------------ RFC 9421 building blocks

/** A covered component: a derived component (`@authority`) or a header field (`signature-agent`). */
export interface Component {
  name: string;
  /** `;req`: the component comes from the request a response answers (RFC 9421 §2.4). */
  req?: boolean;
}

/** Signature parameters in the order they are serialized (RFC 9421 §2.3). */
export interface SignatureParams {
  created?: number;
  keyid?: string;
  alg?: string;
  expires?: number;
  nonce?: string;
  tag?: string;
}

/** The message parts a signature base can refer to. Header names are matched case-insensitively. */
export interface HttpMessageParts {
  method?: string;
  url?: string | URL;
  status?: number;
  headers?: Record<string, string | undefined>;
}

/** RFC 8941 sf-string: printable ASCII, with `\` and `"` escaped. */
export function sfString(value: string): string {
  if (!/^[\x20-\x7e]*$/.test(value)) throw new TypeError(`not a structured-field string: ${JSON.stringify(value)}`);
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function serializeComponent(c: Component): string {
  return `${sfString(c.name)}${c.req ? ';req' : ''}`;
}

/** `("@authority" "signature-agent");created=…;keyid="…"` — the value of `@signature-params`. */
export function serializeSignatureParams(components: readonly Component[], params: SignatureParams): string {
  let out = `(${components.map(serializeComponent).join(' ')})`;
  for (const [name, value] of Object.entries(params) as [keyof SignatureParams, unknown][]) {
    if (value === undefined) continue;
    if (typeof value === 'number') {
      if (!Number.isInteger(value) || value < 0) throw new TypeError(`signature parameter ${name} must be a non-negative integer`);
      out += `;${name}=${value}`;
    } else out += `;${name}=${sfString(String(value))}`;
  }
  return out;
}

function headerValue(headers: Record<string, string | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const wanted = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === wanted && v !== undefined) return v;
  return undefined;
}

/** The canonical value of one component (RFC 9421 §2.1, §2.2). */
export function componentValue(c: Component, message: HttpMessageParts, request?: HttpMessageParts): string {
  const m = c.req ? request : message;
  if (!m) throw new Error(`component ${c.name};req needs the request`);
  const name = c.name.toLowerCase();
  if (name.startsWith('@')) {
    if (name === '@method') {
      if (!m.method) throw new Error('@method needs the request method');
      return m.method;
    }
    if (name === '@status') {
      if (m.status === undefined) throw new Error('@status needs a response');
      return String(m.status);
    }
    if (!m.url) throw new Error(`${name} needs the target URI`);
    const url = typeof m.url === 'string' ? new URL(m.url) : m.url;
    switch (name) {
      case '@authority':
        return url.host.toLowerCase(); // WHATWG URL already drops default ports
      case '@scheme':
        return url.protocol.replace(/:$/, '').toLowerCase();
      case '@target-uri':
        return url.href;
      case '@path':
        return url.pathname || '/';
      case '@query':
        return url.search || '?';
      case '@request-target':
        return `${url.pathname || '/'}${url.search}`;
      default:
        throw new Error(`unsupported derived component ${name}`);
    }
  }
  const value = headerValue(m.headers, name);
  if (value === undefined) throw new Error(`header ${name} is not in the message`);
  return value.trim().replace(/[ \t]*\r?\n[ \t]*/g, ' ');
}

/** The signature base (RFC 9421 §2.5): one line per component, then `@signature-params`. */
export function signatureBase(components: readonly Component[], paramsValue: string, message: HttpMessageParts, request?: HttpMessageParts): string {
  const lines = components.map((c) => `${serializeComponent(c)}: ${componentValue(c, message, request)}`);
  lines.push(`"@signature-params": ${paramsValue}`);
  return lines.join('\n');
}

/** Ed25519 signature over a signature base, base64 (the `:…:` byte sequence content). */
export function signBase(base: string, key: Ed25519Key): string {
  return sign(null, Buffer.from(base, 'utf8'), key.privateKey).toString('base64');
}

// ------------------------------------------------------------------ request signing (the crawler)

export interface RequestSigner {
  /** The `Signature-Agent` value (an sf-string, quotes included). */
  readonly signatureAgent: string;
  readonly keyid: string;
  /** Headers to add to a request for `url`: `signature-agent`, `signature-input`, `signature`. */
  sign(url: URL): Record<string, string>;
}

export interface WebBotAuthSignerOptions {
  key: Ed25519Key | string;
  /** Origin that serves the key directory, e.g. `https://pretoscop.ro`. */
  agentOrigin: string;
  validitySeconds?: number;
  /** Signature label in Signature-Input / Signature. */
  label?: string;
  now?: () => number;
  nonce?: () => string;
}

const LABEL_RE = /^[a-z*][a-z0-9_\-.*]*$/;

export function createWebBotAuthSigner(opts: WebBotAuthSignerOptions): RequestSigner {
  const key = typeof opts.key === 'string' ? loadEd25519Key(opts.key) : opts.key;
  const origin = new URL(opts.agentOrigin).origin;
  if (!/^https?:\/\//.test(origin)) throw new TypeError(`Signature-Agent must be an http(s) origin, got ${opts.agentOrigin}`);
  const signatureAgent = sfString(origin);
  const label = opts.label ?? 'sig1';
  if (!LABEL_RE.test(label)) throw new TypeError(`invalid signature label ${label}`);
  const validity = Math.max(1, Math.floor(opts.validitySeconds ?? DEFAULT_SIGNATURE_VALIDITY_SECONDS));
  const now = opts.now ?? Date.now;
  const nonce = opts.nonce ?? (() => randomBytes(64).toString('base64'));
  const components: Component[] = [{ name: '@authority' }, { name: 'signature-agent' }];
  return {
    signatureAgent,
    keyid: key.keyid,
    sign(url: URL): Record<string, string> {
      const created = Math.floor(now() / 1000);
      const params = serializeSignatureParams(components, {
        created,
        keyid: key.keyid,
        alg: 'ed25519',
        expires: created + validity,
        nonce: nonce(),
        tag: WEB_BOT_AUTH_TAG,
      });
      const base = signatureBase(components, params, { url, headers: { 'signature-agent': signatureAgent } });
      return {
        'signature-agent': signatureAgent,
        'signature-input': `${label}=${params}`,
        signature: `${label}=:${signBase(base, key)}:`,
      };
    },
  };
}

function envOn(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test((value ?? '').trim());
}

/**
 * The signer the environment asks for: none unless `WEB_BOT_AUTH` is on. On without a usable
 * `WEB_BOT_AUTH_PRIVATE_KEY` throws: a crawler that was told to sign must not run unsigned.
 * The Signature-Agent is the origin of the bot info URL (`BOT_INFO_URL`, https://pretoscop.ro).
 */
export function signerFromEnv(env: Record<string, string | undefined>, defaultInfoUrl = 'https://pretoscop.ro/bot'): RequestSigner | undefined {
  if (!envOn(env.WEB_BOT_AUTH)) return undefined;
  const secret = env.WEB_BOT_AUTH_PRIVATE_KEY;
  if (!secret || secret.trim() === '') throw new WebBotAuthKeyError('WEB_BOT_AUTH is on but WEB_BOT_AUTH_PRIVATE_KEY is not set');
  let origin: string;
  try {
    origin = new URL(env.BOT_INFO_URL?.trim() || defaultInfoUrl).origin;
  } catch {
    origin = new URL(defaultInfoUrl).origin;
  }
  return createWebBotAuthSigner({ key: secret, agentOrigin: origin });
}

// ------------------------------------------------------------------ key directory (the web app)

/** Body of the key directory: `{"keys":[<JWK>…]}`. */
export function directoryBody(keys: readonly Ed25519Key[]): string {
  return JSON.stringify({ keys: keys.map((k) => k.jwk) });
}

/**
 * Signature headers for the directory response, one signature per published key, each covering
 * the authority the client asked for (`"@authority";req`) with tag "http-message-signatures-directory".
 */
export function signDirectoryResponse(opts: {
  keys: readonly Ed25519Key[];
  authority: string;
  now?: number;
  validitySeconds?: number;
  nonce?: () => string;
}): { 'signature-input': string; signature: string } {
  if (opts.keys.length === 0) throw new WebBotAuthKeyError('no key to sign the directory with');
  const created = Math.floor((opts.now ?? Date.now()) / 1000);
  const validity = Math.max(1, Math.floor(opts.validitySeconds ?? DEFAULT_SIGNATURE_VALIDITY_SECONDS));
  const nonce = opts.nonce ?? (() => randomBytes(32).toString('base64'));
  const components: Component[] = [{ name: '@authority', req: true }];
  const request: HttpMessageParts = { url: `https://${opts.authority}/` };
  const inputs: string[] = [];
  const signatures: string[] = [];
  opts.keys.forEach((key, i) => {
    const label = `sig${i + 1}`;
    const params = serializeSignatureParams(components, {
      created,
      keyid: key.keyid,
      alg: 'ed25519',
      expires: created + validity,
      nonce: nonce(),
      tag: DIRECTORY_TAG,
    });
    inputs.push(`${label}=${params}`);
    signatures.push(`${label}=:${signBase(signatureBase(components, params, {}, request), key)}:`);
  });
  return { 'signature-input': inputs.join(', '), signature: signatures.join(', ') };
}

// ------------------------------------------------------------------ verification (tests, self-checks)

export interface ParsedSignature {
  label: string;
  components: Component[];
  params: SignatureParams & Record<string, string | number | boolean>;
  /** The exact `@signature-params` value, as received. */
  paramsValue: string;
  signature: Buffer;
}

function parseSfStringAt(s: string, i: number): { value: string; end: number } {
  if (s[i] !== '"') throw new Error(`expected a string at ${i}`);
  let out = '';
  for (let j = i + 1; j < s.length; j++) {
    const ch = s[j]!;
    if (ch === '\\') {
      const next = s[j + 1];
      if (next !== '"' && next !== '\\') throw new Error('bad escape');
      out += next;
      j++;
    } else if (ch === '"') return { value: out, end: j + 1 };
    else out += ch;
  }
  throw new Error('unterminated string');
}

function parseParamsAt(s: string, i: number): { params: Record<string, string | number | boolean>; end: number } {
  const params: Record<string, string | number | boolean> = {};
  let j = i;
  while (s[j] === ';') {
    const m = /^[a-z*][a-z0-9_\-.*]*/.exec(s.slice(j + 1));
    if (!m) throw new Error(`bad parameter at ${j}`);
    const name = m[0];
    j += 1 + name.length;
    if (s[j] !== '=') {
      params[name] = true;
      continue;
    }
    j++;
    if (s[j] === '"') {
      const str = parseSfStringAt(s, j);
      params[name] = str.value;
      j = str.end;
    } else {
      const num = /^-?\d{1,15}/.exec(s.slice(j));
      if (!num) throw new Error(`bad value for ${name}`);
      params[name] = Number(num[0]);
      j += num[0].length;
    }
  }
  return { params, end: j };
}

/** Splits a structured-field dictionary into `label → raw member` (only what our headers use). */
function splitDictionary(header: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  const s = header;
  while (i < s.length) {
    while (s[i] === ' ' || s[i] === ',') i++;
    if (i >= s.length) break;
    const m = /^[a-z*][a-z0-9_\-.*]*/.exec(s.slice(i));
    if (!m || s[i + m[0].length] !== '=') throw new Error(`bad dictionary member at ${i}`);
    const label = m[0];
    let j = i + label.length + 1;
    const start = j;
    // Member value: an inner list "(...)" or a byte sequence ":...:", followed by parameters.
    if (s[j] === '(') {
      let depth = 0;
      for (; j < s.length; j++) {
        if (s[j] === '"') {
          j = parseSfStringAt(s, j).end - 1;
          continue;
        }
        if (s[j] === '(') depth++;
        if (s[j] === ')' && --depth === 0) break;
      }
      j++;
    } else if (s[j] === ':') {
      j = s.indexOf(':', j + 1) + 1;
      if (j === 0) throw new Error('unterminated byte sequence');
    } else throw new Error(`unsupported member value for ${label}`);
    j = parseParamsAt(s, j).end;
    out.set(label, s.slice(start, j));
    i = j;
  }
  return out;
}

/** Parses `Signature-Input` + `Signature` into their signatures (RFC 9421 §4). */
export function parseSignatureHeaders(signatureInput: string, signatureHeader: string): ParsedSignature[] {
  const inputs = splitDictionary(signatureInput);
  const sigs = splitDictionary(signatureHeader);
  const out: ParsedSignature[] = [];
  for (const [label, raw] of inputs) {
    const sigRaw = sigs.get(label);
    if (!sigRaw) continue;
    if (raw[0] !== '(') throw new Error(`signature input ${label} is not an inner list`);
    const components: Component[] = [];
    let i = 1;
    for (;;) {
      while (raw[i] === ' ') i++;
      if (raw[i] === ')') break;
      if (i >= raw.length) throw new Error(`unterminated inner list in ${label}`);
      const str = parseSfStringAt(raw, i);
      const p = parseParamsAt(raw, str.end);
      components.push(p.params.req ? { name: str.value, req: true } : { name: str.value });
      i = p.end;
    }
    const { params } = parseParamsAt(raw, i + 1);
    const b64 = /^:([A-Za-z0-9+/=]*):/.exec(sigRaw);
    if (!b64) throw new Error(`bad signature value for ${label}`);
    out.push({ label, components, params, paramsValue: raw, signature: Buffer.from(b64[1]!, 'base64') });
  }
  return out;
}

export type VerifyFailure = 'no_signature' | 'wrong_tag' | 'unknown_key' | 'expired' | 'not_yet_valid' | 'bad_signature' | 'missing_component';

/**
 * Verifies a Web Bot Auth request signature the way a CDN would: a signature tagged
 * `web-bot-auth` covering `@authority`, made by a key of the directory, inside its validity window.
 */
export function verifyWebBotAuthRequest(input: {
  url: string | URL;
  headers: Record<string, string | undefined>;
  keys: readonly Ed25519PublicJwk[];
  now?: number;
  tag?: string;
  request?: HttpMessageParts;
}): { ok: true; keyid: string; label: string } | { ok: false; reason: VerifyFailure } {
  const sigInput = headerValue(input.headers, 'signature-input');
  const sigHeader = headerValue(input.headers, 'signature');
  if (!sigInput || !sigHeader) return { ok: false, reason: 'no_signature' };
  const tag = input.tag ?? WEB_BOT_AUTH_TAG;
  const nowSec = Math.floor((input.now ?? Date.now()) / 1000);
  let parsed: ParsedSignature[];
  try {
    parsed = parseSignatureHeaders(sigInput, sigHeader);
  } catch {
    return { ok: false, reason: 'no_signature' };
  }
  const candidates = parsed.filter((p) => p.params.tag === tag);
  if (candidates.length === 0) return { ok: false, reason: 'wrong_tag' };
  let reason: VerifyFailure = 'unknown_key';
  for (const p of candidates) {
    const jwk = input.keys.find((k) => jwkThumbprint(k) === p.params.keyid);
    if (!jwk) continue;
    if (typeof p.params.expires === 'number' && p.params.expires < nowSec) {
      reason = 'expired';
      continue;
    }
    if (typeof p.params.created === 'number' && p.params.created > nowSec + 60) {
      reason = 'not_yet_valid';
      continue;
    }
    if (!p.components.some((c) => c.name === '@authority')) {
      reason = 'missing_component';
      continue;
    }
    let base: string;
    try {
      base = signatureBase(p.components, p.paramsValue, { url: input.url, headers: input.headers }, input.request);
    } catch {
      reason = 'missing_component';
      continue;
    }
    if (verify(null, Buffer.from(base, 'utf8'), publicKeyFromJwk(jwk), p.signature)) {
      return { ok: true, keyid: String(p.params.keyid), label: p.label };
    }
    reason = 'bad_signature';
  }
  return { ok: false, reason };
}
