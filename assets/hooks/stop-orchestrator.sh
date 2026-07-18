#!/bin/bash
# Stop Orchestrator Hook - Stop
# Refreshes handoff state and, for pending planning discussions, forces one
# self-review pass before the agent stops.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"
if [[ -f "$SCRIPT_DIR/lib/minimal-change.sh" ]]; then
  # shellcheck source=/dev/null
  . "$SCRIPT_DIR/lib/minimal-change.sh"
fi

MINIMAL_CHANGE_REVIEW_SUMMARY=""
MINIMAL_CHANGE_REVIEW_VERDICT=""
MINIMAL_CHANGE_REVIEW_PATH=""
MINIMAL_CHANGE_REVIEW_FINDINGS="0"
MINIMAL_CHANGE_HANDOFF_BEGIN="<!-- repo-harness:minimal-change-review begin -->"
MINIMAL_CHANGE_HANDOFF_END="<!-- repo-harness:minimal-change-review end -->"

plan_completeness_state_file() {
  workflow_repo_relative_path \
    "$(workflow_policy_get '.planning.completeness_state_file' '.ai/harness/planning/plan-completeness.json')" \
    '.ai/harness/planning/plan-completeness.json' \
    '.ai/harness/'
}

plan_completeness_signature() {
  local kind prompt_slug draft_path source_ref created_at

  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  prompt_slug="$(workflow_pending_orchestration_field prompt_slug 2>/dev/null || true)"
  draft_path="$(workflow_pending_orchestration_field draft_plan_path 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"
  created_at="$(workflow_pending_orchestration_field created_at 2>/dev/null || true)"

  printf '%s|%s|%s|%s|%s' \
    "${kind:-unknown}" \
    "${prompt_slug:-planning}" \
    "${draft_path:-none}" \
    "${source_ref:-none}" \
    "${created_at:-unknown}"
}

plan_completeness_last_signature() {
  local state_file value
  state_file="$(plan_completeness_state_file)"
  [[ -f "$state_file" ]] || return 1

  if command -v jq >/dev/null 2>&1; then
    value="$(jq -r '.last_signature // empty' "$state_file" 2>/dev/null || true)"
  else
    value="$(
      awk '
        /"last_signature"/ {
          line = $0
          sub(/^[^:]*:[[:space:]]*"/, "", line)
          sub(/"[[:space:]]*,?[[:space:]]*$/, "", line)
          print line
          exit
        }
      ' "$state_file"
    )"
  fi

  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

plan_completeness_record_signature() {
  local signature="$1"
  local state_file
  state_file="$(plan_completeness_state_file)"
  mkdir -p "$(dirname "$state_file")"

  if command -v jq >/dev/null 2>&1; then
    jq -nc \
      --arg signature "$signature" \
      --arg updated_at "$(date '+%Y-%m-%dT%H:%M:%S%z')" \
      '{version:1,last_signature:$signature,updated_at:$updated_at}' > "$state_file"
    return 0
  fi

  cat > "$state_file" <<EOF_STATE
{"version":1,"last_signature":"$(workflow_json_escape "$signature")","updated_at":"$(workflow_json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")"}
EOF_STATE
}

plan_completeness_shell_quote() {
  printf '%q' "$1"
}

plan_completeness_runtime_summary() {
  local kind host prompt_slug draft_path source_ref expected_artifact cwd

  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  host="$(workflow_pending_orchestration_field host 2>/dev/null || true)"
  prompt_slug="$(workflow_pending_orchestration_field prompt_slug 2>/dev/null || true)"
  draft_path="$(workflow_pending_orchestration_field draft_plan_path 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"
  expected_artifact="$(workflow_pending_orchestration_field expected_artifact 2>/dev/null || true)"
  cwd="$(workflow_pending_orchestration_field cwd 2>/dev/null || true)"

  printf 'kind=%s host=%s expected=%s slug=%s' "${kind:-unknown}" "${host:-unknown}" "${expected_artifact:-plan}" "${prompt_slug:-planning}"
  [[ -n "$draft_path" ]] && printf ' draft=%s' "$draft_path"
  [[ -n "$source_ref" ]] && printf ' source_ref=<source-ref>'
  [[ -n "$cwd" ]] && printf ' cwd=%s' "$cwd"
  printf '\n'
}

plan_completeness_guidance_title_arg() {
  case "$1" in
    waza-think)
      printf '"Waza think planning output"'
      ;;
    dynamic-workflow)
      printf '"Dynamic workflow planning output"'
      ;;
    codex-plan)
      printf '"Codex planning output"'
      ;;
    repo-harness-plan)
      printf '"repo-harness planning output"'
      ;;
    *)
      printf '"Planning output"'
      ;;
  esac
}

