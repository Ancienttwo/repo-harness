#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/ensure-task-workflow.sh [--slug <slug>] [--title <title>]
USAGE_EOF
}

normalize_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

get_active_plan() {
  if [[ -f ".claude/.active-plan" ]]; then
    local marker_plan
    marker_plan="$(cat ".claude/.active-plan" 2>/dev/null | xargs)"
    if [[ -n "$marker_plan" && -f "$marker_plan" ]]; then
      printf '%s' "$marker_plan"
      return 0
    fi
  fi
  local latest
  latest="$(find plans -maxdepth 1 -type f -name 'plan-*.md' 2>/dev/null | sort | tail -1)"
  if [[ -n "$latest" ]]; then
    printf '%s' "$latest"
    return 0
  fi
  return 1
}

ensure_templates() {
  mkdir -p .claude/templates

  if [[ ! -f ".claude/templates/spec.template.md" ]]; then
    cat > .claude/templates/spec.template.md <<'SPEC_TEMPLATE_EOF'
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
SPEC_TEMPLATE_EOF
  fi

  if [[ ! -f ".claude/templates/research.template.md" ]]; then
    cat > .claude/templates/research.template.md <<'RESEARCH_TEMPLATE_EOF'
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
RESEARCH_TEMPLATE_EOF
  fi

  if [[ ! -f ".claude/templates/plan.template.md" ]]; then
    cat > .claude/templates/plan.template.md <<'PLAN_TEMPLATE_EOF'
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

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] ...
PLAN_TEMPLATE_EOF
  fi

  if [[ ! -f ".claude/templates/contract.template.md" ]]; then
    cat > .claude/templates/contract.template.md <<'CONTRACT_TEMPLATE_EOF'
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
CONTRACT_TEMPLATE_EOF
  fi

  if [[ ! -f ".claude/templates/review.template.md" ]]; then
    cat > .claude/templates/review.template.md <<'REVIEW_TEMPLATE_EOF'
# Sprint Review: {{TASK_SLUG}}

> **Status**: Pending
> **Plan**: {{PLAN_FILE}}
> **Contract**: {{CONTRACT_FILE}}
> **Checks File**: {{CHECKS_FILE}}
> **Last Updated**: {{TIMESTAMP}}
> **Recommendation**: fail

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
REVIEW_TEMPLATE_EOF
  fi
}

ensure_idle_todo() {
  mkdir -p tasks
  if [[ ! -f "tasks/todo.md" ]]; then
    cat > tasks/todo.md <<'TODO_EOF'
# Task Execution Checklist (Primary)

> **Source Plan**: (none)
> **Status**: Idle
> Generate the next execution checklist from an approved plan with:
>   bash scripts/plan-to-todo.sh --plan plans/plan-YYYYMMDD-HHMM-slug.md

## Execution
- [ ] No active execution checklist
TODO_EOF
  fi
}

