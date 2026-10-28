#!/usr/bin/env bash
# Records one page as an extractor fixture with the crawler's identity (docs/05 A.5: fixtures are
# real recorded pages with the recording date in the file name; never edit them by hand).
#
#   scripts/record-fixture.sh <shop> <name> <url> [ext] [--purpose listing|product|sitemap|robots]
#   → packages/extractors/fixtures/<shop>/<name>_<YYYY-MM-DD>.<ext> (+ .meta.json)
#
# Since M10 the request goes through @pretoscop/fetch (`pnpm --filter @pretoscop/fetch record`):
# PretoscopBot User-Agent, robots.txt fetched and obeyed, the shop's registry interval (>= 5 s,
# shared with the demo CLI through data/fetch-demo-state.json), block detection (a challenge or a
# 403 writes nothing and exits 2), and shops that are not `active` + `direct` in the registry are
# refused before any request. Keep it to a handful of pages per shop (M03: <= 3; M10: <= 5).
set -euo pipefail
cd "$(dirname "$0")/.."

shop="${1:?shop}"; name="${2:?name}"; url="${3:?url}"; shift 3
args=()
if [[ $# -gt 0 && "$1" != --* ]]; then args+=(--ext "$1"); shift; fi
exec pnpm --silent --filter @pretoscop/fetch record "$shop" "$name" "$url" ${args[@]+"${args[@]}"} "$@"
