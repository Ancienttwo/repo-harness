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
# Only the affected lane takes an optional base. The PR architecture advisory needs one.
if [[ "$#" -gt 0 || ( -n "$base" && "$lane" != affected && "$lane" != architecture-advisory ) || ( -z "$base" && "$lane" == architecture-advisory ) ]] \
  || [[ "$lane" != all && "$lane" != governance && "$lane" != functional && "$lane" != affected && "$lane" != architecture && "$lane" != architecture-advisory ]]; then
  echo "Usage: scripts/check-ci.sh [affected|all|governance|functional|architecture] [--base <git-ref>]" >&2
  echo "       scripts/check-ci.sh architecture-advisory --base <git-ref>" >&2
  exit 2
fi

BUN_TEST_TIMEOUT_MS="${BUN_TEST_TIMEOUT_MS:-60000}"
BUN_TEST_MAX_CONCURRENCY="${BUN_TEST_MAX_CONCURRENCY:-1}"
BUN_TEST_ISOLATE_FILES="${BUN_TEST_ISOLATE_FILES:-1}"
BUN_TEST_JOBS="${BUN_TEST_JOBS:-8}"
BUN_TEST_SCHEDULE_FILES=1
BUN_TEST_SUITE=full

source "$ROOT/scripts/lib/ci-run-tests.sh"

# Runs the read-only architecture check and writes its JSON result to $1. The
# check writes no repository files. A private HOME enables the provider without
# touching the caller's global configuration. CodeGraph supplies the code facts.
run_architecture_check() {
  local out="$1" arch_home status=0
  arch_home="$(mktemp -d /tmp/rh-arch-home-XXXXXX)"
  mkdir -p "$arch_home/.repo-harness"
  printf '%s\n' '{"architecture":{"projection_provider":"archctx","projection_apply":"manual","projection_timeout_ms":600000}}' > "$arch_home/.repo-harness/config.json"
  if [[ -d .codegraph ]]; then
    HOME="$arch_home" npm exec --no -- codegraph sync -q . </dev/null >/dev/null || status=$?
  else
    HOME="$arch_home" npm exec --no -- codegraph init -y . </dev/null >/dev/null || status=$?
  fi
  if [[ "$status" -eq 0 ]]; then
    HOME="$arch_home" bun src/cli/index.ts architecture-projection check --json > "$out" || status=$?
  fi
  rm -rf "$arch_home"
  return "$status"
}

# Prints the summary that the daily repair issue carries: status, stale nodes,
# files and human actions. It fails when the check printed no JSON result.
architecture_summary() {
  bun -e 'const r = JSON.parse(await Bun.file(process.argv[1]).text()); console.log(JSON.stringify({ status: r.status, staleNodes: (r.freshness?.staleNodes ?? []).map(n => n.nodeId), files: (r.files ?? []).map(f => f.path), humanActions: r.humanActions ?? [] }, null, 2));' "$1"
}

# Prints a GitHub Actions warning annotation. The title must not contain ':' or ','.
warn() {
  local message="$2"
  message="${message//'%'/%25}"
  message="${message//$'\r'/%0D}"
  message="${message//$'\n'/%0A}"
  echo "::warning title=$1::$message"
}

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

# PR advisory: warn when the PR owes architecture updates. Architecture
# diagnostics never fail the PR, so every outcome here exits 0.
if [[ "$lane" == architecture-advisory ]]; then
  echo "[ci] owed architecture capabilities"
  owed_json="$(mktemp /tmp/rh-arch-owed-XXXXXX)"
  owed_err="$(mktemp /tmp/rh-arch-owed-err-XXXXXX)"
  owed_ids=""
  owed_status=0
  bun src/cli/index.ts state owed --json --base "$base" > "$owed_json" 2> "$owed_err" || owed_status=$?
  if [[ "$owed_status" -eq 0 ]]; then
    owed_ids="$(bun -e 'const r = JSON.parse(await Bun.file(process.argv[1]).text()); if (r.kind !== "repo-harness-owed-capabilities") throw new Error("not an owed-capabilities report"); console.error(`[ci] Owed status: ${r.status}`); if (r.status === "owed") console.log(r.capabilities.map(c => c.id).join(", "));' "$owed_json" 2>> "$owed_err")" || owed_status=$?
  fi
  # A workflow command must start its own line, so end the output with a newline.
  printf '%s\n' "$(cat "$owed_err")" >&2
  if [[ "$owed_status" -ne 0 ]]; then
    warn "Architecture owed check failed" "repo-harness state owed --json --base $base failed: $(tail -n 5 "$owed_err")"
  fi
  rm -f "$owed_json" "$owed_err"
  if [[ -z "$owed_ids" ]]; then
    echo "[ci] No architecture check needed."
    exit 0
  fi
  warn "Architecture update owed" "This PR changes paths owned by these capabilities after the last architecture manifest update: $owed_ids."

  echo "[ci] architecture projection"
  arch_json="$(mktemp /tmp/rh-arch-check-XXXXXX)"
  run_architecture_check "$arch_json" || true
  arch_line="$(bun -e 'const r = JSON.parse(await Bun.file(process.argv[1]).text()); console.log([r.status, (r.freshness?.staleNodes ?? []).map(n => n.nodeId).join(", ") || "none"].join("\t"));' "$arch_json")" || arch_line=""
  printf '%s\n' "$(cat "$arch_json")"
  rm -f "$arch_json"
  if [[ -z "$arch_line" ]]; then
    warn "Architecture check failed" "repo-harness architecture-projection check --json returned no result. Read the job log. Owed capabilities: $owed_ids."
  elif [[ "${arch_line%%$'\t'*}" == noop ]]; then
    echo "[ci] Architecture documents are current."
  else
    warn "Architecture documents stale" "Status: ${arch_line%%$'\t'*}. Stale nodes: ${arch_line#*$'\t'}. Owed capabilities: $owed_ids. In this PR run: repo-harness architecture-projection apply --json. Then commit docs/architecture/."
  fi
  echo "[ci] OK"
  exit 0
fi

if [[ "$lane" == all || "$lane" == governance ]]; then
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
fi

# Daily lane: stale architecture documents fail it, so the daily report opens
# a repair issue. ARCHITECTURE_SUMMARY names the file for that report.
if [[ "$lane" == all || "$lane" == architecture ]]; then
  echo "[ci] architecture projection"
  arch_json="$(mktemp /tmp/rh-arch-check-XXXXXX)"
  arch_status=0
  run_architecture_check "$arch_json" || arch_status=$?
  if arch_summary="$(architecture_summary "$arch_json")"; then
    printf '%s\n' "$arch_summary"
    if [[ -n "${ARCHITECTURE_SUMMARY:-}" ]]; then
      mkdir -p "$(dirname "$ARCHITECTURE_SUMMARY")"
      printf '%s\n' "$arch_summary" > "$ARCHITECTURE_SUMMARY"
    fi
  else
    cat "$arch_json"
  fi
  rm -f "$arch_json"
  if [[ "$arch_status" -ne 0 ]]; then
    echo "[ci] Architecture projection is not noop. Fix the provider error, or run repo-harness architecture-projection apply in a PR." >&2
    exit 1
  fi
fi

if [[ "$lane" == all || "$lane" == functional ]]; then
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
