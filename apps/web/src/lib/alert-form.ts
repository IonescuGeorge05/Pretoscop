/**
 * Alert form contract (M19), shared by the product-page form and `POST /api/alerts`. Pure: safe
 * in client components. The server re-validates with the current best price.
 */
import { isPlausibleEmail, parseTargetPrice, type AlertKind, type TargetPriceError } from '@pretoscop/core/alerts';

/** Hidden field that people never see and bots fill (same idea as the contact form). */
export const ALERT_HONEYPOT = 'website';

export type AlertField = 'email' | 'kind' | 'target' | 'consent' | 'product';
export type AlertErrors = Partial<Record<AlertField, string>>;

export interface AlertFormValue {
  productId: number;
  email: string;
  kind: AlertKind;
  targetBani: number | null;
  anyVariant: boolean;
  consentVersion: string;
}

export type AlertFormResult = { ok: true; value: AlertFormValue } | { ok: false; errors: AlertErrors; spam: boolean };

const TARGET_ERRORS: Record<TargetPriceError, string> = {
  empty: 'Scrie pragul de preț, de exemplu 1.999.',
  invalid: 'Scrie pragul ca număr, de exemplu 1.999 sau 1.999,99.',
  too_low: 'Pragul trebuie să fie de cel puțin 1 leu.',
  too_high: 'Pragul este prea mare.',
  not_below_current: 'Prețul total de acum este deja sub acest prag. Alege un prag mai mic.',
};

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

function bool(v: unknown): boolean {
  return v === true || v === 'on' || v === 'true' || v === '1';
}

/**
 * Validates the raw form (JSON body or form fields). `currentBestBani`: today's best total when
 * known, so a target that would fire at once is refused with a clear message.
 */
export function validateAlertForm(raw: Record<string, unknown>, opts: { currentBestBani: number | null; consentVersion: string }): AlertFormResult {
  if (str(raw[ALERT_HONEYPOT]) !== '') return { ok: false, errors: {}, spam: true };
  const errors: AlertErrors = {};
  const productId = Number(str(raw.productId));
  if (!Number.isInteger(productId) || productId <= 0) errors.product = 'Produsul nu a fost găsit.';
  const email = str(raw.email);
  if (!email) errors.email = 'Scrie adresa de email la care vrei alerta.';
  else if (!isPlausibleEmail(email)) errors.email = 'Adresa de email nu pare corectă.';
  const kind = str(raw.kind);
  if (kind !== 'below' && kind !== 'any_drop') errors.kind = 'Alege când te anunțăm.';
  let targetBani: number | null = null;
  if (kind === 'below') {
    const t = parseTargetPrice(str(raw.target), opts.currentBestBani);
    if (t.ok) targetBani = t.bani;
    else errors.target = TARGET_ERRORS[t.error];
  }
  if (!bool(raw.consent)) errors.consent = 'Bifează acordul ca să putem trimite alerta pe email.';
  // The text shown must be the text we store: a page cached with an older version is refused.
  const consentVersion = str(raw.consentVersion);
  if (consentVersion !== opts.consentVersion) errors.consent = 'Textul acordului s-a schimbat între timp. Reîncarcă pagina și încearcă din nou.';
  if (Object.keys(errors).length > 0) return { ok: false, errors, spam: false };
  return { ok: true, value: { productId, email, kind: kind as AlertKind, targetBani, anyVariant: bool(raw.anyVariant), consentVersion } };
}

/** "a***@exemplu.ro" for pages reachable through a link. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

/** Romanian description of what an alert watches. */
export function describeAlert(kind: AlertKind, targetLabel: string | null, anyVariant: boolean): string {
  const base = kind === 'below' && targetLabel ? `Prețul total ajunge la ${targetLabel} sau mai jos` : 'Orice scădere a prețului total de cel puțin 1%';
  return anyVariant ? `${base} · orice variantă a modelului` : base;
}
