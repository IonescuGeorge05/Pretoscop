# @pretoscop/core

Pure domain logic: money/VAT, GTIN, Romanian text normalization, brand and attribute extraction,
total price, and the offer normalizer that every ingestion pipeline uses. **No I/O** (enforced by
ESLint): no database, network or filesystem. Matching rules (M07) and verdicts/anomalies (M08) will
live here too.

Filled by M06. Everything here is deterministic: the same input always gives the same output.

## Quick start

```ts
import { normalizeOffer, isAcceptedOffer } from '@pretoscop/core';
import { contentHash } from '@pretoscop/core/hash'; // Node only (uses node:crypto)

const n = normalizeOffer(rawOffer, {
  shop: { slug: 'emag', shippingRules: { free_over: 250, flat: 19.99 } },
  observedAt: new Date(rawOffer.observedAt),
  eurRonRate: 5.3487, // BNR rate of the day, only needed for EUR prices
  hash: contentHash,
});
if (!isAcceptedOffer(n)) {
  stats.rejected += 1; // n.rejects says why, e.g. ['price_instalment']
} else {
  // n.priceBani, n.totalBani, n.gtin14, n.brandName, n.attributes, n.contentHash …
}
```

### Entry points

| Import                 | What                                                     | Runs in                   |
| ---------------------- | -------------------------------------------------------- | ------------------------- |
| `@pretoscop/core`      | everything below except the SHA-256                      | Node and browsers         |
| `@pretoscop/core/hash` | `contentHash`, `sha256Hex` (+ `contentHashInput`, types) | Node only (`node:crypto`) |

`normalizeOffer` takes the hash function as `ctx.hash` (dependency injection), so the root export
never imports Node crypto and browser bundles stay clean. Workers pass `contentHash` from the
sub-path; tests or other runtimes may pass any `(fields) => string`.

## Money convention

- Every amount in core is an integer number of **bani** (1 leu = 100 bani), RON, VAT included,
  in a plain `number` that must be a safe integer. Type alias: `Bani`. Never floats.
- The database stores `numeric(12,2)`. Convert at the boundary:
  `baniToDecimalString(123456) → "1234.56"` and `decimalStringToBani("1234.56") → 123456`
  (extra decimals are accepted only when they are zeros; anything else throws, so nothing is
  rounded silently).
- Shop rules stored in lei as JSON numbers (`shops.shipping_rules`) are converted with
  `leiToBani(19.99) → 1999`.
- Display: `formatLei(123456) → "1.234,56 lei"`; `formatLei(123400, { decimals: 'auto' }) →
"1.234 lei"`; `{ nbsp: true }` uses a no-break space before "lei"; `{ unit: false }` drops it.
- Arithmetic on money uses `sumBani` and `mulDivRound` (BigInt, round half up).

## API

Money and prices (`money.ts`, `price.ts`, `pricing.ts`):

```ts
type Bani = number;
baniToDecimalString(bani: Bani): string
decimalStringToBani(input: string): Bani
leiToBani(lei: number): Bani
formatLei(bani: Bani, options?: { decimals?: 'always' | 'auto' | 'never'; unit?: boolean; nbsp?: boolean }): string
isBani(value: unknown): value is Bani
sumBani(...amounts: Bani[]): Bani
mulDivRound(bani: Bani, numerator: bigint, denominator: bigint): Bani

parsePriceRon(input: unknown, format?: 'ro' | 'decimal' | null):
  { ok: true; bani: Bani; flags: PriceFlag[] } | { ok: false; reason: PriceRejectReason; detail?: string }
parsePrice(input: unknown, options?: { format?: 'ro' | 'decimal' | null; currency?: string | null }):
  { ok: true; minor: number; currency: string; flags: PriceFlag[] } | { ok: false; reason; detail? }
parseShippingCost(input: unknown, options?): same as parsePrice, but "Gratuit"/"0 lei" → 0
normalizeCurrencyCode(raw: string | null | undefined): string | null
detectVatMention(text): 'excluded' | 'included' | null
vatRateAt(date: Date): number              // 21 from 2025-08-01, 19 before (older rates too)
grossUpVat(netBani: Bani, date: Date): Bani
convertToRonBani(amountMinor: number, currency: string, ronPerUnit: number | null | undefined): Bani

totalPrice({ priceBani, shippingBani?, rules?, isLockerEligible? }):
  { shippingBani: Bani | null; totalBani: Bani; shippingEstimated: boolean;
    basis: 'offer' | 'free_over' | 'flat' | 'locker_flat' | 'unknown' }
type ShippingRules = { free_over?: number | null; flat?: number | null; locker_flat?: number | null; notes?: string } // lei
```

`PriceRejectReason`: `empty`, `unparseable`, `multiple_numbers`, `range`, `instalment`,
`unit_price`, `zero`, `negative`, `placeholder`, `currency`, `currency_mismatch`.
`PriceFlag`: `from`, `below_min`, `suspicious_high`, `rounded`, `format_mismatch`, `split_cents`,
`vat_excluded`.

Content hash (`content-hash.ts`, `hash.ts`):

```ts
type ContentHashFields = { priceBani: Bani; oldPriceBani: Bani | null; shippingBani: Bani | null; availability: Availability };
contentHashInput(fields): string        // root export, pure
contentHash(fields): string             // @pretoscop/core/hash: sha256 hex of contentHashInput
sha256Hex(input: string): string        // @pretoscop/core/hash
```

Text (`text.ts`, `units.ts`):

```ts
normalizeText(input): string
asciiFold(input: string): string
foldLower(input): string                // asciiFold(normalizeText(s)).toLowerCase()
slugify(input: string, maxLength = 80): string
cleanTitle(input): string
cleanTitleDetailed(input): { title: string; productCode: string | null; removed: string[] }
titleForMatch(input): string
matchTokens(input): string[]
isHexJunkTitle(input): boolean
cmToScreenInches(cm: number, context: 'tv' | 'monitor' | 'laptop'): number | null
```

Identifiers (`gtin.ts`, `mpn.ts`, `brands.ts`, `brands-data.ts`):

