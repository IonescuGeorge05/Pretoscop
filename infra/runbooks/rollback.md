# Runbook: roll back a release (quick reference)

Symptom after a deploy: errors in `/admin`, 5xx alerts, a broken page. Roll back first, debug later.

```bash
ssh deploy@<server>
cd /srv/pretoscop/prod                       # or /srv/pretoscop/staging
tail -n 5 .deploy-history                    # what runs now and before
infra/scripts/rollback.sh prod               # back to the previous successful tag
curl -s https://pretoscop.ro/api/health      # "version" shows the tag now serving
```

- Takes 2–4 minutes; web stays up throughout (the replicas switch one at a time).
- From GitHub instead: Actions → **deploy** → Run workflow → environment `production`, tag = the
  previous tag. Same script.
- Migrations stay applied (forward-only). If the bad release ran a migration that the previous code
  cannot live with (it should not; see `deploy.md` → Roll back), restore instead: `restore.md`.
- Afterwards: note the bad tag in `docs/progress.md` (module report or decisions log) and fix forward
  with a new tag; never re-tag.
