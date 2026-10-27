'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

/** Magic-link sign-in (and sign-up) for merchants; the link opens the portal. */
export function MerchantLoginForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  if (state === 'sent') {
    return (
      <div role="status" data-testid="merchant-link-sent" className="rounded-[var(--radius-card)] bg-brand-50 p-5 text-[15px] text-ink-soft ring-1 ring-brand-200">
        <p className="font-semibold text-ink">Verifică emailul.</p>
        <p className="mt-1">
          Ți-am trimis un link de autentificare la <strong className="text-ink">{email}</strong>. Linkul este valabil 10 minute și poate fi folosit o singură
          dată.
        </p>
      </div>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('sending');
        const res = await authClient.signIn.magicLink({ email, callbackURL: '/pentru-magazine/cont' });
        setState(res.error ? 'error' : 'sent');
      }}
    >
      <label id="merchant-email-label" htmlFor="merchant-email" className="block text-sm font-semibold text-ink">
        Adresa de email
      </label>
      <p id="merchant-email-hint" className="text-[13px] text-muted">
        Folosește, dacă poți, o adresă de pe domeniul magazinului (de exemplu, nume@magazinul-tau.ro): așa domeniul se verifică automat.
      </p>
      <input
        id="merchant-email"
        aria-labelledby="merchant-email-label"
        aria-describedby="merchant-email-hint"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="block h-11 w-full rounded-lg border border-line bg-white px-3 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
      />
      <Button type="submit" size="lg" disabled={state === 'sending'} className="w-full sm:w-auto">
        {state === 'sending' ? 'Se trimite…' : 'Trimite linkul de autentificare'}
      </Button>
      {state === 'error' && (
        <p role="alert" className="text-sm font-medium text-high">
          Nu am putut trimite linkul. Verifică adresa și încearcă din nou.
        </p>
      )}
    </form>
  );
}
