#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  if [[ "$REPO_HARNESS_TARGET_REPO_ROOT" != /* ]]; then
    echo "sprint-backlog: REPO_HARNESS_TARGET_REPO_ROOT must be an absolute path" >&2
    exit 2
  fi
  if ! REPO_ROOT="$(cd "$REPO_HARNESS_TARGET_REPO_ROOT" 2>/dev/null && pwd -P)"; then
    echo "sprint-backlog: REPO_HARNESS_TARGET_REPO_ROOT does not resolve to a directory" >&2
    exit 2
  fi
  CURRENT_ROOT="$(pwd -P)"
  if [[ "$REPO_ROOT" != "$CURRENT_ROOT" ]]; then
    echo "sprint-backlog: REPO_HARNESS_TARGET_REPO_ROOT must match the current helper cwd" >&2
    exit 2
  fi
  cd "$REPO_ROOT"
elif REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
else
  cd "$SCRIPT_DIR/.."
fi
helper_source="$0"
if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$REPO_HARNESS_HELPER_SOURCE_PATH" \
      && "$(basename "$REPO_HARNESS_HELPER_SOURCE_PATH")" == "$(basename "$0")" ]]; then
  helper_source="$REPO_HARNESS_HELPER_SOURCE_PATH"
fi
helper_dir="$(cd "$(dirname "$helper_source")" && pwd)"

usage() {
  cat <<'USAGE_EOF'
Usage:
  repo-harness run sprint-backlog init --slug <slug> [--title <title>]
  repo-harness run sprint-backlog status
  repo-harness run sprint-backlog next
  repo-harness run sprint-backlog start-task --task <index|task> [--execute] [--sprint <file>]
  repo-harness run sprint-backlog complete-task --task <index|task> [--plan <plan-file>] [--sprint <file>] [--defer-lease-release]

Program-level sprint backlog helper. PRDs live in plans/prds/ as the upper
planning layer; sprints live in plans/sprints/ as ordered execution backlogs.
Contract backlog rows are expanded with $think before the existing plan ->
contract -> worktree flow. Inline rows stay in the sprint backlog or active
plan Task Breakdown. tasks/todos.md stays the deferred-goal ledger.

start-task claims the named pending backlog row on the shared coordination
plane before any capture runs. --task is required: preventing duplicate claims
is not the same as proving two rows are safe to run in parallel, and the
backlog carries no dependency or parallel-safety column, so there is no
automatic claim-next. Contract rows can capture a thin plan seed. Inline rows
should not create plan/contract/review artifacts.
--sprint overrides the active-sprint marker (still confined to the sprints
dir), which finish back-fill uses inside worktrees where the runtime marker
is absent.
--defer-lease-release leaves the lease alone: contract finish releases it after
the publication commit lands, so complete-task must not release it while
building the publication tree.

Exit codes: 0 success; 1 error; 2 usage error; 3 no pending backlog task (next/start-task).
USAGE_EOF
}

policy_file=".ai/harness/policy.json"

