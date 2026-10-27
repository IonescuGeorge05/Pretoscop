#!/usr/bin/env bash
# Records one page as an extractor fixture with the crawler's identity (docs/05 A.5: fixtures are
# real recorded pages with the recording date in the file name; never edit them by hand).
#
#   scripts/record-fixture.sh <shop> <name> <url> [ext]
#   → packages/extractors/fixtures/<shop>/<name>_<YYYY-MM-DD>.<ext> (+ .meta.json)
#
# Politeness: at most one request per host every 5 s (enforced with a timestamp file per host);
# check robots.txt yourself first (the recorder is for a handful of pages per shop, ≤3 per M03).
set -euo pipefail
cd "$(dirname "$0")/.."

shop="${1:?shop}"; name="${2:?name}"; url="${3:?url}"; ext="${4:-html}"
UA="Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)"
host="$(printf '%s' "$url" | sed -E 's#^https?://([^/]+).*#\1#')"
day="$(date -u +%Y-%m-%d)"
dir="packages/extractors/fixtures/${shop}"
out="${dir}/${name}_${day}.${ext}"
mkdir -p "$dir" data/fixture-recorder

stamp="data/fixture-recorder/${host}.last"
if [[ -f "$stamp" ]]; then
  last="$(cat "$stamp")"; now="$(date +%s)"; wait=$((last + 5 - now))
  if ((wait > 0)); then echo "waiting ${wait}s for ${host}"; sleep "$wait"; fi
fi
date +%s >"$stamp"

hdrs="$(mktemp)"
status="$(curl -sS --compressed -L --max-redirs 3 --max-time 60 \
  -A "$UA" -H 'Accept-Language: ro-RO,ro;q=0.9,en;q=0.6' \
  -D "$hdrs" -o "$out" -w '%{http_code}' "$url")"
python3 - "$out" "$url" "$status" "$hdrs" <<'PY'
import json, sys, datetime
out, url, status, hdrs = sys.argv[1:5]
headers = {}
for line in open(hdrs, encoding='latin-1'):
    if ':' in line:
        k, v = line.split(':', 1)
        headers[k.strip().lower()] = v.strip()
meta = {
    'url': url,
    'status': int(status),
    'recorded_at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
    'user_agent': 'Mozilla/5.0 (compatible; PretoscopBot/1.0; +https://pretoscop.ro/bot)',
    'content_type': headers.get('content-type'),
    'bytes': len(open(out, 'rb').read()),
}
json.dump(meta, open(out + '.meta.json', 'w'), indent=2)
print(json.dumps(meta))
PY
rm -f "$hdrs"
