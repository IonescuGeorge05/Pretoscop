/**
 * Availability mapping: schema.org values, Romanian shop strings and feed flags → the four values
 * stored in `offers.availability`. Pure.
 */
import { foldLower } from './text';

export type Availability = 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';

/**
 * schema.org ItemAvailability → our value. LimitedAvailability and OnlineOnly are in stock;
 * BackOrder, PreOrder, PreSale and MadeToOrder can be ordered but ship later (`preorder`);
 * Discontinued and SoldOut are out of stock; InStoreOnly (not buyable online) and Reserved are
 * `unknown`, which keeps them out of the cheapest-price series.
 */
const SCHEMA_ORG: Readonly<Record<string, Availability>> = {
  instock: 'in_stock',
  limitedavailability: 'in_stock',
  onlineonly: 'in_stock',
  outofstock: 'out_of_stock',
  soldout: 'out_of_stock',
  discontinued: 'out_of_stock',
  preorder: 'preorder',
  presale: 'preorder',
  backorder: 'preorder',
  madetoorder: 'preorder',
  instoreonly: 'unknown',
  reserved: 'unknown',
};

/** Negative statements are checked first: "nu este în stoc" contains "în stoc". */
const OUT_OF_STOCK_RE =
  /\b(?:stoc epuizat|epuizat|indisponibil|nedisponibil|nu (?:este|e|mai este|mai e) (?:in stoc|disponibil)|nu mai este in stoc|fara stoc|lipsa (?:din )?stoc|stoc (?:0|zero|insuficient)|out of stock|sold out|unavailable|not available|momentan indisponibil|produs indisponibil|stoc terminat)\b/;
const PREORDER_RE =
  /\b(?:precomanda|pre-comanda|pre comanda|pre-?order|in curand|curand|disponibil in curand|la comanda|disponibil la comanda|backorder|lansare|presale|pre-?vanzare)\b/;
const IN_STOCK_RE =
  /\b(?:in stoc|stoc limitat|stoc suficient|ultimel?e? (?:\d+ )?(?:bucati|produse|unitati)|ultimul produs|ultima bucata|disponibil|in stock|available|stoc furnizor|in stoc furnizor|stoc magazin|stoc online|livrare imediata)\b/;

/**
 * Maps a raw availability value. Accepts schema.org URLs and short forms (`https://schema.org/InStock`,
 * `InStock`, `in_stock`), Romanian strings (`în stoc`, `stoc limitat`, `ultimele bucăți`,
 * `disponibil`, `stoc epuizat`, `indisponibil`, `nu este în stoc`, `precomandă`, `în curând`,
 * `la comandă`), feed flags (`1/0`, `yes/no`, `da/nu`, `true/false`, booleans) and stock counts
 * (`5` → in stock, `0` → out of stock). Anything else → `unknown`.
 */
export function mapAvailability(raw: unknown): Availability {
  if (raw == null) return 'unknown';
  if (typeof raw === 'boolean') return raw ? 'in_stock' : 'out_of_stock';
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return 'unknown';
    return raw > 0 ? 'in_stock' : 'out_of_stock';
  }
  if (typeof raw !== 'string') return 'unknown';
  const s = foldLower(raw);
  if (s === '') return 'unknown';

  const schema = /^(?:https?:\/\/)?(?:www\.)?schema\.org\/([a-z]+)\/?$/.exec(s);
  const token = (schema ? schema[1] : s)?.replace(/[\s_-]+/g, '') ?? '';
  const mapped = SCHEMA_ORG[token];
  if (mapped) return mapped;

  if (/^(?:1|y|yes|da|true|t|activ|active)$/.test(s)) return 'in_stock';
  if (/^(?:0|n|no|nu|false|f|inactiv|inactive)$/.test(s)) return 'out_of_stock';
  if (/^-?\d+$/.test(s)) return Number(s) > 0 ? 'in_stock' : 'out_of_stock';

  if (OUT_OF_STOCK_RE.test(s)) return 'out_of_stock';
  if (PREORDER_RE.test(s)) return 'preorder';
  if (IN_STOCK_RE.test(s)) return 'in_stock';
  return 'unknown';
}
