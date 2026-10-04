#!/bin/bash
# Create a new factor candidate workspace and register it.

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
      echo "Usage: repo-harness run factor-lab-new --name <slug>"
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
if [[ -z "$SLUG" ]]; then
  echo "Unable to derive a valid slug from name: $NAME" >&2
  exit 1
fi

REGISTRY="$REPO_ROOT/tasks/factors/registry.json"
CANDIDATE_DIR="$REPO_ROOT/.claude/.factor-cache/candidates/$SLUG"
HYPOTHESIS_TEMPLATE="$REPO_ROOT/.claude/factor-factory/hypothesis.template.md"

mkdir -p "$CANDIDATE_DIR/raw-backtest"

if [[ ! -f "$REGISTRY" ]]; then
  echo "Missing factor registry: $REGISTRY" >&2
  exit 1
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

if (registry.candidates.some((entry) => entry.slug === slug) ||
    registry.promoted.some((entry) => entry.slug === slug) ||
    registry.rejected.some((entry) => entry.slug === slug)) {
  console.error(`Factor already exists in registry: ${slug}`);
  process.exit(1);
}

registry.candidates.push({
  slug,
  status: "candidate",
  created_at: new Date().toISOString()
});

fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n");
NODE_EOF

if [[ -f "$HYPOTHESIS_TEMPLATE" ]]; then
  sed \
    -e "s/{{FACTOR_ID}}/$SLUG/g" \
    -e "s/{{FACTOR_NAME}}/$NAME/g" \
    "$HYPOTHESIS_TEMPLATE" > "$CANDIDATE_DIR/hypothesis.md"
else
  cat > "$CANDIDATE_DIR/hypothesis.md" <<EOF_HYPOTHESIS
---
factor_id: "$SLUG"
category: "momentum"
confidence: "medium"
data_deps:
  - ohlcv
---

# $NAME Hypothesis
EOF_HYPOTHESIS
fi

echo "[FactorFactory] Created candidate ${SLUG}"
