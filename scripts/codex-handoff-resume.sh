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

latest_plan() {
  if [[ -f ".claude/.active-plan" ]]; then
    local marker
    marker="$(cat .claude/.active-plan 2>/dev/null | xargs)"
    if [[ -n "$marker" && -f "$marker" ]]; then
      printf '%s' "$marker"
      return 0
    fi
  fi

  find plans -maxdepth 1 -type f -name 'plan-*.md' 2>/dev/null | sort | tail -1
}

derive_contract() {
  local plan_file="$1"
  local slug
  [[ -n "$plan_file" ]] || return 1
  slug="$(basename "$plan_file" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
  [[ -n "$slug" ]] || return 1
  printf 'tasks/contracts/%s.contract.md' "$slug"
}

derive_notes() {
  local plan_file="$1"
  local slug notes_dir
  [[ -n "$plan_file" ]] || return 1
  slug="$(basename "$plan_file" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
  [[ -n "$slug" ]] || return 1
  notes_dir="$(safe_repo_file "$(policy_get '.tasks.notes_dir' 'tasks/notes')" 'tasks/notes' 'tasks/')"
  printf '%s/%s.notes.md' "$notes_dir" "$slug"
}

latest_global_handoff() {
  local codex_home="${CODEX_HOME:-$HOME/.codex}"
  find "$codex_home/handoffs" -maxdepth 1 -type f -name 'handoff-*.md' 2>/dev/null | sort | tail -1
}

resume_file="$(safe_repo_file "$(policy_get '.handoff_resume.resume_packet_file' '.ai/harness/handoff/resume.md')" '.ai/harness/handoff/resume.md' '.ai/harness/')"
repo_handoff="$(safe_repo_file "$(policy_get '.harness.handoff_file' '.ai/harness/handoff/current.md')" '.ai/harness/handoff/current.md' '.ai/harness/')"
checks_file="$(safe_repo_file "$(policy_get '.harness.checks_file' '.ai/harness/checks/latest.json')" '.ai/harness/checks/latest.json' '.ai/harness/')"
budget_file="$(safe_repo_file "$(policy_get '.context_budget.status_file' '.ai/harness/context-budget/latest.json')" '.ai/harness/context-budget/latest.json' '.ai/harness/')"
research_file="$(safe_repo_file "$(policy_get '.tasks.research_file' 'tasks/research.md')" 'tasks/research.md' 'tasks/')"
todo_file="$(safe_repo_file "$(policy_get '.tasks.todo_file' 'tasks/todo.md')" 'tasks/todo.md' 'tasks/')"
plan_file="$(latest_plan || true)"
contract_file="$(derive_contract "$plan_file" || true)"
notes_file="$(derive_notes "$plan_file" || true)"
global_handoff="$(latest_global_handoff || true)"

mkdir -p "$(dirname "$resume_file")"

cat > "$resume_file" <<EOF_RESUME
# Codex Resume Packet
<!-- generated-by: project-initializer codex-handoff-resume v1 -->

> **Generated**: $(date '+%Y-%m-%d %H:%M:%S')
> **Reason**: ${reason}
> **Working Directory**: ${cwd}

## Resume Prompt

You are starting a fresh Codex session for an existing long-running task. Do not rely on prior chat history or Codex auto-compact. First read the source artifacts listed below, then continue from the exact next step in the repo handoff.

Required first reads:
- AGENTS.md
- ${repo_handoff}
- ${todo_file}
- ${notes_file:-(none)}
- ${research_file}
- ${checks_file}
- ${budget_file}

Conditional first reads:
- Active plan: ${plan_file:-(none)}
- Active contract: ${contract_file:-(none)}
- Implementation notes: ${notes_file:-(none)}
- Global handoff: ${global_handoff:-(none)}

Execution rules:
- Treat filesystem artifacts as the source of truth.
- Decide in the main agent whether to use subagents, parallel sidecars, sidecar \`codex exec --json\`, or a bounded main-thread trace for broad research/log scans based on context impact and callable tools; do not ask the user for spawn confirmation.
- Keep deep research conclusions in \`${research_file}\`, not only in chat.
- Do not run \`/compact\` as the primary recovery path.
- Preserve the current dirty worktree and do not touch unrelated untracked files.

## Source Artifacts

- Repo handoff: ${repo_handoff}
- Resume packet: ${resume_file}
- Context budget: ${budget_file}
- Checks: ${checks_file}
- Todo: ${todo_file}
- Research: ${research_file}
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
