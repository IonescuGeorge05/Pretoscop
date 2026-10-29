#!/usr/bin/env bash
# Restaurează baza de date dintr-un backup făcut de serviciul `backup` din docker-compose.
#   bash scripts/restore-db.sh backups/pretoscop-20261030-1200.sql.gz            # înlocuiește baza `pretoscop`
#   bash scripts/restore-db.sh backups/pretoscop-20261030-1200.sql.gz test_db    # într-o bază separată (verificare)
# Oprește api și worker înainte de a înlocui baza principală, ca să nu scrie în ea în timpul restaurării.
set -euo pipefail

file="${1:?folosire: restore-db.sh <backup.sql.gz> [baza_tinta]}"
target="${2:-pretoscop}"
user="${POSTGRES_USER:-pretoscop}"
[ -f "$file" ] || { echo "nu găsesc $file"; exit 1; }

if [ "$target" = "pretoscop" ]; then
  read -r -p "Înlocuiesc baza principală „pretoscop” cu $file? Scrie DA: " ok
  [ "$ok" = "DA" ] || { echo "anulat"; exit 1; }
  docker compose stop api worker
fi

docker compose exec -T db dropdb -U "$user" --if-exists "$target"
docker compose exec -T db createdb -U "$user" "$target"
gunzip -c "$file" | docker compose exec -T db psql -q -U "$user" -d "$target" -v ON_ERROR_STOP=1 >/dev/null
echo "restaurat în $target: $(docker compose exec -T db psql -At -U "$user" -d "$target" -c 'select count(*) from price_points') puncte de preț"

[ "$target" = "pretoscop" ] && docker compose start api worker
exit 0
