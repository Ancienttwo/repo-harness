#!/bin/bash
# Promote a factor candidate into the committed registry.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  REPO_ROOT="$(cd "$REPO_HARNESS_TARGET_REPO_ROOT" && pwd)"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="${2:-}"; shift 2 ;;
    --help)
      echo "Usage: repo-harness run factor-lab-promote --name <slug>"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$NAME" ]]; then
  echo "--name is required" >&2
  exit 1
fi

SLUG="$(printf '%s' "$NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
REGISTRY="$REPO_ROOT/tasks/factors/registry.json"
CANDIDATE_DIR="$REPO_ROOT/.claude/.factor-cache/candidates/$SLUG"
PROMOTED_DIR="$REPO_ROOT/tasks/factors/promoted/$SLUG"

if [[ ! -f "$CANDIDATE_DIR/hypothesis.md" ]]; then
  echo "Missing candidate hypothesis: $CANDIDATE_DIR/hypothesis.md" >&2
  exit 1
fi

if [[ ! -f "$CANDIDATE_DIR/backtest-summary.md" ]]; then
  echo "Missing candidate backtest summary: $CANDIDATE_DIR/backtest-summary.md" >&2
  exit 1
fi

mkdir -p "$PROMOTED_DIR/backtest-data"
cp "$CANDIDATE_DIR/hypothesis.md" "$PROMOTED_DIR/hypothesis.md"
cp "$CANDIDATE_DIR/backtest-summary.md" "$PROMOTED_DIR/backtest-summary.md"

if [[ -d "$CANDIDATE_DIR/raw-backtest" ]]; then
  cp -R "$CANDIDATE_DIR/raw-backtest"/. "$PROMOTED_DIR/backtest-data/"
fi

JS_RUNTIME=""
if command -v node >/dev/null 2>&1; then JS_RUNTIME=node
elif command -v bun >/dev/null 2>&1; then JS_RUNTIME=bun
else echo "No JavaScript runtime (node or bun) found" >&2; exit 1; fi

$JS_RUNTIME - "$REGISTRY" "$SLUG" <<'NODE_EOF'
const fs = require("fs");
const [,, registryPath, slug] = process.argv;
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

registry.candidates ??= [];
registry.promoted ??= [];
registry.rejected ??= [];

const idx = registry.candidates.findIndex((entry) => entry.slug === slug);
if (idx === -1) {
  console.error(`Candidate not found in registry: ${slug}`);
  process.exit(1);
}

const candidate = registry.candidates[idx];
registry.candidates.splice(idx, 1);
registry.promoted.push({
  slug,
  promoted_at: new Date().toISOString(),
  source: candidate
});

fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
NODE_EOF

rm -rf "$CANDIDATE_DIR"

echo "[FactorFactory] Promoted factor ${SLUG}"