policy_get() {
  local jq_path="$1"
  local default_value="$2"

  if [[ -f "$policy_file" ]] && command -v jq >/dev/null 2>&1; then
    local value
    value="$(jq -r "$jq_path // empty" "$policy_file" 2>/dev/null || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

sprints_dir="$(policy_get '.sprints.dir' 'plans/sprints')"
marker_file="$(policy_get '.sprints.active_marker_file' '.ai/harness/sprint/active-sprint')"
template_file="$(policy_get '.sprints.template_file' '.claude/templates/sprint.template.md')"

normalize_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

# Trim without xargs: xargs chokes on unbalanced quotes in user-edited text.
trim() {
  sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

extract_status() {
  local file="$1"
  awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$file" | trim
}

# Explicit sprint override (--sprint) for callers running where the runtime
# marker does not exist, e.g. finish back-fill inside a contract worktree.
sprint_override=""

sprint_file_under_sprints_dir() {
  local sprint_file="$1"
  local sprints_real sprint_dir_real

  case "$sprint_file" in
    "$sprints_dir"/*) ;;
    *) return 1 ;;
  esac
  case "$sprint_file" in
    *..*) return 1 ;;
  esac
  [[ -f "$sprint_file" ]] || return 1
  [[ ! -L "$sprint_file" ]] || return 1

  sprints_real="$(cd -P "$sprints_dir" 2>/dev/null && pwd)" || return 1
  sprint_dir_real="$(cd -P "$(dirname "$sprint_file")" 2>/dev/null && pwd)" || return 1
  case "$sprint_dir_real" in
    "$sprints_real"|"$sprints_real"/*) ;;
    *) return 1 ;;
  esac
}

active_sprint_file() {
  local sprint_file
  if [[ -n "$sprint_override" ]]; then
    sprint_file="$sprint_override"
  else
    [[ -f "$marker_file" ]] || return 1
    sprint_file="$(trim < "$marker_file" 2>/dev/null)"
  fi
  [[ -n "$sprint_file" ]] || return 1
  # Containment: the marker is repo-controlled, but complete-task rewrites the
  # file it points at, so never follow it outside the sprints dir.
  sprint_file_under_sprints_dir "$sprint_file" || return 1
  printf '%s' "$sprint_file"
}

require_active_sprint() {
  local sprint_file
  if ! sprint_file="$(active_sprint_file)"; then
    if [[ -n "$sprint_override" ]]; then
      echo "sprint-backlog: --sprint does not resolve to a sprint file under ${sprints_dir}: $sprint_override" >&2
    else
      echo "sprint-backlog: no active sprint (marker: $marker_file)" >&2
    fi
    exit 1
  fi
  printf '%s' "$sprint_file"
}

# The shared coordination plane, rooted at the git common directory so every
# linked worktree of one clone addresses the same locks and leases. A
# repo-relative path resolves inside each worktree instead, which is exactly
# why the retired `.backlog-lock` and in-flight markers serialized nothing
# across agents.
coordination_root() {
  local common_dir
  common_dir="$(git rev-parse --git-common-dir 2>/dev/null)" || return 1
  common_dir="$(cd "$common_dir" 2>/dev/null && pwd -P)" || return 1
  printf '%s/repo-harness/coordination/v1' "$common_dir"
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

now_ms() {
  if command -v node >/dev/null 2>&1; then
    node -e 'process.stdout.write(String(Date.now()))'
  elif command -v bun >/dev/null 2>&1; then
    bun -e 'process.stdout.write(String(Date.now()))'
  else
    printf '%s000' "$(date +%s)"
  fi
}

# Coordination wait metrics sink. Rooted at the primary worktree (the parent of
# the git common directory) for the same reason `coordination_root` is: one
# clone must own one ledger, and a per-worktree path would scatter the records
# across linked worktrees -- and would not survive the worktree cleanup that
# `contract-worktree finish` runs on its own success path.
coordination_waits_file() {
  local common_dir
  common_dir="$(git rev-parse --git-common-dir 2>/dev/null)" || return 1
  common_dir="$(cd "$common_dir" 2>/dev/null && pwd -P)" || return 1
  printf '%s/.ai/harness/runs/coordination/waits.jsonl' "$(dirname "$common_dir")"
}

# Append-only, single-line, no lock file: the same idiom the workstream-sync
# event log uses. Interleaved writes from concurrent agents are the accepted
# tradeoff; a torn record loses one measurement, never a host command. Every
# failure path returns 0 so instrumentation can never change an exit status.
coordination_wait_emit() {
  local record="$1" file
  file="$(coordination_waits_file 2>/dev/null)" || return 0
  [[ -n "$file" ]] || return 0
  mkdir -p "$(dirname "$file")" 2>/dev/null || return 0
  printf '%s\n' "$record" >> "$file" 2>/dev/null || return 0
  return 0
}

# Serialize read-modify-write mutations: two concurrent complete-task or
# start-task calls would otherwise both render from the same snapshot and the
# second mv would drop the first writer's update.
BACKLOG_LOCK_DIR=""

release_backlog_lock() {
  if [[ -n "$BACKLOG_LOCK_DIR" ]]; then
    rmdir "$BACKLOG_LOCK_DIR" 2>/dev/null || true
    BACKLOG_LOCK_DIR=""
  fi
}

emit_backlog_lock_wait() {
  local verb="$1" started_ms="$2" attempts="$3" reclaimed_stale="$4" outcome="$5"
  local ended_ms
  # A polluted `now_ms` stdout (a bare word instead of a millisecond timestamp)
  # makes the elapsed arithmetic fail under `set -u`, which a trailing `|| true`
  # cannot catch. Measurement is best effort: drop the record rather than the
  # host command. No fallback timestamp is synthesized.
  ended_ms="$(now_ms || true)"
  [[ "$ended_ms" =~ ^[0-9]+$ && "$started_ms" =~ ^[0-9]+$ ]] || return 0
  coordination_wait_emit "{\"protocol\":1,\"kind\":\"backlog_lock_wait\",\"at\":\"$(json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")\",\"verb\":\"$(json_escape "$verb")\",\"ms\":$((ended_ms - started_ms)),\"attempts\":${attempts},\"reclaimed_stale\":${reclaimed_stale},\"outcome\":\"$(json_escape "$outcome")\"}" || true
}

acquire_backlog_lock() {
  local verb="${1:-unknown}"
  local attempts=0
  local reclaimed_stale=false
  local started_ms
  # The opening sample is measurement-only, and a polluted `now_ms` stdout must
  # not abort lock acquisition. An unusable sample is cleared here so the
  # emit-site numeric guard drops the record instead of the host command.
  started_ms="$(now_ms || true)"
  [[ "$started_ms" =~ ^[0-9]+$ ]] || started_ms=""
  local coordination_dir
  local max_attempts="${REPO_HARNESS_BACKLOG_LOCK_ATTEMPTS:-100}"
  local sleep_seconds="${REPO_HARNESS_BACKLOG_LOCK_SLEEP_SECONDS:-0.1}"
  case "$max_attempts" in
    ''|*[!0-9]*) max_attempts=100 ;;
  esac
  [[ "$sleep_seconds" =~ ^[0-9]+([.][0-9]+)?$ ]] || sleep_seconds=0.1
  if ! coordination_dir="$(coordination_root)"; then
    echo "sprint-backlog: not inside a git repository; the shared backlog lock is unavailable" >&2
    exit 1
  fi
  BACKLOG_LOCK_DIR="$coordination_dir/locks/backlog.lock"
  mkdir -p "$(dirname "$BACKLOG_LOCK_DIR")"
  until mkdir "$BACKLOG_LOCK_DIR" 2>/dev/null; do
    # Reclaim only when the stale dir actually goes away; a non-empty lock dir
    # must fall through to the timeout instead of hot-looping.
    if [[ -n "$(find "$BACKLOG_LOCK_DIR" -maxdepth 0 -mmin +1 2>/dev/null)" ]] \
      && rmdir "$BACKLOG_LOCK_DIR" 2>/dev/null; then
      echo "sprint-backlog: reclaiming stale backlog lock: $BACKLOG_LOCK_DIR" >&2
      reclaimed_stale=true
      continue
    fi
    attempts=$((attempts + 1))
    if [[ "$attempts" -ge "$max_attempts" ]]; then
      echo "sprint-backlog: timed out acquiring backlog lock: $BACKLOG_LOCK_DIR" >&2
      emit_backlog_lock_wait "$verb" "$started_ms" "$attempts" "$reclaimed_stale" timeout
      exit 1
    fi
    sleep "$sleep_seconds"
  done
  trap release_backlog_lock EXIT INT TERM
  # After the trap, never before: the emission spawns a node process for
  # `now_ms`, and doing that while the lock dir exists but the release trap is
  # unarmed would widen the leak window by one spawn. The `ms` bracket still
  # ends at acquisition (`started_ms` is read from before the loop).
  emit_backlog_lock_wait "$verb" "$started_ms" "$attempts" "$reclaimed_stale" acquired
}

# Backlog rows live between '## Backlog' and the next '## ' heading. The row
# shape depends on the schema declared in the sprint header:
#
#   schema 1 (no '> **Backlog Schema**:' marker):
#     | 1 | [ ] | task-slug | contract | acceptance | plan |
#   schema 2 ('> **Backlog Schema**: 2'):
#     | 1 | <64-hex id> | [ ] | task-slug | contract | acceptance | plan |
#
# Output is one fixed shape for both, so every existing field reference keeps
# its position and the persisted id is appended last:
#   index<TAB>status<TAB>task<TAB>mode<TAB>acceptance<TAB>plan<TAB>id
# The id field is empty on schema 1, where the column does not exist. The marker
# is only honoured before '## Backlog'; src/core/state/sprint-backlog-rows.ts
# reads it the same way and tests/sprint-backlog-grammar-drift.test.ts binds the
# two together.
backlog_rows() {
  local file="$1"
  awk -F '|' '
    !in_section && /^>[[:space:]]*\*\*Backlog Schema\*\*:/ {
      declared = $0
      sub(/^>[[:space:]]*\*\*Backlog Schema\*\*:[[:space:]]*/, "", declared)
      gsub(/[[:space:]]+$/, "", declared)
      declarations++
      if (declarations > 1) {
        printf "sprint-backlog: backlog schema is declared %d times; exactly one declaration is allowed\n", declarations > "/dev/stderr"
        exit 1
      }
      if (declared == "2") {
        schema = 2
      } else {
        printf "sprint-backlog: unsupported backlog schema: %s\n", declared > "/dev/stderr"
        exit 1
      }
      next
    }
    /^## Backlog[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    !in_section { next }
    /^\|[[:space:]]*[0-9]+[[:space:]]*\|/ {
      last = (schema == 2) ? 8 : 7
      for (i = 2; i <= last; i++) {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $i)
      }
      if (schema == 2) {
        printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n", $2, $4, $5, $6, $7, $8, $3
      } else {
        printf "%s\t%s\t%s\t%s\t%s\t%s\t\n", $2, $3, $4, $5, $6, $7
      }
    }
  ' "$file"
}

