# Runbook: backups and restore

Price history is the asset (`docs/03-architecture.md` §3). Two independent backups exist (ADR-018):

| Backup | What | Where | Kept | Tested |
|---|---|---|---|---|
| Physical (pgBackRest sidecar) | full on Sundays, differential every night at 02:30, **every WAL segment within 5 minutes** (`archive_timeout`) | R2 bucket `pretoscop-backups`, encrypted client-side (AES-256) | 2 full cycles ≈ 14 days of point-in-time recovery | Sundays: latest backup + all WAL restored into a scratch directory, row counts compared with live (`RESTORE_TEST_HEARTBEAT_URL`) |
| Logical (worker `backup.nightly`) | `pg_dump --format=custom` at 00:30 | blob store `backups/pg/YYYY-MM-DD/` (R2 bucket of the app) | 14 days | Sundays 05:00: restored into the scratch database `pretoscop_restore_test`, counted, dropped |

Recovery point: at most 5 minutes of writes (one WAL segment). Recovery time: about 10 minutes per
10 GB from R2 plus WAL replay.

**The encryption passphrase** (`PGBACKREST_REPO1_CIPHER_PASS` in `.env.backup`) must also be in both
founders' password managers. Without it the physical backups are unreadable.

## Check the backups (2 minutes, monthly)

```bash
cd /srv/pretoscop/prod
C="docker compose -p pretoscop-prod -f infra/docker-compose.prod.yml --env-file .env"
$C exec pgbackrest pgbackrest info          # backups, WAL range, sizes
$C logs --tail 50 pgbackrest                # last backup and restore test results
$C exec worker node --import tsx src/cli/backup.ts --restore-test   # logical dump round-trip now
```

## A table or rows were deleted or corrupted (point-in-time restore)

1. Note the time just **before** the accident, in UTC (`docker compose ... logs` timestamps are UTC).
   If only a few rows matter and the site can keep running, prefer the scratch route (step 5).
2. Freeze crawling (`/admin/flaguri` → `crawl.enabled` off) so nothing new competes with the restore.
3. Restore in place (stops web and worker, restores, replays WAL to the target, promotes, takes a new
   full backup, starts everything):
   ```bash
   infra/scripts/restore-pitr.sh prod --target "2026-11-02 09:55:00+00"   # asks to type "prod"
   ```
   Everything written after the target is gone, including legitimate observations. Restart crawling.
4. Record what happened and the target used in `docs/progress.md` (decisions log).
5. Scratch route (no downtime): restore a copy at the target time inside the sidecar, copy the rows
   back, drop the copy. Needs free disk about the size of the database.
   ```bash
   $C exec pgbackrest pgbackrest-sidecar restore-scratch "2026-11-02 09:55:00+00"
   $C exec -T pgbackrest pg_dump -h /tmp/pgbackrest-scratch.sock -p 5498 -U pretoscop -d pretoscop \
     --data-only -t <table> > rows.sql          # look at it; filter to the rows you need
   $C exec -T postgres psql -U pretoscop -d pretoscop -v ON_ERROR_STOP=1 < rows.sql
   $C exec pgbackrest pgbackrest-sidecar scratch-stop
   ```

## The server is lost (disaster recovery)

1. New server: `infra/runbooks/server-setup.md` §1–§3 (same `.env` and `.env.backup` from the
   password manager; the passphrase is the critical part).
2. Start only the database with an empty volume, then stop it:
   `$C up -d --wait postgres && $C stop postgres`.
3. `infra/scripts/restore-pitr.sh prod --yes` (latest: replays every archived WAL segment).
4. `infra/scripts/deploy.sh prod <last tag from GitHub releases>`; update the DNS A records in
   Cloudflare to the new IP (proxied, so visitors see no change) and the PTR of the crawler IP.
5. If the physical backups are unusable: the newest `backups/pg/*/pretoscop_*.dump` in R2 →
   `pg_restore --clean --if-exists --no-owner -d pretoscop` (loses up to a day).

## Alerts that point here

- `Nightly backup failed` / `NightlyDumpMissing`: `$C logs worker | grep -i backup`; usually R2
  credentials or disk. Run `$C exec worker node --import tsx src/cli/backup.ts` to retry.
- `pgBackRest … backup failed` / heartbeat missing: `$C logs pgbackrest`; `$C exec pgbackrest pgbackrest-sidecar check`.
- `WAL archiving is failing` / `WalArchivingFailing`: archive-push errors are in `$C logs postgres`.
  While it fails, WAL accumulates in `pg_wal` (watch disk). Fix the repository (credentials, R2
  outage), then `pgbackrest-sidecar check`. If the disk is about to fill and R2 stays down for
  hours: `PG_ARCHIVE_MODE=off` + deploy (PITR is lost until the next full backup; take one).
- `restore test FAILED`: the backups may be unusable. Treat as critical: run
  `$C exec pgbackrest pgbackrest-sidecar restore-test` again and read its log; take a fresh full
  backup (`pgbackrest-sidecar backup full`).
