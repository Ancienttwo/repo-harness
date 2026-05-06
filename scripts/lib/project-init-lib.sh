#!/bin/bash
# Shared install helpers for project-initializer scaffolding scripts.

PI_RUNTIME_BLOCK_BEGIN="# BEGIN: claude-runtime-temp (managed by project-initializer)"
PI_RUNTIME_BLOCK_END="# END: claude-runtime-temp"
PI_DEFAULT_GITIGNORE_CONTENT=$(cat <<'EOF_GITIGNORE'
# Dependencies
node_modules/

# Build artifacts
artifacts/
coverage/
*.tar.gz
*.tgz

# Environment
.env
.env.*
!.env.example

# OS metadata
.DS_Store
EOF_GITIGNORE
)
PI_DEFAULT_RUNTIME_ENTRIES=$(cat <<'EOF_RUNTIME'
.claude/settings.local.json
.claude/.atomic_pending
.claude/.session-id
.claude/.tool-call-count
.claude/.session-handoff.md
.claude/.task-state.json
.claude/.task-handoff.md
.claude/.context-pressure/
.claude/*.tmp
.claude/*.bak
.claude/*.bak.*
.claude/*.backup-*
.ai/harness/checks/latest.json
.ai/harness/events.jsonl
.ai/harness/failures/latest.jsonl
.ai/harness/handoff/current.md
.ai/harness/handoff/resume.md
.ai/harness/context-budget/latest.json
.ai/harness/runs/
EOF_RUNTIME
)
PI_EXTERNAL_TOOLING_HOSTS_DEFAULT=$(cat <<'EOF_EXTERNAL_TOOLING_HOSTS'
[
  "claude-code",
  "codex"
]
EOF_EXTERNAL_TOOLING_HOSTS
)
PI_TEMPLATE_RESEARCH=$(cat <<'EOF_TEMPLATE_RESEARCH'
# {{PROJECT_NAME}} — Research Notes

> **Last Updated**: {{DATE}}
> **Scope**: (what area of the codebase was researched)
> **Usage**: Store deep codebase findings and hidden contracts here, not in chat-only summaries.

## Codebase Map
| File | Purpose | Key Exports |
|------|---------|-------------|

## Architecture Observations
### Patterns & Conventions
### Implicit Contracts
### Edge Cases & Intricacies

## Technical Debt / Risks

## Research Conclusions
### What to Preserve
### What to Change
### Open Questions
EOF_TEMPLATE_RESEARCH
)
PI_TEMPLATE_SPEC=$(cat <<'EOF_TEMPLATE_SPEC'
# Product Spec: {{PROJECT_NAME}}

> **Status**: Draft
> **Last Updated**: {{TIMESTAMP}}
> **Owner**: Planner

## Product Outcome

Describe the stable user or operator outcome this repo should deliver.

## Success Criteria

- Primary workflow:
- Quality bar:
- Out of scope:

## Constraints

- Technical:
- Compliance:
- Delivery:

## Acceptance Scenarios

- Given
  When
  Then

## Open Questions

- ...
EOF_TEMPLATE_SPEC
)
PI_TEMPLATE_PLAN=$(cat <<'EOF_TEMPLATE_PLAN'
# Plan: {{TITLE}}

> **Status**: Draft
> **Created**: {{TIMESTAMP}}
> **Slug**: {{SLUG}}
> **Research**: See `tasks/research.md`

## Approach
### Strategy
### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|

### Code Snippets
### Data Flow

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|

## Task Contracts
- Contract file: `tasks/contracts/{{SLUG}}.contract.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/{{SLUG}}.contract.md --strict`
- Active plan rule: the latest non-archived `plans/plan-*.md` file is the current plan

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] ...
EOF_TEMPLATE_PLAN
)
PI_TEMPLATE_CONTRACT=$(cat <<'EOF_TEMPLATE_CONTRACT'
# Task Contract: {{TASK_SLUG}}

> **Status**: Pending
> **Plan**: {{PLAN_FILE}}
> **Owner**: {{OWNER}}
> **Last Updated**: {{TIMESTAMP}}
> **Review File**: `tasks/reviews/{{TASK_SLUG}}.review.md`

## Goal

Describe the exact outcome this task must deliver.

## Scope

- In scope:
- Out of scope:

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todo.md
  - tasks/contracts/{{TASK_SLUG}}.contract.md
  - tasks/reviews/{{TASK_SLUG}}.review.md
  - src/
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/modules/{{TASK_SLUG}}/index.ts
  tests_pass:
    - path: tests/unit/{{TASK_SLUG}}.test.ts
  commands_succeed:
    - bun run typecheck
  files_contain:
    - path: src/modules/{{TASK_SLUG}}/index.ts
      pattern: "export"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
EOF_TEMPLATE_CONTRACT
)
PI_TEMPLATE_REVIEW=$(cat <<'EOF_TEMPLATE_REVIEW'
# Sprint Review: {{TASK_SLUG}}

> **Status**: Pending
> **Plan**: {{PLAN_FILE}}
> **Contract**: {{CONTRACT_FILE}}
> **Checks File**: {{CHECKS_FILE}}
> **Last Updated**: {{TIMESTAMP}}
> **Recommendation**: fail

## Verification Evidence

- Commands run:
- Manual checks:
- Supporting artifacts:

## Behavior Diff Notes

- ...

## Residual Risks / Follow-ups

- ...

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- ...

## Retest Steps

- Re-run:
- Re-check:

## Summary

- ...
EOF_TEMPLATE_REVIEW
)
PI_CONTEXT_PROFILE_DEFAULT="stable-root-progressive-subdir"
PI_RECOVERY_PROFILE_DEFAULT="hybrid"
PI_STATE_PROFILE_DEFAULT="file-backed"
PI_ORCHESTRATION_PROFILE_DEFAULT="shared-long-running-harness"
PI_EVALUATION_PROFILE_DEFAULT="browser-qa"
PI_HANDOFF_PROFILE_DEFAULT="artifact-aware"

pi_write_file_if_apply() {
  local mode="${1:-apply}"
  local path="$2"
  local content="$3"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] write $path"
    return 0
  fi

  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
}

pi_copy_file_if_apply() {
  local mode="${1:-apply}"
  local src="$2"
  local dest="$3"
  local src_abs=""
  local dest_abs=""

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] cp \"$src\" \"$dest\""
    return 0
  fi

  src_abs="$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
  dest_abs="$(cd "$(dirname "$dest")" && pwd)/$(basename "$dest")"

  if [[ "$src_abs" == "$dest_abs" ]]; then
    return 0
  fi

  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
}

pi_ensure_executable_if_apply() {
  local mode="${1:-apply}"
  shift || true

  if [[ "$mode" != "apply" || "$#" -eq 0 ]]; then
    return 0
  fi

  chmod +x "$@" 2>/dev/null || true
}

pi_default_runtime_block() {
  local extra_entries="${1:-}"
  local runtime_entries="$PI_DEFAULT_RUNTIME_ENTRIES"

  if [[ -n "$extra_entries" ]]; then
    runtime_entries="${runtime_entries}"$'\n'"${extra_entries}"
  fi

  printf '%s\n%s\n%s\n' "$PI_RUNTIME_BLOCK_BEGIN" "$runtime_entries" "$PI_RUNTIME_BLOCK_END"
}

pi_ensure_gitignore_block() {
  local file_path="$1"
  local prelude="${2:-}"
  local extra_entries="${3:-}"
  local mode="${4:-apply}"
  local block

  block="$(pi_default_runtime_block "$extra_entries")"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] ensure managed runtime block in $file_path"
    return 0
  fi

  mkdir -p "$(dirname "$file_path")"
  if [[ ! -f "$file_path" ]]; then
    if [[ -n "$prelude" ]]; then
      printf '%s\n' "$prelude" > "$file_path"
    else
      touch "$file_path"
    fi
  fi

  if ! grep -Fq "$PI_RUNTIME_BLOCK_BEGIN" "$file_path"; then
    printf '\n%s\n' "$block" >> "$file_path"
    return 0
  fi

  local tmp_file
  local block_written=0
  tmp_file="$(mktemp)"

  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$PI_RUNTIME_BLOCK_BEGIN" ]]; then
      if [[ "$block_written" -eq 0 ]]; then
        printf '%s\n' "$block" >> "$tmp_file"
        block_written=1
      fi

      while IFS= read -r inner_line || [[ -n "$inner_line" ]]; do
        if [[ "$inner_line" == "$PI_RUNTIME_BLOCK_END" ]]; then
          break
        fi
      done
      continue
    fi

    printf '%s\n' "$line" >> "$tmp_file"
  done < "$file_path"

  mv "$tmp_file" "$file_path"
}

pi_resolve_json_runtime() {
  if command -v node >/dev/null 2>&1; then
    printf 'node'
    return 0
  fi

  if command -v bun >/dev/null 2>&1; then
    printf 'bun'
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    printf 'python3'
    return 0
  fi

  return 1
}

pi_workflow_contract_query_lines() {
  local contract_file="$1"
  local selector="$2"
  local runtime

  if [[ ! -f "$contract_file" ]]; then
    return 1
  fi

  runtime="$(pi_resolve_json_runtime || true)"
  if [[ -z "$runtime" ]]; then
    echo "[warn] no runtime available to read workflow contract: $contract_file" >&2
    return 1
  fi

  case "$runtime" in
    python3)
      "$runtime" - "$contract_file" "$selector" <<'PY_EOF'
import json
import sys

path, selector = sys.argv[1], sys.argv[2]
value = json.load(open(path, "r", encoding="utf-8"))
for part in selector.split("."):
    value = value.get(part) if isinstance(value, dict) else None
if isinstance(value, list):
    for item in value:
        print(item)
elif value is not None:
    print(value)
PY_EOF
      ;;
    *)
      "$runtime" -e '
const fs = require("fs");
const [, filePath, selector] = process.argv;
const parts = selector.split(".");
let value = JSON.parse(fs.readFileSync(filePath, "utf8"));
for (const part of parts) {
  value = value && typeof value === "object" ? value[part] : undefined;
}
if (Array.isArray(value)) {
  for (const item of value) {
    console.log(item);
  }
} else if (value !== undefined && value !== null) {
  console.log(value);
}
' "$contract_file" "$selector"
      ;;
  esac
}

pi_install_workflow_contract() {
  local target_dir="$1"
  local contract_asset="$2"
  local mode="${3:-apply}"
  local output_path="$target_dir/.ai/harness/workflow-contract.json"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] install workflow contract into $output_path"
    return 0
  fi

  mkdir -p "$(dirname "$output_path")"
  cp "$contract_asset" "$output_path"
}

pi_install_templates() {
  local target_dir="$1"
  local templates_dir="$2"
  local mode="${3:-apply}"
  local output_dir="$target_dir/.claude/templates"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] install templates into $output_dir"
    return 0
  fi

  mkdir -p "$output_dir"

  if [[ -f "$templates_dir/research.template.md" ]]; then
    cp "$templates_dir/research.template.md" "$output_dir/research.template.md"
  else
    printf '%s\n' "$PI_TEMPLATE_RESEARCH" > "$output_dir/research.template.md"
  fi

  if [[ -f "$templates_dir/spec.template.md" ]]; then
    cp "$templates_dir/spec.template.md" "$output_dir/spec.template.md"
  else
    printf '%s\n' "$PI_TEMPLATE_SPEC" > "$output_dir/spec.template.md"
  fi

  if [[ -f "$templates_dir/plan.template.md" ]]; then
    cp "$templates_dir/plan.template.md" "$output_dir/plan.template.md"
  else
    printf '%s\n' "$PI_TEMPLATE_PLAN" > "$output_dir/plan.template.md"
  fi

  if [[ -f "$templates_dir/contract.template.md" ]]; then
    cp "$templates_dir/contract.template.md" "$output_dir/contract.template.md"
  else
    printf '%s\n' "$PI_TEMPLATE_CONTRACT" > "$output_dir/contract.template.md"
  fi

  if [[ -f "$templates_dir/review.template.md" ]]; then
    cp "$templates_dir/review.template.md" "$output_dir/review.template.md"
  else
    printf '%s\n' "$PI_TEMPLATE_REVIEW" > "$output_dir/review.template.md"
  fi
}

pi_install_helpers() {
  local target_dir="$1"
  local helpers_dir="$2"
  local mode="${3:-apply}"
  local helper_names="${4:-new-plan.sh plan-to-todo.sh archive-workflow.sh prepare-handoff.sh verify-contract.sh summarize-failures.sh check-task-sync.sh check-agent-tooling.sh ensure-task-workflow.sh check-task-workflow.sh context-budget.ts prepare-codex-handoff.sh codex-handoff-resume.sh}"
  local scripts_dir="$target_dir/scripts"
  local helper_name

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] install helpers into $scripts_dir"
    return 0
  fi

  mkdir -p "$scripts_dir"

  if [[ -d "$helpers_dir" ]]; then
    for helper_name in $helper_names; do
      if [[ -f "$helpers_dir/$helper_name" ]]; then
        cp "$helpers_dir/$helper_name" "$scripts_dir/$helper_name"
      fi
    done
    pi_ensure_executable_if_apply "$mode" "$scripts_dir"/new-spec.sh "$scripts_dir"/new-sprint.sh "$scripts_dir"/new-plan.sh "$scripts_dir"/plan-to-todo.sh "$scripts_dir"/archive-workflow.sh "$scripts_dir"/prepare-handoff.sh "$scripts_dir"/prepare-codex-handoff.sh "$scripts_dir"/codex-handoff-resume.sh "$scripts_dir"/verify-contract.sh "$scripts_dir"/summarize-failures.sh "$scripts_dir"/verify-sprint.sh "$scripts_dir"/check-task-sync.sh "$scripts_dir"/check-agent-tooling.sh "$scripts_dir"/ensure-task-workflow.sh "$scripts_dir"/check-task-workflow.sh "$scripts_dir"/switch-plan.sh
    return 0
  fi

  for helper_name in $helper_names; do
    cat > "$scripts_dir/$helper_name" <<EOF_STUB
#!/bin/bash
set -euo pipefail
echo "Missing helper template: $helper_name"
exit 1
EOF_STUB
  done
  pi_ensure_executable_if_apply "$mode" "$scripts_dir"/*.sh
}

pi_context_profile() {
  printf '%s' "${PROJECT_INITIALIZER_CONTEXT_PROFILE:-$PI_CONTEXT_PROFILE_DEFAULT}"
}

pi_recovery_profile() {
  printf '%s' "${PROJECT_INITIALIZER_RECOVERY_PROFILE:-$PI_RECOVERY_PROFILE_DEFAULT}"
}

pi_state_profile() {
  printf '%s' "${PROJECT_INITIALIZER_STATE_PROFILE:-$PI_STATE_PROFILE_DEFAULT}"
}

pi_orchestration_profile() {
  printf '%s' "${PROJECT_INITIALIZER_ORCHESTRATION_PROFILE:-$PI_ORCHESTRATION_PROFILE_DEFAULT}"
}

pi_evaluation_profile() {
  printf '%s' "${PROJECT_INITIALIZER_EVALUATION_PROFILE:-$PI_EVALUATION_PROFILE_DEFAULT}"
}

pi_handoff_profile() {
  printf '%s' "${PROJECT_INITIALIZER_HANDOFF_PROFILE:-$PI_HANDOFF_PROFILE_DEFAULT}"
}

pi_external_tooling_hosts_json() {
  printf '%s' "${PROJECT_INITIALIZER_EXTERNAL_TOOLING_HOSTS_JSON:-$PI_EXTERNAL_TOOLING_HOSTS_DEFAULT}"
}

pi_external_tooling_gbrain_mcp() {
  printf '%s' "${PROJECT_INITIALIZER_EXTERNAL_TOOLING_GBRAIN_MCP:-candidate-disabled}"
}

pi_external_tooling_defaults_summary() {
  cat <<'EOF_EXTERNAL_TOOLING_DEFAULTS'
- Policy defaults: routing complex->gstack, simple->waza, knowledge->gbrain
- Hosts: claude-code, codex
- Mode: guidance-only
- Detection: init-migrate
- Waza: Codex-first, managed skills check/design/health/hunt/learn/read/think/write, stage upstream in ~/.agents/skills, sync verified copies into ~/.codex/skills
- gbrain MCP: candidate-disabled
- Auto-actions: never install, upgrade, serve, sync, or enable MCP automatically
EOF_EXTERNAL_TOOLING_DEFAULTS
}

pi_resolve_external_tooling_detector() {
  local repo_dir="$1"
  local fallback_script="${2:-}"
  local repo_detector="$repo_dir/scripts/check-agent-tooling.sh"

  if [[ -f "$repo_detector" ]]; then
    printf '%s' "$repo_detector"
    return 0
  fi

  if [[ -n "$fallback_script" && -f "$fallback_script" ]]; then
    printf '%s' "$fallback_script"
    return 0
  fi

  return 1
}

pi_print_external_tooling_report() {
  local repo_dir="$1"
  local mode="${2:-apply}"
  local fallback_script="${3:-}"
  local detector
  local output

  echo "--- External Tooling ---"
  pi_external_tooling_defaults_summary

  detector="$(pi_resolve_external_tooling_detector "$repo_dir" "$fallback_script" || true)"
  if [[ -z "$detector" ]]; then
    echo "- Advisory detector: unavailable"
    return 0
  fi

  if output="$(cd "$repo_dir" && bash "$detector" --host both --check-updates 2>&1)"; then
    if [[ "$mode" == "apply" ]]; then
      echo "- Advisory report:"
    else
      echo "- Advisory report (dry-run snapshot):"
    fi
    printf '%s\n' "$output" | sed 's/^/  /'
    return 0
  fi

  echo "- Advisory report: detector failed (non-fatal)"
  printf '%s\n' "$output" | sed 's/^/  /'
}

pi_should_generate_directory_context() {
  local target_dir="$1"
  local dir

  for dir in apps packages services; do
    if [[ -d "$target_dir/$dir" ]] && find "$target_dir/$dir" -mindepth 1 -maxdepth 1 -type d -print -quit 2>/dev/null | grep -q .; then
      return 0
    fi
  done

  return 1
}

pi_write_harness_policy() {
  local target_dir="$1"
  local mode="${2:-apply}"
  local output_file="$target_dir/.ai/harness/policy.json"
  local default_file
  local merged_file

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] write $output_file"
    return 0
  fi

  mkdir -p "$(dirname "$output_file")"
  default_file="$(mktemp)"
  merged_file="$(mktemp)"
  cat > "$default_file" <<EOF_POLICY
{
  "version": 1,
  "active_plan": {
    "marker_file": ".claude/.active-plan",
    "directory": "plans",
    "archive_directory": "plans/archive",
    "glob": "plan-*.md",
    "source_of_truth": "latest non-archived plan or explicit marker"
  },
  "tasks": {
    "todo_file": "tasks/todo.md",
    "lessons_file": "tasks/lessons.md",
    "research_file": "tasks/research.md",
    "contracts_dir": "tasks/contracts",
    "reviews_dir": "tasks/reviews"
  },
  "progress": {
    "file": "docs/PROGRESS.md",
    "mode": "milestone-only"
  },
  "context": {
    "profile": "$(pi_context_profile)",
    "map_file": ".ai/context/context-map.json"
  },
  "harness": {
    "policy_file": ".ai/harness/policy.json",
    "checks_file": ".ai/harness/checks/latest.json",
    "handoff_file": ".ai/harness/handoff/current.md",
    "failure_log_file": ".ai/harness/failures/latest.jsonl",
    "events_file": ".ai/harness/events.jsonl",
    "runs_dir": ".ai/harness/runs"
  },
  "context_budget": {
    "status_file": ".ai/harness/context-budget/latest.json",
    "source_priority": ["rollout_token_count", "state_thread", "tool_call_count"],
    "zones": {
      "yellow": 0.55,
      "orange": 0.7,
      "red": 0.8
    },
    "fallback_model_windows": {
      "gpt-5.4": 1050000,
      "gpt-5.5": 258000
    },
    "fallback_tool_calls": {
      "yellow": 30,
      "orange": 40,
      "red": 50
    }
  },
  "handoff_resume": {
    "resume_packet_file": ".ai/harness/handoff/resume.md",
    "global_handoff_dir": "~/.codex/handoffs",
    "auto_start_new_session": false
  },
  "sidecar_research": {
    "default": true,
    "output_file": "tasks/research.md",
    "preferred_runners": ["subagent", "codex exec --json"],
    "main_thread_policy": "consume conclusions and evidence paths, not raw logs"
  },
  "profiles": {
    "orchestration": "$(pi_orchestration_profile)",
    "evaluation": "$(pi_evaluation_profile)",
    "handoff": "$(pi_handoff_profile)",
    "recovery": "$(pi_recovery_profile)",
    "state": "$(pi_state_profile)"
  },
  "external_tooling": {
    "routing": {
      "complex": "gstack",
      "simple": "waza",
      "knowledge": "gbrain"
    },
    "hosts": $(pi_external_tooling_hosts_json),
    "mode": "guidance-only",
    "detection": "init-migrate",
    "waza": {
      "source_repo": "tw93/Waza",
      "source_url": "https://github.com/tw93/Waza.git",
      "managed_skills": ["check", "design", "health", "hunt", "learn", "read", "think", "write"],
      "primary_host": "codex",
      "codex_primary_path": "~/.codex/skills",
      "staging_cache_path": "~/.agents/skills",
      "sync_mode": "stage-upstream-then-copy-to-codex",
      "host_drift_policy": "report-per-host-version-staging-and-upstream-drift"
    },
    "gbrain": {
      "mcp": "$(pi_external_tooling_gbrain_mcp)"
    }
  },
  "enforcement": {
    "worktree_guard": "warn-by-default",
    "verification_gate": "contract-and-review",
    "completion_requires_checks": true
  }
}
EOF_POLICY

  if [[ -f "$output_file" ]]; then
    if ! pi_merge_json_defaults "$default_file" "$output_file" "$merged_file"; then
      cp "$default_file" "$merged_file"
    fi
  else
    cp "$default_file" "$merged_file"
  fi

  mv "$merged_file" "$output_file"
  rm -f "$default_file"
}

pi_write_context_map() {
  local target_dir="$1"
  local mode="${2:-apply}"
  local output_file="$target_dir/.ai/context/context-map.json"
  local discoverable_entries

  discoverable_entries=$(
    cat <<'EOF_DISCOVERABLE'
    {
      "path": "apps/*/AGENTS.md",
      "priority": "high",
      "char_budget": 1200,
      "purpose": "subdir-contract"
    },
    {
      "path": "packages/*/AGENTS.md",
      "priority": "medium",
      "char_budget": 1000,
      "purpose": "package-contract"
    },
    {
      "path": "services/*/AGENTS.md",
      "priority": "medium",
      "char_budget": 1000,
      "purpose": "service-contract"
    },
    {
      "path": "docs/reference-configs/*.md",
      "priority": "low",
      "char_budget": 900,
      "purpose": "deep-doc"
    }
