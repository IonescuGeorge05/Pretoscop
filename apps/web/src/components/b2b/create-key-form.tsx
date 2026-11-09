'use client';

import { useActionState } from 'react';
import { createApiKeyAction, type CreateKeyState } from '@/app/b2b/actions';
import { Button } from '@/components/ui/button';

const ERRORS: Record<string, string> = {
  doar_proprietar: 'Doar proprietarul spațiului de lucru poate crea chei.',
  fara_api: 'Planul tău nu include acces API.',
  nume: 'Dă un nume cheii (de exemplu, ERP sau Power BI).',
};

/** Creates an API key; the key is shown once, here, and never again (only its hash is stored). */
export function CreateKeyForm({ ws }: { ws: number }) {
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createApiKeyAction, {});
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="ws" value={ws} />
        <div className="space-y-1">
          <label id="key-name-label" htmlFor="key-name" className="block text-sm font-semibold text-ink">
            Numele cheii
          </label>
          <input
            id="key-name"
            name="name"
            aria-labelledby="key-name-label"
            required
            minLength={2}
            maxLength={60}
            placeholder="ERP"
            className="block h-10 w-64 rounded-lg border border-line bg-white px-3 text-[15px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Se creează…' : 'Creează o cheie'}
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-high">
          {ERRORS[state.error] ?? 'Cheia nu a putut fi creată.'}
        </p>
      )}
      {state.key && (
        <div role="status" className="rounded-lg bg-good-bg p-3 text-sm ring-1 ring-good/30">
          <p className="font-semibold text-ink">Cheia „{state.name}” a fost creată. Copiaz-o acum: nu o mai afișăm.</p>
          <code data-testid="b2b-new-key" className="mt-2 block break-all rounded bg-white px-2 py-1 font-mono text-[13px] ring-1 ring-line">
            {state.key}
          </code>
        </div>
      )}
    </div>
  );
}