```ts
validateGtin(raw: unknown, options?: { shopSlug?; extraFakes? }):
  { gtin14: string | null; quality: 'valid' | 'invalid' | 'placeholder' | 'restricted' | 'missing';
    reason?: GtinReason; kind?: 'gtin8' | 'gtin12' | 'gtin13' | 'gtin14'; bookland?: boolean; convertedFrom?: 'isbn10' }
normalizeGtin(raw, options?): string | null          // GTIN-14 of a valid code only
extractGtins(raw: unknown, options?): GtinResult[]   // lists, arrays
summarizeGtins(results): { primary: GtinResult; alternates: string[] }
gtinCheckDigit(body: string): number
isValidGtinCheckDigit(code: string): boolean
KNOWN_FAKE_GTINS: Record<shopSlug | '*', string[]>

normalizeMpn(raw): string | null
extractMpnCandidates(title, { brand?, productCode? }): { raw; norm; score; source: 'title' | 'product_code' }[]
isSpecToken(token): boolean             // "67INCH", "175X75CM", "CORTEX-A35", "RK3326": never an MPN

detectBrand(title, brandField?, categoryHint?):
  { name; slug; confidence; via: 'field' | 'title' | 'alias' | 'product_line'; known: boolean;
    line?; matched?; conflict?; guess?: 'trademark' | 'prefix' | 'after_noun' | 'segment' } | null
detectBrandInTitle(title, categoryHint?): BrandMatch | null
guessUnknownBrand(title, explainedKind, isKnown): { text; rule; confidence } | null
findBrand(nameOrAlias): Brand | null
isPlaceholderBrand(raw): boolean
BRANDS: Brand[]; BRAND_SEEDS; brandTokens(input); brandDictionaryIssues()
```

Attributes and flags (`product-kind.ts`, `attributes.ts`, `condition.ts`, `bundle.ts`,
`accessory.ts`, `availability.ts`):

```ts
detectProductKind(title, categoryHint?): ProductKind   // 'phone' | 'tv' | 'washer' | 'accessory' | 'game' | … | 'other'
explainProductKind(title, categoryHint?): { kind: ProductKind;
  via: 'title' | 'head' | 'compat' | 'category' | 'line' | 'none'; word: string | null }
categoryKind(categoryHint): ProductKind | null         // breadcrumb only, leaf first
lineKind(title): ProductKind | null                    // product line only (MacBook → laptop)
extractAttributes(title, { categoryHint?, brand?, kind? }): Attributes
colorKeyOf(word): ColorKey | undefined
detectCondition(title, field?): { condition: 'new' | 'refurbished' | 'used';
  detail?: 'open_box' | 'grade_a' | 'grade_b' | 'grade_c' | 'renewed' | 'damaged'; reason: string }
detectBundle(title, categoryHint?): { isBundle: boolean;
  kind: 'game' | 'gift' | 'accessory' | 'subscription' | 'other' | null;
  reason: string | null }                              // reason = `${kind}:${evidence}`
detectAccessory(title, categoryHint?): { isAccessory: boolean; reason: string | null }
mapAvailability(raw: unknown): 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown'

interface Attributes {
  storageGb?: number; ramGb?: number; vramGb?: number; screenInches?: number;
  resolution?: '8k' | '5k' | '4k' | 'dqhd' | 'uwqhd' | 'wqxga' | 'qhd' | '3k' | '2.8k' | 'wuxga' | 'fhd' | 'hd';
  color?: ColorKey; colorRo?: string; year?: number; generation?: string;
  connectivity?: ('5g' | '4g' | 'wifi' | 'bluetooth' | 'dual_sim' | 'esim' | 'cellular' | 'nfc')[];
  energyClass?: string; capacityL?: number; capacityKg?: number; powerW?: number;
  edition?: ('slim' | 'digital' | 'disc' | 'pro' | 'ultra' | 'max' | 'plus' | 'mini' | 'lite' | 'fe' | 'se' | 'air' | 'xl' | 'ti' | 'super')[];
  caseSizeMm?: number; packCount?: number; kind?: ProductKind;
}
```

Offer normalization (`normalize.ts`):

```ts
normalizeOffer(raw: RawOffer, ctx: {
  shop: { slug: string; shippingRules?: ShippingRules | null; vatIncludedDefault?: boolean;
          priceFormat?: 'ro' | 'decimal' | null; fakeGtins?: readonly string[] };
  observedAt: Date; eurRonRate?: number | null; hash: (fields: ContentHashFields) => string;
}): NormalizedOffer      // = AcceptedOffer (ok: true) | RejectedOffer (ok: false)
isAcceptedOffer(offer): offer is AcceptedOffer
```

`NormalizedOffer` fields: `ok`, `rejects`, `warnings`; identity `shopSlug, externalId, url,
affiliateUrl, observedAt`; money `priceBani` (non-null when accepted), `oldPriceBani`,
`shippingBani` (delivery stated by the offer; hashed and stored in `offers.shipping_cost`),
`totalShippingBani` (delivery used in the total, possibly estimated), `totalBani`,
`shippingEstimated`, `shippingBasis`, `shopLowest30dBani`, `currency` (observed), `fxRate`,
`vatGrossedUp`, `priceIsFrom`; identifiers `gtin14` (valid only), `gtinQuality`, `gtinReason`,
`gtinAlternates`, `gtinRaw`, `brandName`, `brandSlug`, `brandConfidence`, `brandVia`, `brandKnown`,
`brandRaw`, `mpnNorm`, `mpnRaw`, `mpnSource`, `mpnCandidates`; `attributes`, `productKind`,
`condition`, `conditionDetail`, `conditionReason`, `isBundle`, `bundleKind`, `bundleReason`,
`isAccessory`, `accessoryReason`, `availability`; titles `titleRaw`, `titleClean`, `titleAscii`,
`titleMatch`; `categoryRaw`, `sellerName`, `isMarketplaceSeller`; `contentHash` (non-null when
accepted).

