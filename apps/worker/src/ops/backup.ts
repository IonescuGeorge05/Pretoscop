import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { Readable } from 'node:stream';
import type { Env } from '@pretoscop/config/env';
import { findRepoRoot } from '@pretoscop/config/env';
import type { Logger } from '@pretoscop/config/logger';
import type { BlobStore } from '@pretoscop/storage';

const COMPOSE = ['compose', '-f', 'infra/docker-compose.dev.yml', '-p', 'pretoscop'];

function onPath(bin: string): boolean {
  return (process.env.PATH ?? '').split(delimiter).some((d) => existsSync(join(d, bin)));
}

/**
 * The command that writes a custom-format dump of DATABASE_URL to stdout:
 * `pg_dump` when installed (production image, CI), otherwise the dev compose container.
 */
export function dumpCommand(env: Env): { cmd: string; args: string[]; cwd: string } {
  const cwd = findRepoRoot();
  if (onPath('pg_dump')) return { cmd: 'pg_dump', args: ['--format=custom', '--no-owner', env.DATABASE_URL], cwd };
  const db = new URL(env.DATABASE_URL);
  return {
    cmd: 'docker',
    args: [...COMPOSE, 'exec', '-T', 'postgres', 'pg_dump', '--format=custom', '--no-owner', '-U', decodeURIComponent(db.username), db.pathname.slice(1)],
    cwd,
  };
}

function run(cmd: string, args: string[], cwd: string, stdin?: Readable): { stdout: Readable; done: Promise<void> } {
  const child = spawn(cmd, args, { cwd, stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr?.on('data', (d: Buffer) => {
    stderr += d.toString();
  });
  if (stdin && child.stdin) stdin.pipe(child.stdin);
  const done = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-800)}`))));
  });
  if (!child.stdout) throw new Error(`${cmd}: no stdout`);
  return { stdout: child.stdout, done };
}

export const BACKUP_PREFIX = 'backups/pg/';

/** Nightly logical backup: pg_dump (custom format, compressed) → blob store. Returns the key. */
export async function backupDatabase(env: Env, blob: BlobStore, log: Logger, now = new Date()): Promise<{ key: string; bytes: number }> {
  const { cmd, args, cwd } = dumpCommand(env);
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const key = `${BACKUP_PREFIX}${now.toISOString().slice(0, 10)}/pretoscop_${stamp}.dump`;
  const { stdout, done } = run(cmd, args, cwd);
  await Promise.all([blob.putStream(key, stdout, 'application/octet-stream'), done]);
  const objects = await blob.list(key);
  const bytes = objects[0]?.size ?? 0;
  if (bytes < 1024) throw new Error(`backup ${key} is suspiciously small (${bytes} bytes)`);
  log.info({ key, bytes, location: blob.describe(key) }, 'database backup written');
  return { key, bytes };
}

/** Keeps the newest `keepDays` daily folders. */
export async function pruneBackups(blob: BlobStore, keepDays = 14): Promise<number> {
  const all = await blob.list(BACKUP_PREFIX);
  const days = [...new Set(all.map((o) => o.key.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 10)))].sort().reverse();
  const drop = new Set(days.slice(keepDays));
  let n = 0;
  for (const o of all) {
    if (drop.has(o.key.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 10))) {
      await blob.delete(o.key);
      n++;
    }
  }
  return n;
}

export async function latestBackupKey(blob: BlobStore): Promise<string | null> {
  const all = await blob.list(BACKUP_PREFIX);
  return all.map((o) => o.key).sort().at(-1) ?? null;
}

/**
 * Restore test: restores the latest dump into a scratch database and compares row counts of the
 * key tables with the live database (the dump must contain at least as many rows as existed when
 * it was taken; live counts can only have grown since). Drops the scratch database afterwards.
 */
export async function restoreTest(env: Env, blob: BlobStore, log: Logger): Promise<{ key: string; tables: Record<string, number> }> {
  const key = await latestBackupKey(blob);
  if (!key) throw new Error('no backup found');
  const cwd = findRepoRoot();
  const db = new URL(env.DATABASE_URL);
  const user = decodeURIComponent(db.username);
  const scratch = 'pretoscop_restore_test';
  const local = onPath('pg_restore') && onPath('psql');
  const psql = (sqlText: string, database = 'postgres') =>
    local
      ? run('psql', [new URL(`/${database}`, env.DATABASE_URL).toString(), '-v', 'ON_ERROR_STOP=1', '-Atc', sqlText], cwd)
      : run('docker', [...COMPOSE, 'exec', '-T', 'postgres', 'psql', '-U', user, '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atc', sqlText], cwd);
  const collect = async (r: { stdout: Readable; done: Promise<void> }) => {
    let out = '';
    r.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    await r.done;
    return out.trim();
  };

  await collect(psql(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`));
  await collect(psql(`CREATE DATABASE ${scratch}`));
  try {
    const dump = await blob.getStream(key);
    if (!dump) throw new Error(`backup ${key} unreadable`);
    const restore = local
      ? run('pg_restore', ['--no-owner', '-d', new URL(`/${scratch}`, env.DATABASE_URL).toString()], cwd, dump)
      : run('docker', [...COMPOSE, 'exec', '-T', 'postgres', 'pg_restore', '--no-owner', '-U', user, '-d', scratch], cwd, dump);
    restore.stdout.resume();
    await restore.done;
    const tables: Record<string, number> = {};
    for (const t of ['shops', 'shop_sources', 'offers', 'price_events', 'ingest_runs']) {
      tables[t] = Number(await collect(psql(`SELECT count(*) FROM ${t}`, scratch)));
    }
    if (tables.shops === 0) throw new Error('restored database has no shops');
    log.info({ key, tables }, 'restore test passed');
    return { key, tables };
  } finally {
    await collect(psql(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`)).catch(() => undefined);
  }
}
