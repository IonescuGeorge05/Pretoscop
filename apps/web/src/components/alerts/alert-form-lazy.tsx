'use client';

import dynamic from 'next/dynamic';

/**
 * The price-alert form (M19) in its own chunk (M16 performance budget): the product page imports
 * this wrapper, so the form's code is downloaded only where it renders (alerts enabled), and is still
 * server-rendered there. Next.js splits client components only when a client module imports them
 * with next/dynamic, hence this file.
 */
export const AlertFormLazy = dynamic(() => import('./alert-form').then((m) => m.AlertForm));
