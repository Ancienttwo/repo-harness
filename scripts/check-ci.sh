#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# PR CI verifies one candidate; daily and release callers explicitly select the full lanes.
lane_args=("$@")
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

# Every lane waits its turn in the host test queue: release first, then FIFO.
if ! bun "$ROOT/scripts/host-test-queue.ts" held; then
  case "$lane" in
    release) queue_kind=release ;;
    all) queue_kind=full ;;
    *) queue_kind=affected ;;
  esac
  exec bun "$ROOT/scripts/host-test-queue.ts" run --kind "$queue_kind" -- "$BASH" "$ROOT/scripts/check-ci.sh" ${lane_args[@]+"${lane_args[@]}"}
fi

BUN_TEST_TIMEOUT_MS="${BUN_TEST_TIMEOUT_MS:-60000}"
BUN_TEST_MAX_CONCURRENCY="${BUN_TEST_MAX_CONCURRENCY:-1}"
BUN_TEST_ISOLATE_FILES="${BUN_TEST_ISOLATE_FILES:-1}"
BUN_TEST_JOBS="${BUN_TEST_JOBS:-8}"
BUN_TEST_SCHEDULE_FILES=1
BUN_TEST_SUITE=full

source "$ROOT/scripts/lib/ci-run-tests.sh"
source "$ROOT/scripts/lib/architecture-plugin.sh"

# Records an install selection with the architecture plugin in the private
# HOME $1. The repository policy sets capability_source archcontext, which
# needs that plugin; without a recorded selection the plugin is not loaded.
record_architecture_selection() {
  mkdir -p "$1/.repo-harness"
  bun -e 'const version = (await Bun.file("package.json").json()).version; await Bun.write(process.argv[1], `${JSON.stringify({ protocol: 3, core: { version }, plugins: [{ id: "architecture", version }], selection: ["architecture"], transaction_id: "ci", applied_at: new Date(0).toISOString(), ownership_manifest: [], previous: null })}\n`);' "$1/.repo-harness/install-state.json"
}

# Runs "$@" with a private HOME that selects the architecture plugin.
with_architecture_selection() {
  local selection_home status=0
  selection_home="$(mktemp -d /tmp/rh-arch-selection-XXXXXX)"
  record_architecture_selection "$selection_home"
  HOME="$selection_home" "$@" || status=$?
  rm -rf "$selection_home"
  return "$status"
}

