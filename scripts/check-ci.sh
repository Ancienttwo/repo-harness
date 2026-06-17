#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUN_TEST_TIMEOUT_MS="${BUN_TEST_TIMEOUT_MS:-60000}"
BUN_TEST_MAX_CONCURRENCY="${BUN_TEST_MAX_CONCURRENCY:-4}"
BUN_TEST_ISOLATE_FILES="${BUN_TEST_ISOLATE_FILES:-0}"

run_bun_test_file() {
  local file="$1"
  echo "[ci] test $file"
  bun test --timeout "$BUN_TEST_TIMEOUT_MS" --max-concurrency "$BUN_TEST_MAX_CONCURRENCY" "$file"
}

run_bun_tests() {
  if [[ "$BUN_TEST_ISOLATE_FILES" != "1" ]]; then
    bun test --timeout "$BUN_TEST_TIMEOUT_MS" --max-concurrency "$BUN_TEST_MAX_CONCURRENCY"
    return
  fi

  local found=0
  if [[ -n "${BUN_TEST_FILES:-}" ]]; then
    local file
    for file in $BUN_TEST_FILES; do
      found=1
      run_bun_test_file "$file"
    done
  else
    while IFS= read -r file; do
      found=1
      run_bun_test_file "$file"
    done < <(find tests -type f -name '*.test.ts' | LC_ALL=C sort)
  fi

  if [[ "$found" != "1" ]]; then
    echo "[ci] no test files matched" >&2
    return 1
  fi
}

echo "[ci] install"
bun install --frozen-lockfile

echo "[ci] typecheck"
bun run check:type

echo "[ci] tests"
run_bun_tests

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