ensure_auxiliary_files() {
  mkdir -p plans plans/archive tasks/archive tasks/contracts tasks/reviews docs scripts .ai/context .ai/harness/checks .ai/harness/handoff .ai/harness/context-budget .ai/harness/failures .ai/harness/runs

  if [[ ! -f "docs/spec.md" ]]; then
    cat > docs/spec.md <<'SPEC_EOF'
# Product Spec

> **Status**: Draft
> **Owner**: Planner
SPEC_EOF
  fi

  if [[ ! -f "tasks/lessons.md" ]]; then
    cat > tasks/lessons.md <<'LESSONS_EOF'
# Lessons Learned (Self-Improvement Loop)

> Capture correction-derived prevention rules here.
> Promote repeated patterns into durable project rules during spa day.

## Template
- Date:
- Triggered by correction:
- Mistake pattern:
- Prevention rule:
- Where to apply next time:
LESSONS_EOF
  fi

  if [[ ! -f "tasks/research.md" ]]; then
    cat > tasks/research.md <<'RESEARCH_EOF'
# Project — Research Notes

> **Last Updated**: TBD
> **Scope**: (what area of the codebase was researched)

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
RESEARCH_EOF
  fi

  if [[ ! -f "docs/PROGRESS.md" ]]; then
    cat > docs/PROGRESS.md <<'PROGRESS_EOF'
# Project Milestones

> Use this file for milestone checkpoints only.
> Active execution belongs in `tasks/todo.md`, `tasks/contracts/`, `tasks/reviews/`, and `.ai/harness/handoff/current.md`.

## Current Milestone

- Name: First milestone
- Status: In progress
- Success state: Ship the next agreed milestone without reopening the active sprint checklist.

## Completed Milestones

- [ ] Capture the previous milestone here once it ships

## Next Milestone / Blockers

- [ ] Define the next milestone ship target
- [ ] Record the blocker or dependency that gates the next milestone.

## Milestone Notes

- Record releases, migrations, and major checkpoints here.
PROGRESS_EOF
  fi

  if [[ ! -f ".ai/harness/checks/latest.json" ]]; then
    echo "{}" > ".ai/harness/checks/latest.json"
  fi

  if [[ ! -f ".ai/harness/handoff/current.md" ]]; then
    cat > ".ai/harness/handoff/current.md" <<'HANDOFF_EOF'
# Harness Handoff

> **Reason**: bootstrap
HANDOFF_EOF
  fi

  if [[ ! -f ".ai/harness/handoff/resume.md" ]]; then
    cat > ".ai/harness/handoff/resume.md" <<'RESUME_EOF'
# Codex Resume Packet

> **Reason**: bootstrap
RESUME_EOF
  fi

  if [[ ! -f ".ai/harness/context-budget/latest.json" ]]; then
    echo "{}" > ".ai/harness/context-budget/latest.json"
  fi

  if [[ ! -f ".ai/harness/events.jsonl" ]]; then
    : > ".ai/harness/events.jsonl"
  fi

  if [[ ! -f ".ai/harness/failures/latest.jsonl" ]]; then
    : > ".ai/harness/failures/latest.jsonl"
  fi

  if [[ ! -f ".ai/harness/runs/.gitkeep" ]]; then
    : > ".ai/harness/runs/.gitkeep"
  fi

  if [[ ! -f ".ai/harness/policy.json" ]]; then
    cat > ".ai/harness/policy.json" <<'POLICY_EOF'
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
    "profile": "stable-root-progressive-subdir",
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
    "orchestration": "shared-long-running-harness",
    "evaluation": "browser-qa",
    "handoff": "artifact-aware",
    "recovery": "hybrid",
    "state": "file-backed"
  },
  "external_tooling": {
    "routing": {
      "complex": "gstack",
      "simple": "waza",
      "knowledge": "gbrain"
    },
    "hosts": [
      "claude-code",
      "codex"
    ],
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
      "mcp": "candidate-disabled"
    }
  },
  "enforcement": {
    "worktree_guard": "warn-by-default",
    "verification_gate": "contract-and-review",
    "completion_requires_checks": true
  }
}
POLICY_EOF
  fi

  if [[ ! -f ".ai/context/context-map.json" ]]; then
    cat > ".ai/context/context-map.json" <<'CONTEXT_EOF'
{
  "version": 1,
  "profile": "stable-root-progressive-subdir",
  "root_context_files": [
    "CLAUDE.md",
    "AGENTS.md",
    "docs/spec.md",
    "tasks/todo.md",
    "tasks/lessons.md",
    ".ai/harness/policy.json"
  ],
  "discoverable_contexts": [
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
  ],
  "budgets": {
    "root_total_chars": 12000,
    "per_discoverable_file_chars": 1200
  }
}
CONTEXT_EOF
  fi
}

slug=""
title=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)
      [[ -n "${2:-}" ]] || { echo "Error: --slug requires a value" >&2; usage; exit 1; }
      slug="$2"
      shift 2
      ;;
    --title)
      [[ -n "${2:-}" ]] || { echo "Error: --title requires a value" >&2; usage; exit 1; }
      title="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

ensure_templates
ensure_auxiliary_files
ensure_idle_todo

active_plan="$(get_active_plan || true)"
if [[ -n "$active_plan" ]]; then
  echo "Workflow ready. Active plan: $active_plan"
  exit 0
fi

if [[ ! -f "docs/spec.md" ]]; then
  if [[ -x "scripts/new-spec.sh" ]]; then
    bash "scripts/new-spec.sh"
  fi
fi

if [[ -z "$slug" ]]; then
  echo "Workflow ready. No active plan present."
  echo "Create one with: bash scripts/ensure-task-workflow.sh --slug <slug> --title <title>"
  exit 0
fi

slug="$(normalize_slug "$slug")"
if [[ -z "$slug" ]]; then
  echo "Slug is empty after normalization" >&2
  exit 1
fi

if [[ -z "$title" ]]; then
  title="$slug"
fi

if [[ -x "scripts/new-plan.sh" ]]; then
  bash "scripts/new-plan.sh" --slug "$slug" --title "$title"
else
  echo "Missing scripts/new-plan.sh" >&2
  exit 1
fi