plan_completeness_capture_guidance() {
  local kind prompt_slug source_ref title_arg source_arg

  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  prompt_slug="$(workflow_pending_orchestration_field prompt_slug 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"

  kind="${kind:-host-plan}"
  prompt_slug="${prompt_slug:-planning}"
  title_arg="$(plan_completeness_guidance_title_arg "$kind")"
  source_arg=""
  if [[ -n "$source_ref" ]]; then
    source_arg=' --source-ref "<source-ref>"'
  fi

  cat <<EOF_GUIDANCE
If the planning answer is decision-complete, capture the final plan body before stopping:
  printf '%s\n' '<decision-complete plan body>' | repo-harness run capture-plan --slug $(plan_completeness_shell_quote "$prompt_slug") --title ${title_arg} --status Draft --source $(plan_completeness_shell_quote "$kind") --orchestration-kind $(plan_completeness_shell_quote "$kind") --route planning${source_arg}

If the user already approved implementation, use:
  printf '%s\n' '<approved plan body>' | repo-harness run capture-plan --slug $(plan_completeness_shell_quote "$prompt_slug") --title ${title_arg} --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --source $(plan_completeness_shell_quote "$kind") --orchestration-kind $(plan_completeness_shell_quote "$kind") --route planning --execute${source_arg}

Use a short English title/source-ref alias in these runtime instructions; do not paste non-ASCII prompt text into command arguments.

If the plan is not decision-complete, revise once for: goal/success criteria, scope/non-scope, constraints, P1/P2/P3, fragile assumption, rejected alternative, public API/config/file-interface changes, external dependency/API key requirements, tests, rollback/failure handling, phase independence, and no placeholders. Do not implement until capture succeeds.
EOF_GUIDANCE
}

assistant_message_looks_like_plan() {
  local message="$1"
  local length

  length="$(printf '%s' "$message" | wc -c | tr -d ' ')"
  [[ "${length:-0}" -ge 240 ]] || return 1

  printf '%s\n' "$message" | grep -qEi \
    '(Approved design summary|Building|Not building|Approach|Key decisions|Unknowns|Task Breakdown|Evidence Contract|P1|P2|P3|plan|design|方案|计划|设计)'
}

emit_stop_block_json() {
  local reason="$1"

  if command -v jq >/dev/null 2>&1; then
    jq -nc --arg reason "$reason" '{decision:"block",reason:$reason}'
    return 0
  fi

  printf '{"decision":"block","reason":"%s"}\n' "$(workflow_json_escape "$reason")"
}

