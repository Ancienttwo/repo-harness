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

# kill(pid, 0) with the TS ESRCH discrimination: exit 0 is alive, and the
# "No such process" error is the one failure that proves death. Any other
# failure (EPERM from a privileged or foreign owner, a probe that could not
# run) counts as alive so the lock is never stolen from a holder that may
# still exist. LC_ALL=C pins the strerror text against localized environments.
backlog_owner_dead() {
  local pid="$1" probe
  if kill -0 "$pid" 2>/dev/null; then
    return 1
  fi
  probe="$(LC_ALL=C kill -0 "$pid" 2>&1 || true)"
  case "$probe" in
    *"No such process"*) return 0 ;;
    *) return 1 ;;
  esac
}

# Mirror of the single-owner path in reclaimStaleLockDirectory
# (src/effects/locking/exclusive-directory-lock.ts): a TypeScript holder takes
# this same lock by creating `<pid>-<created_ms>-<uuid>.json` inside the lock
# directory, so a holder that crashes after publication leaves a non-empty
# directory the plain empty-dir reclaim below can never remove. Every
# ambiguous input fails closed: only an exactly identified dead owner is
# reclaimed, and this never hot-loops because a failed verdict falls through
# to the ordinary attempts counter.
try_reclaim_dead_owner_backlog_lock() {
  local lock_dir="$1"
  local entry_path entry_name entry_pid="" entry_token=""
  local owner_pid="" owner_token="" owner_mtime=""

  # Exactly one entry, like the TS readdirSync().length === 1 gate.
  [[ "$(find "$lock_dir" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')" == "1" ]] || return 1
  entry_path="$(find "$lock_dir" -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1)"
  entry_name="${entry_path##*/}"
  # Filename shape is the TS ownerTokenFromFileName regex; the hex class is
  # widened for its case-insensitive flag, and the dot is written `[.]`
  # because bash 3.2 `[[ =~ ]]` does not reliably preserve an unquoted `\.`.
  if [[ "$entry_name" =~ ^([1-9][0-9]*)-[0-9]+-[0-9a-fA-F-]{36}[.]json$ ]]; then
    entry_pid="${BASH_REMATCH[1]}"
    entry_token="${entry_name%.json}"
  fi
  [[ -n "$entry_token" ]] || return 1
  [[ ! -L "$entry_path" && -f "$entry_path" ]] || return 1

  # Owner content is one line of `{"pid":N,"created_at":N,"token":"..."}`;
  # sed pulls the two fields the TS reclaim compares, and a quoted number or
  # missing field fails the pull exactly where JSON.parse falls into the TS
  # catch path.
  owner_pid="$(sed -n -E 's/^.*"pid"[[:space:]]*:[[:space:]]*([1-9][0-9]*).*$/\1/p' "$entry_path" 2>/dev/null | head -n 1)"
  owner_token="$(sed -n -E 's/^.*"token"[[:space:]]*:[[:space:]]*"([0-9A-Za-z-]+)".*$/\1/p' "$entry_path" 2>/dev/null | head -n 1)"
  if [[ -n "$owner_pid" && -n "$owner_token" ]]; then
    [[ "$owner_pid" == "$entry_pid" && "$owner_token" == "$entry_token" ]] || return 1
  else
    # Unparseable owner JSON mirrors the TS catch path: the file must be older
    # than the TS LOCK_STALE_MS (30s) and the filename pid dead.
    owner_mtime="$(stat -f %m "$entry_path" 2>/dev/null || stat -c %Y "$entry_path" 2>/dev/null || true)"
    [[ "$owner_mtime" =~ ^[0-9]+$ ]] || return 1
    [[ $(( $(date +%s) - owner_mtime )) -gt 30 ]] || return 1
  fi

  backlog_owner_dead "$entry_pid" || return 1

  # unlink then rmdir, both or nothing: rmdir is the publication fence, so a
  # creator racing in after the unlink makes rmdir fail and the verdict stays
  # "not reclaimed" instead of stealing a freshly published lock.
  rm -f "$entry_path" 2>/dev/null || return 1
  rmdir "$lock_dir" 2>/dev/null || return 1
  return 0
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
    # No directory-age gate on the owner path: an owner-verified dead holder is
    # reclaimable the moment it died, exactly like the TS mirror.
    if try_reclaim_dead_owner_backlog_lock "$BACKLOG_LOCK_DIR"; then
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

  local sprint_file plan_cell output
  sprint_file="$(require_active_sprint)"

  plan_cell=""
  if [[ -n "$plan_file" ]]; then
    plan_cell="\`${plan_file}\`"
  fi

  # One call, one transaction. The verb takes the backlog lock itself, so this
  # helper must not hold it: the lock is a directory mutex, not a reentrant one.
  local -a complete_args
  complete_args=(complete-row
    --sprint "$sprint_file"
    --task "$task_ref"
    --target-ref "$(coordination_target_ref)")
  [[ -z "$plan_cell" ]] || complete_args+=(--plan-cell "$plan_cell")
  [[ "$defer_lease_release" -eq 0 ]] || complete_args+=(--defer-lease-release)

  # stdout carries the verb's JSON, stderr its diagnostics -- a stale-lock
  # reclamation among them. Merging the two with `2>&1` would both corrupt the
  # JSON and swallow the diagnostic on success, so they are kept apart and the
  # verb's stderr is forwarded either way.
  local verb_stderr
  verb_stderr="$(mktemp)"
  if ! output="$(sprint_lease "${complete_args[@]}" 2>"$verb_stderr")"; then
    cat "$verb_stderr" >&2
    rm -f "$verb_stderr"
    exit 1
  fi
  cat "$verb_stderr" >&2
  rm -f "$verb_stderr"

  # Rendering only: every value below was produced by the verb inside its locks.
  local completed_task completed_row released_claim done total
  completed_task="$(json_string_field "$output" task)"
  completed_row="$(json_string_field "$output" row_index)"
  released_claim="$(json_string_field "$output" released_claim_id)"
  done="$(json_number_field "$output" done)"
  total="$(json_number_field "$output" total)"

  if [[ -n "$released_claim" ]]; then
    echo "Released lease for '$completed_task' (claim $released_claim)"
  fi
  echo "Completed backlog task '$completed_task' (row $completed_row) in $sprint_file"
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

# The numeric twin, for the counts `complete-row` reports back. Both readers see
# only CLI stdout the verb just produced; no shell reader touches an authority
# record on disk any more.
json_number_field() {
  printf '%s\n' "$1" | sed -nE "s/^[[:space:]]*\"$2\": ([0-9]+),?[[:space:]]*\$/\1/p" | head -1
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

# The inline completion transaction lives in TypeScript.
#
# `sprint complete-row` takes the shared backlog lock, then the row's task
# lock, and inside that one boundary it resolves the row, reads the owner
# record and the claim token through their single parsers, compares claim id
# and task revision, rewrites the row, and releases the lease. The shell used
# to do those steps itself across two processes -- resolve, gate, rewrite,
# then ask the CLI to release -- which left windows a concurrent steal or
# release could land in, and read the owner record with a second parser that
# disagreed with `JSON.parse` about a duplicated key. Both are gone with the
# shell-side gate: this helper now only resolves arguments and renders the
# verb's answer.

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
