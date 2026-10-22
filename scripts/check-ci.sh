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
  || [[ "$lane" != all && "$lane" != governance && "$lane" != functional && "$lane" != affected && "$lane" != architecture && "$lane" != architecture-advisory && "$lane" != release ]]; then
  echo "Usage: scripts/check-ci.sh [affected|all|governance|functional|architecture|release] [--base <git-ref>]" >&2
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

# Runs "$@" with a private HOME that enables the archctx provider without
# touching the caller's global configuration. It first builds or syncs the
# CodeGraph index at HEAD, which supplies the code facts. The architecture
# commands write no repository files.
with_architecture_home() {
  local arch_home status=0
  arch_home="$(mktemp -d /tmp/rh-arch-home-XXXXXX)"
  mkdir -p "$arch_home/.repo-harness"
  printf '%s\n' '{"architecture":{"projection_provider":"archctx","projection_apply":"manual","projection_timeout_ms":600000}}' > "$arch_home/.repo-harness/config.json"
  if [[ -d .codegraph ]]; then
    HOME="$arch_home" npm exec --no -- codegraph sync -q . </dev/null >/dev/null || status=$?
  else
    HOME="$arch_home" npm exec --no -- codegraph init -y . </dev/null >/dev/null || status=$?
  fi
  if [[ "$status" -eq 0 ]]; then
    HOME="$arch_home" "$@" || status=$?
  fi
  rm -rf "$arch_home"
  return "$status"
}