# The declared backlog schema of one sprint file: 1 or 2. Fails closed on any
# other declared value, matching sprintBacklogSchema() in TypeScript.
backlog_schema() {
  local file="$1"
  awk '
    /^## Backlog[[:space:]]*$/ { exit }
    /^>[[:space:]]*\*\*Backlog Schema\*\*:/ {
      declared = $0
      sub(/^>[[:space:]]*\*\*Backlog Schema\*\*:[[:space:]]*/, "", declared)
      gsub(/[[:space:]]+$/, "", declared)
      declarations++
      if (declarations > 1) {
        printf "sprint-backlog: backlog schema is declared %d times; exactly one declaration is allowed\n", declarations > "/dev/stderr"
        bad = 1
        exit 1
      }
      if (declared == "2") { found = 2; next }
      printf "sprint-backlog: unsupported backlog schema: %s\n", declared > "/dev/stderr"
      bad = 1
      exit 1
    }
    END { if (!bad) print (found == 2) ? 2 : 1 }
  ' "$file"
}

backlog_counts() {
  local file="$1"
  backlog_rows "$file" | awk -F '\t' '
    { total++ }
    $2 ~ /^\[[xX]\]$/ { done++ }
    END { printf "%d %d\n", done + 0, total + 0 }
  '
}

next_pending_row() {
  local file="$1"
  backlog_rows "$file" | awk -F '\t' '$2 == "[ ]" { print; exit }'
}

# Mint one persisted task id: 32 random bytes rendered as lowercase hex. A task
# id is never derived from the Task text, the slug, or the row index -- deriving
# it from any of those is exactly the identity coupling schema 2 removes. Random
# also keeps ids unique across sprints, which matters because the coordination
# lease directory is keyed by task id alone.
mint_task_id() {
  local id
  id="$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')"
  if [[ ! "$id" =~ ^[0-9a-f]{64}$ ]]; then
    echo "sprint-backlog: could not mint a task id from /dev/urandom" >&2
    exit 1
  fi
  printf '%s' "$id"
}

render_sprint_file() {
  local target="$1"
  local slug="$2"
  local title="$3"
  local timestamp="$4"

  if [[ ! -f "$template_file" ]]; then
    mkdir -p "$(dirname "$template_file")"
    cat > "$template_file" <<'SPRINT_TEMPLATE_EOF'
# Sprint: {{SPRINT_TITLE}}

> **Status**: Draft
> **Slug**: {{SPRINT_SLUG}}
> **Created**: {{TIMESTAMP}}
> **Updated**: {{TIMESTAMP}}
> **Source PRD**: (optional) `plans/prds/<prd>.prd.md`
> **Source Spec**: `docs/spec.md`
> **Backlog Schema**: 2
> **Goal Mode**: incremental

Program-level sprint container. The Source PRD summary and ordered backlog
decompose product intent into ordered rows. Contract rows become task-contract
slices after `$think` expansion; inline rows stay in the sprint backlog or
active plan Task Breakdown.
`tasks/todos.md` stays the deferred-goal ledger and never carries this backlog.

## PRD

Summarize or link the upper-layer PRD here. Keep the full PRD in `plans/prds/`.

### Problem

- ...

### Users

- ...

### Success Criteria

- ...

### Acceptance Scenarios

- ...

### Non-goals

- ...

## Architecture Notes

### Capabilities Touched

- ...

### Dependency Order

- ...

### Risks

- ...

## Backlog

Ordered execution queue; keep rows in dependency order. Mode `contract` runs
the full plan -> contract -> worktree flow; `inline` allows primary-tree
execution for small tasks. Every row needs a concrete acceptance line.

The `ID` cell is the persisted, immutable task identity (64 lowercase hex
characters). It is minted once when the row is created and must never be edited,
copied between rows, or regenerated: editing the Task text is a rename, not a new
task.

| # | ID | Status | Task | Mode | Acceptance | Plan |
|---|----|--------|------|------|------------|------|
| 1 | {{TASK_ID_1}} | [ ] | {{SPRINT_SLUG}}-task-1 | contract | Replace with a machine-checkable acceptance line | (pending) |

## Execution Log

Keep this section last; `repo-harness run sprint-backlog complete-task` appends rows here.

| When | Task | Plan | Result |
|------|------|------|--------|
SPRINT_TEMPLATE_EOF
  fi

  # Literal placeholder replacement via index/substr: sed/gsub replacement
  # strings treat |, &, \ and newlines as metacharacters, so free-text titles
  # must never reach them. Render to a temp file so a failure cannot leave a
  # half-written sprint file behind.
  local tmp_file task_id_1
  tmp_file="$(mktemp)"
  task_id_1="$(mint_task_id)"
  if ! SPRINT_SLUG="$slug" SPRINT_TITLE="$title" SPRINT_TS="$timestamp" TASK_ID_1="$task_id_1" awk '
    function replace_all(line, ph, val,    out, i) {
      out = ""
      while ((i = index(line, ph)) > 0) {
        out = out substr(line, 1, i - 1) val
        line = substr(line, i + length(ph))
      }
      return out line
    }
    {
      line = $0
      line = replace_all(line, "{{SPRINT_SLUG}}", ENVIRON["SPRINT_SLUG"])
      line = replace_all(line, "{{SPRINT_TITLE}}", ENVIRON["SPRINT_TITLE"])
      line = replace_all(line, "{{TIMESTAMP}}", ENVIRON["SPRINT_TS"])
      line = replace_all(line, "{{TASK_ID_1}}", ENVIRON["TASK_ID_1"])
      print line
    }
  ' "$template_file" > "$tmp_file"; then
    rm -f "$tmp_file"
    echo "sprint-backlog: failed to render sprint template" >&2
    exit 1
  fi
  mv "$tmp_file" "$target"
}

cmd_init() {
  local slug=""
  local title=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --slug)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --slug requires a value" >&2; exit 2; }
        slug="$2"
        shift 2
        ;;
      --title)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --title requires a value" >&2; exit 2; }
        title="$2"
        shift 2
        ;;
      *)
        echo "sprint-backlog: unknown init argument: $1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done

  [[ -n "$slug" ]] || { echo "sprint-backlog: init requires --slug" >&2; usage >&2; exit 2; }
  slug="$(normalize_slug "$slug")"
  [[ -n "$slug" ]] || { echo "sprint-backlog: slug is empty after normalization" >&2; exit 2; }
  [[ -n "$title" ]] || title="$slug"
  # Headings are single-line; fold control characters out of free-text titles.
  title="$(printf '%s' "$title" | tr '\n\r\t' '   ')"

  local existing existing_status
  if existing="$(active_sprint_file)"; then
    existing_status="$(extract_status "$existing")"
    case "$existing_status" in
      Done|Archived)
        ;;
      *)
        echo "sprint-backlog: active sprint already exists with status ${existing_status:-unknown}: $existing" >&2
        echo "sprint-backlog: complete or archive it before starting a new sprint" >&2
        exit 1
        ;;
    esac
  fi

  mkdir -p "$sprints_dir" "$(dirname "$marker_file")"

  local timestamp file_stamp sprint_file counter
  timestamp="$(date '+%Y-%m-%d %H:%M')"
  file_stamp="$(date +%Y%m%d-%H%M)"
  sprint_file="${sprints_dir}/${file_stamp}-${slug}.sprint.md"
  counter=2
  while [[ -e "$sprint_file" ]]; do
    sprint_file="${sprints_dir}/${file_stamp}-${slug}-v${counter}.sprint.md"
    counter=$((counter + 1))
  done

  render_sprint_file "$sprint_file" "$slug" "$title" "$timestamp"
  printf '%s' "$sprint_file" > "$marker_file"

  echo "Created draft sprint: $sprint_file"
  echo "Active sprint marker: $marker_file"
  echo "Fill PRD, Architecture Notes, and Backlog, then set Status to Approved before execution."
}

