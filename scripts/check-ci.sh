#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUN_TEST_TIMEOUT_MS="${BUN_TEST_TIMEOUT_MS:-60000}"
BUN_TEST_MAX_CONCURRENCY="${BUN_TEST_MAX_CONCURRENCY:-4}"
BUN_TEST_ISOLATE_FILES="${BUN_TEST_ISOLATE_FILES:-0}"

source "$ROOT/scripts/lib/ci-run-tests.sh"

echo "[ci] install"
bun install --frozen-lockfile

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

echo "[ci] tests"
run_bun_tests

echo "[ci] workflow checks"
bash scripts/check-deploy-sql-order.sh
echo "[ci] context files"
bash scripts/check-context-files.sh
bash scripts/check-architecture-sync.sh
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

echo "[ci] package dry-run"
npm pack --dry-run --json >/dev/null
bash scripts/check-tarball-install-smoke.sh

echo "[ci] OK"
