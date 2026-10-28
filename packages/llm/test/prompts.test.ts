import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  attributesV1,
  categoryV1,
  defaultRoutes,
  ForbiddenDataError,
  orderByPrefix,
  pairVerifyV1,
  parseAnswer,
  prepare,
  promptByVersion,
  redactPersonalData,
  sanitizeSide,
  type PromptDef,
} from '../src';

const routes = defaultRoutes({ default: 'claude-haiku-5-5', escalation: 'claude-sonnet-5-5' });

/**
 * Fingerprints of the released prompt versions. Editing a prompt's text, schema or user layout
 * changes its fingerprint: give it a new version instead (stored answers, the ledger and the eval
 * are keyed by id@version), add it to the registry and pin its fingerprint here.
 */
const FINGERPRINTS: Record<string, string> = {
  'pair_verify@1': '38b1dbae1c570927',
  'attributes@1': '0dc2fc37081540eb',
  'category@1': 'b63a337ff80d1533',
};

function fingerprint(p: PromptDef<never, unknown>, sample: unknown): string {
  return createHash('sha256')
    .update(p.system)
    .update(JSON.stringify(p.schema))
    .update((p.user as (i: unknown) => string)(sample))
    .digest('hex')
    .slice(0, 16);
}

const pairSample = {
  offer: { title: 'Telefon mobil Samsung Galaxy S25, 12GB RAM, 256GB, 5G, Navy', brand: 'Samsung', mpn: 'SM-S931B', gtin: null, category: 'telefoane-mobile', attributes: { storageGb: 256, ramGb: 12 }, priceLei: 3999.9, shop: 'forIT' },
  product: { title: 'Samsung Galaxy S25 5G Dual SIM 12/256GB Albastru inchis', brand: 'Samsung', mpn: null, gtin: '08806095467382', category: 'telefoane-mobile', attributes: { storageGb: 256 }, priceLei: '4099.00' },
};

describe('versioned prompts', () => {
  it.each([
    ['pair_verify@1', pairVerifyV1, pairSample],
    ['attributes@1', attributesV1, { title: 'Masina de spalat rufe Beko WUE6612DBA, 6 kg', category: null, brand: 'Beko' }],
    ['category@1', categoryV1, { shop: 'Bonami', path: 'Bucătărie > Electrocasnice de bucătărie', titles: ['Espressor DeLonghi Dedica'] }],
  ])('%s keeps its fingerprint (bump the version to change it)', (key, prompt, sample) => {
    expect(fingerprint(prompt as PromptDef<never, unknown>, sample)).toBe(FINGERPRINTS[key]);
    expect(promptByVersion(prompt.id, prompt.version)).toBe(prompt);
  });

  it('every prompt prefix is long enough to be cached (512 tokens on Haiku 5.5 and Sonnet 5.5)', () => {
    // UTF-8 bytes / 4 underestimates tokens for this text: a safe lower bound.
    for (const p of [pairVerifyV1, attributesV1, categoryV1]) expect(Buffer.byteLength(p.system, 'utf8') / 4).toBeGreaterThan(560);
  });

  it('schemas are closed objects without numeric bounds (structured-output limits)', () => {
    const walk = (s: unknown): void => {
      if (!s || typeof s !== 'object') return;
      const o = s as Record<string, unknown>;
      if (o.type === 'object') {
        expect(o.additionalProperties).toBe(false);
        expect(Object.keys(o.properties as object).sort()).toEqual([...(o.required as string[])].sort());
      }
      for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'multipleOf']) expect(k in o).toBe(false);
      for (const v of Object.values(o)) walk(v);
    };
    for (const p of [pairVerifyV1, attributesV1, categoryV1]) walk(p.schema);
  });

  it('the pair prompt is Romanian-aware (diacritics, colours, Dual SIM, bundles, accessories, refurbished)', () => {
    const s = pairVerifyV1.system;
    for (const w of ['Mașină', 'Maşină', 'negru = black', 'argintiu = silver', 'Dual SIM', '+ cadou', 'pentru', 'resigilat', 'Pro Max', '4G']) expect(s).toContain(w);
  });

  it('builds byte-identical requests for identical inputs, with the prefix cached for one hour', () => {
    const a = prepare(pairVerifyV1, routes.default, pairSample);
    const b = prepare(pairVerifyV1, routes.default, JSON.parse(JSON.stringify(pairSample)));
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.params.system).toEqual([{ type: 'text', text: pairVerifyV1.system, cache_control: { type: 'ephemeral', ttl: '1h' } }]);
    expect(a.params.output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema: pairVerifyV1.schema } });
    // No sampling parameters (400 on these models), no prefill, no forced tool use.
    const body = a.params as unknown as Record<string, unknown>;
    for (const k of ['temperature', 'top_p', 'top_k', 'tool_choice', 'tools', 'thinking']) expect(k in body).toBe(false);
    expect(a.params.messages.at(-1)!.role).toBe('user');
    expect(a.maxInputTokens).toBeGreaterThan(Buffer.byteLength(JSON.stringify(a.params)));
    // Another model or another offer is another request.
    expect(prepare(pairVerifyV1, routes.escalation, pairSample).inputHash).not.toBe(a.inputHash);
    expect(prepare(pairVerifyV1, routes.default, { ...pairSample, offer: { ...pairSample.offer, title: 'X 128GB' } }).inputHash).not.toBe(a.inputHash);
  });

  it('orders batch items by prompt prefix (model, prompt, effort)', () => {
    const items = [
      { req: prepare(attributesV1, routes.default, { title: 'B' }) },
      { req: prepare(pairVerifyV1, routes.escalation, pairSample) },
      { req: prepare(pairVerifyV1, routes.default, pairSample) },
      { req: prepare(attributesV1, routes.default, { title: 'A' }) },
    ];
    const keys = orderByPrefix(items).map((i) => i.req.prefixKey);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(3);
  });

  it('reads the documented response shape: thinking block first, then the JSON text', () => {
    const msg = JSON.parse(readFileSync(new URL('./fixtures/message-pair-verify.json', import.meta.url), 'utf8'));
    const r = parseAnswer(pairVerifyV1, msg);
    expect(r).toEqual({ ok: true, value: { same: true, confidence: 0.94, conflictingAttributes: [], reason: 'Same model S25, 256 GB and 12 GB RAM; navy is dark blue.' } });
  });

  it('treats refusals, truncation and invalid JSON as unusable answers', () => {
    const msg = (text: string, stop: 'end_turn' | 'refusal' | 'max_tokens' = 'end_turn') => ({ content: [{ type: 'text' as const, text, citations: null }], stop_reason: stop });
    expect(parseAnswer(pairVerifyV1, msg('{}', 'refusal'))).toEqual({ ok: false, error: 'refusal' });
    expect(parseAnswer(pairVerifyV1, msg('{"same_product": tr', 'max_tokens')).ok).toBe(false);
    expect(parseAnswer(pairVerifyV1, msg('not json')).ok).toBe(false);
    expect(parseAnswer(pairVerifyV1, msg('{"same_product":"yes","confidence":1,"conflicting_attributes":[],"reason":""}')).ok).toBe(false);
    // Out-of-range confidence is clamped, not trusted beyond 1.
    const r = parseAnswer(pairVerifyV1, msg('{"same_product":true,"confidence":7,"conflicting_attributes":[],"reason":"x"}'));
    expect(r.ok && r.value.confidence).toBe(1);
  });

  it('maps extracted attributes to our attribute keys and drops implausible values', () => {
    const parse = (o: object) => attributesV1.parse({ storage_gb: null, ram_gb: null, screen_inches: null, color: null, capacity_kg: null, capacity_l: null, network: null, edition: [], is_bundle: false, is_accessory: false, is_refurbished: false, ...o });
    expect(parse({ storage_gb: 512, ram_gb: 12, color: 'black', network: '5g', edition: ['ultra'] })).toEqual({
      attributes: { storageGb: 512, ramGb: 12, color: 'black', connectivity: ['5g'], edition: ['ultra'] },
      isBundle: false,
      isAccessory: false,
      isRefurbished: false,
    });
    expect(parse({ screen_inches: 54.6, capacity_kg: 0, capacity_l: 99999 }).attributes).toEqual({ screenInches: 54.6 });
    expect(() => parse({ color: 'mauve' })).toThrow();
  });

  it('category answers must be a slug of our taxonomy or null', () => {
    expect(categoryV1.parse({ category: 'espressoare', confidence: 0.9, reason: 'r' }).slug).toBe('espressoare');
    expect(categoryV1.parse({ category: null, confidence: 0.4, reason: 'r' }).slug).toBeNull();
    expect(() => categoryV1.parse({ category: 'jucarii', confidence: 0.9, reason: 'r' })).toThrow();
  });
});