cmd_status() {
  local sprint_file status done total next_task
  if ! sprint_file="$(active_sprint_file)"; then
    echo "sprint: (none)"
    return 0
  fi

  status="$(extract_status "$sprint_file")"
  read -r done total <<<"$(backlog_counts "$sprint_file")"
  next_task="$(next_pending_row "$sprint_file" | awk -F '\t' '{ print $3 }')"

  echo "sprint: $sprint_file"
  echo "status: ${status:-unknown}"
  echo "tasks_done: $done"
  echo "tasks_total: $total"
  echo "next_task: ${next_task:-(none)}"
}

cmd_next() {
  local sprint_file row
  sprint_file="$(require_active_sprint)"
  row="$(next_pending_row "$sprint_file")"
  if [[ -z "$row" ]]; then
    echo "next_task: (none)"
    exit 3
  fi

  printf '%s\n' "$row" | awk -F '\t' '{
    printf "index: %s\ntask: %s\nmode: %s\nacceptance: %s\nplan: %s\n", $1, $3, $4, $5, $6
  }'
}

cmd_complete_task() {
  local task_ref=""
  local plan_file=""
  local defer_lease_release=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --defer-lease-release)
        defer_lease_release=1
        shift
        ;;
      --task)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --task requires a value" >&2; exit 2; }
        task_ref="$2"
        shift 2
        ;;
      --plan)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --plan requires a value" >&2; exit 2; }
        plan_file="$2"
        shift 2
        ;;
      --sprint)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --sprint requires a value" >&2; exit 2; }
        sprint_override="$2"
        shift 2
        ;;
      *)
        echo "sprint-backlog: unknown complete-task argument: $1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done

  [[ -n "$task_ref" ]] || { echo "sprint-backlog: complete-task requires --task" >&2; usage >&2; exit 2; }

  local sprint_file target_row target_index target_status target_task target_plan plan_cell match_count
  sprint_file="$(require_active_sprint)"
  acquire_backlog_lock complete-task

  # task_ref travels via ENVIRON (awk -v reprocesses backslash escapes).
  match_count="$(backlog_rows "$sprint_file" | TASK_REF="$task_ref" awk -F '\t' '$1 == ENVIRON["TASK_REF"] || $3 == ENVIRON["TASK_REF"] { count++ } END { print count + 0 }')"
  if [[ "$match_count" -eq 0 ]]; then
    echo "sprint-backlog: no backlog row matches task '$task_ref' in $sprint_file" >&2
    exit 1
  fi
  if [[ "$match_count" -gt 1 ]]; then
    echo "sprint-backlog: task reference '$task_ref' is ambiguous (${match_count} backlog rows match); fix duplicate indices or task names first" >&2
    exit 1
  fi

  target_row="$(backlog_rows "$sprint_file" | TASK_REF="$task_ref" awk -F '\t' '$1 == ENVIRON["TASK_REF"] || $3 == ENVIRON["TASK_REF"] { print; exit }')"

  target_index="$(printf '%s' "$target_row" | cut -f1)"
  target_status="$(printf '%s' "$target_row" | cut -f2)"
  target_task="$(printf '%s' "$target_row" | cut -f3)"
  target_plan="$(printf '%s' "$target_row" | cut -f6)"

  if [[ "$target_status" != "[ ]" ]]; then
    echo "sprint-backlog: backlog task '$target_task' (row $target_index) is already complete" >&2
    exit 1
  fi

  # Before the rewrite, never after: flipping the row to [x] is the step that
  # publishes "this task is done", so it is the step the shared lease has to
  # gate. Inside the backlog lock the caller already holds.
  assert_completion_lease_gate "$sprint_file" "$target_task"

  plan_cell="$target_plan"
  if [[ -n "$plan_file" ]]; then
    plan_cell="\`${plan_file}\`"
  fi

  local timestamp tmp_file
  timestamp="$(date '+%Y-%m-%d %H:%M')"
  tmp_file="$(mktemp)"
  # plan_cell and target_task travel via ENVIRON: awk -v reprocesses C
  # escapes, so a backslash in either would split or mismatch the table row.
  # The rewrite matches index AND task so a duplicate index can never flip a
  # different row than the one resolved above.
  local schema
  schema="$(backlog_schema "$sprint_file")"
  if ! PLAN_CELL="$plan_cell" TARGET_TASK="$target_task" awk -F '|' -v target="$target_index" -v ts="$timestamp" -v schema="$schema" '
    BEGIN { in_section = 0; rewritten = 0; off = (schema == 2) ? 1 : 0 }
    /^> \*\*Updated\*\*:/ {
      print "> **Updated**: " ts
      next
    }
    /^## Backlog[[:space:]]*$/ { in_section = 1; print; next }
    in_section && /^## / { in_section = 0 }
    {
      if (in_section && !rewritten && $0 ~ /^\|[[:space:]]*[0-9]+[[:space:]]*\|/) {
        idx = $2; id = (schema == 2) ? $3 : ""
        task = $(4 + off); mode = $(5 + off); acceptance = $(6 + off)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", idx)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", id)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", task)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", mode)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", acceptance)
        if (idx == target && task == ENVIRON["TARGET_TASK"]) {
          if (schema == 2) {
            printf "| %s | %s | [x] | %s | %s | %s | %s |\n", idx, id, task, mode, acceptance, ENVIRON["PLAN_CELL"]
          } else {
            printf "| %s | [x] | %s | %s | %s | %s |\n", idx, task, mode, acceptance, ENVIRON["PLAN_CELL"]
          }
          rewritten = 1
          next
        }
      }
      print
    }
    END { exit rewritten ? 0 : 1 }
  ' "$sprint_file" > "$tmp_file"; then
    rm -f "$tmp_file"
    echo "sprint-backlog: failed to rewrite backlog row (row not rewritten; check the table for malformed cells)" >&2
    exit 1
  fi
  mv "$tmp_file" "$sprint_file"

  if ! grep -Eq '^## Execution Log[[:space:]]*$' "$sprint_file"; then
    {
      echo
      echo "## Execution Log"
      echo
      echo "| When | Task | Plan | Result |"
      echo "|------|------|------|--------|"
    } >> "$sprint_file"
  fi
  printf '| %s | %s | %s | done |\n' "$timestamp" "$target_task" "${plan_cell:-(none)}" >> "$sprint_file"

  # Same critical section as the row rewrite: the backlog lock is still held
  # (released by the EXIT trap), so completion and release are one transaction
  # for an inline task. Contract finish passes --defer-lease-release because its
  # transaction boundary is the publication commit, not this rewrite.
  if [[ "$defer_lease_release" -eq 0 ]]; then
    release_task_lease "$sprint_file" "$target_task"
  fi

  local done total
  read -r done total <<<"$(backlog_counts "$sprint_file")"
  echo "Completed backlog task '$target_task' (row $target_index) in $sprint_file"
  echo "Backlog progress: ${done}/${total}"
  if [[ "$done" -eq "$total" ]]; then
    echo "All backlog tasks complete. Set the sprint Status to Done after review."
  fi
}

