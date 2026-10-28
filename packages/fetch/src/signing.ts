import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify, type KeyObject } from 'node:crypto';

/**
 * Web Bot Auth (M21): PretoscopBot proves its identity cryptographically, on top of the
 * User-Agent and the published IPs. Requests carry HTTP Message Signatures (RFC 9421) made with
 * an Ed25519 key, as specified by draft-ietf-webbotauth-httpsig-protocol-00 (1 September 2026):
 *
 *   Signature-Agent: sig1="https://pretoscop.ro"
 *   Signature-Input: sig1=("@authority" "signature-agent";key="sig1");created=…;keyid="<JWK thumbprint>";alg="ed25519";expires=…;nonce="…";tag="web-bot-auth"
 *   Signature: sig1=:<base64 Ed25519 signature>:
 *
 * `Signature-Agent` is a structured-field Dictionary whose member (keyed by the signature label)
 * names the origin serving the key directory, and that member is a covered component (§5.2.1:
 * "Signers MUST send the dictionary form"; the bare-string form of the earlier drafts is legacy and
 * only accepted by `verifyWebBotAuthRequest`). The public key is published at
 * `<origin>/.well-known/http-message-signatures-directory` as a JWK Set whose response is itself
 * signed with tag "http-message-signatures-directory", covering `"@authority";req` and
 * `content-digest` (Appendix B.1). Verifiers (Cloudflare, Akamai, DataDome) fetch the directory and
 * then check every request.
 *
 * Off by default: the fetcher signs only when `WEB_BOT_AUTH=1` and `WEB_BOT_AUTH_PRIVATE_KEY` is
 * set. The private key lives only in the environment (never in git); `pnpm --filter
 * @pretoscop/fetch bot-auth:keygen` creates one. Pure computation (node:crypto), no I/O, so the
 * web app can import it through `@pretoscop/fetch/signing` to serve the key directory.
 *
 * The tests pin the header shapes to RFC 9421 B.2.6 and to the draft's Appendix E.2 vectors
 * (E.2.1 request, E.2.2 legacy request, E.2.3 directory), so a drift in the draft is a one-file
 * change here.
 */

export const WEB_BOT_AUTH_TAG = 'web-bot-auth';
export const DIRECTORY_TAG = 'http-message-signatures-directory';
export const DIRECTORY_PATH = '/.well-known/http-message-signatures-directory';
export const DIRECTORY_MEDIA_TYPE = 'application/http-message-signatures-directory+json';
/** The draft the header shapes follow; printed by the self-check and the runbook. */
export const WEB_BOT_AUTH_SPEC = 'draft-ietf-webbotauth-httpsig-protocol-00';
/**
 * Request signatures are valid this long; a verifier rejects them afterwards. A signature that
 * covers only the authority can be replayed against the same site until it expires, so keep it
 * short: signing happens right before sending, after the per-host wait, so a minute covers the
 * 30 s request budget.
 */
export const DEFAULT_SIGNATURE_VALIDITY_SECONDS = 60;
/** Clock skew a verifier here tolerates for `created` (seconds). */
const MAX_CLOCK_SKEW_SECONDS = 60;

/** The public half of an Ed25519 key as a JWK (RFC 8037), without optional members. */
export interface Ed25519PublicJwk {
  kty: 'OKP';
  crv: 'Ed25519';
  x: string;
}

/** A key as the directory publishes it: `kid` is the JWK thumbprint (draft §5.5), `use` is "sig". */
export interface DirectoryJwk extends Ed25519PublicJwk {
  kid: string;
  use: 'sig';
}

export interface Ed25519Key {
  privateKey: KeyObject;
  publicKey: KeyObject;
  jwk: Ed25519PublicJwk;
  /** RFC 7638 / RFC 8037 JWK SHA-256 thumbprint, base64url: the `keyid` of every signature. */
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
export function jwkThumbprint(jwk: Pick<Ed25519PublicJwk, 'crv' | 'kty' | 'x'>): string {
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
 * (the JWK `d` member, what `bot-auth:keygen` prints) or a PKCS#8 PEM block. Error messages never
 * contain the key.
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
export function publicKeyFromJwk(jwk: Pick<Ed25519PublicJwk, 'x'>): KeyObject {
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, format: 'jwk' });
}

// ------------------------------------------------------------------ RFC 8941 / RFC 9421 building blocks

