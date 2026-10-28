import { COLOR_LABELS_RO, type Attributes, type ColorKey, type Edition } from '@pretoscop/core';
import { redactPersonalData } from '../guard';
import { asObject, InvalidOutputError, type PromptDef } from './types';

export interface AttributesInput {
  title: string;
  /** Our category slug or the shop's breadcrumb, when known. */
  category?: string | null;
  brand?: string | null;
}

/** The hard attributes matching compares (M07), in our own attribute keys, plus the exclusion flags. */
export interface ExtractedAttributes {
  attributes: Pick<Attributes, 'storageGb' | 'ramGb' | 'screenInches' | 'color' | 'capacityKg' | 'capacityL' | 'connectivity' | 'edition'>;
  isBundle: boolean;
  isAccessory: boolean;
  isRefurbished: boolean;
}

export const COLOR_KEYS = Object.keys(COLOR_LABELS_RO) as ColorKey[];
export const EDITION_KEYS = ['slim', 'digital', 'disc', 'pro', 'ultra', 'max', 'plus', 'mini', 'lite', 'fe', 'se', 'air', 'xl', 'ti', 'super'] as const satisfies readonly Edition[];

const SYSTEM = `You read Romanian shop product titles for Pretoscop, a Romanian price-comparison site, and extract the attributes that tell one product variant from another. Our own parser left at least one of them out, so read carefully, and leave a value null whenever the title does not state it: a wrong value is worse than a missing one, because these attributes decide which offers are compared with each other.

Fields
- storage_gb: internal storage, SSD or drive capacity in GB (1 TB = 1024). "8/256GB" or "8GB/256GB" on a phone means 8 GB RAM and 256 GB storage. Memory cards, USB sticks and external drives use the same field.
- ram_gb: RAM in GB (phones, tablets, laptops, PCs).
- screen_inches: screen diagonal in inches with at most one decimal; convert centimetres (139 cm = 55, 164 cm = 65, 108 cm = 43). Never use a box or product dimension.
- color: the main colour as one of the allowed keys. Romanian words: negru = black, alb = white, gri = gray, argintiu = silver, albastru or bleumarin = blue, verde = green, roșu = red, roz = pink, auriu = gold, mov = purple, galben = yellow, portocaliu = orange, bej = beige, maro = brown, titan = titanium, titan natural = natural_titanium, roz auriu = rose_gold. Marketing names map to their plain colour when the meaning is clear ("Phantom Black" = black, "Midnight Green" = green); leave color null when a name is ambiguous ("Starlight", "Aurora").
- capacity_kg: washing or drying load in kg (washing machines, dryers, washer-dryers: the washing load).
- capacity_l: total volume in litres (fridges, freezers, ovens, water heaters).
- network: "5g" or "4g" when the title names the phone or tablet generation, else null.
- edition: model-name variant words that are part of the product name, from the allowed list (Pro, Max, Plus or "+", Ultra, Mini, Lite, FE, SE, Air, Slim, Digital, Disc, XL, Ti, Super). "Pro Max" gives ["pro", "max"]. Do not list words that only describe a feature.
- is_bundle: true when the offer sells the product together with something else ("+ cadou", "+ husă", "+ joc", "pachet", "set", "bundle", "kit").
- is_accessory: true when the product is an accessory for another device ("husă pentru", "încărcător compatibil", "folie", "curea", spare parts).
- is_refurbished: true for "resigilat", "recondiționat", "refurbished", "second hand", "renew", "open box".

Diacritics are optional and both comma and cedilla forms occur ("Mașină" = "Maşină" = "Masina"). Answer with the JSON object of the schema and nothing else.

Examples
"Telefon mobil Samsung Galaxy S25 Ultra, 12GB RAM, 512GB, 5G, Titanium Black" gives storage_gb 512, ram_gb 12, color black, network 5g, edition ["ultra"], the rest null or false.
"Televizor Philips 50PUS8009, 126 cm, Smart, 4K Ultra HD, LED" gives screen_inches 50, every other field null or false.
"Masina de spalat rufe slim Beko WUE6612DBA, 6 kg, 1000 RPM, Clasa A, Alb" gives capacity_kg 6, color white, edition ["slim"].
"Consola Sony PlayStation 5 Slim Digital Edition, 1TB + joc EA FC 26" gives storage_gb 1024, edition ["slim", "digital"], is_bundle true.`;

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

