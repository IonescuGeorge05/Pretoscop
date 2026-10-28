import 'server-only';
import { accounts, sessions, touchUserActivity, users, verifications } from '@pretoscop/db';
import { createMailer } from '@pretoscop/mailer';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { magicLink } from 'better-auth/plugins/magic-link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { db, serverEnv } from './db';
import { allowLoginEmail, resetLoginEmails } from './login-limits';

function buildAuth() {
  const env = serverEnv();
  const mailer = createMailer(env);
  const admins = new Set(env.ADMIN_EMAILS);
  return betterAuth({
    appName: 'Pretoscop',
    baseURL: env.PUBLIC_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: { users, sessions, accounts, verifications },
    }),
    user: {
      modelName: 'users',
      additionalFields: { role: { type: 'string', defaultValue: 'user', input: false } },
    },
    session: { modelName: 'sessions', expiresIn: 60 * 60 * 24 * 30 },
    account: { modelName: 'accounts' },
    verification: { modelName: 'verifications' },
    emailAndPassword: { enabled: false },
    // Personal data minimization (CLAUDE.md): no IP tracking, no User-Agent on sessions.
    advanced: { ipAddress: { disableIpTracking: true } },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: { ...user, role: admins.has(String(user.email).toLowerCase()) ? 'admin' : 'user' },
          }),
        },
      },
      session: {
        create: {
          before: async (session) => ({ data: { ...session, ipAddress: null, userAgent: null } }),
          // M19 retention: a login is activity (resets the 24-month inactivity clock); it also
          // starts the address's login-link count over (login-limits.ts).
          after: async (session) => {
            await touchUserActivity(db(), session.userId).catch(() => undefined);
            await resetLoginEmails(db(), session.userId).catch(() => undefined);
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 600,
        storeToken: 'hashed',
        // Every login path ends here (the /alerte form, the admin and merchant forms, direct calls
        // to POST /api/auth/sign-in/magic-link): over a limit nothing is sent and the answer stays
        // the same (no enumeration).
        sendMagicLink: async ({ email, url }, ctx) => {
          const decision = await allowLoginEmail(db(), email, ctx?.headers ?? ctx?.request?.headers);
          if (!decision.allowed) {
            console.warn(JSON.stringify({ level: 'warn', service: 'web.auth', event: 'login.link_capped', reason: decision.reason, time: new Date().toISOString() }));
            return;
          }
          await mailer.send({
            to: email,
            subject: 'Linkul tău de autentificare Pretoscop',
            text: `Bună,\n\nApasă pe linkul de mai jos pentru a te autentifica în Pretoscop. Linkul este valabil 10 minute și poate fi folosit o singură dată.\n\n${url}\n\nDacă nu ai cerut acest email, îl poți ignora.\n\n— ${env.COMPANY_LEGAL_NAME}, ${env.COMPANY_POSTAL_ADDRESS}`,
          });
        },
      }),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof buildAuth>;
const g = globalThis as unknown as { __pretoscopAuth?: Auth };

export function auth(): Auth {
  g.__pretoscopAuth ??= buildAuth();
  return g.__pretoscopAuth;
}

/**
 * The session of this request. Memoized per request (React `cache`): the admin layout and each admin
 * page both check it (a layout check alone does not stop a page segment from rendering).
 */
export const getSession = cache(async () => auth().api.getSession({ headers: await headers() }));

/**
 * Admin gate for /admin pages and actions: a session, role `admin`, and the email still in
 * ADMIN_EMAILS (removing an email from the allowlist revokes access immediately).
 */
export async function requireAdmin(): Promise<{ id: string; email: string; actor: string }> {
  const s = await getSession();
  const env = serverEnv();
  const email = s?.user.email?.toLowerCase();
  const role = (s?.user as { role?: string } | undefined)?.role;
  if (!s || !email || role !== 'admin' || !env.ADMIN_EMAILS.includes(email)) redirect('/admin/autentificare');
  return { id: s.user.id, email, actor: `human:${s.user.id}` };
}
