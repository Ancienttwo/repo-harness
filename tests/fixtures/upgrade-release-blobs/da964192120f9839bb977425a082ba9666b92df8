#!/bin/bash
# Inspect factor registry health and candidate completeness.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  REPO_ROOT="$(cd "$REPO_HARNESS_TARGET_REPO_ROOT" && pwd)"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
REGISTRY="$REPO_ROOT/tasks/factors/registry.json"

if [[ ! -f "$REGISTRY" ]]; then
  echo "Missing factor registry: $REGISTRY" >&2
  exit 1
fi

JS_RUNTIME=""
if command -v node >/dev/null 2>&1; then JS_RUNTIME=node
elif command -v bun >/dev/null 2>&1; then JS_RUNTIME=bun
else echo "No JavaScript runtime (node or bun) found" >&2; exit 1; fi

$JS_RUNTIME - "$REGISTRY" "$REPO_ROOT" <<'NODE_EOF'
const fs = require("fs");
const path = require("path");

const [,, registryPath, repoRoot] = process.argv;
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const candidates = registry.candidates ?? [];
const promoted = registry.promoted ?? [];
const rejected = registry.rejected ?? [];

console.log(`[FactorFactory] Candidates: ${candidates.length}`);
console.log(`[FactorFactory] Promoted: ${promoted.length}`);
console.log(`[FactorFactory] Rejected: ${rejected.length}`);

let failures = 0;

for (const candidate of candidates) {
  const baseDir = path.join(repoRoot, ".claude", ".factor-cache", "candidates", candidate.slug);
  const hypothesisPath = path.join(baseDir, "hypothesis.md");
  const backtestSummaryPath = path.join(baseDir, "backtest-summary.md");

  if (!fs.existsSync(hypothesisPath)) {
    console.log(`[FactorFactory] ERROR ${candidate.slug}: missing hypothesis.md`);
    failures += 1;
    continue;
  }

  const hypothesis = fs.readFileSync(hypothesisPath, "utf8");
  if (!hypothesis.includes("data_deps:")) {
    console.log(`[FactorFactory] WARN ${candidate.slug}: hypothesis is missing data_deps`);
  }

  if (fs.existsSync(backtestSummaryPath)) {
    const report = fs.readFileSync(backtestSummaryPath, "utf8");
    if (!/Transaction Cost/i.test(report)) {
      console.log(`[FactorFactory] WARN ${candidate.slug}: backtest-summary.md is missing transaction cost review`);
    }
  } else {
    console.log(`[FactorFactory] WARN ${candidate.slug}: backtest-summary.md not generated yet`);
  }
}

for (const entry of promoted) {
  const promotedDir = path.join(repoRoot, "tasks", "factors", "promoted", entry.slug);
  if (!fs.existsSync(promotedDir)) {
    console.log(`[FactorFactory] ERROR ${entry.slug}: registry promoted entry missing filesystem directory`);
    failures += 1;
  }
}

if (failures > 0) {
  process.exit(1);
}
NODE_EOF
