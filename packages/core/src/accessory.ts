/**
 * Accessory detection: an offer for something used *with* a device (case, screen protector,
 * charger, cable, strap, controller…), whose title names the device ("Husă pentru iPhone 17 Pro")
 * and must never be matched to the device itself. Pure.
 */
import { detectProductKind } from './product-kind';
import { foldLower } from './text';

export interface AccessoryResult {
  isAccessory: boolean;
  /** Why: `noun:<word>`, `compat`, `category`, or `kind:<kind>` when a device noun leads. */
  reason: string | null;
}

const ACCESSORY_NOUNS =
  /\b(?:husa|huse|folie|folii|sticla (?:de )?protectie|sticla securizata|cablu|incarcator|alimentator|adaptor|suport|geanta|rucsac|bumper|stylus|curea|dock|docking|hub|telecomanda|cartus|toner)\b/;

const COMPAT_TARGETS =
  /\b(?:pentru|compatibil[aei]?\s+cu|compatible with|for)\s+(?:telefon\w*|smartphone\w*|laptop\w*|tablet\w*|iphone|ipad|samsung|galaxy|apple|xiaomi|redmi|huawei|honor|motorola|oppo|oneplus|google|pixel|playstation|ps5|ps4|xbox|nintendo|switch|macbook|airpods|apple watch|kindle|dyson|gopro|garmin|consola|ceas\w*|smartwatch)\b/;

/**
 * Detects accessories:
 * 1. the title starts with an accessory noun (husă, folie, sticlă de protecție, cablu,
 *    încărcător, adaptor, suport, geantă, rucsac, carcasă, stylus, curea, dock, hub, cartuș,
 *    controller, volan …) → accessory;
 * 2. it starts with a device noun (telefon, laptop, smartwatch, carcasă PC, baterie externă …) →
 *    not an accessory, whatever follows ("Smartwatch …, Curea Sport");
 * 3. otherwise an accessory noun among the first three words ("Apple Husă …") or the pattern
 *    "… pentru / compatibil cu <device or brand>" → accessory;
 * 4. otherwise the shop category decides (Accesorii, Huse, Încărcătoare …).
 */
export function detectAccessory(
  title: string | null | undefined,
  categoryHint?: string | null,
): AccessoryResult {
  const s = foldLower(title);
  if (s === '') return { isAccessory: false, reason: null };
  const kind = detectProductKind(title);
  if (kind === 'accessory') {
    return { isAccessory: true, reason: `noun:${s.split(/[^a-z0-9]+/)[0] ?? ''}` };
  }
  if (kind !== 'other') return { isAccessory: false, reason: `kind:${kind}` };
  const firstWords = s.split(/\s+/).slice(0, 3).join(' ');
  if (ACCESSORY_NOUNS.test(firstWords)) return { isAccessory: true, reason: 'noun' };
  if (COMPAT_TARGETS.test(s)) return { isAccessory: true, reason: 'compat' };
  if (categoryHint && detectProductKind('', categoryHint) === 'accessory') {
    return { isAccessory: true, reason: 'category' };
  }
  return { isAccessory: false, reason: null };
}