EOF_DISCOVERABLE
  )

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] write $output_file"
    return 0
  fi

  mkdir -p "$(dirname "$output_file")"
  cat > "$output_file" <<EOF_CONTEXT
{
  "version": 1,
  "profile": "$(pi_context_profile)",
  "root_context_files": [
    "CLAUDE.md",
    "AGENTS.md",
    "docs/spec.md",
    "tasks/todo.md",
    "tasks/lessons.md",
    ".ai/harness/policy.json"
  ],
  "discoverable_contexts": [
${discoverable_entries}
  ],
  "budgets": {
    "root_total_chars": 12000,
    "per_discoverable_file_chars": 1200
  }
}
EOF_CONTEXT
}

pi_install_directory_context_files() {
  local target_dir="$1"
  local mode="${2:-apply}"
  local directory_agents_content
  local dir
  local module_dir

  if ! pi_should_generate_directory_context "$target_dir"; then
    return 0
  fi

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] install nested AGENTS.md files in $target_dir"
    return 0
  fi

  directory_agents_content=$(cat <<'EOF_DIRECTORY_AGENTS'
# Directory AGENTS.md

Keep this file focused on the local module contract for this subtree.

## Local Context Contract

- Describe only the ownership, boundaries, and stable entrypoints for this subtree.
- Route deep implementation detail into nearby docs instead of inflating the root AGENTS.md.
- Treat `.ai/context/context-map.json` as the index of discoverable context files.
- Prefer repo-local workflow artifacts over tool-specific chat memory.
EOF_DIRECTORY_AGENTS
)

  for dir in apps packages services; do
    [[ -d "$target_dir/$dir" ]] || continue

    while IFS= read -r module_dir; do
      [[ -n "$module_dir" ]] || continue
      if [[ ! -f "$module_dir/AGENTS.md" ]]; then
        printf '%s\n' "$directory_agents_content" > "$module_dir/AGENTS.md"
      fi
    done < <(find "$target_dir/$dir" -mindepth 1 -maxdepth 1 -type d | sort)
  done
}

