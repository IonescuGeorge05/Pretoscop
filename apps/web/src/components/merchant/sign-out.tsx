'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

/** Signs out and goes to `to` (default: the merchant landing page, M20). */
export function SignOutButton({ to = '/pentru-magazine' }: { to?: string } = {}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-sm font-medium text-brand-700 underline underline-offset-2"
      onClick={async () => {
        await authClient.signOut();
        router.push(to);
        router.refresh();
      }}
    >
      Ieși din cont
    </button>
  );
}