Warnings include `brand_unknown` (no dictionary brand: an unknown field or a guessed title brand),
`brand_conflict`, `mpn_looks_like_gtin`, `mpn_looks_like_spec` (an MPN field such as "67INCH" or
"CORTEXA35" is ignored and the title is used), `gtin_<quality>`, `price_<flag>`, `vat_conflict`,
`old_price_not_higher`, `old_price_implausible`, `<amount>_unparseable`.

## Rules in plain English

### Text

- **Canonical text** (`normalizeText`): Unicode NFC; the old cedilla letters ş ţ Ş Ţ become the
  correct comma-below ș ț Ș Ț; invisible characters (zero-width space, soft hyphen, BOM, control
  characters) are removed; curly quotes become `"` and `'`; all dashes and the minus sign become
  `-`; every kind of space (including the no-break spaces shops use in prices) becomes one normal
  space; leading and trailing spaces are trimmed.
- **ASCII copy** (`asciiFold`): ș→s, ț→t, ă→a, â→a, î→i and every other accent removed (é→e,
  ö→o), ß→ss, ø→o, ł→l. Case is kept.
- **Slugs** (`slugify`): ASCII, lower case, words joined by `-`, at most 80 characters, cut at a
  word boundary, never ending in `-`. Apostrophes vanish (De'Longhi → delonghi), `&` vanishes,
  a `+` stuck to a model becomes `plus` (S25+ → s25-plus).
- **Title cleanup** (`cleanTitle`): removes the shop's name at the end after `-`, `|` or `:`
  (eMAG, Altex, Media Galaxy, Flanco, PC Garage, evoMAG, Libris, Dedeman, Vexio, …; names that are
  ordinary words — cel, elefant, flip, olx — only when written as `.ro`); removes the
  "Cumpără … la preț mic/online" wrapper of search-result titles; removes leading promo words
  ("OFERTA!", "Promo:"); removes a trailing "cod produs / cod / SKU / ref …" value and keeps it
  as `productCode` (shops sometimes put the manufacturer code there). "Joc COD MW3" is left alone.
  Condition words such as "Resigilat" are never removed.
- **Match form** (`titleForMatch`): ASCII, lower case, symbols ™ ® © ° removed, decimal commas
  become dots, units glued to numbers (`16 GB`→`16gb`, `1 TB`→`1tb`, `120 Hz`→`120hz`,
  `2.000 W`→`2000w`), screen sizes unified (`55"`, `55''`, `55 inch`, `55 inchi`, and on
  TV/monitor/laptop titles `139 cm` → `55in`; "2 in 1" stays), `Wi-Fi 6E`→`wifi6e`,
  `USB Type-C`→`usbc`, `Full HD`→`fullhd`, `Ultra HD`→`uhd`, `1920 x 1080`→`1920x1080`,
  `S25+`→`s25 plus`, other punctuation becomes spaces.
- **Junk titles** (`isHexJunkTitle`): cel.ro shows decoy products with random hexadecimal names
  behind its captcha ("Husa Pro b6fc26eb"). A title with a lower-case hexadecimal word of 6+
  characters mixing digits and letters a–f is junk when the title has at most 4 words or such
  words make up 40% of it. Such offers are rejected (`title_junk_hex`).
- **Centimetres → inches** (`cmToScreenInches`): TVs snap to the nearest marketed size within
  3 cm (138 cm → 55", 108 cm → 43", 218 cm → 86"; 39" and 49" are not used for TVs because shops
  list 40"/50" sets as 100–101 and 125–126 cm), monitors snap within 1 cm, laptops round to one
  decimal (39.6 cm → 15.6"). Centimetres are converted only on TV, monitor and laptop titles —
  elsewhere they are widths and heights (fridges, hobs).

### Prices

- Accepted: `1.234,56 lei`, `1234.56 RON`, `1 234,56 Lei` (any space, incl. no-break), `de la
1.234 lei` (flagged `from`), `1.299 Lei` (= 1299), `1.234,5`, `1.299,- lei`, numbers (lei),
  `3,638.99 Lei` (evoMAG writes English separators), eMAG's split cents `1.234<sup>99</sup>` and
  `1.234 99`, `&nbsp;` entities, `Preț: … (TVA inclus)`.
- **How dots and commas are read**:
  - with `format: 'ro'`: dot and space group thousands, comma is the decimal point;
  - with `format: 'decimal'` (JSON-LD, feeds): dot is the decimal point, comma and space group
    thousands; more than two decimals are rounded (flag `rounded`);
  - with no format: if both `.` and `,` appear, the right-most is the decimal point; one kind
    appearing several times groups thousands; **one separator followed by exactly three digits
    groups thousands** (`1.299` = 1299, `12.500` = 12500, `1,299` = 1299 — feeds that mean 12,50
    must declare `decimal`); followed by one or two digits it is the decimal point (`19.99`);
    followed by four or more digits it is the decimal point only if the extra digits are zeros
    (`1299.0000`), otherwise rejected;
  - when a declared format does not fit but the string is unambiguous the other way, the
    unambiguous reading is used and flagged `format_mismatch`;
  - a flattened eMAG price `1.23499` is rejected: extractors must keep the superscript cents.
- Rejected: empty; ranges (`1.000 - 2.000 lei`, `între … și …`, `de la … până la …`); instalments
  (`lei/lună`, `rate`, `rată`, `x 12 luni`, `3 x 333 lei`, `dobândă`, `avans`); unit prices
  (`12,99 lei/kg`, `/100 g`); several numbers; zero; negative; placeholders (≥ 9.999.999 lei or
  all nines from 999.999 up); another currency than RON in `parsePriceRon` (`99 €`); two
  currencies in one string.
- Flags: ≤ 1 leu → `below_min` (normalizeOffer then rejects `price_too_low`, as the anomaly rules
  of the architecture require); ≥ 1.000.000 lei → `suspicious_high`; "fără TVA" in the string →
  `vat_excluded`.
- **Delivery cost** (`parseShippingCost`): "Gratuit", "Livrare gratuită", "free", "0 lei" → 0.
  "Gratuit peste 200 lei" is a rule, not a cost: unparseable.
- **VAT**: standard rate 21% from 1 August 2025 00:00 Bucharest time, 19% from 2017, 20% in 2016,
  24% from July 2010. `grossUpVat` adds the rate valid at the observation date, rounding half up
  to the ban. "fără TVA", "fara TVA", "exclusiv TVA", "+ TVA", "TVA neinclus", "nu include TVA"
  mean excluded; "TVA inclus", "cu TVA" mean included. Only the standard rate is modelled (books,
  food: see limitations).
- **Currency**: `convertToRonBani` multiplies by the BNR reference rate (RON per unit) supplied
  by the caller and rounds half up; RON passes through. "lei", "leu", "ron" mean RON; "ROL" is read
  as RON (feeds that still write it mean RON); "€", "euro" mean EUR.
- **Total price** (`totalPrice`): a delivery cost stated by the offer wins (basis `offer`, not an
  estimate). Otherwise, from the shop rules in lei: free when the price is at least `free_over`;
  else the cheaper of `flat` and, for items that fit a parcel locker, `locker_flat`; with no rule
  the delivery is unknown and the total equals the price (`basis: 'unknown'`). Every rule-based
  value has `shippingEstimated: true`.
- **Content hash**: `v1|<price>|<old_price>|<shipping_cost>|<availability>`, amounts exactly as
  PostgreSQL prints `numeric(12,2)` ("1234.56"), a missing amount as the literal `null`, e.g.
  `v1|1234.56|null|19.99|in_stock`; `content_hash` is its lower-case SHA-256 hex. The shipping
  part is the cost **stated by the offer** (estimates from shop rules are not observations).
  SQL equivalent for checks and backfills:
  `encode(sha256(convert_to(concat_ws('|', 'v1', price::text, coalesce(old_price::text, 'null'), coalesce(shipping_cost::text, 'null'), availability), 'UTF8')), 'hex')`.

### GTIN

Order: missing → malformed → placeholder → check digit → restricted ranges → valid.

- Spaces, dashes and dots are ignored; 8–14 digits are zero-padded to 14 (leading zeros lost in
  spreadsheets are recovered because the check digit decides); Excel scientific notation
  (`5.94E+12`) is invalid (digits are lost). An ISBN-10 (also with check character X) becomes
  its ISBN-13.
- Check digit: GS1 mod 10 (weights 3, 1, 3 … from the right).
- Placeholders: all zeros; one digit repeated or at most two digits different ("5000000000005");
  runs of consecutive digits — 9 or more on 12–14 digit codes ("1234567890123", "0123456789012"),
  the whole body on GTIN-8 ("12345670"); codes in `KNOWN_FAKE_GTINS` (`*` for every shop, plus
  the shop's own list, plus `ctx.shop.fakeGtins`). GS1's own example 5901234123457 is listed.
- Restricted (never used for matching), on the GTIN-13 view: 02 and 20–29 (restricted
  circulation within a region, incl. variable-measure items), 04 (within a company), 05 and 981–999
  (coupons), 980 (refund receipts), 952 (GS1 demo numbers), GTIN-14 indicator 9 (variable
  measure); EAN-8 prefixes 000–099 and 200–299 (RCN-8, GS1 General Specifications 26.0).
- Valid: everything else, including ISBN/ISSN/ISMN 977–979 (`bookland: true`) and Romanian 594.
- An offer may list several codes (`extractGtins` splits on `, ; | /` and spaces between whole
  codes); the first valid one is `gtin14`, other valid ones are `gtinAlternates`.

### Brands

- Dictionary: about 700 brands (electronics, IT, components, appliances, small appliances,
  personal care, tools, games publishers, Romanian brands such as Allview, Myria, Serioux, Tellur,
  Lemontti, Heinner, Arctic, Star-Light, Nei, Utok), with canonical casing, aliases (WD, Hewlett
  Packard → HP, LG Electronics → LG, B&O, DeLonghi/De Longhi, TPLink, GSkill …) and product lines
  (PlayStation/PS5/DualSense → Sony, Xbox/Surface → Microsoft, iPhone/iPad/MacBook/AirPods/Apple
  Watch → Apple, Galaxy → Samsung, Pixel → Google, ThinkPad/Legion/IdeaPad/Yoga/LOQ → Lenovo,
  ROG/TUF/Zenbook/Vivobook → ASUS, Redmi/POCO → Xiaomi, Kindle/Echo → Amazon, Alienware → Dell,
  Roomba → iRobot, Ninebot → Segway …), handheld makers (Anbernic, Trimui, Miyoo, Retroid,
  Powkiddy, Evercade, My Arcade, Ayaneo, GPD, Mangmi). Edit `src/brands-data.ts`.
- **Brand field first**: a shop brand field that maps to a known brand wins (case, diacritics
  and punctuation ignored; "SRL", "SA", "Electronics", "Romania" … stripped). Placeholder fields
  ("Generic", "OEM", "Fără brand", "N/A", "Universal" …) count as no field. If the title names a
  different known brand, it is reported as `conflict`.
- **Title scan** (no usable field): whole-word matches, longest first; the earliest mention wins
  (Romanian titles put the brand right after the product noun). Ignored:
  - anything after "pentru", "compatibil(ă) cu", "for" when a device or brand follows
    ("Husă pentru iPhone 17 Pro" has no brand; "Tabletă pentru copii Lenovo" is Lenovo), except
    accessory makers ("Suport auto pentru telefon Hoco" is Hoco);
  - anything after "emulator", "emulatoare", "emulare", "simulatoare" (what a retro handheld
    emulates is not its maker: "R36S …, Emulator N64 PSP PS1 PlayStation Sega" is not Sony);
  - device lines on accessory titles ("Husă iPhone 17" is not Apple) and platform lines on game
    titles ("Joc … PS5" is not Sony);
  - component and co-branding names (Intel, AMD, NVIDIA, Qualcomm, Leica, Zeiss, Harman Kardon,
    Bang & Olufsen …) unless nothing else is named — and never as the maker of a laptop, PC,
    phone, tablet, TV, monitor, console, smartwatch or e-reader ("Laptop cu procesor AMD Ryzen 5"
    has no brand; "Procesor AMD Ryzen 7" is AMD);
  - platform features named after a company: "Google TV/Assistant/Cast/Home", "Microsoft
    Windows/Office", "Amazon Alexa", "Apple AirPlay/HomeKit/CarPlay";
  - Redmi/POCO unless no other brand is named;
  - ordinary-word brands (Arctic, Sapphire, Ninja, Trust, Polar, Thomas …) beyond the first 8 words
    or before a colour word ("Arctic Grey" is a colour);
  - a 1–3 letter brand right after a number ("compresor 2 HP");
  - field-only names never matched in titles (Orange, Total, Ring, Dual, Sage, Graphite, Home).
  - "Nothing" counts only as "Nothing Phone/Ear/Headphone" or "CMF by Nothing"; "CAT" only before
    a model like S75; lines such as Galaxy, Pixel, Yoga, Legion, Surface, Switch need a model word
    after them ("Proiector Galaxy Star", "Saltea yoga", "Switch rețea" are not brands).
- An unknown brand field is returned title-cased ("LEMONTTIX" → "Lemonttix") with confidence
  0.5 (0.6 if the title contains it), unless the title names a known brand.
- **Unknown brands in titles** (`guessUnknownBrand`, only when the title names no known brand;
  `known: false`, `guess` says which rule): no-name devices carry the seller's brand word, which
  no dictionary can list.
  - `trademark` (0.8, any product): a word glued to ® or ™ ("Garsonal®", "HAPPY JOKER®" → Happy
    Joker), not a known brand or a technology mark (Intel® Core™, Radeon™, Wi-Fi®);
  - for devices only (phones, tablets, laptops, PCs, monitors, TVs, consoles, watches), at 0.6:
    `prefix`, the first word before a later product noun ("SweetLink S2 Plus Telefon mobil");
    `after_noun`, the first word after the product noun and its descriptors ("Telefon Mobil pentru
    Seniori Mapajoy MP2", "Laptop XIAORAN 15.6"", "Consola SUP Game Box") when followed by a model
    code, an upper-case word, "cu"/"pentru" or the end of the segment, or written in capitals;
    `segment`, a second title segment of one or two capitalized words ("Consola portabila,
    Taipintee, 800 jocuri").
  - Never guessed: generic, marketing and technology words (Retro, Gaming, Mini, Game, Android,
    PSP, NES …), colours, words with digits, lower-case words. A brand field, even unknown, wins
    over a guess. The worker keeps brands with confidence ≥ 0.7 as matching constraints, so
    ®-marked brands are kept and position guesses stay informational.
- Confidence: field 1.0; title name 0.9; alias 0.85; product line 0.8; ®/™ guess 0.8; ambiguous
  word 0.7; weak brand 0.6; position guess 0.6.

### MPN (manufacturer part number)

- `normalizeMpn`: upper case, every separator removed ("MXU23ZD/A" → "MXU23ZDA"); placeholders
  ("N/A", "-", "Generic", "0000") and values shorter than 3 characters → null.
- From titles (`extractMpnCandidates`), a candidate mixes letters and digits and has at least 5
  characters (4 if it contains an inner dash or dot). Never candidates: units and specs (16GB,
  55inch, 2.4-inch, 120Hz, 4K, 5G, WiFi6, USB-C, DDR5, DDR3L, M.2, A+++, IP68, 2x16GB,
  17.5x7.5cm, 197x126x48mm, 10-core, 2-in-1, 256-bit, CL30, 3-pack, 1080p, DVB-T2/S2), years,
  CPU models (i5-13420H, 8645HS, 9800X3D, 265K, 3250C, N95, N5095, J4105), any token right after
  Intel/Celeron/Pentium/Atom/Core/Ryzen/AMD/procesor/CPU/GPU/Snapdragon/MediaTek/Unisoc/Allwinner/
  Rockchip, SoC parts (Cortex-A53, RK3326, Mali-G31 MP2), GPU models (RTX4070, 4070Ti), chipsets
  (B650-A, X870E), model names (Fold7, Watch8, Reno14, HERO13, PRO1, X12plus, R36TMAX). Items
  joined by "+" are separate tokens ("SSD+2TB", "32GB+128G"). A slash code keeps a short suffix
  (MXU23ZD/A, 50PUS8009/12); a list such as PS5/PS4/PC is not a code. Numeric codes with a dash
  are allowed (Logitech 910-006162, Russell Hobbs 26960-56).
- Ranking: longer, structured (dash/slash/dot), upper-case codes that alternate letters and digits
  first; a "cod produs" value removed by the title cleanup gets a bonus.
- In `normalizeOffer`, the MPN field wins (`mpnSource: 'field'`); an MPN field that is really a
  valid GTIN is ignored (warning `mpn_looks_like_gtin`), and so is one that is a spec or a chip
  (`isSpecToken`: "67INCH", "175X75CM", "CORTEXA35", "RK3326"; warning `mpn_looks_like_spec`);
  otherwise the best title code (`mpnSource: 'title'`). Codes written with spaces ("FFB 8458 BV
  EE") are not recovered.

### Product kind

`explainProductKind` (and `detectProductKind`, its `kind`) decides in this order:

1. `title`: the product noun the title starts with: Telefon/Smartphone → phone, Tabletă → tablet
   (Tabletă grafică → peripheral), Laptop/Notebook/MacBook → laptop, Televizor → tv, Monitor →
   monitor, Consolă/Console / Pachet/Set consolă / Set PS5 / Joc TV / Joc portabil / Joc cu
   afișaj / Gameboy → console, Joc → game, Placă video → gpu, Memorie RAM/DDR → ram, SSD/Hard disk →
   storage, Card de memorie → memory_card, Stick/Memorie USB → usb_drive, Carcasă PC/…-Tower →
   pc_case, Husă/Folie/Cablu/Încărcător/Adaptor/Suport/Geantă/Rucsac/Carcasă/Curea/Brățară (not
   fitness)/Controller(s)/Volan/"Set 2 Controllers" … → accessory, Brățară fitness → fitness_band,
   Baterie externă → power_bank, Mașină de spălat rufe (cu uscător) → washer (washer_dryer),
   Uscător de rufe → dryer, Mașină de spălat vase → dishwasher, Frigider/Combină frigorifică/
   Congelator → fridge, Cuptor cu microunde → microwave, Aspirator → vacuum, Espressor/Cafetieră →
   coffee, and so on;
2. `head`: a product noun among words 2–6 of the first title segment, after a brand, seller or
   model prefix ("SweetLink S2 Plus Telefon mobil", "Kiano Slim TV Travel Televizor", "Miyoo Mini
   Plus Consola", "Gaming Notebook", "Mini Laptop", "HAPPY JOKER Controller", "Baseus Cablu");
   a device noun found there yields to an accessory breadcrumb;
3. `compat`: "… pentru / compatibil cu <device or brand>" → accessory;
4. `category`: the breadcrumb, **leaf first** (`categoryKind`): in each segment an accessory word
   wins ("Huse telefoane"), but a segment that only groups a family with its accessories
   ("Telefoane mobile & accesorii", "Laptopuri si accesorii") is not an accessory category, and a
   segment naming several kinds ("Console, Jocuri & Accesorii") defers to its parent;
5. `line`: a product line named before any "pentru/compatibil/emulator" (`lineKind`): MacBook,
   ThinkPad, IdeaPad, LOQ, Vivobook, Zenbook … → laptop; iPhone, Galaxy S/A/Z, Pixel, Redmi →
   phone; iPad, Galaxy Tab → tablet; Apple/Galaxy Watch → smartwatch; AirPods, Galaxy Buds →
   headphones; PlayStation 5/Portal, Xbox Series, Nintendo Switch, Steam Deck, ROG Ally, Legion
   Go, Anbernic, Miyoo, Trimui … → console; Kindle → ereader; iMac, Mac mini → desktop;
6. else `other`. Negations never name the product ("…, Fără încărcător").

### Attributes

- **Storage, RAM, graphics memory**: `GB`/`TB` values (1 TB = 1024 GB; 1000 GB = 1 TB). A value
  followed or preceded by RAM/DDR/LPDDR is RAM; by SSD/HDD/eMMC/UFS/stocare/ROM is storage; by
  GDDR/VRAM, or right after a GPU name ("RTX 4060 8GB"), is graphics memory; by a bare "memorie",
  RAM on laptops and PCs ("Memorie 16GB") and storage elsewhere ("Memorie 32GB" on a console).
  The word before a value wins ("RAM 16GB SSD 512GB"), unless that word follows another value
  and labels it ("12GB RAM 512GB SSD": 512 GB is storage). Expandable or optional capacities are
  ignored ("pana la 128GB", "up to 1TB", "suport 1TB", "Expansion SSD 1TB", "1 TB SSD
  expansiune", "memorie extensibila"). Sellers' forms: "128G"/"64G" (16–512) are GB, "SSD512"
  and "SSD1TB" are storage, "10,16GB" is a list (not 10.16 GB), DDR3L is RAM. Pairs "8/256GB",
  "8GB/256GB", "12+512GB" are RAM/storage when the first value is at most 24 GB ("32GB+128G" are
  two cards). RAM kits "2x16GB" are ignored (the total is stated).
  Unlabelled values: on RAM modules → RAM; graphics cards → graphics memory; drives, cards and
  sticks → storage; on devices, with RAM known the larger value is storage, two values are
  RAM (smaller, ≤ 64 GB) and storage (larger), one value of 32 GB or more is storage (also on
  e-readers and consoles), one small value on a laptop/PC is RAM; a single small value on a
  phone is left out (ambiguous). MB values (cache) are ignored. "4G RAM" (a frequent typo) is
  4 GB of RAM, not 4G connectivity.
- **Screen**: `55"`, `55''`, `15.6'`, `55 inch`, `2.4-inch`, `55 inchi`, `toli`; ranges ("32-65"") are ignored; drives
  and PC parts never have a screen ("2.5 inch" HDD); centimetres only on TVs, monitors and
  laptops (see the conversion rule above); "2 in 1" is not a size.
- **Resolution**: 8K, 5K, 4K/UHD/Ultra HD/2160p/3840x2160, DQHD, UWQHD/3440x1440, WQXGA,
  QHD/WQHD/1440p, 3K, 2.8K, WUXGA, FHD/Full HD/1080p/1920x1080, HD Ready/HD/720p. "HDR10" is not HD.
- **Colour**: Romanian and English words map to a key and a Romanian label: negru/black/midnight/
  obsidian/onyx → black; alb/white/starlight → white; gri/gray/grey/graphite/grafit/charcoal/
  antracit/space gray → gray; argintiu/silver/platinum/inox/crom/nichel → silver; albastru/blue/
  navy/bleumarin/turcoaz/silverblue → blue; verde/green/mint/teal/sage/jade → green; roșu/red/bordo →
  red; roz/pink → pink; auriu/gold/champagne → gold; mov/violet/purple/lavender → purple; galben/
  yellow → yellow; portocaliu/orange/coral → orange; bej/beige/crem/desert → beige; maro/brown/
  bronz/cupru → brown; titan/titanium alone → titanium; titan natural/natural titanium →
  natural_titanium; rose gold/roz auriu → rose_gold; transparent/clear → transparent;
  multicolor. The colour is taken from the **last comma-separated part that names one** (shops
  put it at the end), the first colour in that part ("Negru/Roșu" → black); adjacent colour words
  and one-word compounds name one colour and the last word decides ("Blue Black" → black,
  "LightGray" → gray, "Graygreen" → green), a specific colour wins over the material or finish
  ("Titanium Black" → black, "Desert Titanium" → beige, "negru transparent" and "Transparent
  negru" → black; "Transparent" alone stays transparent); colours listed in a row of
  comma-separated parts name the first ("…, negru, roșu" → black, like "Negru/Roșu"); marketing names that do not say a colour
  ("Glacier", "Night Sky", "Arabesque") give no colour; and watch-band parts ("Curea … Albastru") only
  when nothing else names a colour. Not colours: "80+ Gold", "WD Black", "Black Friday", "Titan
  OS", "Hue White and Color", "Red/Blue/Brown Switch", "Gold Edition", "Black Shark".
- **Energy class**: "Clasa G", "clasa energetică D", "Clasa D/E" (→ D), "energy class E", and a
  free-standing "A+", "A++", "A+++"; never inside model codes ("HCF-205NHA+").
- **Capacity**: litres (`350 l`, `350L`, `7,2 l`, `litri`; the largest value, since fridges list
  total and compartments; not `l/min`); kilograms only on washing machines and dryers (`8 kg`,
  `10.5/6 kg` → 10.5).
- **Power**: `W`/`wați` (`2.000 W` = 2000) and `kW`.
- **Year**: 2010–2035 as a separate word, not a power, speed or capacity ("2000 W", "2133 MHz").
- **Generation**: "Gen 2", "13th Gen", "(2nd Gen)", "a 2-a generație", "generația 2" → gen2; Apple
  silicon on Apple titles "M4", "M4 Pro" → m4, m4-pro; PCIe/USB generations are not product
  generations.
- **Connectivity**: 5G, 4G/LTE, Wi-Fi, Bluetooth/BT, Dual SIM, eSIM, Cellular, NFC.
- **Edition** (only in the model name, i.e. before the first comma): Slim, Digital (consoles or
  "Digital Edition"), Disc, Pro, Ultra (not "Ultra HD", not "Core Ultra"), Max (not "max. 35 kg"),
  Plus/"+", Mini (not "Mini PC"), Lite, FE, SE (after iPhone/Watch/iPad), Air (after MacBook/iPad/
  iPhone), XL, Ti and SUPER (after a GPU number). "Windows 11 Pro" is not an edition.
- **Case size** (smartwatches): 36–55 mm. **Pack count**: "Set 2 …", "3-pack", "2 bucăți".

### Condition

- Open box → refurbished + `open_box`: resigilat/ă/e, open box, ambalaj deteriorat/desigilat,
  produs (de) expoziție, expus, produs demo.
- Refurbished: refurbished, recondiționat, reconditioned, remanufactured, renewed (`renewed`),
  "Grad/Grade A/B/C" (`grade_a`/`grade_b`/`grade_c`).
- Used: second hand, folosit/ă, utilizat/ă (but not "ușor de folosit/utilizat"), ca nou(ă),
  pre-owned, used, "SH" in capitals as a separate word.
- Field values: schema.org NewCondition / RefurbishedCondition / UsedCondition /
  DamagedCondition (→ used + `damaged`), or the same words as above.
- A non-new signal always wins over "new"; between two non-new signals the title wins; with no
  signal the offer is new (`reason: 'default'`).

### Bundles

- Bundle: the word "bundle"; a title starting with "Pachet" (not "Pachet 4 baterii", not
  "Pachet Office"); gifts ("+ … cadou", "cu … cadou", "cadou:"; not "card cadou", "set cadou");
  included games ("cu joc", "joc inclus", "include … jocul", "cod joc", "și 2 jocuri", and on a
  console a segment "…, joc NBA 2K26"); a second controller ("și 2 controlere", "Controller
  suplimentar", "Extra controller"); a free-standing "+" followed by an item ("+ joc", "+ Mario
  Kart", "+ Husă", "+ Office", "+ Woven Strap Ring Stand"), also right after a spec word when an
  item follows ("1TB SSD + Joc …").
- Not a bundle: "+" between specs ("Wi-Fi + Cellular", "GPS + Cellular", "8GB + 256GB",
  "Print + Scan", "+ adaptor SD"); "+" glued to a model (S25+, A+++, 80+, HDR10+); "+" inside
  kits, accessories, peripherals, lighting and kitchen sets ("Kit … 3 becuri + Bridge",
  "Set tastatură + mouse"); "Set" alone ("Set cuțite"); multipacks ("Set 2 becuri" →
  `packCount`), which are products of their own.
- What a product ships with is not a bundle: built-in games ("cu jocuri", "15000 jocuri",
  "+ 20.000 jocuri", "jocuri preinstalate/încorporate/clasice/retro", "400 in 1"), a memory card
  with the games ("card inclus de 64GB", "Game Memory Card"), compatibility phrases ("compatibil
  doar cu jocuri din PS4"). On a console that is not a mainstream platform (PlayStation, Xbox,
  Nintendo, Steam Deck, ROG Ally, Legion Go, MSI Claw, named before any "pentru/emulator"), the
  "+" items and a leading "Pachet" are package contents ("Joc TV Consola Retro + Pistol 2x Pady",
  "Consola Retro … + Controller"); only "bundle" or a gift makes those a bundle.
- Kind (`bundleKind`, and the first part of `bundleReason` = `<kind>:<evidence>`): `gift` for
  "cadou" and for any extra item on a phone, tablet or watch (eMAG's "+ Woven Strap Ring Stand",
  "+ Stativ cu stație de încărcare", "+ moto buds"); `game` for included games, a "+" game or a
  game named in a "… Bundle" title ("EA Sports FC 26 Bundle", "Fortnite … Bundle"); `accessory`
  for an extra controller or accessory; `subscription` ("+ 90 zile Abonament", "Game Pass");
  `other` ("30th Anniversary Limited Edition Bundle", "+ Office 2024").

### Accessories

The product kind decides (`explainProductKind`, see Product kind): an accessory noun that names
the product — at the start ("Husă …", "Controller …", "Set 2 Controllers") or after a brand or
seller prefix ("HAPPY JOKER Controller", "Apple Husă") → accessory (`noun:<word>`); a device noun,
a device breadcrumb or a device product line → not an accessory (`kind:<kind>`), whatever
accessory words describe it ("Smartwatch …, Curea Sport", "SweetLink Telefon mobil … Stand
încărcare", "MacBook Air …, Fără încărcător", "Televizor … | Încărcător auto"); "… pentru /
compatibil cu <device or brand>" → accessory (`compat`); an accessory breadcrumb ("Accesorii GSM >
Huse") → accessory (`category`). Breadcrumbs that only group a family with its accessories
("Laptopuri și accesorii > Notebook") never make an accessory.

### Availability

schema.org URLs and short forms: InStock, LimitedAvailability, OnlineOnly → in_stock; OutOfStock,
SoldOut, Discontinued → out_of_stock; PreOrder, PreSale, BackOrder, MadeToOrder → preorder;
InStoreOnly, Reserved → unknown (kept out of the cheapest-online series). Romanian: "în stoc",
"stoc limitat", "ultimele bucăți", "disponibil", "stoc furnizor" → in_stock; "stoc epuizat",
"indisponibil", "nu este în stoc", "nu mai este disponibil" → out_of_stock (negative phrases are
checked first); "precomandă", "în curând", "la comandă" → preorder. Feed flags 1/0, yes/no, da/nu,
true/false, booleans and stock counts (5 → in stock, 0 → out of stock). Anything else → unknown.

### normalizeOffer

1. Identity and title: an empty external id or title is rejected; the title is cleaned; junk hex
   titles are rejected.
2. Price: parsed with the offer's `priceFormat`, else the shop's; rejected for the reasons above
   (`price_missing`, `price_unparseable`, `price_range`, `price_instalment`, `price_unit`,
   `price_zero`, `price_negative`, `price_placeholder`, `price_too_low` (≤ 1 leu after
   conversion), `price_currency`, `fx_rate_missing` (EUR without `ctx.eurRonRate`)).
3. VAT: grossed up when `vatIncluded === false`, or when the field is absent and the price text
   says "fără TVA" or the shop default says prices exclude VAT (warning `vat_conflict` when the
   field says included but the text says otherwise; the field wins).
4. Old price is kept only when strictly above the price and at most 10× it (warnings
   `old_price_not_higher`, `old_price_implausible`, `old_price_unparseable`); the shop's 30-day
   lowest price is kept as published; delivery from the offer, a free-delivery note, else the shop
   rules.
5. GTIN, brand, product kind, attributes, MPN, condition, bundle, accessory and availability as
   described above. Warnings: `gtin_invalid`/`gtin_placeholder`/`gtin_restricted`,
   `brand_unknown`, `brand_conflict`, `mpn_looks_like_gtin`, `mpn_looks_like_spec`,
   `price_<flag>`.
6. Accepted offers carry `contentHash = ctx.hash({ priceBani, oldPriceBani, shippingBani,
availability })`; rejected offers carry `contentHash: null` and `rejects`.

## Title corpus and accuracy

`src/__corpus__/titles.ts` holds three labelled sets:

- `TITLE_CORPUS`: 255 **synthetic** titles written in the styles of eMAG, Altex, Media Galaxy,
  Flanco, PC Garage, evoMAG, Dedeman, cel.ro and Vexio across phones, tablets, laptops, PC parts,
  monitors, TVs, audio, consoles and games, smartwatches, large and small appliances, accessories;
- `HOLDOUT_CORPUS`: 72 more synthetic titles written after the rules, to estimate accuracy on
  unseen titles;
- `REAL_CORPUS`: the 66 distinct **real** titles of eMAG's phone listing recorded by PretoscopBot
  on 2026-10-27 (M03 fixtures).

`src/__corpus__/real-live-2026-10-27.ts` holds `REAL_LIVE_CORPUS`: 168 **real** eMAG titles from
the first live run (960 offers recorded 2026-10-27 22:50–23:10: phones, laptops, TVs, console
hardware), every 6th offer per category plus the titles the lead reported, each with its
breadcrumb (evaluated like `raw.category`). Labelled by reading before the second M06 round;
accuracy before → after that round:

| field                               | before | after |
| ----------------------------------- | ------ | ----- |
| brand                               | 77.4%  | 99.4% |
| MPN                                 | 90.5%  | 98.8% |
| storage                             | 95.8%  | 100%  |
| RAM                                 | 98.2%  | 100%  |
| screen                              | 98.8%  | 100%  |
| colour                              | 97.6%  | 100%  |
| bundle                              | 95.2%  | 100%  |
| accessory                           | 91.7%  | 100%  |
| energy class, litres, kg, condition | 100%   | 100%  |

Append more real titles from the recorder's snapshots as new sets with honest labels.
`corpus.test.ts` compares brands by slug, requires at least 95% accuracy per field (brand, MPN,
storage, RAM, screen, colour, energy class, litres, kilograms, condition, bundle, accessory) on
every set and prints the table and every miss: `pnpm --filter @pretoscop/core exec vitest run src/corpus.test.ts --silent=false`.
Label what a careful person reads in the title, never what the code outputs.

## Known limitations

- Model codes written with spaces ("FFB 8458 BV EE", "W7I HP42 L", "43 HYN 8110 VDQ4K") are not
  extracted from titles; the MPN field usually carries them.
- A game title names its platform, not its publisher ("Joc Mario Kart World pentru Nintendo
  Switch 2" has no brand).
- Unknown seller brands written in lower case ("lynker", "asskanaer", ", bedee,"), at the end of
  the title ("…, Gonga", "…, Blasko") or with two letters ("Televizor UD QLED") are not guessed;
  a capitalized model name right after the product noun can be taken for a brand ("Consola …
  LCX 4.3 Inch" → LCX).
- Laptop titles from small sellers often carry no part number at all ("Laptop 14" cu procesor
  Intel Celeron …"); only the shop's MPN field can identify them.
- Only the standard VAT rate is modelled; reduced rates (books, food) are not.
- Colour names outside the dictionary (marketing names such as "Scarab", "Porcelain") are left
  out rather than guessed.
- UPC-E (8-digit compressed UPC) is not expanded; such codes usually fail the EAN-8 check digit
  and are reported as invalid.

## Commands

```bash
pnpm --filter @pretoscop/core demo "Consola PlayStation 5 Slim Digital Edition, 1TB + joc EA FC 26"
pnpm --filter @pretoscop/core demo "<title>" --price "2.499 lei" --old-price "2.999 lei" --gtin 0711719577034 --json
pnpm --filter @pretoscop/core gtin 0711719577034 0000000000000
pnpm --filter @pretoscop/core test
make verify M=06
```
