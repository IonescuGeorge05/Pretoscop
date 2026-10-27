import 'server-only';
import { PgBoss } from 'pg-boss';
import { serverEnv } from './db';

// Producer-only pg-boss client: the web app queues jobs, the worker runs them.
const g = globalThis as unknown as { __pretoscopBoss?: Promise<PgBoss> };

export function boss(): Promise<PgBoss> {
  g.__pretoscopBoss ??= (async () => {
    const b = new PgBoss({
      connectionString: serverEnv().DATABASE_URL,
      schema: 'pgboss',
      application_name: 'pretoscop-web',
      max: 2,
      supervise: false,
      schedule: false,
      migrate: false,
    });
    b.on('error', () => undefined);
    await b.start();
    return b;
  })();
  return g.__pretoscopBoss;
}
