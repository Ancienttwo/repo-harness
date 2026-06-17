#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PACKAGE_NAME="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.name)')"
PACKAGE_VERSION="${1:-$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.version)')}"
NPM_RELEASE_REGISTRY="${NPM_RELEASE_REGISTRY:-https://registry.npmjs.org/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[release-published] package: ${PACKAGE_NAME}@${PACKAGE_VERSION}"
echo "[release-published] registry: ${NPM_RELEASE_REGISTRY}"

VIEW_JSON="$TMP_DIR/npm-view.json"
TAGS_JSON="$TMP_DIR/npm-tags.json"
PACK_JSON="$TMP_DIR/npm-pack.json"

npm view "${PACKAGE_NAME}@${PACKAGE_VERSION}" version dist.integrity dist.shasum dist.tarball --json --registry "$NPM_RELEASE_REGISTRY" >"$VIEW_JSON"
npm view "$PACKAGE_NAME" dist-tags --json --registry "$NPM_RELEASE_REGISTRY" >"$TAGS_JSON"
npm pack "${PACKAGE_NAME}@${PACKAGE_VERSION}" --json --pack-destination "$TMP_DIR" --registry "$NPM_RELEASE_REGISTRY" >"$PACK_JSON"

bun - "$PACKAGE_NAME" "$PACKAGE_VERSION" "$VIEW_JSON" "$TAGS_JSON" "$PACK_JSON" <<'JS_EOF'
const [, , packageName, version, viewPath, tagsPath, packPath] = process.argv;
const view = await Bun.file(viewPath).json();
const tags = await Bun.file(tagsPath).json();
const pack = await Bun.file(packPath).json();
const packed = Array.isArray(pack) ? pack[0] : pack;

function fail(message) {
  console.error(`[release-published] ERROR: ${message}`);
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

git rev-parse -q --verify "refs/tags/v${PACKAGE_VERSION}" >/dev/null
bun scripts/check-skill-version.ts --project . >/dev/null

echo "[release-published] OK: registry, dist-tag, tarball, tag, and local version files agree."