# --- shared lease plane ------------------------------------------------------
# Execution ownership lives in the common-dir lease record, never here. The
# retired per-worktree in-flight markers were invisible to sibling worktrees
# and keyed by normalize_slug(), which collapses "Fix auth bug" and
# "Fix auth-bug" into one key -- harmless for a local marker and fatal for a
# shared lease. They are deleted, not translated: mapping a legacy marker to a
# canonical task needs the very identity derivation this protocol introduces,
# and install/upgrade refuses to proceed while any legacy marker survives.

SPRINT_CLI_RESOLVED=0
SPRINT_CLI_CMD=()

# The CLI owns every digest and every lease mutation. Re-deriving task_id or
# task_revision in awk here would be a second implementation of the identity
# contract, so the shell only ever passes values the CLI handed it back.
resolve_sprint_cli() {
  [[ "$SPRINT_CLI_RESOLVED" -eq 0 ]] || return 0
  if [[ -n "${REPO_HARNESS_CLI_BIN:-}" ]]; then
    if [[ "$REPO_HARNESS_CLI_BIN" != /* || ! -x "$REPO_HARNESS_CLI_BIN" ]]; then
      echo "sprint-backlog: REPO_HARNESS_CLI_BIN is not an executable absolute path: $REPO_HARNESS_CLI_BIN" >&2
      exit 1
    fi
    SPRINT_CLI_CMD=("$REPO_HARNESS_CLI_BIN")
  elif command -v repo-harness >/dev/null 2>&1; then
    SPRINT_CLI_CMD=(repo-harness)
  elif [[ -f "src/cli/index.ts" ]] && command -v bun >/dev/null 2>&1; then
    SPRINT_CLI_CMD=(bun "src/cli/index.ts")
  else
    echo "sprint-backlog: the repo-harness CLI is unavailable; sprint leases cannot be reached" >&2
    exit 1
  fi
  SPRINT_CLI_RESOLVED=1
}

sprint_lease() {
  resolve_sprint_cli
  "${SPRINT_CLI_CMD[@]}" sprint "$@"
}

# The verbs emit one JSON object per line-per-field, so a field read is exact
# rather than a general JSON parse the shell has no business attempting.
json_string_field() {
  printf '%s\n' "$1" | sed -nE "s/^[[:space:]]*\"$2\": \"([^\"]*)\",?[[:space:]]*\$/\1/p" | head -1
}

coordination_target_ref() {
  policy_get '.worktree_strategy.merge_back.target' 'main'
}

coordination_session_id() {
  printf '%s' "${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-session-$$}}}"
}

# The fencing token this tree holds. The lease record is the authority; this
# file is only the capability proving that this tree, and not a tree the claim
# was stolen from, may still act on it.
claim_token_dir() {
  printf '%s/claims' "$(dirname "$marker_file")"
}

claim_token_field() {
  sed -n "s/^$2=//p" "$1" | head -1
}

write_claim_token() {
  local tree="$1" task_id="$2" claim_id="$3" sprint_path="$4" task_cell="$5" unit_ref="$6" output
  # Token bytes are a worktree-local capability, but their publication must
  # still prove the shared lease's exact bound owner under the task lock. The
  # CLI is the one writer; a shell redirect here would reopen a stale-token
  # TOCTOU between bind and the hook projection.
  if ! output="$(sprint_lease write-claim-token \
    --task-id "$task_id" \
    --claim-id "$claim_id" \
    --worktree "$tree" \
    --sprint-path "$sprint_path" \
    --task "$task_cell" \
    --unit-ref "$unit_ref" 2>&1)"; then
    printf '%s\n' "$output" >&2
    echo "sprint-backlog: could not write the lock-checked claim token for '${task_cell}'" >&2
    return 1
  fi
}

# 0 with the token path on stdout, 1 when this tree holds none, 2 when the
# token on disk does not carry the identity its own filename claims.
#
# The lookup is by identity, not by display text: the CLI names the token file
# `<task_id>.claim` and writes `task_id` inside it, so one `[[ -f ]]` answers
# the question exactly. It used to scan every token and match the `sprint` and
# `task` fields against the Task cell, which meant a renamed row reported "this
# tree holds no token" -- the tree that really owned the row was refused, and
# the release that follows completion silently released nothing. That is the
# identity-from-display-text defect this contract removes, and it was still
# alive here after the TypeScript side moved.
find_claim_token() {
  local task_id="$1" dir token
  if [[ ! "$task_id" =~ ^[0-9a-f]{64}$ ]]; then
    echo "sprint-backlog: refusing to resolve a claim token for a malformed task id: $task_id" >&2
    return 2
  fi
  dir="$(claim_token_dir)"
  [[ -d "$dir" ]] || return 1
  token="$dir/$task_id.claim"
  [[ -f "$token" && ! -L "$token" ]] || return 1
  if [[ "$(claim_token_field "$token" task_id)" != "$task_id" ]]; then
    echo "sprint-backlog: claim token $token does not carry task id $task_id" >&2
    return 2
  fi
  printf '%s' "$token"
}

# The identity the completion gate resolved for the row being completed, so the
# release that follows does not read canonical a second time. Empty when the
# gate returned before resolving one (no lease store, or no lease for the row).
COMPLETION_TASK_ID=""

# Resolve one backlog row's persisted task id through the CLI, which owns every
# identity read. Prints the id on stdout.
resolve_row_task_id() {
  local sprint_path="$1" task_cell="$2" identity task_id
  if ! identity="$(sprint_lease identify --task "$task_cell" --target-ref "$(coordination_target_ref)" --sprint-path "$sprint_path" 2>&1)"; then
    printf '%s\n' "$identity" >&2
    echo "sprint-backlog: cannot resolve the coordination identity of '$task_cell'" >&2
    return 1
  fi
  task_id="$(json_string_field "$identity" task_id)"
  if [[ -z "$task_id" ]]; then
    echo "sprint-backlog: sprint identify returned no task id for '$task_cell'" >&2
    return 1
  fi
  printf '%s' "$task_id"
}

# Read one field of a common-dir owner record. The record is written by the
# CLI as two-space-indented JSON with one field per line, which is the same
# shape `closeout_journal_field` reads in contract-worktree.sh. The CLI stays
# the only authority on the record; this reports which claim owns it so a
# refusal can name it.
lease_owner_field() {
  local file="$1" name="$2"
  [[ -f "$file" && ! -L "$file" ]] || return 1
  sed -n "s/^  \"${name}\": \"\(.*\)\",\{0,1\}\$/\1/p" "$file" | head -1
}

# The inline completion gate.
#
# Execution ownership lives in the shared lease, so a tree without the owning
# fencing token may not flip a claimed row to [x] -- the exact false-completion
# this protocol exists to close. Three shapes, and the reason each is what it is:
#
# - no lease store on this clone: its absence is the authority for "nothing
#   owns anything here", so the zero-coordination single-agent flow completes
#   exactly as before, without deriving an identity or reading a canonical ref;
# - a lease store with no lease for this row: nothing owns the row, proceed;
# - a lease for this row: this tree must hold a claim token carrying the same
#   claim id the owner record does. A stolen-from tree keeps its old token and
#   therefore fails the comparison, which is the point.
#
# Anything the CLI would classify `unknown` -- a symlinked lease, a missing or
# unreadable owner record -- refuses and names `sprint reconcile`, because an
# unclassifiable lease cannot prove the row is unowned.
assert_completion_lease_gate() {
  local sprint_path="$1" task_cell="$2"
  local coordination_dir leases_root entry identity task_id lease_dir owner_file
  local owner_claim token token_claim found status
  local canonical_revision owner_revision

  if ! coordination_dir="$(coordination_root)"; then
    echo "sprint-backlog: not inside a git repository; the shared lease cannot be read" >&2
    exit 1
  fi
  leases_root="$coordination_dir/leases"
  [[ -d "$leases_root" ]] || return 0
  found=0
  for entry in "$leases_root"/*; do
    if [[ -e "$entry" || -L "$entry" ]]; then
      found=1
      break
    fi
  done
  [[ "$found" -eq 1 ]] || return 0

  # The CLI owns every digest: re-deriving task_id here would be a second
  # implementation of the identity contract.
  if ! identity="$(sprint_lease identify --task "$task_cell" --target-ref "$(coordination_target_ref)" --sprint-path "$sprint_path" 2>&1)"; then
    printf '%s\n' "$identity" >&2
    echo "sprint-backlog: cannot derive the coordination identity of '$task_cell'; leases are live on this clone, so the row cannot be completed unverified" >&2
    exit 1
  fi
  task_id="$(json_string_field "$identity" task_id)"
  if [[ -z "$task_id" ]]; then
    echo "sprint-backlog: sprint identify returned no task id for '$task_cell'" >&2
    exit 1
  fi
  COMPLETION_TASK_ID="$task_id"

  lease_dir="$leases_root/$task_id"
  [[ -e "$lease_dir" || -L "$lease_dir" ]] || return 0
  if [[ ! -d "$lease_dir" || -L "$lease_dir" ]]; then
    echo "sprint-backlog: the lease for '$task_cell' is not a lease directory ($lease_dir); run 'repo-harness sprint reconcile --task-id $task_id --target-ref <branch>' before completing it" >&2
    exit 1
  fi

  owner_file="$lease_dir/owner.json"
  owner_claim="$(lease_owner_field "$owner_file" claim_id || true)"
  if [[ -z "$owner_claim" ]]; then
    echo "sprint-backlog: the lease for '$task_cell' has no readable owner record ($lease_dir); run 'repo-harness sprint reconcile --task-id $task_id --target-ref <branch>' before completing it" >&2
    exit 1
  fi

  set +e
  token="$(find_claim_token "$task_id")"
  status=$?
  set -e
  case "$status" in
    0) ;;
    1)
      echo "sprint-backlog: backlog task '$task_cell' is claimed by ${owner_claim} and this worktree holds no claim token for it; complete it from the owning worktree, or take the claim over with 'repo-harness sprint steal --expected-claim-id ${owner_claim} --reason <reason> --session-id <id>'" >&2
      exit 1
      ;;
    *) exit 1 ;;
  esac

  token_claim="$(claim_token_field "$token" claim_id)"
  if [[ "$token_claim" != "$owner_claim" ]]; then
    echo "sprint-backlog: backlog task '$task_cell' is claimed by ${owner_claim}, but this worktree holds claim ${token_claim:-(none)}; the claim moved, so this tree may not complete the row" >&2
    exit 1
  fi

  # The revision fence, and why ownership alone is not enough.
  #
  # Identity survives a Task title edit -- that is the point of the persisted ID
  # column, and it is why the token above was still found. What does not survive
  # is the *definition*: `task_revision` hashes the Task, Mode and Acceptance
  # cells, so a lease taken before the edit was taken against a row that no
  # longer exists. Completing on it would publish "done" for work nobody agreed
  # to. The contract path already refuses this inside the per-task lock in
  # `sprint begin-completion` ("drifted since it was claimed"); the inline path
  # reaches the same conclusion from the two values the CLI already produced --
  # `sprint identify` reads the canonical revision, and the owner record carries
  # the one the claim observed -- rather than re-deriving either of them here.
  canonical_revision="$(json_string_field "$identity" task_revision)"
  owner_revision="$(lease_owner_field "$owner_file" task_revision || true)"
  if [[ -z "$canonical_revision" || -z "$owner_revision" ]]; then
    echo "sprint-backlog: cannot compare the task revision of '$task_cell' (canonical=${canonical_revision:-(none)}, lease=${owner_revision:-(none)}); run 'repo-harness sprint reconcile --task-id $task_id --target-ref <branch>' before completing it" >&2
    exit 1
  fi
  if [[ "$canonical_revision" != "$owner_revision" ]]; then
    echo "sprint-backlog: backlog task '$task_cell' drifted since it was claimed: canonical revision is ${canonical_revision}, the claim observed ${owner_revision}; release the stale claim with 'repo-harness sprint release --claim-id ${owner_claim}' and re-claim the row at the current revision, or take it over explicitly with 'repo-harness sprint steal --expected-claim-id ${owner_claim} --reason <reason> --session-id <id>'" >&2
    exit 1
  fi
}

# Inline completion releases inside the caller's backlog-lock critical section.
# A row completed without a token in this tree releases nothing: either it was
# never claimed, or the claim was stolen and the new owner's lease is not this
# caller's to delete.
release_task_lease() {
  local sprint_path="$1" task_cell="$2"
  local token status claim_id output task_id entry held=0
  local dir
  dir="$(claim_token_dir)"
  [[ -d "$dir" ]] || return 0
  for entry in "$dir"/*.claim; do
    if [[ -f "$entry" ]]; then
      held=1
      break
    fi
  done
  # No token in this tree at all: nothing to release, and no reason to reach
  # the CLI for an identity the zero-coordination flow never needs.
  [[ "$held" -eq 1 ]] || return 0

  task_id="$COMPLETION_TASK_ID"
  if [[ -z "$task_id" ]]; then
    if ! task_id="$(resolve_row_task_id "$sprint_path" "$task_cell")"; then
      exit 1
    fi
  fi

  set +e
  token="$(find_claim_token "$task_id")"
  status=$?
  set -e
  case "$status" in
    0) ;;
    1) return 0 ;;
    *) exit 1 ;;
  esac

  claim_id="$(claim_token_field "$token" claim_id)"
  if [[ -z "$claim_id" ]]; then
    echo "sprint-backlog: claim token carries no claim id: $token" >&2
    exit 1
  fi
  if ! output="$(sprint_lease release --claim-id "$claim_id" 2>&1)"; then
    printf '%s\n' "$output" >&2
    echo "sprint-backlog: could not release the lease for '$task_cell' (claim $claim_id)" >&2
    exit 1
  fi
  rm -f "$token"
  echo "Released lease for '$task_cell' (claim $claim_id)"
}

# `reserving -> bound`. The path is resolved with `pwd -P` on both sides of the
# protocol -- here and in contract-worktree finish -- so the binding comparison
# is between two canonical paths and a symlinked worktree cannot look like a
# different one.
bind_claim() {
  local claim_id="$1" worktree="$2" branch="$3" unit_ref="$4" output
  if ! output="$(sprint_lease bind --claim-id "$claim_id" --worktree "$worktree" --branch "$branch" --unit-ref "$unit_ref" 2>&1)"; then
    printf '%s\n' "$output" >&2
    echo "sprint-backlog: could not bind claim ${claim_id} to ${worktree}" >&2
    return 1
  fi
}

# Undo a reservation this call created after capture failed. Only the holder of
# the same fencing token may do this, which is what release enforces.
rollback_claim() {
  local claim_id="$1" output
  [[ -n "$claim_id" ]] || return 0
  if ! output="$(sprint_lease release --claim-id "$claim_id" 2>&1)"; then
    printf '%s\n' "$output" >&2
    echo "sprint-backlog: the reservation survived a failed capture (claim $claim_id); run 'repo-harness sprint reconcile --task-id <id> --target-ref <branch>' to clear it" >&2
  fi
}

# Fill only the Plan cell of one backlog row (status untouched); used by
# start-task so the backlog shows in-flight work.
set_row_plan_cell() {
  local sprint_file="$1"
  local target_index="$2"
  local target_task="$3"
  local plan_cell="$4"
  local timestamp tmp_file
  timestamp="$(date '+%Y-%m-%d %H:%M')"
  tmp_file="$(mktemp)"
  local schema
  schema="$(backlog_schema "$sprint_file")"
  if ! PLAN_CELL="$plan_cell" TARGET_TASK="$target_task" awk -F '|' -v target="$target_index" -v ts="$timestamp" -v schema="$schema" '
    BEGIN { in_section = 0; rewritten = 0; off = (schema == 2) ? 1 : 0 }
    /^> \*\*Updated\*\*:/ {
      print "> **Updated**: " ts
      next
    }
    /^## Backlog[[:space:]]*$/ { in_section = 1; print; next }
    in_section && /^## / { in_section = 0 }
    {
      if (in_section && !rewritten && $0 ~ /^\|[[:space:]]*[0-9]+[[:space:]]*\|/) {
        idx = $2; id = (schema == 2) ? $3 : ""
        status = $(3 + off); task = $(4 + off); mode = $(5 + off); acceptance = $(6 + off)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", idx)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", id)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", status)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", task)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", mode)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", acceptance)
        if (idx == target && task == ENVIRON["TARGET_TASK"]) {
          if (schema == 2) {
            printf "| %s | %s | %s | %s | %s | %s | %s |\n", idx, id, status, task, mode, acceptance, ENVIRON["PLAN_CELL"]
          } else {
            printf "| %s | %s | %s | %s | %s | %s |\n", idx, status, task, mode, acceptance, ENVIRON["PLAN_CELL"]
          }
          rewritten = 1
          next
        }
      }
      print
    }
    END { exit rewritten ? 0 : 1 }
  ' "$sprint_file" > "$tmp_file"; then
    rm -f "$tmp_file"
    echo "sprint-backlog: failed to update backlog plan cell (row not rewritten; check the table for malformed cells)" >&2
    exit 1
  fi
  mv "$tmp_file" "$sprint_file"
}

cmd_start_task() {
  local task_ref=""
  local execute=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --task)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --task requires a value" >&2; exit 2; }
        task_ref="$2"
        shift 2
        ;;
      --execute)
        execute=1
        shift
        ;;
      --sprint)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --sprint requires a value" >&2; exit 2; }
        sprint_override="$2"
        shift 2
        ;;
      *)
        echo "sprint-backlog: unknown start-task argument: $1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done

  # No claim-next. Backlog rows carry no depends_on, no parallel_group, and no
  # conflict_key, so "the next pending row" is not "a row that may run
  # concurrently"; preventing duplicate claims is not the same as proving two
  # rows are parallel-safe, and this helper only does the first.
  if [[ -z "$task_ref" ]]; then
    echo "sprint-backlog: start-task requires --task <index|task>; there is no automatic claim-next" >&2
    usage >&2
    exit 2
  fi

  local sprint_file sprint_status
  sprint_file="$(require_active_sprint)"
  sprint_status="$(extract_status "$sprint_file")"
  case "$sprint_status" in
    Approved|Executing)
      ;;
    *)
      echo "sprint-backlog: sprint status is ${sprint_status:-unknown}; approve the sprint before starting tasks" >&2
      exit 1
      ;;
  esac

  acquire_backlog_lock start-task

  local target_row match_count
  match_count="$(backlog_rows "$sprint_file" | TASK_REF="$task_ref" awk -F '\t' '$1 == ENVIRON["TASK_REF"] || $3 == ENVIRON["TASK_REF"] { count++ } END { print count + 0 }')"
  if [[ "$match_count" -eq 0 ]]; then
    echo "sprint-backlog: no backlog row matches task '$task_ref' in $sprint_file" >&2
    exit 1
  fi
  if [[ "$match_count" -gt 1 ]]; then
    echo "sprint-backlog: task reference '$task_ref' is ambiguous (${match_count} backlog rows match); fix duplicate indices or task names first" >&2
    exit 1
  fi
  target_row="$(backlog_rows "$sprint_file" | TASK_REF="$task_ref" awk -F '\t' '$1 == ENVIRON["TASK_REF"] || $3 == ENVIRON["TASK_REF"] { print; exit }')"

  local target_index target_status target_task target_mode target_acceptance
  target_index="$(printf '%s' "$target_row" | cut -f1)"
  target_status="$(printf '%s' "$target_row" | cut -f2)"
  target_task="$(printf '%s' "$target_row" | cut -f3)"
  target_mode="$(printf '%s' "$target_row" | cut -f4)"
  target_acceptance="$(printf '%s' "$target_row" | cut -f5)"

  if [[ "$target_status" != "[ ]" ]]; then
    echo "sprint-backlog: backlog task '$target_task' (row $target_index) is already complete" >&2
    exit 1
  fi

  # Claim before anything is captured, and against the canonical target ref
  # rather than this tree's copy: a worktree cut from an older commit must not
  # reserve work from its own stale backlog. The lease starts `reserving`
  # because the execution worktree does not exist yet.
  local target_ref identity task_id task_revision claim_output claim_id
  target_ref="$(coordination_target_ref)"
  if ! identity="$(sprint_lease identify --task "$target_task" --target-ref "$target_ref" --sprint-path "$sprint_file" 2>&1)"; then
    printf '%s\n' "$identity" >&2
    echo "sprint-backlog: cannot derive the coordination identity of '$target_task' from $target_ref" >&2
    exit 1
  fi
  task_id="$(json_string_field "$identity" task_id)"
  task_revision="$(json_string_field "$identity" task_revision)"
  if [[ -z "$task_id" || -z "$task_revision" ]]; then
    echo "sprint-backlog: sprint identify returned no task identity for '$target_task'" >&2
    exit 1
  fi

  if ! claim_output="$(sprint_lease claim \
    --task-id "$task_id" \
    --expected-task-revision "$task_revision" \
    --target-ref "$target_ref" \
    --sprint-path "$sprint_file" \
    --session-id "$(coordination_session_id)" 2>&1)"; then
    printf '%s\n' "$claim_output" >&2
    echo "sprint-backlog: backlog task '$target_task' could not be claimed" >&2
    exit 1
  fi
  claim_id="$(json_string_field "$claim_output" claim_id)"
  if [[ -z "$claim_id" ]]; then
    echo "sprint-backlog: sprint claim returned no claim id for '$target_task'" >&2
    exit 1
  fi
  echo "Claimed backlog task '$target_task' (row ${target_index}) as claim ${claim_id}"

  [[ -f "$helper_dir/capture-plan.sh" ]] || {
    release_backlog_lock
    rollback_claim "$claim_id"
    echo "sprint-backlog: packaged capture-plan helper not found" >&2
    exit 1
  }

  # Do not hold the backlog lock across capture-plan: with --execute it can
  # run git worktree setup for minutes and the stale-reclaim would hand the
  # lock to a second writer.
  release_backlog_lock

  local body_file capture_output plan_path
  body_file="$(mktemp)"
  if [[ "$target_mode" == "inline" ]]; then
    cat > "$body_file" <<BODY_EOF
# Sprint Row: ${target_task}

## Context

- Sprint: \`${sprint_file}\`
- Backlog row: ${target_index}
- Mode: ${target_mode}
- Keep this as a checklist row in the current active plan; do not promote it to a top-level plan, contract, review, or notes bundle.

## Task Breakdown

- [ ] Complete sprint row \`${target_task}\`: ${target_acceptance}
BODY_EOF

    capture_output="$(bash "$helper_dir/capture-plan.sh" --artifact-level checklist-row --slug "$target_task" --title "Sprint row: ${target_task}" --source repo-harness-sprint --orchestration-kind sprint-inline --source-ref "sprint:${sprint_file}#${target_task}" --body-file "$body_file" 2>&1)" || {
      printf '%s\n' "$capture_output" >&2
      rm -f "$body_file"
      rollback_claim "$claim_id"
      echo "sprint-backlog: checklist-row capture failed for inline task '$target_task'" >&2
      exit 1
    }
    rm -f "$body_file"
    printf '%s\n' "$capture_output"
    # Inline work executes here, so this tree is the execution worktree and the
    # bind can happen immediately.
    if ! bind_claim "$claim_id" "$(pwd -P)" "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'HEAD')" \
      "inline:${sprint_file}#${target_index}"; then
      rollback_claim "$claim_id"
      exit 1
    fi
    if ! write_claim_token "." "$task_id" "$claim_id" "$sprint_file" "$target_task" \
      "inline:${sprint_file}#${target_index}"; then
      rollback_claim "$claim_id"
      exit 1
    fi
    echo "Backlog row ${target_index} ('${target_task}') is inline; appended checklist row(s) to the active plan without plan/contract/review/notes projection."
    return 0
  fi

  cat > "$body_file" <<BODY_EOF
# Sprint Task: ${target_task}

## Context

- Sprint: \`${sprint_file}\`
- Backlog row: ${target_index}
- Mode: ${target_mode}
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task \`${target_task}\` so that the acceptance line holds: ${target_acceptance}

## Planning Expansion

Before editing code, use \`\$think\` to expand this sprint row into a decision-complete implementation plan. The \`\$think\` pass should read the sprint file, preserve the acceptance line, name concrete files or commands, and produce the detailed \`plans/plan-*.md\` body that drives contract execution.

## Task Breakdown

- [ ] Run \`\$think\` for backlog task \`${target_task}\` using sprint \`${sprint_file}\` and acceptance: ${target_acceptance}
- [ ] Capture the approved \`\$think\` output with \`repo-harness run capture-plan --source waza-think --source-ref sprint:${sprint_file}#${target_task}\`
- [ ] Verify acceptance: ${target_acceptance}
BODY_EOF

  local -a capture_args
  capture_args=(
    --slug "$target_task"
    --title "Sprint task: ${target_task}"
    --status Approved
    --artifact-level work-package
    --source repo-harness-sprint
    --orchestration-kind sprint-task
    --source-ref "sprint:${sprint_file}#${target_task}"
    --body-file "$body_file"
  )
  if [[ "$execute" -eq 1 ]]; then
    capture_args+=(--promotion-reason worktree_boundary --execute)
  fi

  capture_output="$(bash "$helper_dir/capture-plan.sh" "${capture_args[@]}" 2>&1)" || {
    printf '%s\n' "$capture_output" >&2
    rm -f "$body_file"
    rollback_claim "$claim_id"
    echo "sprint-backlog: capture-plan failed for task '$target_task'" >&2
    exit 1
  }
  rm -f "$body_file"
  printf '%s\n' "$capture_output"

  plan_path="$(printf '%s\n' "$capture_output" | sed -nE 's/^Captured plan: (.+)$/\1/p' | head -1)"
  if [[ -z "$plan_path" ]]; then
    rollback_claim "$claim_id"
    echo "sprint-backlog: could not resolve captured plan path; the reservation was rolled back" >&2
    exit 1
  fi

  # Bind the reservation to the execution worktree once it exists. Without
  # --execute (or with worktree creation disabled by policy) there is no
  # worktree to name, so the lease deliberately stays `reserving` with no
  # claim token. A token is a bound-worktree capability, never evidence that a
  # primary-tree reservation may execute or complete the contract row.
  local worktree_path worktree_branch worktree_abs
  worktree_path="$(printf '%s\n' "$capture_output" | sed -nE 's/^\[ContractWorktree\] (Created worktree|Added worktree for existing branch|Reusing existing worktree): (.+)$/\2/p' | tail -1)"
  worktree_branch="$(printf '%s\n' "$capture_output" | sed -nE 's/^\[ContractWorktree\] Branch: (.+)$/\1/p' | tail -1)"
  if [[ -n "$worktree_path" && -n "$worktree_branch" && -d "$worktree_path" ]]; then
    worktree_abs="$(cd "$worktree_path" && pwd -P)"
    if ! bind_claim "$claim_id" "$worktree_abs" "$worktree_branch" "$plan_path"; then
      rollback_claim "$claim_id"
      exit 1
    fi
    if ! write_claim_token "$worktree_abs" "$task_id" "$claim_id" "$sprint_file" "$target_task" "$plan_path"; then
      rollback_claim "$claim_id"
      exit 1
    fi
  else
    echo "sprint-backlog: no execution worktree was created; claim ${claim_id} stays reserving without a token until 'repo-harness sprint bind' names one" >&2
  fi

  # Contract mode: the plan moves into a worktree branched from HEAD, so
  # writing the Plan cell here would dirty the primary tree and block the
  # eventual --ff-only merge back. The finish back-fill writes the row
  # (status + plan) atomically with the merged slice instead.
  echo "Backlog row ${target_index} ('${target_task}') stays (pending); contract-worktree finish back-fills the Plan cell after merge."
}

[[ $# -gt 0 ]] || { usage >&2; exit 2; }

command="$1"
shift

case "$command" in
  init)
    cmd_init "$@"
    ;;
  status)
    cmd_status "$@"
    ;;
  next)
    cmd_next "$@"
    ;;
  start-task)
    cmd_start_task "$@"
    ;;
  complete-task)
    cmd_complete_task "$@"
    ;;
  --help|-h|help)
    usage
    ;;
  *)
    echo "sprint-backlog: unknown command: $command" >&2
    usage >&2
    exit 2
    ;;
esac