/**
 * A covered component: a derived component (`@authority`) or a header field (`signature-agent`),
 * optionally one member of a Dictionary header (`;key="sig1"`, RFC 9421 §2.1.2) or taken from the
 * request a response answers (`;req`, §2.4).
 */
export interface Component {
  name: string;
  key?: string;
  req?: boolean;
  /** The identifier exactly as a received Signature-Input serialized it (verification only). */
  id?: string;
}

/** Signature parameters, serialized in the order they are given (RFC 9421 §2.3). */
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

const KEY_RE = /^[a-z*][a-z0-9_\-.*]*/;
const TOKEN_RE = /^[A-Za-z*][!#$%&'*+\-.^_`|~0-9A-Za-z:/]*/;

export function serializeComponent(c: Component): string {
  if (c.id !== undefined) return c.id;
  return `${sfString(c.name)}${c.key !== undefined ? `;key=${sfString(c.key)}` : ''}${c.req ? ';req' : ''}`;
}

/** `("@authority" "signature-agent";key="sig1");created=…;keyid="…"` — the value of `@signature-params`. */
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
    else if (ch < ' ' || ch > '~') throw new Error('invalid character in a string');
    else out += ch;
  }
  throw new Error('unterminated string');
}

/** One bare item at `i`, canonically re-serialized (strings, tokens, numbers, booleans, byte sequences). */
function parseBareItemAt(s: string, i: number): { text: string; end: number } {
  const ch = s[i];
  if (ch === '"') {
    const str = parseSfStringAt(s, i);
    return { text: sfString(str.value), end: str.end };
  }
  if (ch === '?') {
    if (s[i + 1] !== '0' && s[i + 1] !== '1') throw new Error('bad boolean');
    return { text: s.slice(i, i + 2), end: i + 2 };
  }
  if (ch === ':') {
    const end = s.indexOf(':', i + 1);
    if (end < 0 || !/^[A-Za-z0-9+/=]*$/.test(s.slice(i + 1, end))) throw new Error('bad byte sequence');
    return { text: s.slice(i, end + 1), end: end + 1 };
  }
  const num = /^-?\d{1,15}(\.\d{1,3})?/.exec(s.slice(i));
  if (num) return { text: num[0], end: i + num[0].length };
  const tok = TOKEN_RE.exec(s.slice(i));
  if (tok) return { text: tok[0], end: i + tok[0].length };
  throw new Error(`unsupported item at ${i}`);
}

/** Parameters at `i` (`;a=1;b`), canonically re-serialized. */
function parseParamsTextAt(s: string, i: number): { text: string; end: number } {
  let text = '';
  let j = i;
  while (s[j] === ';') {
    j++;
    while (s[j] === ' ') j++;
    const key = KEY_RE.exec(s.slice(j))?.[0];
    if (!key) throw new Error(`bad parameter at ${j}`);
    j += key.length;
    if (s[j] === '=') {
      const item = parseBareItemAt(s, j + 1);
      text += item.text === '?1' ? `;${key}` : `;${key}=${item.text}`;
      j = item.end;
    } else text += `;${key}`;
  }
  return { text, end: j };
}

/**
 * A structured-field Dictionary (RFC 8941 §3.2) of items, each member canonically re-serialized:
 * what RFC 9421 §2.1.2 signs for a `;key=` component. Inner lists are not supported (not used
 * by Signature-Agent).
 */
