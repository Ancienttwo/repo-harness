#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PACKAGE_NAME="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.name)')"
PACKAGE_VERSION="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.version)')"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PACK_JSON="$TMP_DIR/pack.json"
npm pack --json --pack-destination "$TMP_DIR" >"$PACK_JSON"
TARBALL="$(bun - "$PACK_JSON" <<'JS_EOF'
const [, , path] = process.argv;
const pack = await Bun.file(path).json();
const entry = Array.isArray(pack) ? pack[0] : pack;
console.log(entry.filename);
JS_EOF
)"
TARBALL_PATH="$TMP_DIR/$TARBALL"
APP_DIR="$TMP_DIR/app"
TARGET_REPO="$TMP_DIR/target-repo"

mkdir -p "$APP_DIR" "$TARGET_REPO"
git -C "$TARGET_REPO" init -q

cd "$APP_DIR"
bun init -y >/dev/null
bun add "$TARBALL_PATH" >/dev/null

CLI="$APP_DIR/node_modules/.bin/repo-harness"
HOOK="$APP_DIR/node_modules/.bin/repo-harness-hook"

VERSION="$("$CLI" --version)"
if [[ "$VERSION" != "$PACKAGE_VERSION" ]]; then
  echo "[tarball-smoke] ERROR: repo-harness --version returned $VERSION, expected $PACKAGE_VERSION" >&2
  exit 1
fi

(cd "$TARGET_REPO" && "$CLI" status --json >/dev/null)
"$CLI" adopt --repo "$TARGET_REPO" --dry-run --json >"$TMP_DIR/adopt-plan.json"
bun - "$TMP_DIR/adopt-plan.json" <<'JS_EOF'
const [, , path] = process.argv;
const plan = await Bun.file(path).json();
if (plan.protocol !== 1 || plan.command !== "adopt" || plan.apply !== false) {
  console.error("[tarball-smoke] ERROR: packaged adopt dry-run did not return protocol v1 plan JSON");
  process.exit(1);
}
JS_EOF

if ! "$CLI" run check-task-workflow --help >/dev/null; then
  echo "[tarball-smoke] ERROR: packaged 'repo-harness run check-task-workflow --help' failed (run dispatcher / helper lookup / bin startup broken)" >&2
  exit 1
fi
printf '{"prompt":"review release readiness"}\n' | "$HOOK" prompt-guard-decide >/dev/null

echo "[tarball-smoke] OK: ${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz installs and packaged CLI bins start."
