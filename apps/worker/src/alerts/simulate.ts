import { parseArgs } from 'node:util';
import { isPlausibleEmail, normalizeEmail } from '@pretoscop/core';

/**
 * Guard rails of `pnpm alerts:simulate` (M19 review, finding 4). A simulation is a test email with a
 * made-up price: it goes only to addresses named on the command line (`--email`, repeatable) or, by
 * default, to ADMIN_EMAILS, never to every subscriber of the product; and it is refused when
 * APP_ENV=prod unless `--allow-prod` is given.
 */
export const SIMULATE_USAGE = [
  'usage: pnpm alerts:simulate <productId> [percent 1-89, default 10] [--email <address>]... [--allow-prod]',
  '  Sends a [SIMULARE] alert email, for their active alerts on the product, only to the addresses',
  '  given with --email (default: ADMIN_EMAILS). Refused with APP_ENV=prod unless --allow-prod.',
].join('\n');

export interface SimulateOptions {
  productId: number;
  percent: number;
  /** Normalized addresses that may receive the simulation. */
  recipients: string[];
}

export type SimulateArgs = { ok: true; value: SimulateOptions } | { ok: false; error: string };

export function parseSimulateArgs(argv: string[], env: { APP_ENV: string; ADMIN_EMAILS: string[] }): SimulateArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv.filter((a) => a !== '--'),
      allowPositionals: true,
      options: { email: { type: 'string', multiple: true }, 'allow-prod': { type: 'boolean', default: false } },
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const [productArg, pctArg] = parsed.positionals;
  const productId = Number(productArg);
  const percent = Number(pctArg ?? 10);
  if (!Number.isInteger(productId) || productId <= 0) return { ok: false, error: 'productId must be a positive integer' };
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 90) return { ok: false, error: 'percent must be between 1 and 89' };
  if (env.APP_ENV === 'prod' && !parsed.values['allow-prod']) {
    return { ok: false, error: 'refused with APP_ENV=prod: a simulation emails a made-up price (add --allow-prod only for your own address)' };
  }
  const given = parsed.values.email ?? [];
  for (const e of given) if (!isPlausibleEmail(e)) return { ok: false, error: `not an email address: ${e}` };
  const recipients = [...new Set((given.length > 0 ? given : env.ADMIN_EMAILS).map(normalizeEmail))];
  if (recipients.length === 0) return { ok: false, error: 'no recipient: pass --email <address> (or set ADMIN_EMAILS)' };
  return { ok: true, value: { productId, percent, recipients } };
}

/** Keeps the alerts whose owner's address is one of `recipients`. */
export function simulationTargets<T extends { userId: string }>(candidates: T[], emailByUser: Map<string, string>, recipients: string[]): T[] {
  const allowed = new Set(recipients.map(normalizeEmail));
  return candidates.filter((c) => {
    const email = emailByUser.get(c.userId);
    return email !== undefined && allowed.has(normalizeEmail(email));
  });
}