pi_ensure_harness_state_surface() {
  local target_dir="$1"
  local mode="${2:-apply}"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] ensure harness policy/context/events/runs in $target_dir"
    return 0
  fi

  mkdir -p \
    "$target_dir/.ai/context" \
    "$target_dir/.ai/harness/checks" \
    "$target_dir/.ai/harness/handoff" \
    "$target_dir/.ai/harness/context-budget" \
    "$target_dir/.ai/harness/failures" \
    "$target_dir/.ai/harness/runs"

  [[ -f "$target_dir/.ai/harness/checks/latest.json" ]] || printf "{}\n" > "$target_dir/.ai/harness/checks/latest.json"
  [[ -f "$target_dir/.ai/harness/handoff/current.md" ]] || printf "# Harness Handoff\n\n> **Reason**: bootstrap\n" > "$target_dir/.ai/harness/handoff/current.md"
  [[ -f "$target_dir/.ai/harness/handoff/resume.md" ]] || printf "# Codex Resume Packet\n\n> **Reason**: bootstrap\n" > "$target_dir/.ai/harness/handoff/resume.md"
  [[ -f "$target_dir/.ai/harness/context-budget/latest.json" ]] || printf "{}\n" > "$target_dir/.ai/harness/context-budget/latest.json"
  [[ -f "$target_dir/.ai/harness/events.jsonl" ]] || : > "$target_dir/.ai/harness/events.jsonl"
  [[ -f "$target_dir/.ai/harness/failures/latest.jsonl" ]] || : > "$target_dir/.ai/harness/failures/latest.jsonl"
  [[ -f "$target_dir/.ai/harness/runs/.gitkeep" ]] || : > "$target_dir/.ai/harness/runs/.gitkeep"

  pi_write_harness_policy "$target_dir" "$mode"
  pi_write_context_map "$target_dir" "$mode"
  pi_install_directory_context_files "$target_dir" "$mode"
}

