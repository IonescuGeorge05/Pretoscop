'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('sending');
        const res = await authClient.signIn.magicLink({ email, callbackURL: '/admin' });
        setState(res.error ? 'error' : 'sent');
      }}
    >
      <label htmlFor="email" className="block text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        aria-label="Email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-10 w-full rounded-lg border border-line bg-white px-3"
        autoComplete="email"
      />
      <button type="submit" disabled={state === 'sending'} className="h-10 w-full rounded-lg bg-brand-600 font-semibold text-white">
        {state === 'sending' ? 'Se trimite…' : 'Trimite linkul'}
      </button>
      {state === 'sent' && <p className="text-sm text-good">Verifică emailul (în dezvoltare: http://localhost:8025).</p>}
      {state === 'error' && <p className="text-sm text-high">Nu am putut trimite linkul. Încearcă din nou.</p>}
    </form>
  );
}