export function parseSfDictionary(value: string): Map<string, string> {
  const out = new Map<string, string>();
  const s = value.trim();
  let i = 0;
  while (i < s.length) {
    const key = KEY_RE.exec(s.slice(i))?.[0];
    if (!key) throw new Error(`bad dictionary key at ${i}`);
    i += key.length;
    let item = '?1';
    if (s[i] === '=') {
      const parsed = parseBareItemAt(s, i + 1);
      item = parsed.text;
      i = parsed.end;
    }
    const params = parseParamsTextAt(s, i);
    i = params.end;
    out.set(key, item === '?1' && params.text === '' ? '?1' : `${item}${params.text}`);
    while (s[i] === ' ' || s[i] === '\t') i++;
    if (i >= s.length) break;
    if (s[i] !== ',') throw new Error(`expected "," at ${i}`);
    i++;
    while (s[i] === ' ' || s[i] === '\t') i++;
    if (i >= s.length) throw new Error('trailing comma');
  }
  return out;
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
  if (c.key !== undefined) {
    const member = parseSfDictionary(value).get(c.key);
    if (member === undefined) throw new Error(`header ${name} has no member ${c.key}`);
    return member;
  }
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

/** RFC 9530 `Content-Digest` value with SHA-256: `sha-256=:<base64>:`. */
export function contentDigest(body: string | Uint8Array): string {
  return `sha-256=:${createHash('sha256').update(body).digest('base64')}:`;
}

// ------------------------------------------------------------------ request signing (the crawler)

export interface RequestSigner {
  /** Origin named in the Signature-Agent member, e.g. `https://pretoscop.ro`. */
  readonly agentOrigin: string;
  /** The `Signature-Agent` header value (dictionary form), e.g. `sig1="https://pretoscop.ro"`. */
  readonly signatureAgent: string;
  readonly keyid: string;
  /** Headers to add to a request for `url`: `signature-agent`, `signature-input`, `signature`. */
  sign(url: URL): Record<string, string>;
}

export interface WebBotAuthSignerOptions {
  key: Ed25519Key | string;
  /** Origin that serves the key directory, e.g. `https://pretoscop.ro` (a path is dropped). */
  agentOrigin: string;
  validitySeconds?: number;
  /** Signature label in Signature-Input / Signature. Default `sig1`. */
  label?: string;
  /** Key of our member in the Signature-Agent dictionary. Default: the label (draft §5.2.1). */
  agentKey?: string;
  now?: () => number;
  nonce?: () => string;
}

const LABEL_RE = /^[a-z*][a-z0-9_\-.*]*$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The Signature-Agent origin: https (draft §5.2.1), or http on a loopback host for local tests. */
export function signatureAgentOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`Signature-Agent must be an https origin, got ${value}`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) {
    throw new TypeError(`Signature-Agent must be an https origin, got ${url.origin}`);
  }
  return url.origin;
}

