#!/usr/bin/env bash
# Runs scripts/verify/MXX.sh and prints the module's founder checklist.
# Usage: make verify M=05   (also accepts 5, 05B, 5b)
set -euo pipefail

cd "$(dirname "$0")/../.."

raw="${1:-}"
if [[ -z "$raw" ]]; then
  echo "usage: make verify M=05" >&2
  exit 2
fi

num="${raw//[^0-9]/}"
suffix="$(printf '%s' "${raw//[0-9]/}" | tr '[:lower:]' '[:upper:]')"
id="$(printf '%02d' "$((10#$num))")${suffix}"

script="scripts/verify/M${id}.sh"
checklist="scripts/verify/M${id}.checklist.md"

if [[ ! -f "$script" ]]; then
  echo "No verify script for M${id} (${script})" >&2
  exit 2
fi

echo "== make verify M=${id}"
bash "$script"

echo
echo "== Founder checklist (M${id})"
if [[ -f "$checklist" ]]; then
  cat "$checklist"
else
  echo "(no checklist file)"
fi
