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
CONSOLE_NAME="$(bun -e 'const pkg = await Bun.file("packages/operator-web/package.json").json(); console.log(pkg.name)')"
CONSOLE_VERSION="$(bun -e 'const pkg = await Bun.file("packages/operator-web/package.json").json(); console.log(pkg.version)')"
EXPECTED_CONSOLE_NAME="$(bun -e 'import { OPERATOR_WEB_PACKAGE_NAME } from "./src/core/skill-surface/plugin-manifest.ts"; console.log(OPERATOR_WEB_PACKAGE_NAME)')"
if [[ "$CONSOLE_NAME" != "$EXPECTED_CONSOLE_NAME" || "$CONSOLE_VERSION" != "$PACKAGE_VERSION" ]]; then
  echo "[release] ERROR: console manifest must name ${EXPECTED_CONSOLE_NAME} and use version ${PACKAGE_VERSION}." >&2
  exit 1
fi
NPM_RELEASE_REGISTRY="${NPM_RELEASE_REGISTRY:-https://registry.npmjs.org/}"
LOOKUP_STDERR="$(mktemp)"
trap 'rm -f "$LOOKUP_STDERR"' EXIT

echo "[release] package: ${PACKAGE_NAME}@${PACKAGE_VERSION}"
echo "[release] registry: ${NPM_RELEASE_REGISTRY}"
if [[ "$MODE" == "prepublish" && "${npm_package_name:-}" != "$PACKAGE_NAME" && "${npm_package_name:-}" != "$CONSOLE_NAME" ]]; then
  echo "[release] ERROR: npm_package_name must name ${PACKAGE_NAME} or ${CONSOLE_NAME}." >&2
  exit 1
fi

bun run check:helpers
check_unpublished() {
  local name="$1"
  if npm view "${name}@${PACKAGE_VERSION}" version --json --registry "$NPM_RELEASE_REGISTRY" >/dev/null 2>"$LOOKUP_STDERR"; then
  echo "[release] ERROR: ${name}@${PACKAGE_VERSION} already exists on npm." >&2
  echo "[release] Bump package.json, CLI version, status version, and tests before publishing." >&2
  exit 1
fi

if ! grep -Eq 'E404|404 Not Found|No match found|not in this registry' "$LOOKUP_STDERR"; then
  echo "[release] ERROR: unable to prove ${name}@${PACKAGE_VERSION} is unpublished." >&2
  cat "$LOOKUP_STDERR" >&2
  exit 1
fi
}

if [[ "$MODE" == "prepublish" ]]; then
  check_unpublished "$npm_package_name"
  if [[ "$npm_package_name" == "$PACKAGE_NAME" ]]; then
    if ! npm view "${CONSOLE_NAME}@${PACKAGE_VERSION}" version --json --registry "$NPM_RELEASE_REGISTRY" >/dev/null; then
      echo "[release] ERROR: ${CONSOLE_NAME}@${PACKAGE_VERSION} must be published before ${PACKAGE_NAME}." >&2
      exit 1
    fi
  fi
  echo "[release] OK: prepublish fast gate passed (check:release runs the release lane; CI owns the full suite)."
  exit 0
fi

check_unpublished "$PACKAGE_NAME"
check_unpublished "$CONSOLE_NAME"
bash scripts/check-ci.sh release

echo "[release] OK: npm package gate passed."