# Runs "$@" with a private HOME that selects the architecture plugin and
# enables the archctx provider without touching the caller's global
# configuration. It first builds or syncs the CodeGraph index at HEAD, which
# supplies the code facts. The architecture commands write no repository files.
with_architecture_home() {
  local arch_home status=0
  arch_home="$(mktemp -d /tmp/rh-arch-home-XXXXXX)"
  record_architecture_selection "$arch_home"
  printf '%s\n' '{"architecture":{"projection_provider":"archctx","projection_apply":"manual","projection_timeout_ms":600000}}' > "$arch_home/.repo-harness/config.json"
  if [[ -d .codegraph ]]; then
    HOME="$arch_home" repo_harness_architecture_start "$ROOT" "" "CodeGraph sync" npm exec --no -- codegraph sync -q . </dev/null >/dev/null || status=$?
  else
    HOME="$arch_home" repo_harness_architecture_start "$ROOT" "" "CodeGraph init" npm exec --no -- codegraph init -y . </dev/null >/dev/null || status=$?
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

# Prints the committer time of the oldest unpublished main commit for the
# render-check summary $1. M is the newest first-parent commit that changes the
# projection manifest; only the rolling writer changes it, and with manifest v4
# only when a rendered output or the semantic baseline changes. Of the
# first-parent commits after M, firstRenderChangeCommit picks the render change;
# else M itself counts, because a product commit can sit between the
# rendered base and M. The squash body names the rendered base only as text, so
# it is not read.
architecture_unpublished_since() {
  local shallow manifest_commit after start
  # A shallow clone ends at a boundary commit that git log reports as a manifest change.
  shallow="$(git rev-parse --is-shallow-repository)" || return 1
  if [[ "$shallow" != false ]]; then
    echo "[ci] The checkout is shallow, so the newest projection manifest commit is unknown. Check out the full history." >&2
    return 1
  fi
  manifest_commit="$(git log --first-parent -1 --format=%H -- docs/architecture/.projection-manifest.json)" || return 1
  if [[ -z "$manifest_commit" ]]; then
    echo "[ci] No first-parent commit changes docs/architecture/.projection-manifest.json." >&2
    return 1
  fi
  after="$(git rev-list --first-parent --reverse "$manifest_commit..HEAD")" || return 1
  start="$manifest_commit"
  if [[ -n "$after" ]]; then
    # shellcheck disable=SC2086 # one argument per commit
    start="$(with_architecture_selection bun -e 'const { readRecordedSelection, registerSelectedArchitecturePorts } = await import("./src/cli/installer/architecture-selection.ts"); await registerSelectedArchitecturePorts(readRecordedSelection(), async () => (await import("./src/effects/architecture/providers.ts")).ARCHITECTURE_PROVIDERS); const { firstRenderChangeCommit } = await import("./src/core/architecture/projection.ts"); const { capabilityOwnersForPaths } = await import("./src/effects/state/resolve-effective-state.ts"); const { gitExecFileSync } = await import("./src/effects/git/runner.ts"); const [summaryPath, ...shas] = process.argv.slice(1); const ids = JSON.parse(await Bun.file(summaryPath).text()).differingCapabilityIds; if (ids !== null && !(Array.isArray(ids) && ids.every(id => typeof id === "string"))) throw new Error("render-check summary differingCapabilityIds must be a string array or null"); const commits = shas.map(sha => ({ sha, paths: gitExecFileSync(["diff", "--name-only", "--no-renames", "-z", `${sha}^`, sha, "--"], { encoding: "utf8" }).split("\0").filter(Boolean) })); const owners = ids === null || ids.length === 0 ? new Map() : capabilityOwnersForPaths(process.cwd(), [...new Set(commits.flatMap(commit => commit.paths))]); console.log(firstRenderChangeCommit(commits, ids, path => owners.get(path)?.id));' "$1" $after)" || return 1
  fi
  git show -s --format=%cI "$start" || return 1
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
  # CI_SHARD=<index>/<total> runs array <index> of the selection job's shard plan; shard 0 also owns typecheck.
  if [[ -n "$base" ]]; then
    shard_total=1
    if [[ -n "${CI_SHARD:-}" ]]; then shard_total="${CI_SHARD#*/}"; fi
    selection="$(CI_SHARD_TOTAL="$shard_total" bun scripts/select-ci-coverage.ts --base "$base")"
    printf '%s\n' "$selection"
    if grep -qx 'mode=documentation' <<< "$selection"; then
      echo "[ci] Documentation-only diff: no build or test job."
      echo "[ci] OK"
      exit 0
    fi
  fi
  BUN_TEST_FILES="$(bun scripts/select-test-suite.ts shard ${CI_SHARD:+"$CI_SHARD"})"
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
    bun run build:oar-review-host
    run_bun_tests
    # Each file of the run list proves with its own report that it ran in this shard.
    # shellcheck disable=SC2086 # The run list holds validated test paths, one per line.
    bun scripts/select-test-suite.ts reports "$BUN_TEST_JUNIT_DIR" $BUN_TEST_FILES
  else
    echo "[ci] No affected tests${CI_SHARD:+ in shard $CI_SHARD}."
  fi
  echo "[ci] OK"
  exit 0
fi

# PR architecture lane. Only the ADR-0002 rule 5 constraint and the released
# CHANGELOG sections can fail it. The debt and hand-edit results are warnings.
if [[ "$lane" == architecture-advisory ]]; then
  # A branch that started before a release commit puts its [Unreleased] entry
  # inside the released section in the merge result. The merge is clean, so the
  # lane compares the released sections with the merge result of the base.
  echo "[ci] released CHANGELOG sections"
  changelog_status=0
  bun scripts/check-changelog-released-sections.ts --base "$base" || changelog_status=$?
  if [[ "$changelog_status" -ne 0 ]]; then
    echo "::error title=Released CHANGELOG sections::scripts/check-changelog-released-sections.ts failed for base $base. Read the [changelog] line in the job log."
    exit 1
  fi

  # archctx exits 0 for violated and undetermined, and the layer-direction
  # warnings keep the global status violated. So the gate reads only this
  # constraint's own result, never the exit code or the global status.
  echo "[ci] plugin-internals constraint"
  constraint_json="$(mktemp /tmp/rh-arch-constraints-XXXXXX)"
  constraint_status=0
  with_architecture_home repo_harness_architecture_start "$ROOT" "" "plugin-internals constraint" npm exec --no -- archctx constraints check --json > "$constraint_json" || true
  constraint_failures="$(bun -e 'const { decodeConstraintEvaluation } = await import("./src/core/architecture/projection.ts"); const id = "constraint.surface.plugin-internals"; const envelope = JSON.parse(await Bun.file(process.argv[1]).text()); if (envelope.ok !== true) throw new Error(`archctx constraints check failed: ${JSON.stringify(envelope.error ?? null)}`); const r = decodeConstraintEvaluation(envelope.data); const failures = []; if (!r.constraintIds.includes(id)) failures.push(`${id} was not evaluated`); if (r.coverage !== "complete") failures.push(`coverage is ${r.coverage}`); if (r.reasonCodes.length > 0) failures.push(`reason codes: ${r.reasonCodes.join(", ")}`); for (const u of r.unresolvedImports) failures.push(`unresolved import ${u.specifier} from ${u.from}`); for (const v of r.violations) if (v.constraintId === id) failures.push(`${v.fromPath} imports ${v.toPath} (${v.fromNode} -> ${v.toNode})`); console.log(failures.map(f => f.replace(/\s+/g, " ")).join("\n"));' "$constraint_json")" || constraint_status=$?
  if [[ "$constraint_status" -ne 0 ]]; then
    echo "::error title=Plugin internals constraint::archctx constraints check --json gave no valid report. Read the job log."
  elif [[ -n "$constraint_failures" ]]; then
    constraint_status=1
    while IFS= read -r failure; do
      echo "::error title=Plugin internals constraint::${failure//'%'/%25}. ADR-0002 rule 5: a surface reads plugin state only through the plugin contract node."
    done <<< "$constraint_failures"
  else
    echo "[ci] constraint.surface.plugin-internals: 0 violations, coverage complete."
  fi
  rm -f "$constraint_json"

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
    debt_records="$(bun -e 'const { managedArchctxAction } = await import("./src/core/architecture/projection.ts"); const r = JSON.parse(await Bun.file(process.argv[1]).text()); if (r.kind !== "repo-harness-architecture-debt" || r.base === null || !Array.isArray(r.introduced) || !Array.isArray(r.resolvedIds)) throw new Error("not an architecture debt report with a base"); const field = (value) => String(value).replace(/\s+/g, " ").trim(); const out = []; const log = (text) => out.push(["log", field(text)].join("\t")); const warn = (title, message) => out.push(["warn", title, field(message)].join("\t")); const head = r.head.debt; log(`Architecture debt: head coverage ${head.coverage}. Introduced ${r.introduced.length}. Resolved ${r.resolvedIds.length}.`); for (const [name, coverage, codes] of [["Head", head.coverage, head.coverageReasonCodes], ["Base", r.base.coverage, r.base.coverageReasonCodes]]) if (coverage !== "complete") log(`${name} coverage is ${coverage}. Reason codes: ${codes.join(", ") || "none"}. Debt outside the covered checks is not measured.`); if (r.introduced.length === 0 && head.coverage === "complete" && r.base.coverage === "complete") log("No new architecture debt."); const cap = 20; for (const item of r.introduced.slice(0, cap)) { const subjects = item.capabilityIds.length > 0 ? item.capabilityIds : item.paths; warn("Architecture debt introduced", `${item.kind} (${item.reasonCode}) in ${subjects.join(", ") || "the repository"}. Action: ${managedArchctxAction(item.action)}`); } if (r.introduced.length > cap) warn("Architecture debt introduced", `${r.introduced.length - cap} more new debt items have no annotation. Run repo-harness architecture-debt --json --base ${r.base.ref} to list them.`); console.log(out.join("\n"));' "$debt_json" 2>> "$debt_err")" || debt_status=$?
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
  if [[ "$constraint_status" -ne 0 ]]; then
    echo "[ci] The plugin-internals constraint failed." >&2
    exit 1
  fi
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
  bun run build:oar-review-host
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
  with_architecture_selection bun run check:context-map

  echo "[ci] repository inspection"
  bun scripts/inspect-project-state.ts --repo . --format text >/dev/null
  bun src/cli/index.ts init --repo . --dry-run >/dev/null
fi

# Daily lane: a render difference that the writer has not published within the
# lag bound fails, and so does an incomplete check. A younger difference only
# warns. The daily report routes the failure to the
# upstream rolling writer. ARCHITECTURE_SUMMARY names the file for that report;
# the job writes no summary when the check or its freshness input gave no result.
# A dead or missing archimap module document link also fails; the summary keeps
# its lists in archimapLinks (null when the link check gave no result).
if [[ "$lane" == all || "$lane" == architecture ]]; then
  echo "[ci] archimap module links"
  links_status=0
  links_json="$(bun scripts/check-archimap-links.ts)" || links_status=$?
  echo "${links_json:-null}"
  echo "[ci] architecture projection"
  arch_json="$(mktemp /tmp/rh-arch-check-XXXXXX)"
  arch_freshness=""
  arch_input_failed=false
  run_architecture_check "$arch_json" || true
  if [[ -s "$arch_json" ]] && { unpublished_since="$(architecture_unpublished_since "$arch_json")" || { arch_input_failed=true; false; }; } \
    && arch_classified="$(bun -e 'const { classifyArchitectureFreshness } = await import("./src/core/architecture/projection.ts"); const summary = JSON.parse(await Bun.file(process.argv[1]).text()); const since = new Date(process.argv[2]); if (Number.isNaN(since.getTime())) throw new Error(`invalid commit time ${process.argv[2]}`); const freshness = classifyArchitectureFreshness(summary, since, new Date()); console.log(freshness); console.log(JSON.stringify({ ...summary, freshness, unpublishedSince: since.toISOString(), archimapLinks: JSON.parse(process.argv[3] || "null") }, null, 2));' "$arch_json" "$unpublished_since" "$links_json")"; then
    arch_freshness="${arch_classified%%$'\n'*}"
    arch_summary="${arch_classified#*$'\n'}"
    printf '%s\n' "$arch_summary"
    if [[ -n "${ARCHITECTURE_SUMMARY:-}" ]]; then
      mkdir -p "$(dirname "$ARCHITECTURE_SUMMARY")"
      printf '%s\n' "$arch_summary" > "$ARCHITECTURE_SUMMARY"
    fi
  else
    cat "$arch_json"
  fi
  rm -f "$arch_json"
  case "$arch_freshness" in
    fresh) ;;
    lag) warn "Architecture projection lag" "The render differs, and the oldest unpublished main commit ($unpublished_since) is younger than 3 h. The rolling writer publishes it." ;;
    stale) echo "[ci] Architecture render differs, and the oldest unpublished main commit ($unpublished_since) is 3 h or older. Inspect archctx writer status and the rolling PR." >&2; exit 1 ;;
    *) if [[ "$arch_input_failed" == true ]]; then echo "[ci] The oldest unpublished main commit could not be read. Read the git or ownership error above." >&2; exit 1; fi
       echo "[ci] Architecture check is incomplete${arch_freshness:+ ($arch_freshness)}. Inspect the reported human action or provider error." >&2; exit 1 ;;
  esac
  if [[ "$links_status" -ne 0 ]]; then echo "[ci] The archimap module document links do not match modules[].docs. Read the [archimap] lines above." >&2; exit 1; fi
fi

if [[ "$lane" == all || "$lane" == functional ]]; then
  echo "[ci] tests"
  bun run build:hook-bundle
  bun run build:oar-review-host
  run_bun_tests

  echo "[ci] package/install smoke (one shared tarball)"
  bash scripts/check-tarball-install-smoke.sh

fi

echo "[ci] OK"