minimal_change_parse_review_json() {
  local raw="$1"
  local parsed

  if command -v jq >/dev/null 2>&1; then
    parsed="$(printf '%s' "$raw" | jq -r '
      def line($finding):
        "- [" + ($finding.tag // "review") + "] " + ($finding.path // ".") + ": " + ($finding.question // $finding.evidence // "review required");
      [
        (.verdict // "unknown"),
        (.report_path // ".ai/harness/checks/minimal-change.latest.json"),
        ((.findings // []) | length | tostring),
        (
          if (.verdict // "unknown") == "disabled" then ""
          elif (.findings // [] | length) == 0 then ""
          else
            "[MinimalChange] Non-blocking review (" + (.report_path // ".ai/harness/checks/minimal-change.latest.json") + "):\n" +
            ((.findings // [])[0:5] | map(line(.)) | join("\n"))
          end
        )
      ] | @tsv
    ' 2>/dev/null)" || return 1
  elif command -v bun >/dev/null 2>&1; then
    parsed="$(MINIMAL_CHANGE_RAW="$raw" bun -e '
      const report = JSON.parse(process.env.MINIMAL_CHANGE_RAW || "{}");
      const findings = Array.isArray(report.findings) ? report.findings : [];
      const path = report.report_path || ".ai/harness/checks/minimal-change.latest.json";
      let summary = "";
      if (report.verdict !== "disabled" && findings.length > 0) {
        summary = `[MinimalChange] Non-blocking review (${path}):\n` + findings.slice(0, 5).map((finding) => {
          const tag = finding.tag || "review";
          const file = finding.path || ".";
          const question = finding.question || finding.evidence || "review required";
          return `- [${tag}] ${file}: ${question}`;
        }).join("\n");
      }
      console.log([report.verdict || "unknown", path, String(findings.length), summary].join("\t"));
    ' 2>/dev/null)" || return 1
  else
    return 1
  fi

  IFS=$'\t' read -r \
    MINIMAL_CHANGE_REVIEW_VERDICT \
    MINIMAL_CHANGE_REVIEW_PATH \
    MINIMAL_CHANGE_REVIEW_FINDINGS \
    MINIMAL_CHANGE_REVIEW_SUMMARY <<< "$parsed"
}

minimal_change_refresh_review() {
  local raw

  declare -F minimal_change_hook_entry >/dev/null 2>&1 || return 0
  raw="$(minimal_change_hook_entry review --phase stop 2>/dev/null || true)"
  [[ "$raw" == \{* ]] || return 0
  minimal_change_parse_review_json "$raw" || return 0
}

minimal_change_render_handoff_section() {
  printf '%s\n' "$MINIMAL_CHANGE_HANDOFF_BEGIN"
  printf '\n## Minimal Change Review\n\n'
  printf -- '- Report: `%s`\n' "${MINIMAL_CHANGE_REVIEW_PATH:-.ai/harness/checks/minimal-change.latest.json}"
  printf -- '- Verdict: `%s`\n' "${MINIMAL_CHANGE_REVIEW_VERDICT:-unknown}"
  printf -- '- Findings: `%s`\n' "${MINIMAL_CHANGE_REVIEW_FINDINGS:-0}"
  if [[ -n "$MINIMAL_CHANGE_REVIEW_SUMMARY" ]]; then
    printf '\n%s\n' "$MINIMAL_CHANGE_REVIEW_SUMMARY"
  fi
  printf '\n%s\n' "$MINIMAL_CHANGE_HANDOFF_END"
}

minimal_change_append_handoff() {
  local handoff_file tmp_file resume_file resume_tmp_file

  [[ -n "$MINIMAL_CHANGE_REVIEW_VERDICT" ]] || return 0
  [[ "$MINIMAL_CHANGE_REVIEW_VERDICT" != "disabled" ]] || return 0
  handoff_file="$(workflow_handoff_file)"
  mkdir -p "$(dirname "$handoff_file")"
  tmp_file="$(mktemp "${handoff_file}.minimal-change.XXXXXX")" || return 0

  if [[ -f "$handoff_file" ]]; then
    awk -v begin="$MINIMAL_CHANGE_HANDOFF_BEGIN" -v end="$MINIMAL_CHANGE_HANDOFF_END" '
      $0 == begin { skip = 1; next }
      $0 == end { skip = 0; next }
      !skip { print }
    ' "$handoff_file" > "$tmp_file" || {
      rm -f "$tmp_file"
      return 0
    }
  fi

  printf '\n' >> "$tmp_file"
  minimal_change_render_handoff_section >> "$tmp_file"
  mv "$tmp_file" "$handoff_file"

  # refresh_handoff (workflow_write_handoff) already wrote a matched-freshness
  # handoff+resume pair; this function's append above is a genuine second
  # mutation of handoff_file, so check_handoff_resume_pair
  # (scripts/check-task-workflow.sh) would see a stale resume packet unless
  # the pair's finalization is completed here too. Reconfirm resume_file with
  # a real write -- reissuing its own Generated timestamp in place -- instead
  # of borrowing handoff's mtime via a content-blind `touch -r`: the resume
  # packet's Generated field should reflect when the pair was actually last
  # finalized, and its other content does not reference minimal-change-review
  # data, so no further rewrite is needed.
  resume_file="$(workflow_resume_packet_file)"
  if [[ -f "$resume_file" ]]; then
    resume_tmp_file="$(mktemp "${resume_file}.finalize.XXXXXX")" && {
      sed -E "s/^> \*\*Generated\*\*:.*/> **Generated**: $(date '+%Y-%m-%d %H:%M:%S')/" "$resume_file" > "$resume_tmp_file" \
        && mv "$resume_tmp_file" "$resume_file" \
        || rm -f "$resume_tmp_file"
    }
  fi
}

minimal_change_reason_suffix() {
  [[ -n "$MINIMAL_CHANGE_REVIEW_SUMMARY" ]] || return 0
  printf '\n\n%s' "$MINIMAL_CHANGE_REVIEW_SUMMARY"
}

delegation_state_paths_json() {
  local state_dir

  state_dir="${HOOK_REPO_ROOT:-$(pwd)}/.ai/harness/delegation"
  [[ -f "$state_dir/latest.json" ]] || return 1
  command -v bun >/dev/null 2>&1 || return 1

  JSON_INPUT="${HOOK_STDIN_JSON:-}" DELEGATION_STATE_DIR="$state_dir" bun -e '
    const fs = require("fs");
    const path = require("path");
    const crypto = require("crypto");

    function sanitize(value) {
      return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-")
        .slice(0, 120);
    }

    function firstString(input, keys) {
      for (const key of keys) {
        const value = input?.[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
      return "";
    }

    function parseInput() {
      try {
        return JSON.parse(process.env.JSON_INPUT || "{}");
      } catch {
        return {};
      }
    }

    function delegationScope(input) {
      const turnId = firstString(input, ["turn_id"]);
      if (turnId) return { source: "turn_id", id: `turn-${sanitize(turnId)}` };

      const runId = firstString(input, ["run_id"]);
      if (runId) return { source: "run_id", id: `run-${sanitize(runId)}` };

      const sessionId = firstString(input, ["session_id"]);
      if (sessionId) return { source: "session_id", id: `session-${sanitize(sessionId)}` };

      const transcriptPath = firstString(input, ["transcript_path"]);
      if (transcriptPath) {
        const digest = crypto.createHash("sha1").update(transcriptPath).digest("hex").slice(0, 16);
        return { source: "transcript_path", id: `transcript-${digest}` };
      }

      const envSession = process.env.CODEX_SESSION_ID || process.env.CLAUDE_SESSION_ID || "";
      if (envSession) return { source: "env_session", id: `session-${sanitize(envSession)}` };

      return null;
    }

    const stateDir = process.env.DELEGATION_STATE_DIR;
    const latestPath = path.join(stateDir, "latest.json");
    const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    const scope = delegationScope(parseInput());
    if (latest.scope_id) {
      if (!scope || latest.scope_id !== scope.id) process.exit(1);
      const statePath = path.resolve(stateDir, latest.state_file || path.join("turns", `${latest.scope_id}.json`));
      const stateRoot = path.resolve(stateDir) + path.sep;
      if (!statePath.startsWith(stateRoot)) process.exit(1);
      process.stdout.write(JSON.stringify({ latestPath, statePath }));
      process.exit(0);
    }
    process.stdout.write(JSON.stringify({ latestPath, statePath: latestPath }));
  ' 2>/dev/null
}

delegation_should_block() {
  local stop_active="$1"
  local state_paths

  [[ "$stop_active" != "true" ]] || return 1
  state_paths="$(delegation_state_paths_json)" || return 1
  command -v bun >/dev/null 2>&1 || return 1

  DELEGATION_STATE_PATHS="$state_paths" bun -e '
    const fs = require("fs");
    const paths = JSON.parse(process.env.DELEGATION_STATE_PATHS || "{}");
    const state = JSON.parse(fs.readFileSync(paths.statePath, "utf8"));
    const now = Math.floor(Date.now() / 1000);
    const age = Number.isFinite(Number(state.created_at_epoch)) ? now - Number(state.created_at_epoch) : 0;
    const fresh = age >= 0 && age <= 24 * 60 * 60;
    process.exit(state.eligible === true && state.explicit === true && state.spawned !== true && state.fallback_used !== true && state.stop_fallback !== false && fresh ? 0 : 1);
  ' >/dev/null 2>&1
}

delegation_mark_fallback_used() {
  local state_paths

  state_paths="$(delegation_state_paths_json)" || return 0
  command -v bun >/dev/null 2>&1 || return 0

  DELEGATION_STATE_PATHS="$state_paths" bun -e '
    const fs = require("fs");
    const crypto = require("crypto");

    function sleepMs(durationMs) {
      if (durationMs <= 0) return;
      try {
        const view = new Int32Array(new SharedArrayBuffer(4));
        Atomics.wait(view, 0, 0, durationMs);
      } catch {
        const until = Date.now() + durationMs;
        while (Date.now() < until) {
          // Busy-wait fallback for a runtime where Atomics.wait is unavailable.
        }
      }
    }

    // A single lock FILE (not a directory) at a fixed sibling path, created
    // with the O_CREAT | O_EXCL | O_WRONLY (wx) flag: fs.writeFileSync with
    // { flag: wx } is one call that atomically creates and opens the path,
    // throwing EEXIST synchronously when the path already exists, and this
    // same call writes the small owner-marker JSON payload as part of that
    // same successful open. There is no intermediate state where the lock
    // exists but has no readable owner yet, unlike the previous mkdir-plus-
    // separate-marker-file design. This assumes the marker payload stays small
    // and this hook always runs against a local or tmpfs-backed filesystem, so
    // that lock existence and lock content are effectively one fact
    // established by a single syscall; it does not attempt to solve the
    // general case of multi-writer torn writes for a larger payload or a
    // networked filesystem.
    function tryCreateLockFile(lockPath) {
      const token = crypto.randomBytes(8).toString("hex");
      try {
        fs.writeFileSync(
          lockPath,
          JSON.stringify({ pid: process.pid, token: token, acquired_at: new Date().toISOString() }),
          { flag: "wx" },
        );
        return { created: true, token: token };
      } catch (error) {
        if (error && typeof error === "object" && error.code === "EEXIST") return { created: false, token: null };
        throw error;
      }
    }

    // No reclaim is attempted here, on purpose. Five independent review rounds
    // each found a new TOCTOU race one layer deeper in a progressively more
    // careful reclaim mechanism: no lock at all, then an mkdir-based lock on
    // only one writer site, then the same lock on both writer sites but with
    // no ownership check, then an ownership token whose own mkdir-plus-marker
    // write was not atomic, then a single wx-locked file whose own stale-
    // reclaim step let two concurrent reclaimers race each other, and finally
    // a reclaim-marker gate whose own stale-marker cleanup could delete a
    // brand-new legitimate marker belonging to a different process. Every fix closed the
    // previously reported race and opened an equivalent one nested one layer
    // deeper in the mechanism protecting the previous fix. That pattern is a
    // decisive signal, not a coincidence: safely reclaiming a lock from a
    // possibly-crashed holder using only bare filesystem primitives (no
    // flock, no new dependency) cannot be made fully correct through
    // incremental patching. So this lock does not try. A lock left behind by
    // a crashed holder simply stays held until it is removed by hand (for
    // example, rm .ai/harness/delegation/latest.json.lock). That is an
    // accepted tradeoff, not an oversight: SubagentStart and UserPromptSubmit
    // hooks are short-lived, and this lock only guards the shared latest.json
    // convenience pointer -- the isolated per-turn state write always
    // succeeds no matter what this lock decides. The bounded retry loop
    // below still exists so ordinary, brief contention (two hooks racing a
    // normal, soon-to-be-released lock) resolves quickly, and a wedged lock
    // degrades to skipping the guarded write instead of hanging the hook.
    function acquireLock(lockPath, options) {
      const totalTimeoutMs = (options && options.totalTimeoutMs) || 2000;
      const retryDelayMs = (options && options.retryDelayMs) || 25;
      const deadline = Date.now() + totalTimeoutMs;
      for (;;) {
        let attempt;
        try {
          attempt = tryCreateLockFile(lockPath);
        } catch {
          return { acquired: false, token: null };
        }
        if (attempt.created) return { acquired: true, token: attempt.token };
        if (Date.now() >= deadline) return { acquired: false, token: null };
        sleepMs(retryDelayMs);
      }
    }

    // Release re-reads the lock file and only unlinks it when the content
    // token still matches the token returned by this exact acquireLock call,
    // so a lock that has since been legitimately released and re-acquired by
    // a different holder is never removed by a caller that no longer owns
    // it. The read and the unlink are still two separate steps, not one
    // atomic syscall -- POSIX has no portable delete-only-if-content-matches
    // primitive for a plain path without a file-descriptor-based lock such as
    // flock, which this hook deliberately avoids to stay dependency-free.
    // Since this lock is never reclaimed (see acquireLock above), the only
    // way this token check can ever see a mismatch is a legitimate release-
    // then-reacquire by a different holder in between, or the same accepted,
    // extremely low-probability PID-reuse/torn-write edge case already
    // documented for tryCreateLockFile above -- not a new gap introduced here.
    function releaseLock(lockPath, token) {
      let owner;
      try {
        owner = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      } catch {
        // No readable content at this path: this call cannot prove it still
        // owns the lock, so leave it alone rather than remove a lock it may
        // not own.
        return;
      }
      if (!owner || owner.token !== token) {
        // A different holder now owns this lock (already released and
        // re-acquired by a different call); do not touch a lock this call no
        // longer owns.
        return;
      }
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // Already gone: released by a different invocation.
      }
    }

    const paths = JSON.parse(process.env.DELEGATION_STATE_PATHS || "{}");
    const state = JSON.parse(fs.readFileSync(paths.statePath, "utf8"));
    state.fallback_used = true;
    state.fallback_used_at = new Date().toISOString();
    state.updated_at = state.fallback_used_at;
    if (paths.latestPath === paths.statePath) {
      // Unscoped case: statePath IS the shared latest.json pointer (see
      // delegation_state_paths_json above), not an isolated per-turn file,
      // so this single write is itself a shared-pointer write. It must go
      // through the same lock-guarded, in-lock scope_id re-check as the
      // scoped branch below instead of writing unconditionally. Skipping
      // the lock here (treating this as a redundant self-write) was the
      // actual bug: it let an unlocked write reach latest.json whenever no
      // scope had been claimed yet.
      const latestLockPath = `${paths.latestPath}.lock`;
      const latestLock = acquireLock(latestLockPath);
      if (latestLock.acquired) {
        try {
          const currentLatest = JSON.parse(fs.readFileSync(paths.latestPath, "utf8"));
          if (currentLatest && currentLatest.scope_id === state.scope_id) {
            fs.writeFileSync(paths.statePath, `${JSON.stringify(state, null, 2)}\n`);
          }
        } finally {
          releaseLock(latestLockPath, latestLock.token);
        }
      }
      // If the lock could not be acquired within the bounded retry window,
      // skip this write rather than risk a hung hook: a skipped write is
      // safe, a hung hook is not.
    } else {
      // Scoped case: statePath belongs only to this invocation (see
      // delegation_state_paths_json above) and is always safe to write
      // unconditionally; only the shared latestPath write below needs the
      // lock.
      fs.writeFileSync(paths.statePath, `${JSON.stringify(state, null, 2)}\n`);
      // Mutual-exclusion guard: subagent-start-context.sh and
      // codex-delegation-advisor.sh both serialize their own latest.json
      // writes through this same lock. This call is a third writer of the
      // same shared pointer, so it must hold the identical lock too, or a
      // fresher pointer committed by either of those two scripts while this
      // call is running could be silently clobbered back to this stale
      // fallback state. The per-turn statePath write above is always scoped
      // to this invocation alone and is safe regardless.
      //
      // This call resolves paths and reads state before acquiring this
      // lock, so a newer delegation scope can also be committed in that
      // gap, not only while the lock is held afterward. Re-read
      // latest.json inside the lock and only write when its current
      // scope_id still matches the scope this invocation resolved,
      // mirroring the identical in-lock re-check subagent-start-context.sh
      // already uses, so a fresher pointer committed in that gap is never
      // rolled back to this stale fallback state.
      const latestLockPath = `${paths.latestPath}.lock`;
      const latestLock = acquireLock(latestLockPath);
      if (latestLock.acquired) {
        try {
          const currentLatest = JSON.parse(fs.readFileSync(paths.latestPath, "utf8"));
          if (currentLatest && currentLatest.scope_id === state.scope_id) {
            fs.writeFileSync(paths.latestPath, `${JSON.stringify(state, null, 2)}\n`);
          }
        } finally {
          releaseLock(latestLockPath, latestLock.token);
        }
      }
      // If the lock could not be acquired within the bounded retry window,
      // skip the latestPath write rather than risk a hung hook: a skipped
      // write is safe, a hung hook is not.
    }
  ' >/dev/null 2>&1 || true
}

refresh_handoff() {
  workflow_write_handoff "session-stop"
  echo "[FinalizeHandoff] Refreshed $(workflow_handoff_file)." >&2
}

# Memoized canonical-state globals. Populated exactly once per Stop run by
# stop_resolve_state(), which every reader below (stop_workflow_profile,
# stop_maybe_block_on_readiness, stop_report_not_ready_to_ship) consumes
# verbatim -- one CLI invocation per Stop run, reused for profile AND
# readiness, re-deriving nothing.
STOP_STATE_RESOLVED=""
STOP_STATE_PROFILE=""
STOP_STATE_ALLOWED_TO_STOP=""
STOP_STATE_ALLOWED_TO_STOP_REASONS=""
STOP_STATE_READY_TO_SHIP=""
STOP_STATE_READY_TO_SHIP_REASONS=""
STOP_STATE_NEXT_ACTION=""

# Resolve profile + readiness through the same canonical hook CLI route
# pre-edit-guard.sh uses for `state resolve` (REPO_HARNESS_CLI -> repo-harness
# on PATH -> source src/cli/index.ts, in that order). Memoized so callers
# invoked more than once in this process (e.g. from inside the
# stop_workflow_profile() command substitution below) never trigger a second
# cold start. Must be called at least once from the *main* shell (not from
# inside a `$(...)` command substitution) before any reader below, because
# bash command substitutions fork a subshell and cannot write these globals
# back to the caller.
#
# Any output at all -- even a blocked resolution (non-zero CLI exit with a
# populated blockers array) -- counts as success: it is still a real,
# canonical answer, just one that reports workflow_profile/readiness as
# unavailable. Only empty/unparseable output means the resolver itself is
# unavailable or failed; that -- and only that -- logs to stderr and leaves
# every STOP_STATE_* value empty so no profile is ever invented and nothing
# is ever blocked from an absent answer. The orthogonal gates (plan
# completeness, delegation fallback) run regardless of this outcome.
stop_resolve_state() {
  [[ -z "$STOP_STATE_RESOLVED" ]] || return 0
  STOP_STATE_RESOLVED="1"

  local source_cli output
  local -a args=(state resolve --json --operation inspect)
  if [[ -n "${REPO_HARNESS_WORKFLOW_PROFILE:-}" ]]; then
    args+=(--profile "$REPO_HARNESS_WORKFLOW_PROFILE")
  fi
  source_cli="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)/src/cli/index.ts"

  set +e
  if [[ -n "${REPO_HARNESS_CLI:-}" && -f "${REPO_HARNESS_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    output="$(bun "$REPO_HARNESS_CLI" "${args[@]}" 2>/dev/null)"
  elif command -v repo-harness >/dev/null 2>&1; then
    output="$(repo-harness "${args[@]}" 2>/dev/null)"
  elif [[ -f "$source_cli" ]] && command -v bun >/dev/null 2>&1; then
    output="$(bun "$source_cli" "${args[@]}" 2>/dev/null)"
  else
    output=""
  fi
  set -e

  if [[ -z "$output" ]]; then
    echo "[StopReadiness] Unable to resolve canonical state via the hook CLI; skipping readiness-driven behavior (orthogonal gates still run)." >&2
    return 1
  fi

  if command -v jq >/dev/null 2>&1; then
    if ! printf '%s' "$output" | jq -e . >/dev/null 2>&1; then
      echo "[StopReadiness] Canonical state resolution returned unparseable output; skipping readiness-driven behavior (orthogonal gates still run)." >&2
      return 1
    fi
    STOP_STATE_PROFILE="$(printf '%s' "$output" | jq -r '.workflow_profile // empty' 2>/dev/null)"
    # Scalar-readiness guard: `.readiness` is documented as an object or
    # null (EffectiveStateV1['readiness']), but this reads externally
    # produced JSON, so a malformed non-object/non-null value must degrade
    # to skip-readiness rather than let jq's runtime type error
    # (`Cannot index <type> with "..."`) escape this pipeline and abort the
    # whole hook under `set -e` + `pipefail`. `type` itself never errors, so
    # this check is always safe to run.
    local readiness_type
    readiness_type="$(printf '%s' "$output" | jq -r '.readiness | type' 2>/dev/null)"
    if [[ "$readiness_type" == "object" || "$readiness_type" == "null" ]]; then
      STOP_STATE_ALLOWED_TO_STOP="$(printf '%s' "$output" | jq -r '.readiness.allowedToStop.decision // empty' 2>/dev/null)"
      STOP_STATE_ALLOWED_TO_STOP_REASONS="$(printf '%s' "$output" | jq -r '(.readiness.allowedToStop.reasons // []) | join(",")' 2>/dev/null)"
      STOP_STATE_READY_TO_SHIP="$(printf '%s' "$output" | jq -r '.readiness.readyToShip.decision // empty' 2>/dev/null)"
      STOP_STATE_READY_TO_SHIP_REASONS="$(printf '%s' "$output" | jq -r '(.readiness.readyToShip.reasons // []) | join(",")' 2>/dev/null)"
      STOP_STATE_NEXT_ACTION="$(printf '%s' "$output" | jq -r '.readiness.nextAction // empty' 2>/dev/null)"
    else
      echo "[StopReadiness] readiness field is not an object (${readiness_type:-unknown}); skipping readiness-driven behavior (orthogonal gates still run)." >&2
    fi
    return 0
  fi

  if command -v bun >/dev/null 2>&1; then
    local parsed
    parsed="$(STOP_STATE_JSON="$output" bun -e '
      let s;
      try { s = JSON.parse(process.env.STOP_STATE_JSON || ""); } catch { s = null; }
      if (!s || typeof s !== "object") process.exit(1);
      const r = (s.readiness && typeof s.readiness === "object") ? s.readiness : {};
      const stop = (r.allowedToStop && typeof r.allowedToStop === "object") ? r.allowedToStop : {};
      const ship = (r.readyToShip && typeof r.readyToShip === "object") ? r.readyToShip : {};
      const text = (v) => (v === undefined || v === null) ? "" : String(v);
      console.log([
        text(s.workflow_profile),
        text(stop.decision),
        Array.isArray(stop.reasons) ? stop.reasons.join(",") : "",
        text(ship.decision),
        Array.isArray(ship.reasons) ? ship.reasons.join(",") : "",
        text(r.nextAction),
      ].join("\t"));
    ' 2>/dev/null)" || parsed=""
    if [[ -n "$parsed" ]]; then
      IFS=$'\t' read -r STOP_STATE_PROFILE STOP_STATE_ALLOWED_TO_STOP STOP_STATE_ALLOWED_TO_STOP_REASONS \
        STOP_STATE_READY_TO_SHIP STOP_STATE_READY_TO_SHIP_REASONS STOP_STATE_NEXT_ACTION <<< "$parsed"
      return 0
    fi
  fi

  echo "[StopReadiness] Unable to parse canonical state JSON; skipping readiness-driven behavior (orthogonal gates still run)." >&2
  return 1
}

stop_workflow_profile() {
  stop_resolve_state || true
  case "$STOP_STATE_PROFILE" in
    lite|standard|strict) printf '%s\n' "$STOP_STATE_PROFILE" ;;
  esac
}

# The only readiness-driven emit_stop_block_json path: allowedToStop=block
# (durable recovery state lost or another stop-gate requirement unmet).
# Prints the block JSON and returns success (0) so callers know to exit
# immediately; returns failure (1) -- the common case -- when Stop remains
# allowed, whether or not readiness resolved at all.
stop_maybe_block_on_readiness() {
  [[ "$STOP_STATE_ALLOWED_TO_STOP" == "block" ]] || return 1
  emit_stop_block_json "[ReadinessGate] Stop is blocked by shared readiness (missing: ${STOP_STATE_ALLOWED_TO_STOP_REASONS:-unspecified}).$(minimal_change_reason_suffix)"
  return 0
}

# readyToShip=false never blocks Stop (frozen strict.stop delta): report it
# on stderr and let the caller continue to exit 0. Unrequired review/external
# acceptance evidence therefore can never block Stop through this path.
stop_report_not_ready_to_ship() {
  [[ "$STOP_STATE_READY_TO_SHIP" == "block" ]] || return 0
  echo "[ReadinessGate] readyToShip=false (missing: ${STOP_STATE_READY_TO_SHIP_REASONS:-unspecified}); Stop is not blocked -- resolve before shipping." >&2
}

should_run_plan_completeness_gate() {
  local stop_active="$1"
  local last_message="$2"
  local active_plan

  [[ "$stop_active" != "true" ]] || return 1
  workflow_pending_orchestration_is_fresh || return 1

  # If a repo plan is already active, the normal plan status gates own the next
  # transition. This gate only covers host planning output that still needs
  # capture.
  active_plan="$(get_active_plan || true)"
  [[ -z "$active_plan" || ! -f "$active_plan" ]] || return 1

  assistant_message_looks_like_plan "$last_message"
}

stop_hook_active="$(hook_json_get '.stop_hook_active' 'false')"
last_assistant_message="$(hook_json_get '.last_assistant_message' '')"

if [[ "$stop_hook_active" == "true" ]]; then
  exit 0
fi

refresh_handoff
stop_resolve_state || true

# Lite's complete Stop path is compact handoff only. Review freshness,
# minimal-change review, plan capture, and delegation fallback belong to the
# Standard/Strict orchestration envelopes, not brief -> edit -> targeted test.
if [[ "$(stop_workflow_profile || true)" == "lite" ]]; then
  stop_maybe_block_on_readiness || true
  exit 0
fi

stop_maybe_block_on_readiness && exit 0
stop_report_not_ready_to_ship

minimal_change_refresh_review
minimal_change_append_handoff

review_file="$(workflow_active_review || true)"
if [[ -n "$review_file" && -f "$review_file" ]]; then
  review_freshness="$(workflow_review_freshness_status "$review_file")"
  IFS=$'\t' read -r review_freshness_state _review_fingerprint review_freshness_message <<< "$review_freshness"
  case "$review_freshness_state" in
    stale|malformed|malformed_schema|unknown|missing)
      echo "[ReviewFreshness] $review_freshness_message" >&2
      ;;
  esac
fi

if should_run_plan_completeness_gate "$stop_hook_active" "$last_assistant_message"; then
  signature="$(plan_completeness_signature)"
  if [[ "$(plan_completeness_last_signature 2>/dev/null || true)" != "$signature" ]]; then
    plan_completeness_record_signature "$signature"
    summary="$(plan_completeness_runtime_summary)"
    guidance="$(plan_completeness_capture_guidance)"
    emit_stop_block_json "[PlanCompletenessGate] A first planning answer was produced while pending orchestration is still open: ${summary}

${guidance}$(minimal_change_reason_suffix)"
    exit 0
  fi
fi

if delegation_should_block "$stop_hook_active"; then
  delegation_mark_fallback_used
  emit_stop_block_json "[DelegationFallback] This turn explicitly requested bounded delegation, but no SubagentStart event was observed. Continue the task now by spawning the independent explorer/reviewer or isolated worker workstreams first when at least two independent workstreams exist, wait for them, reconcile their findings in the parent, then complete the response. Do not spawn for a trivial or strictly sequential task.$(minimal_change_reason_suffix)"
fi
