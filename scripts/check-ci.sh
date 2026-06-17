#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUN_TEST_TIMEOUT_MS="${BUN_TEST_TIMEOUT_MS:-60000}"
BUN_TEST_MAX_CONCURRENCY="${BUN_TEST_MAX_CONCURRENCY:-4}"

echo "[ci] install"
bun install --frozen-lockfile

echo "[ci] typecheck"
bun run check:type

echo "[ci] tests"
bun test --timeout "$BUN_TEST_TIMEOUT_MS" --max-concurrency "$BUN_TEST_MAX_CONCURRENCY"

echo "[ci] workflow checks"
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
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
bash scripts/migrate-project-template.sh --repo . --dry-run >/dev/null

echo "[ci] package dry-run"
npm pack --dry-run --json >/dev/null
bash scripts/check-tarball-install-smoke.sh

echo "[ci] OK"