export function createWebBotAuthSigner(opts: WebBotAuthSignerOptions): RequestSigner {
  const key = typeof opts.key === 'string' ? loadEd25519Key(opts.key) : opts.key;
  const origin = signatureAgentOrigin(opts.agentOrigin);
  const label = opts.label ?? 'sig1';
  const agentKey = opts.agentKey ?? label;
  if (!LABEL_RE.test(label)) throw new TypeError(`invalid signature label ${label}`);
  if (!LABEL_RE.test(agentKey)) throw new TypeError(`invalid Signature-Agent key ${agentKey}`);
  const signatureAgent = `${agentKey}=${sfString(origin)}`;
  const validity = Math.max(1, Math.floor(opts.validitySeconds ?? DEFAULT_SIGNATURE_VALIDITY_SECONDS));
  const now = opts.now ?? Date.now;
  const nonce = opts.nonce ?? (() => randomBytes(64).toString('base64'));
  const components: Component[] = [{ name: '@authority' }, { name: 'signature-agent', key: agentKey }];
  return {
    agentOrigin: origin,
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
  return createWebBotAuthSigner({ key: secret, agentOrigin: env.BOT_INFO_URL?.trim() || defaultInfoUrl });
}

// ------------------------------------------------------------------ key directory (the web app)

/** The directory entry of a key (member order as in the draft's Appendix E.2.3). */
export function directoryJwk(key: Ed25519Key): DirectoryJwk {
  return { kty: 'OKP', crv: 'Ed25519', kid: key.keyid, x: key.jwk.x, use: 'sig' };
}

/** Body of the key directory: `{"keys":[<JWK>…]}`. Public members only, never `d`. */
export function directoryBody(keys: readonly Ed25519Key[]): string {
  return JSON.stringify({ keys: keys.map(directoryJwk) });
}

/**
 * Headers proving possession of every published key (draft Appendix B.1): `Content-Digest` of the
 * body and one signature per key covering the authority the client asked for (`"@authority";req`)
 * and that digest, with tag "http-message-signatures-directory". Labels: `binding`, `binding2`, …
 */
export function signDirectoryResponse(opts: {
  keys: readonly Ed25519Key[];
  /** The exact response body (`directoryBody(keys)`). */
  body: string | Uint8Array;
  authority: string;
  now?: number;
  validitySeconds?: number;
}): { 'content-digest': string; 'signature-input': string; signature: string } {
  if (opts.keys.length === 0) throw new WebBotAuthKeyError('no key to sign the directory with');
  const created = Math.floor((opts.now ?? Date.now()) / 1000);
  const validity = Math.max(1, Math.floor(opts.validitySeconds ?? DEFAULT_SIGNATURE_VALIDITY_SECONDS));
  const digest = contentDigest(opts.body);
  const components: Component[] = [{ name: '@authority', req: true }, { name: 'content-digest' }];
  const request: HttpMessageParts = { url: `https://${opts.authority}/` };
  const response: HttpMessageParts = { headers: { 'content-digest': digest } };
  const inputs: string[] = [];
  const signatures: string[] = [];
  opts.keys.forEach((key, i) => {
    const label = i === 0 ? 'binding' : `binding${i + 1}`;
    const params = serializeSignatureParams(components, { created, expires: created + validity, keyid: key.keyid, tag: DIRECTORY_TAG });
    inputs.push(`${label}=${params}`);
    signatures.push(`${label}=:${signBase(signatureBase(components, params, response, request), key)}:`);
  });
  return { 'content-digest': digest, 'signature-input': inputs.join(', '), signature: signatures.join(', ') };
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

function parseParamsAt(s: string, i: number): { params: Record<string, string | number | boolean>; end: number } {
  const params: Record<string, string | number | boolean> = {};
  let j = i;
  while (s[j] === ';') {
    const m = KEY_RE.exec(s.slice(j + 1));
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

/** Splits a structured-field dictionary into `label → raw member` (inner lists and byte sequences). */
function splitDictionary(header: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  const s = header;
  while (i < s.length) {
    while (s[i] === ' ' || s[i] === ',') i++;
    if (i >= s.length) break;
    const m = KEY_RE.exec(s.slice(i));
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
      const component: Component = { name: str.value, id: raw.slice(i, p.end) };
      if (p.params.req === true) component.req = true;
      if (typeof p.params.key === 'string') component.key = p.params.key;
      components.push(component);
      i = p.end;
    }
    const { params } = parseParamsAt(raw, i + 1);
    const b64 = /^:([A-Za-z0-9+/=]*):/.exec(sigRaw);
    if (!b64) throw new Error(`bad signature value for ${label}`);
    out.push({ label, components, params, paramsValue: raw, signature: Buffer.from(b64[1]!, 'base64') });
  }
  return out;
}

export type VerifyFailure =
  | 'no_signature'
  | 'wrong_tag'
  | 'unknown_key'
  | 'expired'
  | 'not_yet_valid'
  | 'missing_params'
  | 'bad_signature'
  | 'missing_component'
  | 'bad_digest';

function timeCheck(p: ParsedSignature, nowSec: number): VerifyFailure | null {
  if (typeof p.params.created !== 'number' || typeof p.params.expires !== 'number') return 'missing_params';
  if (p.params.expires < nowSec) return 'expired';
  if (p.params.created > nowSec + MAX_CLOCK_SKEW_SECONDS) return 'not_yet_valid';
  return null;
}

/**
 * Verifies a Web Bot Auth request signature the way a CDN would (draft §5.4): a signature tagged
 * `web-bot-auth` with `created` and `expires`, inside its window, covering `@authority` (or
 * `@target-uri`) and the Signature-Agent member it names, made by a key of the directory. The
 * legacy bare-string Signature-Agent (covered without `;key`) is accepted, as the draft allows
 * verifiers to.
 */
export function verifyWebBotAuthRequest(input: {
  url: string | URL;
  headers: Record<string, string | undefined>;
  keys: ReadonlyArray<Pick<Ed25519PublicJwk, 'crv' | 'kty' | 'x'>>;
  now?: number;
}): { ok: true; keyid: string; label: string; agent: string } | { ok: false; reason: VerifyFailure } {
  const sigInput = headerValue(input.headers, 'signature-input');
  const sigHeader = headerValue(input.headers, 'signature');
  if (!sigInput || !sigHeader) return { ok: false, reason: 'no_signature' };
  const nowSec = Math.floor((input.now ?? Date.now()) / 1000);
  let parsed: ParsedSignature[];
  try {
    parsed = parseSignatureHeaders(sigInput, sigHeader);
  } catch {
    return { ok: false, reason: 'no_signature' };
  }
  const candidates = parsed.filter((p) => p.params.tag === WEB_BOT_AUTH_TAG);
  if (candidates.length === 0) return { ok: false, reason: 'wrong_tag' };
  let reason: VerifyFailure = 'unknown_key';
  for (const p of candidates) {
    const jwk = input.keys.find((k) => jwkThumbprint(k) === p.params.keyid);
    if (!jwk) continue;
    const late = timeCheck(p, nowSec);
    if (late) {
      reason = late;
      continue;
    }
    const agentComponent = p.components.find((c) => c.name === 'signature-agent' && !c.req);
    if (!p.components.some((c) => (c.name === '@authority' || c.name === '@target-uri') && !c.req) || !agentComponent) {
      reason = 'missing_component';
      continue;
    }
    let base: string;
    let agent: string;
    try {
      base = signatureBase(p.components, p.paramsValue, { url: input.url, headers: input.headers });
      const member = componentValue(agentComponent, { headers: input.headers });
      agent = member.startsWith('"') ? parseSfStringAt(member, 0).value : member;
    } catch {
      reason = 'missing_component';
      continue;
    }
    if (verify(null, Buffer.from(base, 'utf8'), publicKeyFromJwk(jwk), p.signature)) {
      return { ok: true, keyid: String(p.params.keyid), label: p.label, agent };
    }
    reason = 'bad_signature';
  }
  return { ok: false, reason };
}

/**
 * Checks a key directory response the way a verifier validating the domain binding would (draft
 * Appendix B): the body is a JWK Set of Ed25519 keys, `Content-Digest` matches the body, and
 * every key has a signature tagged "http-message-signatures-directory" over `"@authority";req`
 * (the authority the directory was requested from) and `content-digest`, inside its window.
 */
export function verifyDirectoryResponse(input: {
  /** The URL the directory was requested at. */
  requestUrl: string | URL;
  headers: Record<string, string | undefined>;
  body: string | Uint8Array;
  now?: number;
}): { ok: true; keyids: string[] } | { ok: false; reason: VerifyFailure | 'bad_body'; keyid?: string } {
  let keys: DirectoryJwk[];
  try {
    const text = typeof input.body === 'string' ? input.body : Buffer.from(input.body).toString('utf8');
    keys = (JSON.parse(text) as { keys: DirectoryJwk[] }).keys;
    if (!Array.isArray(keys) || keys.length === 0) throw new Error('no keys');
    for (const k of keys) {
      if (k.kty !== 'OKP' || k.crv !== 'Ed25519' || typeof k.x !== 'string' || 'd' in k) throw new Error('not a public Ed25519 JWK');
      if (k.kid !== undefined && k.kid !== jwkThumbprint(k)) throw new Error('kid is not the thumbprint');
    }
  } catch {
    return { ok: false, reason: 'bad_body' };
  }
  const digest = headerValue(input.headers, 'content-digest');
  let digestOk = false;
  try {
    digestOk = !!digest && parseSfDictionary(digest).get('sha-256') === contentDigest(input.body).slice('sha-256='.length);
  } catch {
    digestOk = false;
  }
  if (!digestOk) return { ok: false, reason: 'bad_digest' };
  const sigInput = headerValue(input.headers, 'signature-input');
  const sigHeader = headerValue(input.headers, 'signature');
  if (!sigInput || !sigHeader) return { ok: false, reason: 'no_signature' };
  let parsed: ParsedSignature[];
  try {
    parsed = parseSignatureHeaders(sigInput, sigHeader).filter((p) => p.params.tag === DIRECTORY_TAG);
  } catch {
    return { ok: false, reason: 'no_signature' };
  }
  const nowSec = Math.floor((input.now ?? Date.now()) / 1000);
  const keyids: string[] = [];
  for (const k of keys) {
    const keyid = jwkThumbprint(k);
    const mine = parsed.filter((p) => p.params.keyid === keyid);
    if (mine.length === 0) return { ok: false, reason: 'no_signature', keyid };
    let reason: VerifyFailure = 'bad_signature';
    const good = mine.some((p) => {
      const late = timeCheck(p, nowSec);
      if (late) {
        reason = late;
        return false;
      }
      if (!p.components.some((c) => c.name === '@authority' && c.req) || !p.components.some((c) => c.name === 'content-digest' && !c.req)) {
        reason = 'missing_component';
        return false;
      }
      try {
        const base = signatureBase(p.components, p.paramsValue, { headers: input.headers }, { url: input.requestUrl });
        return verify(null, Buffer.from(base, 'utf8'), publicKeyFromJwk(k), p.signature);
      } catch {
        reason = 'missing_component';
        return false;
      }
    });
    if (!good) return { ok: false, reason, keyid };
    keyids.push(keyid);
  }
  return { ok: true, keyids };
}
