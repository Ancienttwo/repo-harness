#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Hosted CI invokes independent lanes; local and release callers run both.
lane="${1:-all}"
if [[ "$#" -gt 1 ]] || [[ "$lane" != all && "$lane" != governance && "$lane" != functional ]]; then
  echo "Usage: scripts/check-ci.sh [all|governance|functional]" >&2
  exit 2
fi

BUN_TEST_TIMEOUT_MS="${BUN_TEST_TIMEOUT_MS:-60000}"
BUN_TEST_MAX_CONCURRENCY="${BUN_TEST_MAX_CONCURRENCY:-4}"
BUN_TEST_ISOLATE_FILES="${BUN_TEST_ISOLATE_FILES:-0}"

source "$ROOT/scripts/lib/ci-run-tests.sh"

echo "[ci] install"
bun install --frozen-lockfile

if [[ "$lane" != functional ]]; then
  echo "[ci] typecheck"
  bun run check:type

  echo "[ci] state boundaries"
  bun run check:state-boundaries

  echo "[ci] hook projection"
  bun run check:hooks

  echo "[ci] helper projection"
  bun run check:helpers

  echo "[ci] reference-configs projection"
  bun run check:reference-configs

  echo "[ci] route eval (TS arm)"
  bun run check:route-eval

  echo "[ci] workflow checks"
  bash scripts/check-deploy-sql-order.sh
  echo "[ci] context files"
  bash scripts/check-context-files.sh
  bash scripts/check-architecture-sync.sh
  echo "[ci] context map"
  bun run check:context-map
  if [[ "${GITHUB_ACTIONS:-}" == "true" && -z "${REPO_HARNESS_DIFF_BASE:-}" ]]; then
    echo "[ci] GitHub Actions must provide REPO_HARNESS_DIFF_BASE for diff-bound workflow evidence." >&2
    exit 1
  fi
  bash scripts/check-task-sync.sh

  if [[ -f scripts/prepare-handoff.sh ]]; then
    REPO_HARNESS_SKIP_RESUME_REFRESH=1 bash scripts/prepare-handoff.sh "ci gate" >/dev/null
  fi
  if [[ -f scripts/codex-handoff-resume.sh ]]; then
    bash scripts/codex-handoff-resume.sh --cwd . --reason "ci gate" >/dev/null
  fi
  bash scripts/check-task-workflow.sh --strict

  echo "[ci] repository inspection"
  bun scripts/inspect-project-state.ts --repo . --format text >/dev/null
  bun src/cli/index.ts init --repo . --dry-run >/dev/null

fi

if [[ "$lane" != governance ]]; then
  if [[ "$lane" == all ]]; then
    # Local and release callers own the expensive real-install and real-herdr
    # cases; the hosted functional lane deliberately leaves them gated out.
    export REPO_HARNESS_TEST_EXPENSIVE=1
  fi

  echo "[ci] tests"
  run_bun_tests

  echo "[ci] package dry-run"
  npm pack --dry-run --json >/dev/null
  bash scripts/check-tarball-install-smoke.sh

fi

echo "[ci] OK"
