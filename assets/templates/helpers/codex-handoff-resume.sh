#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/codex-handoff-resume.sh --cwd <repo> [--print-prompt] [--reason <reason>]
USAGE_EOF
}

cwd=""
print_prompt=0
reason="manual"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cwd)
      cwd="${2:-}"
      shift 2
      ;;
    --print-prompt)
      print_prompt=1
      shift
      ;;
    --reason)
      reason="${2:-manual}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$cwd" ]]; then
  cwd="$(pwd)"
fi

cwd="$(cd "$cwd" && pwd)"
cd "$cwd"

policy_get() {
  local jq_path="$1"
  local default_value="$2"

  if [[ -f ".ai/harness/policy.json" ]] && command -v jq >/dev/null 2>&1; then
    local value
    value="$(jq -r "$jq_path // empty" .ai/harness/policy.json 2>/dev/null || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

safe_repo_file() {
  local value="$1"
  local default_value="$2"
  local allowed_prefix="${3:-}"

  if [[ -z "$value" || "$value" == /* || "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    printf '%s' "$default_value"
    return 0
  fi

  case "$value" in
    ..|../*|*/..|*/../*)
      printf '%s' "$default_value"
      ;;
    *)
      if [[ -n "$allowed_prefix" && "$value" != "$allowed_prefix"* ]]; then
        printf '%s' "$default_value"
        return 0
      fi
      printf '%s' "$value"
      ;;
  esac
}

active_plan() {
  for marker_file in ".ai/harness/active-plan" ".claude/.active-plan"; do
    if [[ ! -f "$marker_file" ]]; then
      continue
    fi
    local marker
    marker="$(cat "$marker_file" 2>/dev/null | xargs)"
    if [[ -n "$marker" && -f "$marker" ]]; then
      printf '%s' "$marker"
      return 0
    fi
  done
}

plan_slug_from_path() {
  local plan_file="$1"
  local base slug
  base="$(basename "$plan_file")"
  slug="$(printf '%s' "$base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
  printf '%s' "$slug"
}

plan_original_artifact_stem_from_path() {
  local plan_file="$1"
  local base stem
  base="$(basename "$plan_file")"
  stem="$(printf '%s' "$base" | sed -E 's/^plan-//; s/\.md$//')"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    printf '%s' "$stem"
  else
    plan_slug_from_path "$plan_file"
  fi
}

is_transient_plan_slug() {
  case "$1" in
    think-plan-[0-9]*|codex-plan-[0-9]*|approved-plan-[0-9]*)
      return 0
      ;;
  esac
  return 1
}

plan_title_slug_from_file() {
  local plan_file="$1"
  local title slug
  [[ -f "$plan_file" ]] || return 1
  title="$(awk '
    /^# Plan:[[:space:]]*/ {
      sub(/^# Plan:[[:space:]]*/, "")
      print
      exit
    }
  ' "$plan_file" | xargs)"
  [[ -n "$title" ]] || return 1
  slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"
  [[ -n "$slug" ]] || return 1
  printf '%s' "$slug"
}

plan_artifact_stem_from_path() {
  local plan_file="$1"
  local stem stamp slug title_slug
  stem="$(plan_original_artifact_stem_from_path "$plan_file")"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    stamp="$(printf '%s' "$stem" | sed -E 's/^([0-9]{8}-[0-9]{4})-.+$/\1/')"
    slug="$(printf '%s' "$stem" | sed -E 's/^[0-9]{8}-[0-9]{4}-//')"
    if is_transient_plan_slug "$slug"; then
      title_slug="$(plan_title_slug_from_file "$plan_file" || true)"
      if [[ -n "$title_slug" && "$title_slug" != "$slug" ]]; then
        printf '%s-%s' "$stamp" "$title_slug"
        return 0
      fi
    fi
    printf '%s' "$stem"
  else
    plan_slug_from_path "$plan_file"
  fi
}

preferred_or_legacy_path() {
  local preferred="$1"
  local legacy="$2"
  if [[ -f "$preferred" ]] || [[ ! -f "$legacy" ]]; then
    printf '%s' "$preferred"
  else
    printf '%s' "$legacy"
  fi
}

derive_contract() {
  local plan_file="$1"
  local slug stem
  [[ -n "$plan_file" ]] || return 1
  slug="$(plan_slug_from_path "$plan_file")"
  stem="$(plan_artifact_stem_from_path "$plan_file")"
  [[ -n "$slug" && -n "$stem" ]] || return 1
  preferred_or_legacy_path "tasks/contracts/${stem}.contract.md" "tasks/contracts/${slug}.contract.md"
}

derive_notes() {
  local plan_file="$1"
  local slug stem notes_dir
  [[ -n "$plan_file" ]] || return 1
  slug="$(plan_slug_from_path "$plan_file")"
  stem="$(plan_artifact_stem_from_path "$plan_file")"
  [[ -n "$slug" && -n "$stem" ]] || return 1
  notes_dir="$(safe_repo_file "$(policy_get '.tasks.notes_dir' 'tasks/notes')" 'tasks/notes' 'tasks/')"
  preferred_or_legacy_path "${notes_dir}/${stem}.notes.md" "${notes_dir}/${slug}.notes.md"
}

latest_global_handoff() {
  local codex_home="${CODEX_HOME:-$HOME/.codex}"
  find "$codex_home/handoffs" -maxdepth 1 -type f -name 'handoff-*.md' 2>/dev/null | sort | tail -1
}

resume_file="$(safe_repo_file "$(policy_get '.handoff_resume.resume_packet_file' '.ai/harness/handoff/resume.md')" '.ai/harness/handoff/resume.md' '.ai/harness/')"
repo_handoff="$(safe_repo_file "$(policy_get '.harness.handoff_file' '.ai/harness/handoff/current.md')" '.ai/harness/handoff/current.md' '.ai/harness/')"
checks_file="$(safe_repo_file "$(policy_get '.harness.checks_file' '.ai/harness/checks/latest.json')" '.ai/harness/checks/latest.json' '.ai/harness/')"
research_dir="$(safe_repo_file "$(policy_get '.tasks.research_dir' 'docs/researches')" 'docs/researches' 'docs/researches')"
todo_file="$(safe_repo_file "$(policy_get '.tasks.todo_file' 'tasks/todos.md')" 'tasks/todos.md' 'tasks/')"
plan_file="$(active_plan || true)"
contract_file="$(derive_contract "$plan_file" || true)"
notes_file="$(derive_notes "$plan_file" || true)"
global_handoff="$(latest_global_handoff || true)"

mkdir -p "$(dirname "$resume_file")"

cat > "$resume_file" <<EOF_RESUME
# Codex Resume Packet
<!-- generated-by: repo-harness codex-handoff-resume v1 -->

> **Generated**: $(date '+%Y-%m-%d %H:%M:%S')
> **Reason**: ${reason}
> **Working Directory**: ${cwd}

## Resume Prompt

You are starting a fresh Codex session for an existing long-running task. Do not rely on prior chat history or Codex auto-compact. First read the source artifacts listed below, then continue from the exact next step in the repo handoff.

Current prompt files first:
- If the current user message lists files under \`# Files mentioned by the user\`, references \`pasted-text.txt\`, or includes an explicit attachment/file path, read those current-input files before the repo recovery artifacts below.
- Use handoff, resume, and \`tasks/current.md\` as recovery context only; they do not outrank the current user message.

Required first reads:
- AGENTS.md
- ${repo_handoff}
- ${todo_file}
- ${notes_file:-(none)}
- ${research_dir}/
- ${checks_file}

Conditional first reads:
- Active plan: ${plan_file:-(none)}
- Active contract: ${contract_file:-(none)}
- Implementation notes: ${notes_file:-(none)}
- Global handoff: ${global_handoff:-(none)}

Execution rules:
- Treat filesystem artifacts as the source of truth.
- Decide in the main agent whether to use subagents, parallel sidecars, sidecar \`codex exec --json\`, or a bounded main-thread trace for broad research/log scans based on context impact and callable tools; do not ask the user for spawn confirmation.
- Keep deep research conclusions in \`${research_dir}/\`, not only in chat.
- Do not run \`/compact\` as the primary recovery path.
- Preserve the current dirty worktree and do not touch unrelated untracked files.

## Source Artifacts

- Repo handoff: ${repo_handoff}
- Resume packet: ${resume_file}
- Checks: ${checks_file}
- Todo: ${todo_file}
- Research: ${research_dir}/
- Plan: ${plan_file:-(none)}
- Contract: ${contract_file:-(none)}
- Notes: ${notes_file:-(none)}
- Global handoff: ${global_handoff:-(none)}
EOF_RESUME

if [[ "$print_prompt" -eq 1 ]]; then
  awk '/^## Resume Prompt$/ {printing=1; next} /^## Source Artifacts$/ {printing=0} printing == 1 {print}' "$resume_file" | sed -E '/^[[:space:]]*$/N; /^\n$/D'
else
  echo "Updated $resume_file"
fi