describe('data minimization guard (ADR-016, personal data)', () => {
  it('forwards only whitelisted fields', () => {
    const s = sanitizeSide({ title: '  Telefon   Apple iPhone 16 ', brand: 'Apple', attributes: { storageGb: 128, kind: 'phone', foo: 'bar' }, internalId: 42 } as never);
    expect(s).toEqual({ title: 'Telefon Apple iPhone 16', brand: 'Apple', mpn: null, gtin: null, category: null, attributes: { storageGb: 128, kind: 'phone' }, priceLei: null, shop: null });
  });

  it('refuses marketplace seller names and Icecat content', () => {
    expect(() => sanitizeSide({ title: 'x', sellerName: 'Ion Popescu' })).toThrow(ForbiddenDataError);
    expect(() => sanitizeSide({ title: 'x', seller_name: 'Ion Popescu' })).toThrow(ForbiddenDataError);
    expect(() => sanitizeSide({ title: 'x', specs: [{ name: 'Greutate' }] })).toThrow(ForbiddenDataError);
    expect(() => sanitizeSide({ title: 'x', extra: { source: 'icecat', title: 'Icecat title' } })).toThrow(ForbiddenDataError);
    expect(() => sanitizeSide({ title: 'x', attributes: { icecatFeature: 1 } })).toThrow(ForbiddenDataError);
    expect(() => prepare(pairVerifyV1, routes.default, { offer: { title: 'x', sellerName: 'Ion Popescu' }, product: { title: 'y' } })).toThrow(ForbiddenDataError);
  });

  it('redacts e-mail addresses and phone numbers but keeps codes and GTINs', () => {
    expect(redactPersonalData('Telefon Samsung contact ion.popescu@gmail.com 0722 123 456 sau +40 744-123-456')).toBe(
      'Telefon Samsung contact [e-mail eliminat] [telefon eliminat] sau [telefon eliminat]',
    );
    expect(redactPersonalData('Samsung SM-S931BZKDEUE 8806095467382 0722123456789')).toBe('Samsung SM-S931BZKDEUE 8806095467382 0722123456789');
    expect(redactPersonalData('Mașină de spălat rufe Bosch, 9 kg, 1400 rpm')).toBe('Mașină de spălat rufe Bosch, 9 kg, 1400 rpm');
  });

  it('keeps Romanian diacritics (NFC) in prompts', () => {
    const r = prepare(pairVerifyV1, routes.default, { offer: { title: 'Masina de spalat rufe' }, product: { title: 'Mașină de spălat rufe' } });
    expect(JSON.stringify(r.params)).toContain('Mașină de spălat rufe');
  });
});