pi_resolve_js_runtime() {
  if command -v node >/dev/null 2>&1; then
    printf 'node'
    return 0
  fi

  if command -v bun >/dev/null 2>&1; then
    printf 'bun'
    return 0
  fi

  if [[ -x "${HOME}/.bun/bin/bun" ]]; then
    printf '%s' "${HOME}/.bun/bin/bun"
    return 0
  fi

  return 1
}

pi_merge_json_defaults() {
  local defaults_file="$1"
  local current_file="$2"
  local output_file="$3"
  local js_runtime

  js_runtime="$(pi_resolve_js_runtime || true)"
  if [[ -n "$js_runtime" ]]; then
    "$js_runtime" -e '
const fs = require("fs");
const [defaultsPath, currentPath, outputPath] = process.argv.slice(1);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeDefaults(defaultsValue, currentValue) {
  if (Array.isArray(defaultsValue)) {
    return Array.isArray(currentValue) ? currentValue : defaultsValue;
  }

  if (isPlainObject(defaultsValue)) {
    const result = { ...defaultsValue };
    if (isPlainObject(currentValue)) {
      for (const [key, value] of Object.entries(currentValue)) {
        result[key] = Object.prototype.hasOwnProperty.call(defaultsValue, key)
          ? mergeDefaults(defaultsValue[key], value)
          : value;
      }
    }
    return result;
  }

  return currentValue === undefined ? defaultsValue : currentValue;
}

const defaultsJson = JSON.parse(fs.readFileSync(defaultsPath, "utf8"));
let currentJson = {};
try {
  currentJson = JSON.parse(fs.readFileSync(currentPath, "utf8"));
} catch (_error) {
  currentJson = {};
}

const merged = mergeDefaults(defaultsJson, currentJson);
fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2) + "\n");
' "$defaults_file" "$current_file" "$output_file"
    return $?
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$defaults_file" "$current_file" "$output_file" <<'PY_EOF'
import json
import sys

