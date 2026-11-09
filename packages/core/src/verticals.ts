/**
 * Category expansion (M29): which "vertical" an offer belongs to. The launch taxonomy (electronics,
 * IT, appliances) decides from the product noun a title starts with; books and beauty products do
 * not name themselves that way ("Harry Potter și piatra filozofală", "Dior Sauvage 100 ml"), so
 * they are recognised first, from evidence that never appears on an electronics offer:
 *
 * - **books**: an ISBN/ISMN (GTIN-13 prefix 978 or 979, the "Bookland" ranges) or a breadcrumb
 *   segment that names books ("Cărți", "Carte", "Librărie online", "Beletristică", "Manga" …);
 * - **beauty**: a breadcrumb that names fragrances or cosmetics ("Parfumuri", "Machiaj", "Îngrijirea
 *   tenului" — never the bare "Îngrijire personală", which electronics shops use for shavers and
 *   hair dryers), or a fragrance/cosmetics noun in the title ("Apă de toaletă", "Eau de Parfum",
 *   "Ruj", "Fond de ten", "Șampon" …), or a title that starts with a fragrance/cosmetics brand of
 *   the beauty dictionary and names a volume or a beauty word ("Dior Sauvage Parfum 100 ml").
 *
 * Everything else stays in the launch taxonomy, so no launch offer changes category (the M29 diff
 * over the recorded catalogue checks it). Inputs are ASCII-folded and lower-cased. Pure.
 */

import { startsWithBeautyBrand } from './beauty';
import { foldText } from './fold';

export { foldText };

export type Vertical = 'books' | 'beauty';

/** Breadcrumb segments, leaf first, folded. Separators: `>`, `/`, `»`, `|`. */
export function crumbSegments(categoryRaw: string | null | undefined): string[] {
  if (!categoryRaw) return [];
  return categoryRaw.split(/>|\/|»|\|/).map(foldText).filter(Boolean).reverse();
}

/** GTIN-14 (or 13 digits) in the ISBN/ISMN ranges 978 and 979. ISSN (977) is press, not a book. */
export function isBooklandGtin(gtin: string | null | undefined): boolean {
  if (!gtin) return false;
  const d = gtin.replace(/\D/g, '');
  const g13 = d.length === 14 && d.startsWith('0') ? d.slice(1) : d;
  return g13.length === 13 && (g13.startsWith('978') || g13.startsWith('979'));
}

/** A breadcrumb segment that names books, whatever the subcategory. */
export const BOOK_CRUMB =
  /^(?:carti|carte|carte (?:straina|in limba \w+)|carti (?:in|de|pentru|bilingve)\b.*|books?|english books|foreign books|e ?books?|e ?carti|audio ?books?|audiobook(?:uri)?|carti audio|librarie(?: online)?|beletristica|literatura\b.*|romane?\b.*|poezie|poezii|teatru|manga|benzi desenate|roman grafic|carti pentru copii|carte pentru copii)$/;

/** A breadcrumb segment that names fragrances or cosmetics. */
export const BEAUTY_CRUMB =
  /\b(?:parfum(?:uri)?|parfumerie|fragrances?|cosmetice|cosmetica|dermato ?cosmetice|machiaj|make ?up|frumusete|beauty|ingrijire(?:a)? (?:tenului|ten|fetei|parului|par|corpului|corp|unghiilor)|ingrijire ten|ingrijire par|ingrijire corp|deodorante|lacuri de unghii|unghii)\b/;

/**
 * Fragrance and cosmetics nouns. `START` words count only at the start of the title (after an
 * optional "Set cadou"/"Tester"/"Mini" prefix): alone they are too short to trust inside a title.
 * `PHRASES` count anywhere in the first title segment.
 */
const BEAUTY_START =
  /^(?:(?:set(?: cadou)?|caseta cadou|pachet(?: cadou)?|tester|mini|travel)\s+)?(?:parfum|parfumuri|ruj|mascara|rimel|pudra|fard|blush|bronzer|eyeliner|concealer|oja|sampon|deodorant|antiperspirant|sapun|demachiant|autobronzant|dermatograf)\b/;

const BEAUTY_PHRASES =
  /\b(?:apa de (?:parfum|toaleta|colonie)|eau de (?:parfum|toilette|cologne)|extrait de parfum|elixir de parfum|body mist|luciu de buze|balsam de buze|fond de ten|paleta de farduri|creion (?:de )?(?:ochi|buze|sprancene)|tus de ochi|baza de machiaj|lac de unghii|crema (?:de |pentru )?(?:fata|ten|zi|noapte|ochi|maini|corp)|crema antirid|ser (?:facial|pentru fata|de fata|pentru ten)|masca (?:de |pentru )?(?:fata|ten|par)|apa micelara|lotiune (?:tonica|de corp|pentru corp)|balsam (?:de |pentru )par|vopsea (?:de |pentru )par|gel de dus|spuma de baie|unt de corp|ulei de corp|iluminator facial)\b/;

/** `EDP`/`EDT`/`EDC` with a millilitre volume: a fragrance written the short way. */
const SHORT_FRAGRANCE = /\b(?:edp|edt|edc)\b.*\b\d+(?:[.,]\d+)?\s?ml\b|\b\d+(?:[.,]\d+)?\s?ml\b.*\b(?:edp|edt|edc)\b/;

export interface VerticalInput {
  title: string | null | undefined;
  categoryRaw?: string | null;
  gtin14?: string | null;
}

/** The title head: before the first comma or " | ", folded. */
function head(title: string): string {
  return foldText(title.split(/,|\s\|\s/)[0] ?? title);
}

/**
 * Words that, after a fragrance or cosmetics brand at the start of the title ("Dior Sauvage Parfum
 * 100 ml", "Maybelline SuperStay Matte Ink Liquid Lipstick"), say the product is one.
 */
const BEAUTY_WORDS =
  /\b(?:\d+(?:[.,]\d+)?\s?ml|parfum|eau|edp|edt|edc|elixir|ruj|lipstick|luciu|gloss|mascara|rimel|fond de ten|foundation|pudra|powder|fard|eyeliner|crema|cream|ser|serum|masca|sampon|shampoo|balsam|conditioner|deodorant|antiperspirant|gel de dus|lotiune|lotion|oja|nail)\b/;

export function isBeautyTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const all = foldText(title);
  const h = head(title);
  if (BEAUTY_START.test(all) || BEAUTY_PHRASES.test(h) || SHORT_FRAGRANCE.test(all)) return true;
  return startsWithBeautyBrand(all) && BEAUTY_WORDS.test(all);
}

export function detectVertical(input: VerticalInput): Vertical | null {
  const crumbs = crumbSegments(input.categoryRaw);
  if (isBooklandGtin(input.gtin14) || crumbs.some((c) => BOOK_CRUMB.test(c))) return 'books';
  if (crumbs.some((c) => BEAUTY_CRUMB.test(c)) || isBeautyTitle(input.title)) return 'beauty';
  return null;
}
