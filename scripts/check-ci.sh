#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# PR CI verifies one candidate; daily and release callers explicitly select the full lanes.
lane="${1:-affected}"
base=""
if [[ "$#" -gt 0 ]]; then shift; fi
if [[ "$#" -eq 2 && "$1" == --base && -n "$2" && "$2" != -* ]]; then
  base="$2"
  shift 2
fi
if [[ "$#" -gt 0 || ( -n "$base" && "$lane" != affected ) ]] || [[ "$lane" != all && "$lane" != governance && "$lane" != functional && "$lane" != affected ]]; then
  echo "Usage: scripts/check-ci.sh [affected|all|governance|functional] [--base <git-ref>]" >&2
  exit 2
fi

BUN_TEST_TIMEOUT_MS="${BUN_TEST_TIMEOUT_MS:-60000}"
BUN_TEST_MAX_CONCURRENCY="${BUN_TEST_MAX_CONCURRENCY:-1}"
BUN_TEST_ISOLATE_FILES="${BUN_TEST_ISOLATE_FILES:-1}"
BUN_TEST_JOBS="${BUN_TEST_JOBS:-8}"
BUN_TEST_SCHEDULE_FILES=1
BUN_TEST_SUITE=full

source "$ROOT/scripts/lib/ci-run-tests.sh"

echo "[ci] install"
bun install --frozen-lockfile

if [[ "$lane" == affected ]]; then
  if [[ -n "$base" ]]; then
    bun scripts/select-ci-coverage.ts --base "$base"
  fi
  echo "[ci] typecheck"
  bun run check:type
  echo "[ci] affected tests"
  BUN_TEST_FILES="$(bun -e 'const files = JSON.parse(await Bun.file(".ci-affected-tests.json").text()); if (!Array.isArray(files) || new Set(files).size !== files.length || files.some(f => typeof f !== "string" || !/^tests\/[\w/.-]+\.test\.tsx?$/.test(f) || f.split("/").includes(".."))) throw Error("Invalid affected tests"); console.log(files.join("\n"));')"
  if [[ -n "$BUN_TEST_FILES" ]]; then
    BUN_TEST_ISOLATE_FILES=1
    BUN_TEST_TIMEOUT_MS=60000
    BUN_TEST_MAX_CONCURRENCY=1
    BUN_TEST_JOBS="${BUN_TEST_JOBS:-8}"
    bun run build:hook-bundle
    bun run build:oar-hosts
    run_bun_tests
  else
    echo "[ci] No executable consumers changed; typecheck completed."
  fi
  echo "[ci] OK"
  exit 0
fi

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

  echo "[ci] workflow checks"
  bash scripts/check-deploy-sql-order.sh
  echo "[ci] context files"
  bash scripts/check-context-files.sh
  echo "[ci] context map"
  bun run check:context-map
  # Preserve the read-only helper's failure before checking successful evidence.
  bash scripts/check-task-sync.sh
  if [[ "${GITHUB_ACTIONS:-}" == "true" && -z "${REPO_HARNESS_DIFF_BASE:-}" ]]; then
    echo "[ci] GitHub Actions must provide REPO_HARNESS_DIFF_BASE for diff-bound workflow evidence." >&2
    exit 1
  fi
  bash scripts/check-task-workflow.sh

  echo "[ci] repository inspection"
  bun scripts/inspect-project-state.ts --repo . --format text >/dev/null
  bun src/cli/index.ts init --repo . --dry-run >/dev/null

  # Stale architecture docs fail this lane, so the daily report opens a repair
  # issue for the Bot. The check writes no repository files. A private HOME
  # enables the provider without touching the caller's global configuration.
  echo "[ci] architecture projection"
  arch_home="$(mktemp -d /tmp/rh-arch-home-XXXXXX)"
  mkdir -p "$arch_home/.repo-harness"
  printf '%s\n' '{"architecture":{"projection_provider":"archctx","projection_apply":"manual","projection_timeout_ms":600000}}' > "$arch_home/.repo-harness/config.json"
  if [[ -d .codegraph ]]; then
    HOME="$arch_home" node_modules/.bin/codegraph index . </dev/null >/dev/null
  else
    HOME="$arch_home" node_modules/.bin/codegraph init -y . </dev/null >/dev/null
  fi
  arch_status=0
  HOME="$arch_home" bun src/cli/index.ts architecture-projection check --json > "$arch_home/check.json" || arch_status=$?
  bun -e 'const r = JSON.parse(await Bun.file(process.argv[1]).text()); console.log(JSON.stringify({ status: r.status, staleNodes: (r.freshness?.staleNodes ?? []).map(n => n.nodeId), files: (r.files ?? []).map(f => f.path), humanActions: r.humanActions ?? [] }, null, 2));' "$arch_home/check.json" || cat "$arch_home/check.json"
  rm -rf "$arch_home"
  if [[ "$arch_status" -ne 0 ]]; then
    echo "[ci] Architecture projection is not noop. Fix the provider error, or run repo-harness architecture-projection apply in a PR." >&2
    exit 1
  fi

fi

if [[ "$lane" != governance ]]; then
  if [[ "$lane" == all ]]; then
    # Local and release callers own the expensive real-install and real-herdr
    # cases; the hosted functional lane deliberately leaves them gated out.
    export REPO_HARNESS_TEST_EXPENSIVE=1
  fi

  echo "[ci] tests"
  bun run build:hook-bundle
  bun run build:oar-hosts
  run_bun_tests

  echo "[ci] package/install smoke (one shared tarball)"
  bash scripts/check-tarball-install-smoke.sh

fi

echo "[ci] OK"
