/**
 * Accessory detection: an offer for something used *with* a device (case, screen protector,
 * charger, cable, strap, controller…), whose title names the device ("Husă pentru iPhone 17 Pro")
 * and must never be matched to the device itself. Pure.
 */
import { explainProductKind } from './product-kind';
import { foldLower } from './text';

export interface AccessoryResult {
  isAccessory: boolean;
  /**
   * Why: `noun:<word>` (the accessory noun that names the product), `compat` ("… pentru iPhone"),
   * `category` (an accessory breadcrumb), or `kind:<kind>` when the product is a device.
   */
  reason: string | null;
}

/**
 * An offer is an accessory when its product kind is (see `explainProductKind`):
 * 1. the title's product noun is an accessory noun — at the start ("Husă …", "Controller …") or
 *    after a brand or seller prefix ("HAPPY JOKER Controller …", "Baseus Cablu …");
 * 2. a device noun, a device breadcrumb or a device product line wins over accessory words that
 *    only describe it ("SweetLink Telefon mobil … Stand încărcare", "MacBook Air …, Fără
 *    încărcător", "Televizor … | Încărcător auto"); negations never count;
 * 3. otherwise "… pentru / compatibil cu <device or brand>" → accessory;
 * 4. otherwise an accessory breadcrumb ("Accesorii telefoane > Huse"); breadcrumbs that only group
 *    a device family with its accessories ("Laptopuri și accesorii > Notebook") do not count.
 */
export function detectAccessory(
  title: string | null | undefined,
  categoryHint?: string | null,
): AccessoryResult {
  if (foldLower(title) === '') return { isAccessory: false, reason: null };
  const k = explainProductKind(title, categoryHint);
  if (k.kind === 'accessory') {
    const reason = k.via === 'title' || k.via === 'head' ? `noun:${k.word ?? ''}` : k.via;
    return { isAccessory: true, reason };
  }
  if (k.kind !== 'other') return { isAccessory: false, reason: `kind:${k.kind}` };
  return { isAccessory: false, reason: null };
}
