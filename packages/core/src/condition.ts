/**
 * Condition detection (new / refurbished / used) from a title and a condition field. Pure.
 * Rule of thumb: never let a non-new item pass as new. A non-new signal in the title or the
 * field wins over "new" in the other.
 */
import { foldLower, normalizeText } from './text';

export type Condition = 'new' | 'refurbished' | 'used';
export type ConditionDetail =
  'open_box' | 'grade_a' | 'grade_b' | 'grade_c' | 'renewed' | 'damaged';

export interface ConditionResult {
  condition: Condition;
  detail?: ConditionDetail;
  /** What decided it, e.g. `title:resigilat`, `field:RefurbishedCondition`, `default`. */
  reason: string;
}

interface Signal {
  condition: Condition;
  detail?: ConditionDetail;
  label: string;
}

const SCHEMA_CONDITIONS: Readonly<Record<string, Signal>> = {
  newcondition: { condition: 'new', label: 'NewCondition' },
  refurbishedcondition: { condition: 'refurbished', label: 'RefurbishedCondition' },
  usedcondition: { condition: 'used', label: 'UsedCondition' },
  damagedcondition: { condition: 'used', detail: 'damaged', label: 'DamagedCondition' },
};

function gradeDetail(letter: string | undefined): ConditionDetail | undefined {
  switch (letter) {
    case 'a':
      return 'grade_a';
    case 'b':
      return 'grade_b';
    case 'c':
      return 'grade_c';
    default:
      return undefined;
  }
}

/**
 * Text signals, strongest first. Work on folded lower-case text:
 * - open box: `resigilat(ă/e)`, `open box`, `ambalaj deteriorat`, `produs (de) expoziție`, `expus`
 *   → refurbished + open_box;
 * - `grad A/B/C`, `grade A` → refurbished + grade;
 * - `refurbished`, `recondiționat`, `renewed`, `reconditioned`, `remanufactured` → refurbished;
 * - `second hand`, `SH` (upper case only), `folosit`, `utilizat`, `ca nou`, `pre-owned`, `used` → used;
 * - `nou`, `sigilat`, `new`, `brand new` → new.
 */
function textSignal(raw: string, fromField: boolean): Signal | null {
  const s = foldLower(raw);
  if (s === '') return null;
  const grade = /\bgrad(?:e|ul)?\s*([abc])(?:\+|\b)/.exec(s);
  if (/\bresigilat[ae]?\b/.test(s))
    return { condition: 'refurbished', detail: 'open_box', label: 'resigilat' };
  if (/\bopen[\s-]?box\b/.test(s))
    return { condition: 'refurbished', detail: 'open_box', label: 'open box' };
  if (/\bambalaj (?:deteriorat|desigilat)\b/.test(s)) {
    return { condition: 'refurbished', detail: 'open_box', label: 'ambalaj deteriorat' };
  }
  if (/\b(?:produs (?:de |din )?expozitie|din expozitie|expus|produs demo)\b/.test(s)) {
    return { condition: 'refurbished', detail: 'open_box', label: 'expozitie' };
  }
  // "ușor de folosit/utilizat" (easy to use) is not a condition.
  if (
    /\b(?:second[\s-]?hand|(?<!de )folosit[ae]?|(?<!de )utilizat[ae]?|ca no(?:u|i|ua)|pre[\s-]?owned)\b/.test(
      s,
    )
  ) {
    return { condition: 'used', label: 'second hand' };
  }
  if (/\b(?:renewed|reinnoit)\b/.test(s))
    return { condition: 'refurbished', detail: 'renewed', label: 'renewed' };
  if (/\b(?:refurbished|refurb|recondi[tț]ionat[ae]?|reconditioned|remanufactured)\b/.test(s)) {
    const detail = gradeDetail(grade?.[1]);
    return detail
      ? { condition: 'refurbished', detail, label: 'refurbished' }
      : { condition: 'refurbished', label: 'refurbished' };
  }
  if (grade) {
    const detail = gradeDetail(grade[1]);
    return detail ? { condition: 'refurbished', detail, label: `grad ${grade[1]}` } : null;
  }
  if (/\bused\b/.test(s)) return { condition: 'used', label: 'used' };
  if (fromField && /^(?:nou[aă]?|new|brand new|sigilat)$/.test(s))
    return { condition: 'new', label: 'new' };
  return null;
}

function fieldSignal(field: string | null | undefined): Signal | null {
  if (field == null) return null;
  const s = normalizeText(field);
  if (s === '') return null;
  const schema = /(?:^|\/)([A-Za-z]+Condition)\/?$/.exec(s);
  if (schema) {
    const known = SCHEMA_CONDITIONS[(schema[1] ?? '').toLowerCase()];
    if (known) return known;
  }
  return textSignal(s, true);
}

/**
 * Detects the condition of an offer. Title signals: see `textSignal`. `SH` counts only when written
 * in capitals as a separate word ("iPhone 13 SH"). The field may be a schema.org URL
 * (`https://schema.org/RefurbishedCondition`), a short form or a shop string ("Resigilat").
 * Precedence: a non-new signal wins over "new"; between two non-new signals the title wins
 * (it is more specific, e.g. "Grad B"); with no signal the offer is new (`reason: 'default'`).
 */
export function detectCondition(
  title: string | null | undefined,
  field?: string | null,
): ConditionResult {
  const t = normalizeText(title);
  let fromTitle = textSignal(t, false);
  if (!fromTitle && /(?:^|[\s,(])SH(?:$|[\s,)])/.test(t))
    fromTitle = { condition: 'used', label: 'SH' };
  const fromField = fieldSignal(field);
  const make = (sig: Signal, source: 'title' | 'field'): ConditionResult => {
    const r: ConditionResult = { condition: sig.condition, reason: `${source}:${sig.label}` };
    if (sig.detail) r.detail = sig.detail;
    return r;
  };
  if (fromTitle && fromTitle.condition !== 'new') return make(fromTitle, 'title');
  if (fromField && fromField.condition !== 'new') return make(fromField, 'field');
  if (fromField) return make(fromField, 'field');
  return { condition: 'new', reason: 'default' };
}
