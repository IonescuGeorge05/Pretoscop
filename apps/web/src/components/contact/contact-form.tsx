'use client';

import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import {
  CONTACT_KIND_LABELS,
  CONTACT_KINDS,
  CONTACT_LIMITS,
  GOOD_FAITH_STATEMENT,
  HONEYPOT_FIELD,
  emailRequired,
  goodFaithRequired,
  isContactKind,
  urlRequired,
  validateContact,
  type ContactErrors,
  type ContactField,
  type ContactKind,
} from '@/lib/contact';

const noopSubscribe = () => () => {};
/** False on the server and before hydration (the form then works as a plain HTML form). */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

const FIELD_ORDER: ContactField[] = ['kind', 'name', 'email', 'url', 'message', 'goodFaith'];
const FIELD_ID: Record<ContactField, string> = {
  kind: 'contact-kind',
  name: 'contact-name',
  email: 'contact-email',
  url: 'contact-url',
  message: 'contact-message',
  goodFaith: 'contact-goodfaith',
};

const URL_HINTS: Partial<Record<ContactKind, string>> = {
  price_error: 'Pagina produsului de pe Pretoscop sau de pe site-ul magazinului.',
  shop_objection: 'Adresa site-ului magazinului pe care îl reprezinți.',
  illegal_content: 'Adresa exactă a conținutului pe care îl semnalezi.',
  merchant: 'Adresa magazinului tău online.',
};

const MESSAGE_HINTS: Partial<Record<ContactKind, string>> = {
  price_error: 'Ce preț ai văzut la noi și ce preț apare pe site-ul magazinului.',
  shop_objection: 'Ce magazin reprezinți și ce dorești: oprirea completă a colectării sau doar un ritm mai lent.',
  illegal_content: 'De ce consideri că acest conținut este ilegal; cu cât mai precis, cu atât mai repede putem decide.',
  privacy: 'Ce drept dorești să exerciți (de exemplu, acces sau ștergere) și orice detaliu care ne ajută să găsim datele.',
  merchant: 'Cum se numește magazinul și ce feed de produse folosești deja (Google Merchant, compari.ro, CSV).',
};

function nextStep(kind: ContactKind | null, hadEmail: boolean): string {
  switch (kind) {
    case 'shop_objection':
      return 'Îți răspundem și oprim colectarea în cel mult o zi lucrătoare. Ți-am trimis și o confirmare de primire pe email.';
    case 'illegal_content':
      return hadEmail
        ? 'Analizăm sesizarea și te anunțăm decizia, împreună cu motivele ei. Ți-am trimis o confirmare de primire pe email.'
        : 'Analizăm sesizarea. Fără o adresă de email nu te putem anunța ce am decis.';
    case 'privacy':
      return 'Îți răspundem în cel mult o lună de la primire, de regulă mult mai repede.';
    case 'price_error':
      return 'Verificăm prețul pe site-ul magazinului și îl corectăm dacă este cazul.';
    default:
      return hadEmail ? 'Îți răspundem pe email cât mai repede.' : 'Nu ne-ai lăsat o adresă de email, așa că nu îți putem răspunde direct. Mulțumim pentru mesaj!';
  }
}

const SERVER_ERRORS: Record<string, string> = {
  validare: 'Unele câmpuri nu au fost completate corect. Verifică-le și trimite din nou.',
  limita: 'Ai trimis deja mai multe mesaje în ultima oră. Încearcă din nou mai târziu sau scrie-ne pe email.',
  respins: 'Nu am putut trimite mesajul. Scrie-ne direct pe email, la adresa de pe această pagină.',
  server: 'Nu am putut salva mesajul din cauza unei erori la noi. Încearcă din nou sau scrie-ne pe email.',
};