const SCHEMA = {
  type: 'object',
  properties: {
    storage_gb: nullable({ type: 'integer' }),
    ram_gb: nullable({ type: 'integer' }),
    screen_inches: nullable({ type: 'number' }),
    color: nullable({ type: 'string', enum: COLOR_KEYS }),
    capacity_kg: nullable({ type: 'number' }),
    capacity_l: nullable({ type: 'number' }),
    network: nullable({ type: 'string', enum: ['5g', '4g'] }),
    edition: { type: 'array', items: { type: 'string', enum: [...EDITION_KEYS] } },
    is_bundle: { type: 'boolean' },
    is_accessory: { type: 'boolean' },
    is_refurbished: { type: 'boolean' },
  },
  required: ['storage_gb', 'ram_gb', 'screen_inches', 'color', 'capacity_kg', 'capacity_l', 'network', 'edition', 'is_bundle', 'is_accessory', 'is_refurbished'],
  additionalProperties: false,
};

function positive(v: unknown, what: string, opts: { int?: boolean; max: number }): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new InvalidOutputError(`attributes.${what}: not a number`);
  if (v <= 0 || v > opts.max) return undefined; // implausible: leave it out rather than trust it
  return opts.int ? Math.round(v) : Math.round(v * 10) / 10;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new InvalidOutputError(`attributes.${what}: not a boolean`);
  return v;
}

export const attributesV1: PromptDef<AttributesInput, ExtractedAttributes> = {
  id: 'attributes',
  version: '1',
  system: SYSTEM,
  schema: SCHEMA,
  user({ title, category, brand }) {
    const o: Record<string, string> = { title: redactPersonalData(title.normalize('NFC').replace(/\s+/g, ' ').trim()).slice(0, 300) };
    if (brand) o.brand = brand.slice(0, 80);
    if (category) o.category = category.slice(0, 120);
    return `Product title:\n${JSON.stringify(o)}`;
  },
  parse(json) {
    const o = asObject(json, 'attributes');
    const a: ExtractedAttributes['attributes'] = {};
    const storage = positive(o.storage_gb, 'storage_gb', { int: true, max: 1_048_576 });
    if (storage) a.storageGb = storage;
    const ram = positive(o.ram_gb, 'ram_gb', { int: true, max: 4096 });
    if (ram) a.ramGb = ram;
    const screen = positive(o.screen_inches, 'screen_inches', { max: 150 });
    if (screen) a.screenInches = screen;
    if (o.color !== null && o.color !== undefined) {
      if (typeof o.color !== 'string' || !COLOR_KEYS.includes(o.color as ColorKey)) throw new InvalidOutputError('attributes.color: unknown colour');
      a.color = o.color as ColorKey;
    }
    const kg = positive(o.capacity_kg, 'capacity_kg', { max: 30 });
    if (kg) a.capacityKg = kg;
    const litres = positive(o.capacity_l, 'capacity_l', { max: 2000 });
    if (litres) a.capacityL = litres;
    if (o.network === '5g' || o.network === '4g') a.connectivity = [o.network];
    else if (o.network !== null && o.network !== undefined) throw new InvalidOutputError('attributes.network: unknown value');
    if (!Array.isArray(o.edition)) throw new InvalidOutputError('attributes.edition: not an array');
    const editions = EDITION_KEYS.filter((e) => (o.edition as unknown[]).includes(e));
    if (editions.length) a.edition = editions;
    return {
      attributes: a,
      isBundle: bool(o.is_bundle, 'is_bundle'),
      isAccessory: bool(o.is_accessory, 'is_accessory'),
      isRefurbished: bool(o.is_refurbished, 'is_refurbished'),
    };
  },
};