defaults_path, current_path, output_path = sys.argv[1:]

def merge_defaults(defaults_value, current_value):
    if isinstance(defaults_value, list):
        return current_value if isinstance(current_value, list) else defaults_value
    if isinstance(defaults_value, dict):
        result = dict(defaults_value)
        if isinstance(current_value, dict):
            for key, value in current_value.items():
                result[key] = merge_defaults(defaults_value[key], value) if key in defaults_value else value
        return result
    return defaults_value if current_value is None else current_value

with open(defaults_path, "r", encoding="utf-8") as handle:
    defaults_json = json.load(handle)

try:
    with open(current_path, "r", encoding="utf-8") as handle:
        current_json = json.load(handle)
except Exception:
    current_json = {}

merged = merge_defaults(defaults_json, current_json)
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(merged, handle, indent=2)
    handle.write("\n")
PY_EOF
    return $?
  fi

  return 1
}

pi_ensure_task_sync() {
  local target_dir="$1"
  local create_if_missing="${2:-0}"
  local mode="${3:-apply}"
  local package_file="$target_dir/package.json"
  local js_runtime
  local project_name

  if [[ ! -f "$package_file" && "$create_if_missing" != "1" ]]; then
    if [[ "$mode" != "apply" ]]; then
      echo "[dry-run] package.json missing; skip task workflow script injection"
    fi
    return 0
  fi

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] inject task workflow scripts into $package_file"
    return 0
  fi

  if [[ ! -f "$package_file" ]]; then
    project_name="$(basename "$target_dir" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9-' '-')"
    project_name="${project_name:-project}"
    cat > "$package_file" <<EOF_PACKAGE
{
  "name": "$project_name",
  "private": true,
  "scripts": {
    "check:context-files": "bash scripts/check-context-files.sh",
    "check:task-sync": "bash scripts/check-task-sync.sh",
    "check:task-workflow": "bash scripts/check-task-workflow.sh --strict"
  }
}
EOF_PACKAGE
    return 0
  fi

  js_runtime="$(pi_resolve_js_runtime || true)"
  if [[ -z "$js_runtime" ]]; then
    echo "[warn] no JavaScript runtime found; unable to inject task workflow scripts into $package_file" >&2
    return 0
  fi

  "$js_runtime" -e '