const inputClass =
  'block w-full rounded-lg border border-line bg-white px-3 text-[15px] text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 aria-[invalid=true]:border-high';

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label id={`${id}-label`} htmlFor={id} className="block text-sm font-semibold text-ink">
        {label} <span className="font-normal text-muted">{required ? '(obligatoriu)' : '(opțional)'}</span>
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-[13px] leading-snug text-muted">
          {hint}
        </p>
      )}
      <div className="mt-1.5">{children}</div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[13px] font-medium text-high">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint: boolean, error: boolean): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

type SendState =
  | { status: 'idle' | 'sending' }
  | { status: 'sent'; reference: string; kind: ContactKind | null; hadEmail: boolean }
  | { status: 'error'; message: string };

export function ContactForm({
  initialKind,
  sentReference,
  sentKind,
  sentHadEmail = false,
  serverError,
  fallbackEmail,
}: {
  initialKind: ContactKind | null;
  /** Set after a no-JavaScript submission (`?trimis=PS-…`). */
  sentReference?: string | null;
  sentKind?: ContactKind | null;
  /** Whether that submission included an email address (`&email=1`). */
  sentHadEmail?: boolean;
  /** `?eroare=` code after a no-JavaScript submission. */
  serverError?: string | null;
  fallbackEmail: string;
}) {
  const hydrated = useHydrated();
  const [kind, setKind] = useState<ContactKind | ''>(initialKind ?? '');
  const [errors, setErrors] = useState<ContactErrors>({});
  const [length, setLength] = useState(0);
  const [state, setState] = useState<SendState>(() =>
    sentReference
      ? { status: 'sent', reference: sentReference, kind: sentKind ?? null, hadEmail: sentHadEmail }
      : serverError && SERVER_ERRORS[serverError]
        ? { status: 'error', message: SERVER_ERRORS[serverError] }
        : { status: 'idle' },
  );
  const confirmationRef = useRef<HTMLDivElement>(null);
  const k = kind || null;

  useEffect(() => {
    if (state.status === 'sent') confirmationRef.current?.focus();
  }, [state.status]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      kind: String(data.get('kind') ?? ''),
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      url: String(data.get('url') ?? ''),
      message: String(data.get('message') ?? ''),
      goodFaith: data.get('goodFaith') === 'on',
      [HONEYPOT_FIELD]: String(data.get(HONEYPOT_FIELD) ?? ''),
    };
    const showErrors = (found: ContactErrors) => {
      setErrors(found);
      const first = FIELD_ORDER.find((f) => found[f]);
      if (first) document.getElementById(FIELD_ID[first])?.focus();
    };
    const local = validateContact(payload);
    if (!local.ok && !local.spam) {
      showErrors(local.errors);
      return;
    }
    setErrors({});
    setState({ status: 'sending' });
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as { reference?: string; errors?: ContactErrors } | null;
      if (res.status === 201 && body?.reference) {
        setState({ status: 'sent', reference: body.reference, kind: isContactKind(payload.kind) ? payload.kind : null, hadEmail: payload.email.trim() !== '' });
        form.reset();
        setLength(0);
        return;
      }
      if (res.status === 400 && body?.errors && Object.keys(body.errors).length > 0) {
        setState({ status: 'idle' });
        showErrors(body.errors);
        return;
      }
      setState({ status: 'error', message: SERVER_ERRORS[res.status === 429 ? 'limita' : res.status >= 500 ? 'server' : 'respins'] ?? '' });
    } catch {
      setState({ status: 'error', message: 'Conexiunea a eșuat. Verifică internetul și încearcă din nou.' });
    }
  }

  if (state.status === 'sent') {
    return (
      <div
        ref={confirmationRef}
        tabIndex={-1}
        role="status"
        data-testid="contact-confirmation"
        className="rounded-[var(--radius-card)] bg-brand-50 p-5 ring-1 ring-brand-200 focus:outline-none sm:p-6"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-brand-700" aria-hidden />
          <div className="space-y-2 text-[15px] text-ink-soft">
            <h2 className="text-lg font-semibold text-ink">Mulțumim, am primit mesajul.</h2>
            <p>
              Numărul de înregistrare: <strong className="font-semibold tabular text-ink">{state.reference}</strong>. Păstrează-l dacă ne scrii din nou
              despre același subiect.
            </p>
            <p>{nextStep(state.kind, state.hadEmail)}</p>
            <Button type="button" variant="secondary" className="mt-2" onClick={() => setState({ status: 'idle' })}>
              Trimite alt mesaj
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const showGoodFaith = !hydrated || goodFaithRequired(k);
  const emailIsRequired = hydrated && emailRequired(k);
  const urlIsRequired = hydrated && urlRequired(k);
  const emailHint = !hydrated
    ? 'Obligatorie pentru cererile magazinelor și pentru solicitările privind datele personale.'
    : emailIsRequired
      ? 'Ca să-ți putem răspunde la această solicitare.'
      : 'Doar dacă vrei să-ți răspundem.';
  const urlHint = (k && URL_HINTS[k]) || 'Pagina despre care ne scrii, dacă este cazul.';
  const messageHint = (k && MESSAGE_HINTS[k]) || undefined;
  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <form action="/api/contact" method="post" noValidate={hydrated} onSubmit={onSubmit} className="relative space-y-5" aria-describedby="contact-privacy">
      {(errorCount > 0 || state.status === 'error') && (
        <div role="alert" className="rounded-lg bg-high-bg px-4 py-3 text-sm font-medium text-high ring-1 ring-red-200">
          {state.status === 'error' ? state.message : 'Verifică câmpurile marcate mai jos.'}
        </div>
      )}

      <Field id={FIELD_ID.kind} label="Tipul solicitării" required error={errors.kind}>
        <select
          id={FIELD_ID.kind}
          aria-labelledby={`${FIELD_ID.kind}-label`}
          name="kind"
          required
          value={kind}
          onChange={(e) => {
            setKind(isContactKind(e.target.value) ? e.target.value : '');
            // The kind decides which fields are required: drop the errors that depended on it.
            setErrors(({ name, message }) => ({ ...(name ? { name } : {}), ...(message ? { message } : {}) }));
          }}
          aria-invalid={errors.kind ? true : undefined}
          aria-describedby={describedBy(FIELD_ID.kind, false, !!errors.kind)}
          className={cn(inputClass, 'h-11')}
        >
          <option value="" disabled>
            Alege…
          </option>
          {CONTACT_KINDS.map((value) => (
            <option key={value} value={value}>
              {CONTACT_KIND_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>

      {k === 'shop_objection' && (
        <p className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900 ring-1 ring-brand-200">
          Oprim colectarea și îți răspundem în cel mult o zi lucrătoare. Poți bloca PretoscopBot și singur, din robots.txt:{' '}
          <Link href="/bot#blocare" className="font-medium underline">
            vezi cum
          </Link>
          .
        </p>
      )}
      {k === 'illegal_content' && (
        <p className="rounded-lg bg-info-bg px-4 py-3 text-sm text-blue-950 ring-1 ring-blue-200">
          Sesizări privind conținut ilegal, conform art. 16 din Regulamentul (UE) 2022/2065 privind serviciile digitale. Îți trimitem o confirmare de primire și
          te anunțăm decizia, cu motivele ei.
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={FIELD_ID.name} label="Numele tău" required={false} error={errors.name}>
          <input
            id={FIELD_ID.name}
          aria-labelledby={`${FIELD_ID.name}-label`}
            name="name"
            type="text"
            autoComplete="name"
            maxLength={CONTACT_LIMITS.name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy(FIELD_ID.name, false, !!errors.name)}
            className={cn(inputClass, 'h-11')}
          />
        </Field>
        <Field id={FIELD_ID.email} label="Adresa de email" required={emailIsRequired} hint={emailHint} error={errors.email}>
          <input
            id={FIELD_ID.email}
          aria-labelledby={`${FIELD_ID.email}-label`}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={CONTACT_LIMITS.email}
            required={emailIsRequired}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy(FIELD_ID.email, true, !!errors.email)}
            className={cn(inputClass, 'h-11')}
          />
        </Field>
      </div>

      <Field id={FIELD_ID.url} label="Adresa paginii (URL)" required={urlIsRequired} hint={urlHint} error={errors.url}>
        <input
          id={FIELD_ID.url}
          aria-labelledby={`${FIELD_ID.url}-label`}
          name="url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="https://"
          maxLength={CONTACT_LIMITS.url}
          required={urlIsRequired}
          aria-invalid={errors.url ? true : undefined}
          aria-describedby={describedBy(FIELD_ID.url, true, !!errors.url)}
          className={cn(inputClass, 'h-11')}
        />
      </Field>

      <Field id={FIELD_ID.message} label="Mesajul" required hint={messageHint} error={errors.message}>
        <textarea
          id={FIELD_ID.message}
          aria-labelledby={`${FIELD_ID.message}-label`}
          name="message"
          required
          rows={7}
          minLength={CONTACT_LIMITS.messageMin}
          maxLength={CONTACT_LIMITS.messageMax}
          onChange={(e) => setLength(e.target.value.length)}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={[describedBy(FIELD_ID.message, !!messageHint, !!errors.message), 'contact-message-count'].filter(Boolean).join(' ')}
          className={cn(inputClass, 'min-h-40 py-2.5 leading-relaxed')}
        />
        <p id="contact-message-count" className="mt-1 text-right text-xs text-muted tabular">
          {length.toLocaleString('ro-RO')} / {CONTACT_LIMITS.messageMax.toLocaleString('ro-RO')} caractere
        </p>
      </Field>

      {showGoodFaith && (
        <div>
          <div className="flex items-start gap-2.5">
            <input
              id={FIELD_ID.goodFaith}
              aria-labelledby={`${FIELD_ID.goodFaith}-label`}
              name="goodFaith"
              type="checkbox"
              aria-invalid={errors.goodFaith ? true : undefined}
              aria-describedby={errors.goodFaith ? `${FIELD_ID.goodFaith}-error` : undefined}
              className="mt-1 size-4 shrink-0 accent-brand-600"
            />
            <label id={`${FIELD_ID.goodFaith}-label`} htmlFor={FIELD_ID.goodFaith} className="text-sm text-ink-soft">
              {GOOD_FAITH_STATEMENT}
              {!hydrated && <span className="text-muted"> (obligatoriu doar pentru sesizările de conținut ilegal)</span>}
            </label>
          </div>
          {errors.goodFaith && (
            <p id={`${FIELD_ID.goodFaith}-error`} className="mt-1 text-[13px] font-medium text-high">
              {errors.goodFaith}
            </p>
          )}
        </div>
      )}

      {/* Honeypot: hidden from people and assistive technology; bots that fill it are refused. */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Nu completa acest câmp</label>
        <input id="contact-website" aria-label="Nu completa acest câmp" name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <p id="contact-privacy" className="text-[13px] leading-snug text-muted">
        Folosim datele din acest formular doar ca să-ți răspundem și să tratăm solicitarea. Detalii în{' '}
        <Link href="/confidentialitate#contact" className="text-brand-700 underline">
          Politica de confidențialitate
        </Link>
        . Dacă formularul nu funcționează, scrie-ne la{' '}
        <a href={`mailto:${fallbackEmail}`} className="text-brand-700 underline">
          {fallbackEmail}
        </a>
        .
      </p>

      <Button type="submit" size="lg" disabled={state.status === 'sending'} className="w-full sm:w-auto">
        {state.status === 'sending' ? 'Se trimite…' : 'Trimite mesajul'}
      </Button>
    </form>
  );
}
