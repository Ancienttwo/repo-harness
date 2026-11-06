#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PACKAGE_NAME="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.name)')"
PACKAGE_VERSION="${1:-$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.version)')}"
CONSOLE_NAME="$(bun -e 'import { OPERATOR_WEB_PACKAGE_NAME } from "./src/core/skill-surface/plugin-manifest.ts"; console.log(OPERATOR_WEB_PACKAGE_NAME)')"
NPM_RELEASE_REGISTRY="${NPM_RELEASE_REGISTRY:-https://registry.npmjs.org/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[release-published] package: ${PACKAGE_NAME}@${PACKAGE_VERSION}"
echo "[release-published] registry: ${NPM_RELEASE_REGISTRY}"

check_package() {
local name="$1"
local view_json="$TMP_DIR/${name}-view.json"
local tags_json="$TMP_DIR/${name}-tags.json"
local pack_json="$TMP_DIR/${name}-pack.json"
echo "[release-published] checking ${name}@${PACKAGE_VERSION}"
npm view "${name}@${PACKAGE_VERSION}" version dist.integrity dist.shasum dist.tarball --json --registry "$NPM_RELEASE_REGISTRY" >"$view_json" || { echo "[release-published] ERROR: ${name}@${PACKAGE_VERSION}: npm version lookup failed." >&2; return 1; }
npm view "$name" dist-tags --json --registry "$NPM_RELEASE_REGISTRY" >"$tags_json" || { echo "[release-published] ERROR: ${name}@${PACKAGE_VERSION}: npm dist-tag lookup failed." >&2; return 1; }
npm pack "${name}@${PACKAGE_VERSION}" --json --pack-destination "$TMP_DIR" --registry "$NPM_RELEASE_REGISTRY" >"$pack_json" || { echo "[release-published] ERROR: ${name}@${PACKAGE_VERSION}: npm pack failed." >&2; return 1; }

bun - "$name" "$PACKAGE_VERSION" "$view_json" "$tags_json" "$pack_json" <<'JS_EOF' || { echo "[release-published] ERROR: ${name}@${PACKAGE_VERSION}: registry verification failed." >&2; return 1; }
const [, , packageName, version, viewPath, tagsPath, packPath] = process.argv;
const view = await Bun.file(viewPath).json();
const tags = await Bun.file(tagsPath).json();
const pack = await Bun.file(packPath).json();
const packed = Array.isArray(pack) ? pack[0] : pack;

function fail(message) {
  console.error(`[release-published] ERROR: ${packageName}@${version}: ${message}`);
  process.exit(1);
}

if (view.version !== version) fail(`npm view returned version ${view.version}`);
if (tags.latest !== version) fail(`latest dist-tag is ${tags.latest}, expected ${version}`);
if (!view["dist.integrity"] || !view["dist.shasum"] || !view["dist.tarball"]) {
  fail("npm view response is missing dist integrity, shasum, or tarball");
}
if (!packed?.filename?.startsWith(`${packageName}-${version}`)) {
  fail(`npm pack returned unexpected filename ${packed?.filename}`);
}
if (packed.integrity !== view["dist.integrity"]) fail("packed tarball integrity does not match registry metadata");
if (packed.shasum !== view["dist.shasum"]) fail("packed tarball shasum does not match registry metadata");
JS_EOF
}

check_package "$CONSOLE_NAME"
check_package "$PACKAGE_NAME"
VIEW_JSON="$TMP_DIR/${PACKAGE_NAME}-view.json"
PACK_JSON="$TMP_DIR/${PACKAGE_NAME}-pack.json"

# Published-package runtime evidence is intentionally separate from a task
# AcceptanceReceipt. This clean install is the release-side oracle: registry
# metadata binds the tarball, then the installed CLI and installed hook must
# both read back their real runtime contracts.
PACKED_TARBALL="$(bun - "$PACK_JSON" <<'JS_EOF'
const [, , path] = process.argv;
const packed = (await Bun.file(path).json());
const entry = Array.isArray(packed) ? packed[0] : packed;
if (!entry?.filename) process.exit(1);
console.log(entry.filename);
JS_EOF
)"
RUNTIME_APP="$TMP_DIR/runtime-app"
RUNTIME_REPO="$TMP_DIR/runtime-repo"
mkdir -p "$RUNTIME_APP" "$RUNTIME_REPO"
git -C "$RUNTIME_REPO" init -q -b main
(cd "$RUNTIME_APP" && npm init -y >/dev/null && npm install "$TMP_DIR/$PACKED_TARBALL" >/dev/null) || {
  echo "[release-published] ERROR: ${PACKAGE_NAME}@${PACKAGE_VERSION}: npm runtime install failed." >&2
  exit 1
}
bun scripts/runtime-evidence-receipt.ts verify \
  --registry "$VIEW_JSON" \
  --tarball "$TMP_DIR/$PACKED_TARBALL" \
  --installed-package "$RUNTIME_APP/node_modules/$PACKAGE_NAME" \
  --installed-cli "$RUNTIME_APP/node_modules/.bin/repo-harness" \
  --installed-hook "$RUNTIME_APP/node_modules/.bin/repo-harness-hook" \
  --hook-repo "$RUNTIME_REPO"

git rev-parse -q --verify "refs/tags/v${PACKAGE_VERSION}" >/dev/null
bun scripts/check-skill-version.ts --project . >/dev/null

echo "[release-published] OK: registry, dist-tag, tarball, tag, and local version files agree."
