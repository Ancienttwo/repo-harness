#!/usr/bin/env bash
set -euo pipefail

# Mode: default = full release gate (adds the check-ci.sh release lane).
# `--prepublish` = fast checks only, backing package.json's prepublishOnly hook.
# CI owns the full suite. The release lane runs the package/install smoke and
# the expensive cases that no hosted lane runs. One script owns both paths so
# the gate logic never forks.
MODE="full"
if [[ "${1:-}" == "--prepublish" ]]; then
  MODE="prepublish"
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PACKAGE_NAME="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.name)')"
PACKAGE_VERSION="$(bun -e 'const pkg = await Bun.file("package.json").json(); console.log(pkg.version)')"
NPM_RELEASE_REGISTRY="${NPM_RELEASE_REGISTRY:-https://registry.npmjs.org/}"
LOOKUP_STDERR="$(mktemp)"
trap 'rm -f "$LOOKUP_STDERR"' EXIT

echo "[release] package: ${PACKAGE_NAME}@${PACKAGE_VERSION}"
echo "[release] registry: ${NPM_RELEASE_REGISTRY}"
bun run check:helpers
if npm view "${PACKAGE_NAME}@${PACKAGE_VERSION}" version --json --registry "$NPM_RELEASE_REGISTRY" >/dev/null 2>"$LOOKUP_STDERR"; then
  echo "[release] ERROR: ${PACKAGE_NAME}@${PACKAGE_VERSION} already exists on npm." >&2
  echo "[release] Bump package.json, CLI version, status version, and tests before publishing." >&2
  exit 1
fi

if ! grep -Eq 'E404|404 Not Found|No match found|not in this registry' "$LOOKUP_STDERR"; then
  echo "[release] ERROR: unable to prove ${PACKAGE_NAME}@${PACKAGE_VERSION} is unpublished." >&2
  cat "$LOOKUP_STDERR" >&2
  exit 1
fi

if [[ "$MODE" == "prepublish" ]]; then
  echo "[release] OK: prepublish fast gate passed (check:release runs the release lane; CI owns the full suite)."
  exit 0
fi

bash scripts/check-ci.sh release

echo "[release] OK: npm package gate passed."
