'use client';

import { BellRing, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { ALERT_HONEYPOT, validateAlertForm, type AlertErrors, type AlertField } from '@/lib/alert-form';
import { formatLei } from '@/lib/format';

const noopSubscribe = () => () => {};
/** False on the server and before hydration: the form then works as a plain HTML form. */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

const inputClass =
  'block w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 aria-[invalid=true]:border-high';

const FIELD_ID: Record<AlertField, string> = {
  product: 'alert-email',
  email: 'alert-email',
  kind: 'alert-kind-below',
  target: 'alert-target',
  consent: 'alert-consent',
};
const ORDER: AlertField[] = ['product', 'kind', 'target', 'email', 'consent'];

type State =
  | { status: 'idle' | 'sending' }
  | { status: 'done'; outcome: 'pending' | 'active'; email: string }
  | { status: 'error'; message: string };

export interface AlertFormProps {
  productId: number;
  /** Best shop-sold total now (bani), for the hint and the local check; the server re-checks. */
  currentBestBani: number | null;
  hasVariants: boolean;
  consent: { key: string; text: string; link: { href: string; label: string } };
}

function suggestion(bani: number | null): string {
  if (bani === null) return '1.999';
  const lei = Math.floor((bani * 0.95) / 100 / 10) * 10;
  return lei >= 10 ? lei.toLocaleString('ro-RO') : '';
}

/**
 * Price-alert form on the product page (docs/03 §7.2 block 5): explicit, unticked consent with the
 * versioned text; the alert starts only after the confirmation email (double opt-in).
 */
export function AlertForm({ productId, currentBestBani, hasVariants, consent }: AlertFormProps) {
  const hydrated = useHydrated();
  const [kind, setKind] = useState<'below' | 'any_drop'>('below');
  const [errors, setErrors] = useState<AlertErrors>({});
  const [state, setState] = useState<State>({ status: 'idle' });
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === 'done') doneRef.current?.focus();
  }, [state.status]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const payload = {
      productId: String(productId),
      email: String(data.get('email') ?? ''),
      kind: String(data.get('kind') ?? ''),
      target: String(data.get('target') ?? ''),
      anyVariant: data.get('anyVariant') === 'on',
      consent: data.get('consent') === 'on',
      consentVersion: String(data.get('consentVersion') ?? ''),
      [ALERT_HONEYPOT]: String(data.get(ALERT_HONEYPOT) ?? ''),
    };
    const show = (found: AlertErrors) => {
      setErrors(found);
      const first = ORDER.find((f) => found[f]);
      if (first) document.getElementById(FIELD_ID[first])?.focus();
    };
    const local = validateAlertForm(payload, { currentBestBani, consentVersion: consent.key });
    if (!local.ok && !local.spam) {
      show(local.errors);
      return;
    }
    setErrors({});
    setState({ status: 'sending' });
    try {
      const res = await fetch('/api/alerts', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => null)) as { status?: 'pending' | 'active'; errors?: AlertErrors } | null;
      if (res.status === 201 && body?.status) {
        setState({ status: 'done', outcome: body.status, email: payload.email.trim() });
        return;
      }
      if (res.status === 400 && body?.errors && Object.keys(body.errors).length > 0) {
        setState({ status: 'idle' });
        show(body.errors);
        return;
      }
      setState({
        status: 'error',
        message:
          res.status === 429
            ? 'Ai cerut mai multe alerte în ultima oră. Încearcă din nou mai târziu.'
            : res.status === 503
              ? 'Alertele nu sunt încă disponibile.'
              : 'Nu am putut porni alerta. Încearcă din nou peste câteva minute.',
      });
    } catch {
      setState({ status: 'error', message: 'Conexiunea a eșuat. Verifică internetul și încearcă din nou.' });
    }
  }

  if (state.status === 'done') {
    return (
      <div ref={doneRef} tabIndex={-1} role="status" data-testid="alert-done" className="rounded-[var(--radius-card)] bg-brand-50 p-4 ring-1 ring-brand-200 focus:outline-none">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <CheckCircle2 className="size-5 text-brand-700" aria-hidden />
          {state.outcome === 'active' ? 'Alerta este activă' : 'Verifică emailul'}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {state.outcome === 'active' ? (
            <>
              O găsești în{' '}
              <Link href="/alerte" className="font-medium text-brand-700 underline">
                Alertele mele
              </Link>
              .
            </>
          ) : (
            <>
              Ți-am trimis un link de confirmare la <strong className="text-ink">{state.email}</strong>. Alerta pornește după ce apeși butonul din email
              (valabil 7 zile).
            </>
          )}
        </p>
      </div>
    );
  }

  const err = (f: AlertField) =>
    errors[f] ? (
      <p id={`alert-${f}-error`} className="mt-1 text-[13px] font-medium text-high">
        {errors[f]}
      </p>
    ) : null;
  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <form action="/api/alerts" method="post" noValidate={hydrated} onSubmit={onSubmit} className="relative space-y-3" data-testid="alert-form">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="consentVersion" value={consent.key} />
      {(errorCount > 0 || state.status === 'error') && (
        <p role="alert" className="rounded-lg bg-high-bg px-3 py-2 text-sm font-medium text-high ring-1 ring-red-200">
          {state.status === 'error' ? state.message : (errors.product ?? 'Verifică câmpurile marcate.')}
        </p>
      )}

      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 font-semibold text-ink">Te anunțăm</legend>
        <div className="flex items-start gap-2">
          <input id="alert-kind-below" aria-labelledby="alert-kind-below-label" type="radio" name="kind" value="below" checked={kind === 'below'} onChange={() => setKind('below')} className="mt-1 size-4 accent-brand-600" />
          <div className="min-w-0 flex-1">
            <label id="alert-kind-below-label" htmlFor="alert-kind-below" className="text-ink-soft">
              când prețul total ajunge la
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="alert-target"
                name="target"
                inputMode="decimal"
                autoComplete="off"
                placeholder={suggestion(currentBestBani)}
                aria-label="Pragul de preț, în lei"
                aria-invalid={errors.target ? true : undefined}
                aria-describedby={errors.target ? 'alert-target-error' : undefined}
                onFocus={() => setKind('below')}
                className={cn(inputClass, 'h-10 w-32')}
              />
              <span className="text-ink-soft">lei sau mai jos</span>
            </div>
            {err('target')}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <input id="alert-kind-drop" aria-labelledby="alert-kind-drop-label" type="radio" name="kind" value="any_drop" checked={kind === 'any_drop'} onChange={() => setKind('any_drop')} className="mt-1 size-4 accent-brand-600" />
          <label id="alert-kind-drop-label" htmlFor="alert-kind-drop" className="text-ink-soft">
            la orice scădere de cel puțin 1%
          </label>
        </div>
        {err('kind')}
      </fieldset>

      {currentBestBani !== null && <p className="text-xs text-muted">Prețul total minim acum, la magazinele care vând direct: {formatLei(currentBestBani)}.</p>}

      {hasVariants && (
        <div className="flex items-start gap-2 text-sm">
          <input id="alert-any-variant" aria-labelledby="alert-any-variant-label" name="anyVariant" type="checkbox" className="mt-1 size-4 shrink-0 accent-brand-600" />
          <label id="alert-any-variant-label" htmlFor="alert-any-variant" className="text-ink-soft">
            Orice variantă a modelului (culoare, memorie)
          </label>
        </div>
      )}

      <div>
        <label id="alert-email-label" htmlFor="alert-email" className="block text-sm font-semibold text-ink">
          Adresa de email
        </label>
        <input
          id="alert-email"
          aria-labelledby="alert-email-label"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'alert-email-error' : undefined}
          className={cn(inputClass, 'mt-1 h-10')}
        />
        {err('email')}
      </div>

      <div>
        <div className="flex items-start gap-2.5">
          <input
            id="alert-consent"
            aria-labelledby="alert-consent-label"
            name="consent"
            type="checkbox"
            required
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? 'alert-consent-error' : undefined}
            className="mt-1 size-4 shrink-0 accent-brand-600"
          />
          <label id="alert-consent-label" htmlFor="alert-consent" className="text-[13px] leading-snug text-ink-soft">
            {consent.text}{' '}
            <Link href={consent.link.href} className="text-brand-700 underline">
              {consent.link.label}
            </Link>
          </label>
        </div>
        {err('consent')}
      </div>

      {/* Honeypot: hidden from people and assistive technology; bots that fill it are refused. */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="alert-website">Nu completa acest câmp</label>
        <input id="alert-website" aria-label="Nu completa acest câmp" name={ALERT_HONEYPOT} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <Button type="submit" className="w-full" disabled={state.status === 'sending'}>
        <BellRing className="size-4" aria-hidden />
        {state.status === 'sending' ? 'Se trimite…' : 'Pornește alerta'}
      </Button>
      <p className="text-xs leading-snug text-muted">Cel mult un email pe zi pentru fiecare alertă, doar când prețul chiar scade. Te dezabonezi dintr-un clic.</p>
    </form>
  );
}
