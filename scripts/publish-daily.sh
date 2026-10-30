#!/usr/bin/env bash
# Publicarea zilnică pe GitHub Pages, pornită de Task Scheduler (vezi scripts/register-daily-publish.ps1).
# Dacă stack-ul nu e pornit (calculator abia deschis, Docker oprit), nu face nimic: încearcă din nou a doua zi.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$ROOT/logs/publish.log"
mkdir -p "$ROOT/logs"
{
  echo "=== $(date '+%Y-%m-%d %H:%M') ==="
  if ! curl -sf -o /dev/null http://localhost:8000/api/health; then
    echo "API-ul nu răspunde (stack oprit?) — sar peste publicarea de azi."
    exit 0
  fi
  bash "$ROOT/scripts/publish-pages.sh"
} >>"$LOG" 2>&1
# păstrăm doar ultimele ~500 de rânduri de log
tail -n 500 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
