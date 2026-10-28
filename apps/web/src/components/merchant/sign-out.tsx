'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-sm font-medium text-brand-700 underline underline-offset-2"
      onClick={async () => {
        await authClient.signOut();
        router.push('/pentru-magazine');
        router.refresh();
      }}
    >
      Ieși din cont
    </button>
  );
}
