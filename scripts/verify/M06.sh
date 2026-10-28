#!/usr/bin/env bash
# M06 — core normalization (GTIN, Romanian text, brands, attributes, pricing). No services needed.
set -euo pipefail
cd "$(dirname "$0")/../.."
. scripts/verify/lib.sh

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

step "toolchain"
node -e 'const [maj,min]=process.versions.node.split(".").map(Number); if (maj<22||(maj===22&&min<12)) {console.error("Node >= 22.12 required, found "+process.version); process.exit(1)}'
pnpm --version >/dev/null || fail "pnpm missing (npm i -g pnpm@10)"
ok "node $(node -v), pnpm $(pnpm -v)"

step "install"
pnpm install --frozen-lockfile >/dev/null
ok "dependencies installed"

step "lint, typecheck, tests (@pretoscop/core)"
pnpm turbo run lint typecheck test --filter=@pretoscop/core --output-logs=errors-only
ok "lint, typecheck and tests pass"

step "purity: only src/hash.ts may import node: modules"
impure="$(grep -l "from 'node:" packages/core/src/*.ts | grep -v -e '\.test\.ts$' -e '/hash\.ts$' || true)"
[[ -z "$impure" ]] || fail "node: imports outside hash.ts: $impure"
grep -q "from './hash'" packages/core/src/index.ts && fail "index.ts must not export hash.ts"
ok "root export is browser-safe; hash lives at @pretoscop/core/hash"

step "title corpus accuracy (synthetic, holdout, real and live-run eMAG titles; >= 95% per field)"
pnpm --filter @pretoscop/core exec vitest run src/corpus.test.ts --silent=false --reporter=verbose >"$tmp/corpus.log" 2>&1 || {
  cat "$tmp/corpus.log"
  fail "corpus accuracy below threshold"
}
grep -E '^(Main|Holdout|Real eMAG|Live eMAG) corpus|^[a-zA-Z]+ +[0-9.]+%$|^overall' "$tmp/corpus.log" | sed 's/^/   /'
ok "corpus accuracy at or above 95% on every field"

step "demo: PS5 bundle title"
pnpm --silent --filter @pretoscop/core demo "Consola PlayStation 5 Slim Digital Edition, 1TB + joc EA FC 26" | tee "$tmp/demo.log"
grep -q '^brand        Sony' "$tmp/demo.log" || fail "demo: brand is not Sony"
grep -q 'storage: 1TB' "$tmp/demo.log" || fail "demo: storage is not 1TB"
grep -q 'edition: Slim Digital' "$tmp/demo.log" || fail "demo: edition is not Slim Digital"
grep -q '^isBundle     true' "$tmp/demo.log" || fail "demo: not detected as a bundle"
grep -q '^condition    new' "$tmp/demo.log" || fail "demo: condition is not new"
ok "demo prints brand Sony, {storage: 1TB, edition: Slim Digital}, isBundle true"

step "demo: live eMAG run (device not an accessory, built-in games not a bundle, emulated platform not the brand)"
pnpm --silent --filter @pretoscop/core demo "Apple MacBook Air 13'' cu procesor Apple M5, 16GB RAM, 512GB SSD, Midnight, Fara incarcator" \
  --category "Laptop, Tablete & Telefoane > Laptopuri si accesorii > Laptop > Notebook" | tee "$tmp/macbook.log"
grep -q '^kind         laptop' "$tmp/macbook.log" || fail "demo: MacBook is not a laptop"
grep -q '^isAccessory  false' "$tmp/macbook.log" || fail "demo: MacBook flagged as an accessory"
pnpm --silent --filter @pretoscop/core demo "Consola retro portabila R36S 64GB cu jocuri, 15000 jocuri, Emulator N64 PSP PS1 PlayStation Sega, Alb" \
  --category "Gaming, Carti & Birotica > Console, Jocuri & Accesorii > Console Hardware" | tee "$tmp/r36s.log"
grep -q '^isBundle     false' "$tmp/r36s.log" || fail "demo: built-in games read as a bundle"
grep -q '^brand        –' "$tmp/r36s.log" || fail "demo: an emulated platform read as the brand"
ok "MacBook is a laptop, not an accessory; R36S has no bundle and no brand"

step "GTIN check"
pnpm --silent --filter @pretoscop/core gtin 0711719577034 | tee "$tmp/gtin.log"
grep -q 'quality=valid  gtin14=00711719577034' "$tmp/gtin.log" || fail "gtin: 0711719577034 not valid"
ok "0711719577034 is a valid GTIN (GTIN-14 00711719577034)"

echo
echo "OK"
