#!/usr/bin/env bash
# Publică pe GitHub Pages o copie statică a site-ului, cu datele reale din baza locală.
#
#   bash scripts/publish-pages.sh          # date reale (implicit)
#   SOURCE=mock bash scripts/publish-pages.sh
#
# Cerințe: stack-ul pornit (docker compose up -d), Node/npm local, git cu drept de push pe origin.
# Rezultatul ajunge pe branch-ul `gh-pages`; în GitHub: Settings -> Pages -> Deploy from a branch -> gh-pages / root.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${SOURCE:-real}"
REPO_NAME="${REPO_NAME:-$(basename -s .git "$(git -C "$ROOT" remote get-url origin)")}"
PAGES_DIR="$ROOT/../.pretoscop-gh-pages"
API_ROUTE="$ROOT/frontend/app/api"
API_ROUTE_PARKED="$ROOT/frontend/.api-route-parked"

echo "==> 1/4 export date ($SOURCE) din API"
docker compose -f "$ROOT/docker-compose.yml" exec -T api sh -c "rm -rf /tmp/snapshot && python -m app.services.snapshot --out /tmp/snapshot --source $SOURCE"
rm -rf "$ROOT/frontend/public/data"
mkdir -p "$ROOT/frontend/public"
docker compose -f "$ROOT/docker-compose.yml" cp api:/tmp/snapshot "$ROOT/frontend/public/data" >/dev/null

echo "==> 2/4 build static (basePath /$REPO_NAME)"
# proxy-ul /api nu are sens fără server și blochează `output: export`: îl scoatem pe durata build-ului
mv "$API_ROUTE" "$API_ROUTE_PARKED"
trap 'mv "$API_ROUTE_PARKED" "$API_ROUTE" 2>/dev/null || true' EXIT
(cd "$ROOT/frontend" && rm -rf out .next && STATIC_EXPORT=1 BASE_PATH="$REPO_NAME" npm run build >/dev/null)
mv "$API_ROUTE_PARKED" "$API_ROUTE"
trap - EXIT
touch "$ROOT/frontend/out/.nojekyll"  # GitHub Pages: servește și folderele care încep cu _ (ex. _next)

echo "==> 3/4 pregătire branch gh-pages"
git -C "$ROOT" fetch -q origin gh-pages 2>/dev/null || true
if [ ! -d "$PAGES_DIR/.git" ] && [ ! -f "$PAGES_DIR/.git" ]; then
  rm -rf "$PAGES_DIR"
  if git -C "$ROOT" show-ref -q --verify refs/remotes/origin/gh-pages; then
    git -C "$ROOT" worktree add -q -B gh-pages "$PAGES_DIR" origin/gh-pages
  else
    git -C "$ROOT" worktree add -q --detach "$PAGES_DIR"
    git -C "$PAGES_DIR" checkout -q --orphan gh-pages
  fi
fi
git -C "$PAGES_DIR" rm -rq --ignore-unmatch . >/dev/null 2>&1 || true
find "$PAGES_DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r "$ROOT/frontend/out/." "$PAGES_DIR/"

echo "==> 4/4 publicare"
git -C "$PAGES_DIR" add -A
if git -C "$PAGES_DIR" diff --cached --quiet; then
  echo "Nicio schimbare de publicat."
else
  git -C "$PAGES_DIR" commit -qm "Actualizare date $(date +%Y-%m-%d\ %H:%M)"
  git -C "$PAGES_DIR" push -q origin gh-pages
  echo "Publicat. Site: https://$(git -C "$ROOT" remote get-url origin | sed -E 's#.*github.com[:/]([^/]+)/.*#\1#' | tr 'A-Z' 'a-z').github.io/$REPO_NAME/"
fi