# Runs the read-only architecture check and writes its JSON result to $1.
run_architecture_check() {
  with_architecture_home bun src/cli/index.ts architecture-projection render-check --json > "$1"
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
  # CI_SHARD=<index>/<total> runs one duration-balanced part; shard 0 also owns typecheck.
  BUN_TEST_FILES="$(bun -e 'const files = JSON.parse(await Bun.file(".ci-affected-tests.json").text()); if (!Array.isArray(files) || new Set(files).size !== files.length || files.some(f => typeof f !== "string" || !/^tests\/[\w/.-]+\.test\.tsx?$/.test(f) || f.split("/").includes(".."))) throw Error("Invalid affected tests"); const shard = process.env.CI_SHARD ?? ""; let selected = files; if (shard) { const match = /^(0|[1-9]\d*)\/([1-9]\d*)$/.exec(shard); if (!match) throw Error("Invalid CI_SHARD"); const { shardTestFiles } = await import("./scripts/select-test-suite.ts"); const durations = JSON.parse(await Bun.file("scripts/test-file-durations.json").text()).files; selected = shardTestFiles(files, durations, Number(match[1]), Number(match[2])); } console.log(selected.join("\n"));')"
  if [[ -z "${CI_SHARD:-}" || "${CI_SHARD%%/*}" == 0 ]]; then
    echo "[ci] typecheck"
    bun run check:type
  fi
  echo "[ci] affected tests${CI_SHARD:+ (shard $CI_SHARD)}"
  if [[ -n "$BUN_TEST_FILES" ]]; then
    BUN_TEST_ISOLATE_FILES=1
    BUN_TEST_TIMEOUT_MS=60000
    BUN_TEST_MAX_CONCURRENCY=1
    BUN_TEST_JOBS="${BUN_TEST_JOBS:-8}"
    bun run build:hook-bundle
    bun run build:oar-hosts
    run_bun_tests
  else
    echo "[ci] No affected tests${CI_SHARD:+ in shard $CI_SHARD}."
  fi
  echo "[ci] OK"
  exit 0
fi

# PR advisory: warn about architecture debt that is new since the PR base, and
# about hand-edited generated regions. Architecture diagnostics never fail the
# PR, so every outcome here exits 0.
if [[ "$lane" == architecture-advisory ]]; then
  echo "[ci] architecture debt"
  debt_json="$(mktemp /tmp/rh-arch-debt-XXXXXX)"
  debt_err="$(mktemp /tmp/rh-arch-debt-err-XXXXXX)"
  debt_records=""
  debt_status=0
  with_architecture_home bun src/cli/index.ts architecture-debt --json --base "$base" > "$debt_json" 2> "$debt_err" || debt_status=$?
  if [[ "$debt_status" -eq 0 ]]; then
    # One record per line: "log<TAB>text" or "warn<TAB>title<TAB>message".
    # Only the debt items that are new at HEAD get annotations. A coverage gap
    # is printed with its reason codes and is never reported as "no debt".
    debt_records="$(bun -e 'const r = JSON.parse(await Bun.file(process.argv[1]).text()); if (r.kind !== "repo-harness-architecture-debt" || r.base === null || !Array.isArray(r.introduced) || !Array.isArray(r.resolvedIds)) throw new Error("not an architecture debt report with a base"); const field = (value) => String(value).replace(/\s+/g, " ").trim(); const out = []; const log = (text) => out.push(["log", field(text)].join("\t")); const warn = (title, message) => out.push(["warn", title, field(message)].join("\t")); const head = r.head.debt; log(`Architecture debt: head coverage ${head.coverage}. Introduced ${r.introduced.length}. Resolved ${r.resolvedIds.length}.`); for (const [name, coverage, codes] of [["Head", head.coverage, head.coverageReasonCodes], ["Base", r.base.coverage, r.base.coverageReasonCodes]]) if (coverage !== "complete") log(`${name} coverage is ${coverage}. Reason codes: ${codes.join(", ") || "none"}. Debt outside the covered checks is not measured.`); if (r.introduced.length === 0 && head.coverage === "complete" && r.base.coverage === "complete") log("No new architecture debt."); const cap = 20; for (const item of r.introduced.slice(0, cap)) { const subjects = item.capabilityIds.length > 0 ? item.capabilityIds : item.paths; warn("Architecture debt introduced", `${item.kind} (${item.reasonCode}) in ${subjects.join(", ") || "the repository"}. Action: ${item.action}`); } if (r.introduced.length > cap) warn("Architecture debt introduced", `${r.introduced.length - cap} more new debt items have no annotation. Run repo-harness architecture-debt --json --base ${r.base.ref} to list them.`); console.log(out.join("\n"));' "$debt_json" 2>> "$debt_err")" || debt_status=$?
  fi
  # A workflow command must start its own line, so end the output with a newline.
  printf '%s\n' "$(cat "$debt_err")" >&2
  if [[ "$debt_status" -ne 0 ]]; then
    warn "Architecture debt check failed" "repo-harness architecture-debt --json --base $base failed: $(tail -n 5 "$debt_err")"
  else
    while IFS=$'\t' read -r debt_record debt_title debt_message; do
      if [[ "$debt_record" == warn ]]; then
        warn "$debt_title" "$debt_message"
      elif [[ "$debt_record" == log ]]; then
        echo "[ci] $debt_title"
      fi
    done <<< "$debt_records"
  fi
  rm -f "$debt_json" "$debt_err"

  echo "[ci] architecture hand edits"
  arch_json="$(mktemp /tmp/rh-arch-check-XXXXXX)"
  arch_status=0
  with_architecture_home bun src/cli/index.ts architecture-projection hand-edits --json --base "$base" > "$arch_json" || arch_status=$?
  if [[ "$arch_status" -eq 0 ]]; then
    arch_lines="$(bun -e 'const r = JSON.parse(await Bun.file(process.argv[1]).text()); if (!Array.isArray(r.edits) || r.edits.some(e => typeof e.path !== "string" || typeof e.reasonCode !== "string")) throw Error("Invalid hand-edit report"); console.log(r.edits.map(e => `${e.path}: ${e.reasonCode}`.replace(/\s+/g, " ")).join("\n"));' "$arch_json")" || arch_status=$?
  fi
  if [[ "$arch_status" -ne 0 ]]; then
    warn "Architecture check failed" "repo-harness architecture-projection hand-edits --json --base $base failed. Read the job log."
  elif [[ -n "$arch_lines" ]]; then
    while IFS= read -r edit; do
      warn "Architecture generated output hand edited" "$edit. Keep model and human prose changes in this PR; the archctx rolling writer owns generated output."
    done <<< "$arch_lines"
  else
    echo "[ci] No hand-edited generated output in this PR."
  fi
  rm -f "$arch_json"
  echo "[ci] OK"
  exit 0
fi

# Local full runs, the daily functional lane and the release gate run the
# expensive real-install cases. The PR lanes leave them gated out.
if [[ "$lane" == all || "$lane" == release || "$lane" == functional ]]; then
  export REPO_HARNESS_TEST_EXPENSIVE=1
fi

# Release gate: CI owns the full suite, so this lane runs only the expensive
# cases and the package/install smoke. The benchmark artifact packs with
# --ignore-scripts, so build the dist files here as the functional lane does.
if [[ "$lane" == release ]]; then
  bun run build:hook-bundle
  bun run build:oar-hosts
  echo "[ci] expensive release tests"
  run_bun_test_file tests/harness-benchmark-matrix.test.ts
  echo "[ci] package/install smoke (one shared tarball)"
  bash scripts/check-tarball-install-smoke.sh
  echo "[ci] OK"
  exit 0
fi

if [[ "$lane" == all || "$lane" == governance ]]; then
  echo "[ci] typecheck"
  bun run check:type

  echo "[ci] state boundaries"
  bun run check:state-boundaries

  echo "[ci] protected Git paths"
  bun scripts/check-protected-paths.ts --tracked

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

  echo "[ci] repository inspection"
  bun scripts/inspect-project-state.ts --repo . --format text >/dev/null
  bun src/cli/index.ts init --repo . --dry-run >/dev/null
fi

# Daily lane: only render drift or an incomplete check fails. Source stamps do not.
# The daily report routes the failure to the upstream rolling writer. ARCHITECTURE_SUMMARY names the file for that report.
if [[ "$lane" == all || "$lane" == architecture ]]; then
  echo "[ci] architecture projection"
  arch_json="$(mktemp /tmp/rh-arch-check-XXXXXX)"
  arch_status=0
  run_architecture_check "$arch_json" || arch_status=$?
  if arch_summary="$(cat "$arch_json")" && [[ -n "$arch_summary" ]]; then
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
    echo "[ci] Architecture render differs or is incomplete. Inspect archctx writer status and the reported debt or provider error." >&2
    exit 1
  fi
fi

if [[ "$lane" == all || "$lane" == functional ]]; then
  echo "[ci] tests"
  bun run build:hook-bundle
  bun run build:oar-hosts
  run_bun_tests

  echo "[ci] package/install smoke (one shared tarball)"
  bash scripts/check-tarball-install-smoke.sh

fi

echo "[ci] OK"