const fs = require("fs");
const file = process.argv[1];
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
pkg.private ??= true;
pkg.scripts ??= {};
pkg.scripts["check:context-files"] = "bash scripts/check-context-files.sh";
pkg.scripts["check:task-sync"] = "bash scripts/check-task-sync.sh";
pkg.scripts["check:task-workflow"] = "bash scripts/check-task-workflow.sh --strict";
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
' "$package_file"
}

pi_factor_factory_gitignore_entries() {
  printf '%s\n' ".claude/.factor-cache/"
}

pi_should_enable_factor_factory() {
  local plan_type="${1:-${PROJECT_INITIALIZER_PLAN_TYPE:-}}"
  local explicit="${PROJECT_INITIALIZER_FACTOR_FACTORY:-0}"

  case "$explicit" in
    1|true|TRUE|yes|YES) return 0 ;;
  esac

  [[ "$plan_type" == "G" ]]
}

pi_install_factor_factory() {
  local target_dir="$1"
  local factor_assets_dir="$2"
  local scripts_source_dir="$3"
  local mode="${4:-apply}"
  local scripts_dir="$target_dir/scripts"
  local factors_dir="$target_dir/tasks/factors"
  local cache_dir="$target_dir/.claude/.factor-cache/candidates"
  local registry_template="$factor_assets_dir/factor-registry.template.json"
  local hypothesis_template="$factor_assets_dir/factor-hypothesis.template.md"
  local report_template="$factor_assets_dir/factor-backtest-report.template.md"

  if [[ "$mode" != "apply" ]]; then
    echo "[dry-run] install factor factory assets into $target_dir"
    return 0
  fi

  mkdir -p "$factors_dir/promoted" "$cache_dir" "$scripts_dir"

  if [[ -f "$registry_template" ]]; then
    cp "$registry_template" "$factors_dir/registry.json"
  fi

  if [[ -f "$hypothesis_template" ]]; then
    mkdir -p "$target_dir/.claude/factor-factory"
    cp "$hypothesis_template" "$target_dir/.claude/factor-factory/hypothesis.template.md"
  fi

  if [[ -f "$report_template" ]]; then
    mkdir -p "$target_dir/.claude/factor-factory"
    cp "$report_template" "$target_dir/.claude/factor-factory/backtest-report.template.md"
  fi

  local factor_script
  for factor_script in factor-lab-new.sh factor-lab-promote.sh factor-lab-reject.sh factor-lab-check.sh; do
    if [[ -f "$scripts_source_dir/$factor_script" ]]; then
      cp "$scripts_source_dir/$factor_script" "$scripts_dir/$factor_script"
    fi
  done

  pi_ensure_executable_if_apply "$mode" "$scripts_dir"/factor-lab-*.sh
}
