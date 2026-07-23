#!/usr/bin/env bash
# SSD-07 phase A (D2 coverage map): closes the "packed-tarball
# disposable-BUN_INSTALL install smoke across profiles" cell flagged in
# evals/skill-routing/retirement-matrix-coverage.md as the one dimension
# genuinely not exercised anywhere else. Standalone evidence probe, not wired
# into any required repo gate: scripts/check-tarball-install-smoke.sh is the
# architecturally-correct home for this (it already does npm pack + disposable
# install smoke) but sits outside this contract's allowed_paths, so folding
# this probe into it is left as an explicit follow-up for the orchestrator
# (see the coverage map's "Explicitly deferred" section) rather than an
# out-of-scope edit made here.
#
# Deliberately narrower than the full profile x host x projection x lifecycle
# x ownership x failure matrix: that logic already runs, against the same
# manifest.json / catalog.ts / skill-surface-select.ts bytes (tree-hash-bound,
# see evals/skill-routing/final-subject-freeze.json), at the dev-tree level in
# tests/installed-copy-sync.test.ts and tests/install-profiles.test.ts. This
# probe verifies only the one risk that is unique to *packaging*:
#   1. the packed CLI's `install --profile <X>` subcommand accepts and
#      produces a well-formed dry-run plan for all four profile literals when
#      invoked from an installed npm tarball, not the dev source tree;
#   2. package.json's "files" allowlist still ships the skill-surface
#      discovery path's own source files (a static, cheap, high-value check
#      guarding against a future narrowing of that allowlist).
# It deliberately does NOT perform a real (mutating) install + `update` +
# facade-directory diff for product-planning/strict: those profiles gate
# Waza/mermaid installation on externalSkills=true, which calls real `bunx
# skills add` over the network -- unsuitable for a probe meant to run
# offline. That real-install path is exercised, with bunx faked via a PATH
# override (never touching the network), at the dev-tree level in
# tests/install-profiles.test.ts ("failed install compensates earlier host
# writes and never commits state").
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

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
mkdir -p "$APP_DIR"

# Packaging fidelity: the skill-surface discovery path's own source files
# must survive npm packing. package.json ships assets/, scripts/, and src/
# wholesale today, so this currently passes trivially -- it exists to catch a
# *future* narrowing of the "files" allowlist that silently breaks profile
# discovery in a real install, the same defense-in-depth pattern
# scripts/check-tarball-install-smoke.sh already uses for its own
# hook-runtime required-files list.
bun - "$PACK_JSON" <<'JS_EOF'
const [, , path] = process.argv;
const pack = await Bun.file(path).json();
const entry = Array.isArray(pack) ? pack[0] : pack;
const files = new Set((entry.files ?? []).map((file) => file.path));
const required = [
  "assets/skill-commands/manifest.json",
  "src/core/skill-surface/catalog.ts",
  "scripts/skill-surface-select.ts",
];
const missing = required.filter((file) => !files.has(file));
if (missing.length > 0) {
  console.error(`[packed-profile-discovery] ERROR: packed tarball is missing skill-surface discovery file(s): ${missing.join(", ")}`);
  process.exit(1);
}
console.log("[packed-profile-discovery] OK: packed tarball ships manifest.json, catalog.ts, and skill-surface-select.ts");
JS_EOF

cd "$APP_DIR"
bun init -y >/dev/null
bun add "$TARBALL_PATH" >/dev/null
CLI="$APP_DIR/node_modules/.bin/repo-harness"

# Cheap, safe, network-free smoke: the packed CLI must accept every target
# profile literal and return a well-formed, non-empty dry-run install plan,
# with no real host mutation. Each profile gets its own disposable
# HOME/BUN_INSTALL root.
for profile in minimal standard product-planning strict; do
  PROFILE_HOME="$TMP_DIR/home-$profile"
  mkdir -p "$PROFILE_HOME"
  DRYRUN_JSON="$TMP_DIR/dry-run-$profile.json"
  HOME="$PROFILE_HOME" BUN_INSTALL="$PROFILE_HOME/.bun" "$CLI" install --profile "$profile" --dry-run --json >"$DRYRUN_JSON"
  bun - "$DRYRUN_JSON" "$profile" <<'JS_EOF'
const [, , path, profile] = process.argv;
const plan = await Bun.file(path).json();
if (
  plan.requested_profile !== profile ||
  plan.current_profile !== null ||
  !Array.isArray(plan.install) ||
  plan.install.length === 0 ||
  !Array.isArray(plan.remove) ||
  plan.remove.length !== 0
) {
  console.error(`[packed-profile-discovery] ERROR: packed CLI dry-run plan for profile ${profile} is malformed: ${JSON.stringify(plan)}`);
  process.exit(1);
}
JS_EOF
  INSTALL_LIST="$(bun -e "const p = await Bun.file(process.argv[1]).json(); console.log(p.install.join(','))" "$DRYRUN_JSON")"
  echo "[packed-profile-discovery] OK: packed CLI accepts profile '${profile}' and returns a well-formed dry-run plan (install=${INSTALL_LIST})"
  # A real HOME must never be mutated by --dry-run.
  if [[ -e "$PROFILE_HOME/.repo-harness/install-state.json" ]]; then
    echo "[packed-profile-discovery] ERROR: --dry-run wrote install-state.json for profile ${profile}" >&2
    exit 1
  fi
done

echo "[packed-profile-discovery] OK: ${TARBALL} accepts all four profile literals from a disposable BUN_INSTALL root with zero host mutation."
