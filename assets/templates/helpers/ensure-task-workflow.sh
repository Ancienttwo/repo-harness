#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/ensure-task-workflow.sh [--new-plan] [--slug <slug>] [--title <title>]
USAGE_EOF
}

normalize_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

ACTIVE_PLAN_MARKER=".ai/harness/active-plan"
LEGACY_ACTIVE_PLAN_MARKER=".claude/.active-plan"

read_active_plan_marker() {
  local marker_file="$1"
  local marker_plan

  if [[ -f "$marker_file" ]]; then
    marker_plan="$(cat "$marker_file" 2>/dev/null | xargs)"
    if [[ -n "$marker_plan" && -f "$marker_plan" ]]; then
      printf '%s' "$marker_plan"
      return 0
    fi
  fi

  return 1
}

get_active_plan() {
  read_active_plan_marker "$ACTIVE_PLAN_MARKER" \
    || read_active_plan_marker "$LEGACY_ACTIVE_PLAN_MARKER"
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
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md`
> **Sprint Review**: `tasks/reviews/{{ARTIFACT_STEM}}.review.md`
> **Implementation Notes**: `tasks/notes/{{ARTIFACT_STEM}}.notes.md`

## Agentic Routing
- Selected route:
- Routing reason:
- Due diligence:
  - P1 map:
  - P2 trace:
  - P3 decision rationale:

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `{{PLAN_FILE}}`
- Sprint contract: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md`
- Sprint review: `tasks/reviews/{{ARTIFACT_STEM}}.review.md`
- Implementation notes: `tasks/notes/{{ARTIFACT_STEM}}.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan {{PLAN_FILE}}` and may start `scripts/contract-worktree.sh start --plan {{PLAN_FILE}}`.

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
- Contract file: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md`
- Review file: `tasks/reviews/{{ARTIFACT_STEM}}.review.md`
- Implementation notes file: `tasks/notes/{{ARTIFACT_STEM}}.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/{{ARTIFACT_STEM}}.contract.md --strict`
- Active plan rule: `.ai/harness/active-plan` is authoritative for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**:
- **Verification evidence**:
- **Evaluator rubric**:
- **Stop condition**:
- **Rollback surface**:

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
> **Capability ID**: {{CAPABILITY_ID}}
> **Last Updated**: {{TIMESTAMP}}
> **Review File**: `{{REVIEW_FILE}}`
> **Notes File**: `{{NOTES_FILE}}`

## Goal

Describe the exact outcome this task must deliver.

## Scope

- In scope:
- Out of scope:

## Workflow Inventory

- Source plan: `{{PLAN_FILE}}`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `{{REVIEW_FILE}}`
- Notes file: `{{NOTES_FILE}}`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todo.md
  - {{CONTRACT_FILE}}
  - {{REVIEW_FILE}}
  - {{NOTES_FILE}}
  - .ai/context/capabilities.json
  - src/
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/modules/{{TASK_SLUG}}/index.ts
    - {{NOTES_FILE}}
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
> **Notes File**: {{NOTES_FILE}}
> **Checks File**: {{CHECKS_FILE}}
> **Last Updated**: {{TIMESTAMP}}
> **Recommendation**: fail

## Verification Evidence

- Waza /check run:
- Commands run:
- Manual checks:
- Supporting artifacts:

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:

- P1 blockers:
- P2 advisories:
- Acceptance checklist:

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

  if [[ ! -f ".claude/templates/implementation-notes.template.md" ]]; then
    cat > .claude/templates/implementation-notes.template.md <<'NOTES_TEMPLATE_EOF'
# Implementation Notes: {{TASK_SLUG}}

> **Status**: Active
> **Plan**: {{PLAN_FILE}}
> **Contract**: {{CONTRACT_FILE}}
> **Review**: {{REVIEW_FILE}}
> **Last Updated**: {{TIMESTAMP}}
> **Lifecycle**: notes

## Design Decisions

- ...

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
NOTES_TEMPLATE_EOF
  fi
}

ensure_idle_todo() {
  mkdir -p tasks
  if [[ ! -f "tasks/todo.md" ]]; then
    cat > tasks/todo.md <<'TODO_EOF'
# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: (ensure-task-workflow)
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| (none) | No deferred medium/long-term goal recorded yet. | Keep the current slice bounded. | Add a row when a real follow-up is postponed. |
TODO_EOF
  fi
}

ensure_current_status_snapshot() {
  mkdir -p tasks
  if [[ -x "scripts/refresh-current-status.sh" ]]; then
    bash "scripts/refresh-current-status.sh" --clear --write --reason "ensure-task-workflow" >/dev/null 2>&1 || true
    return 0
  fi

  if [[ ! -f "tasks/current.md" ]]; then
    cat > tasks/current.md <<'CURRENT_STATUS_EOF'
# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: bootstrap -->
<!-- stale_after: 24h -->

> **Status**: Idle
> **Updated At**: bootstrap
> **Source Branch**: main
> **Source Commit**: bootstrap
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: bootstrap
> **Derived From**: active-plan, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.
CURRENT_STATUS_EOF
  fi
}

ensure_auxiliary_files() {
  mkdir -p plans plans/archive tasks/archive tasks/contracts tasks/reviews tasks/notes tasks/workstreams docs/architecture/domains docs/architecture/modules docs/architecture/requests docs/architecture/snapshots docs/architecture/diagrams scripts .ai/context .ai/harness/checks .ai/harness/handoff .ai/harness/context-budget .ai/harness/failures .ai/harness/security .ai/harness/planning .ai/harness/architecture .ai/harness/worktrees .ai/harness/runs

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

  if [[ ! -f ".ai/harness/architecture/events.jsonl" ]]; then
    : > ".ai/harness/architecture/events.jsonl"
  fi

  if [[ ! -f ".ai/harness/architecture/.gitkeep" ]]; then
    : > ".ai/harness/architecture/.gitkeep"
  fi

  if [[ ! -f ".ai/harness/failures/latest.jsonl" ]]; then
    : > ".ai/harness/failures/latest.jsonl"
  fi

  if [[ ! -f ".ai/harness/security/.gitkeep" ]]; then
    : > ".ai/harness/security/.gitkeep"
  fi

  if [[ ! -f ".ai/harness/runs/.gitkeep" ]]; then
    : > ".ai/harness/runs/.gitkeep"
  fi
  if [[ ! -f ".ai/harness/worktrees/.gitkeep" ]]; then
    : > ".ai/harness/worktrees/.gitkeep"
  fi

  if [[ ! -f "docs/architecture/requests/.gitkeep" ]]; then
    : > "docs/architecture/requests/.gitkeep"
  fi

  if [[ ! -f "docs/architecture/snapshots/.gitkeep" ]]; then
    : > "docs/architecture/snapshots/.gitkeep"
  fi

  if [[ ! -f "docs/architecture/diagrams/.gitkeep" ]]; then
    : > "docs/architecture/diagrams/.gitkeep"
  fi

  if [[ ! -f "docs/architecture/domains/.gitkeep" ]]; then
    : > "docs/architecture/domains/.gitkeep"
  fi

  if [[ ! -f "docs/architecture/modules/.gitkeep" ]]; then
    : > "docs/architecture/modules/.gitkeep"
  fi

  if [[ ! -f "tasks/workstreams/.gitkeep" ]]; then
    : > "tasks/workstreams/.gitkeep"
  fi

  if [[ ! -f ".ai/context/capabilities.json" ]]; then
    cat > ".ai/context/capabilities.json" <<'CAPABILITIES_EOF'
{
  "version": 1,
  "capabilities": []
}
CAPABILITIES_EOF
  fi

  if [[ ! -f "docs/architecture/index.md" ]]; then
    cat > "docs/architecture/index.md" <<'ARCHITECTURE_INDEX_EOF'
# Architecture Index

> Umbrella architecture ledger for current boundaries, drift requests, snapshots, and diagrams.

## Current Snapshot

- Latest snapshot: (none yet)
- Semantic diagram source: (none yet)
- Latest human diagram: (none yet)

## Architecture Drift Flow

- `scripts/architecture-drift.sh` records architecture-sensitive edits as requests.
- `scripts/archive-architecture-request.sh` archives handled requests after an agent records the resolution status and linked artifacts.
- `scripts/context-contract-sync.sh` keeps only the controlled architecture block in functional-block `AGENTS.md` and `CLAUDE.md` files aligned.
- `scripts/workstream-sync.sh` keeps durable multi-session progress under `tasks/workstreams/<domain>/<capability>/` and projects only pointers into local contracts.
- Semantic architecture diagrams live as Mermaid fenced blocks in the relevant module or snapshot Markdown.
- Human-readable architecture diagrams are optional `mermaid` HTML files in `docs/architecture/diagrams/` and should link back to the Markdown semantic source.

## Pending Requests

ARCHITECTURE_INDEX_EOF
  fi

  if [[ ! -f ".ai/harness/policy.json" ]]; then
    cat > ".ai/harness/policy.json" <<'POLICY_EOF'
{
  "version": 1,
  "active_plan": {
    "marker_file": ".ai/harness/active-plan",
    "legacy_marker_file": ".claude/.active-plan",
    "directory": "plans",
    "archive_directory": "plans/archive",
    "glob": "plan-*.md",
    "active_worktree_marker_file": ".ai/harness/active-worktree",
    "source_of_truth": "per-worktree explicit marker with active-worktree owner; legacy Claude marker fallback only"
  },
  "tasks": {
    "todo_file": "tasks/todo.md",
    "current_status_file": "tasks/current.md",
    "lessons_file": "tasks/lessons.md",
    "research_file": "tasks/research.md",
    "workstreams_dir": "tasks/workstreams",
    "contracts_dir": "tasks/contracts",
    "reviews_dir": "tasks/reviews",
    "notes_dir": "tasks/notes"
  },
  "reference_material": {
    "dir": "_ref",
    "mode": "external-ignored",
    "commit_policy": "never commit _ref contents",
    "rule": "use _ref as an occasional ignored external reference checkout cache for upstream/source comparison only; refresh from external sources instead of editing as product code; when it influences a decision, cite the source repo plus commit/tag and path in tasks/notes/ or tasks/research.md"
  },
  "operations": {
    "dir": "deploy",
    "private_dir": "_ops",
    "tracked": ["deploy/README.md", "deploy/scripts/", "deploy/submissions/", "deploy/runbooks/", "deploy/release-checklists/", "deploy/sql/", "deploy/*.md", "deploy/env/.env.example"],
    "ignored": ["_ops/"],
    "rule": "commit deployment runbooks, submission materials, release checklists, helper scripts, ordered SQL files, and env examples under deploy/; keep deploy SQL in deploy/sql/ with 4-digit ascending prefixes; keep keys, tokens, real env values, provider state, artifacts, logs, and scratch files in ignored _ops/ only"
  },
  "context": {
    "profile": "stable-root-progressive-subdir",
    "map_file": ".ai/context/context-map.json",
    "capability_registry_file": ".ai/context/capabilities.json",
    "capability_resolver": "scripts/capability-resolver.ts",
    "capability_match_rule": "longest-prefix; same-length ambiguity fails",
    "functional_block_selector": {
      "script": "scripts/select-agent-context-blocks.sh",
      "config_file": ".ai/context/agent-context-blocks.txt",
      "env": "REPO_HARNESS_CONTEXT_BLOCKS",
      "legacy_env": "PROJECT_INITIALIZER_CONTEXT_BLOCKS",
      "rule": "compatibility selector; capability registry is the source of truth"
    }
  },
  "harness": {
    "policy_file": ".ai/harness/policy.json",
    "checks_file": ".ai/harness/checks/latest.json",
    "handoff_file": ".ai/harness/handoff/current.md",
    "failure_log_file": ".ai/harness/failures/latest.jsonl",
    "events_file": ".ai/harness/events.jsonl",
    "architecture_events_file": ".ai/harness/architecture/events.jsonl",
    "runs_dir": ".ai/harness/runs"
  },
  "architecture": {
    "index_file": "docs/architecture/index.md",
    "requests_dir": "docs/architecture/requests",
    "snapshots_dir": "docs/architecture/snapshots",
    "diagrams_dir": "docs/architecture/diagrams",
    "domains_dir": "docs/architecture/domains",
    "modules_dir": "docs/architecture/modules",
    "diagram_skill": "mermaid",
    "diagram_skill_source": "~/.codex/skills/mermaid",
    "vendoring_policy": "do-not-vendor-diagram-skill-assets",
    "contract_block_begin": "<!-- BEGIN ARCHITECTURE CONTRACT -->",
    "contract_block_end": "<!-- END ARCHITECTURE CONTRACT -->",
    "rule": "hooks record drift and sync controlled local context blocks; agents author semantic snapshots and diagrams"
  },
  "workstreams": {
    "dir": "tasks/workstreams",
    "scope": "capability",
    "projection": "local-contract-active-pointer-and-current-slice",
    "todo_projection": "tasks/todo.md",
    "rule": "durable multi-session progress lives under tasks/workstreams/<domain>/<capability>; current plan execution lives in the plan Task Breakdown; tasks/todo.md records deferred goals only"
  },
  "information_lifecycle": {
    "notes": {
      "dir": "tasks/notes",
      "purpose": "task-local implementation decisions, deviations, tradeoffs, and open questions",
      "promotion": "archive on workflow close; promote only repeated or durable findings"
    },
    "evidence": {
      "latest": ".ai/harness/checks/latest.json",
      "snapshots_dir": ".ai/harness/runs",
      "purpose": "raw verification records used to audit notes, reviews, and future promotion"
    },
    "assets": {
      "sources": [".ai/harness/policy.json", ".ai/harness/workflow-contract.json", ".ai/hooks/", "scripts/", "docs/reference-configs/"],
      "promotion_rule": "only promote patterns after verified reuse across tasks or fixtures"
    },
    "memory": {
      "sources": ["tasks/research.md", "tasks/lessons.md", "gbrain"],
      "rule": "memory is advisory; current repo state and evidence override summaries"
    },
    "external_knowledge": {
      "default_brain_path": "brain/<project>/*",
      "project_path": "brain/<project>/*",
      "manifest_file": ".ai/harness/brain-manifest.json",
      "drift_check": "scripts/check-brain-manifest.sh",
      "sync_script": "scripts/sync-brain-docs.sh",
      "hook_trigger": "PostToolUse Edit|Write for manifest entries with sync.direction=repo-to-brain",
      "rule": "external knowledge stores long-lived explanations, runbooks, and patterns only; repo-local contracts, hooks, scripts, checks, and evidence remain authoritative",
      "sync_rule": "only explicitly opted-in repo-to-brain manifest entries may be written to the default brain vault; pointer-only externalized stubs remain check-only"
    }
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
  "plan_capture": {
    "script": "scripts/capture-plan.sh",
    "sources": ["codex-plan-mode", "waza-think", "repo-harness-plan"],
    "rule": "Codex Plan mode and Waza think planning should capture decision-complete plans into plans/plan-*.md; implementation approval then projects the active approved plan through scripts/plan-to-todo.sh"
  },
  "planning": {
    "pending_orchestration_file": ".ai/harness/planning/pending.json",
    "source_of_truth": "transient host planning bridge only; plans/ and .ai/harness/active-plan remain authoritative"
  },
  "sidecar_research": {
    "default": true,
    "output_file": "tasks/research.md",
    "preferred_runners": ["subagent", "codex exec --json", "main-thread trace"],
    "spawn_decision": "main agent decides from task breadth, context impact, raw-log volume, and callable runner availability; do not ask the user for spawn confirmation",
    "fallback_runner": "main-thread trace",
    "main_thread_policy": "if spawning is not worthwhile or no sidecar runner is callable, perform bounded research in the main thread; consume conclusions and evidence paths, not raw logs"
  },
  "documentation": {
    "profile": "minimal-agentic",
    "required": ["docs/spec.md", "docs/architecture/index.md"],
    "on_demand": ["docs/brief.md", "docs/tech-stack.md", "docs/decisions.md", "docs/architecture.md", "docs/packages.md"],
    "reference_configs": ["harness-overview.md", "agentic-development-flow.md", "external-tooling.md", "sprint-contracts.md", "handoff-protocol.md", "document-generation.md", "global-working-rules.md"],
    "rule": "create optional docs only when the agent has concrete repo evidence or the user asks"
  },
  "lsp_profiles": {
    "default": "typescript-lsp",
    "selection": "functional-block-first",
    "rule": "use block-level LSP/tooling hints before broad repo assumptions"
  },
  "worktree_strategy": {
    "auto_on_conflict": true,
    "auto_for_contract_tasks": true,
    "branch_prefix": "codex/",
    "base_branch": "main",
    "worktree_dir_template": "../{{repo}}-wt-{{slug}}",
    "start_script": "scripts/contract-worktree.sh start --plan <plan-file>",
    "finish_script": "scripts/contract-worktree.sh finish",
    "cleanup_script": "scripts/contract-worktree.sh cleanup --slug <slug>",
    "conflict_signals": [
      "dirty_worktree_overlaps_task_files",
      "current_branch_not_suitable_for_task",
      "existing_changes_unrelated_but_would_block_review",
      "task_requires_clean_validation_surface"
    ],
    "validation_route": "waza:check",
    "merge_back": {
      "target": "main",
      "requires_clean_check": true,
      "preserve_unrelated_changes": true
    }
  },
  "upgrade": {
    "strategy_version": 1,
    "supported_legacy_versions": ["pre-tasks-first", "tasks-first-without-contract-manifest", "current-v1"],
    "action_classes": {
      "preserve": "keep user-authored hooks, ignored reference material, private operations state, secrets, and local env files unchanged",
      "archive": "move user-authored legacy workflow documents or checklists into archive/research surfaces before refresh",
      "reconfigure": "merge managed config defaults without overwriting explicit repo overrides",
      "remove": "delete only workflow-contract actions marked ownership=known_generated"
    },
    "cleanup": {
      "source": ".ai/harness/workflow-contract.json#migrations.upgrade.actions",
      "remove_only_ownership": "known_generated",
      "unknown_files": "preserve-or-archive",
      "custom_hooks": "preserve",
      "ignored_reference_material": "preserve",
      "local_operations_state": "preserve",
      "local_secrets": "preserve"
    },
    "reporting": {
      "inspector_field": "upgrade_plan",
      "dry_run_required": true
    }
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
    "mode": "agent-readiness-required",
    "detection": "init-migrate",
    "readiness_gate": "scripts/check-agent-tooling.sh --host codex --strict-readiness",
    "waza": {
      "source_repo": "tw93/Waza",
      "source_url": "https://github.com/tw93/Waza.git",
      "managed_skills": ["think", "hunt", "check", "health"],
      "primary_host": "codex",
      "codex_primary_path": "~/.codex/skills",
      "staging_cache_path": "~/.agents/skills",
      "sync_mode": "stage-upstream-then-copy-to-codex",
      "host_drift_policy": "report-per-host-version-staging-and-upstream-drift"
    },
    "codex_automation_profile": {
      "required_skills": ["health", "check", "mermaid"],
      "optional_skills": [],
      "mode": "codex-runtime-reference",
      "source": "~/.codex/skills",
      "routes": {
        "workflow_health": "waza:health",
        "review_gate": "waza:check",
        "architecture_diagram": "mermaid"
      },
      "vendoring_policy": "do-not-vendor-skill-body"
    },
    "diagram_design": {
      "skill_name": "mermaid",
      "primary_host": "codex",
      "codex_primary_path": "~/.codex/skills/mermaid",
      "sync_mode": "external-installed-skill",
      "vendoring_policy": "do-not-vendor"
    },
    "gbrain": {
      "mcp": "candidate-disabled"
    },
    "codegraph": {
      "package": "@colbymchenry/codegraph",
      "primary_host": "both",
      "install_mode": "target-aware-mcp",
      "codex_config_path": "~/.codex/config.toml",
      "claude_config_path": "~/.claude.json",
      "index_dir": ".codegraph",
      "readiness": "required-for-agent-code-navigation",
      "hook_policy": "do-not-block-hooks",
      "install_command": "npm install -g @colbymchenry/codegraph && mkdir -p ~/.local/bin && ln -sfn \"$(npm config get prefix)/bin/codegraph\" ~/.local/bin/codegraph && PATH=\"$HOME/.local/bin:$PATH\" repo-harness tools configure codegraph --target codex --location global",
      "project_init_command": "codegraph init -i .",
      "sync_command": "codegraph sync .",
      "vendoring_policy": "do-not-add-package-dependency"
    }
  },
  "agentic_development": {
    "routing": {
      "product_discovery": "gstack:office-hours",
      "complex_engineering_plan": "gstack:plan-eng-review",
      "design_plan": "gstack:plan-design-review",
      "small_or_medium_plan": "waza:think",
      "bug_or_regression": "waza:hunt",
      "post_implementation_review": "waza:check"
    },
    "due_diligence": {
      "levels": ["P1_GLOBAL_ARCHITECTURE", "P2_DATA_FLOW_TRACE", "P3_DESIGN_DECISION"],
      "explicit_report_required_for": ["plan-eng-review", "hunt", "risky_refactor", "deployment", "auth_payment_data", "shared_contract"]
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

  if [[ ! -f ".ai/harness/brain-manifest.json" ]]; then
    cat > ".ai/harness/brain-manifest.json" <<'BRAIN_MANIFEST_EOF'
{
  "version": 1,
  "project": "<project>",
  "mode": "repo-contract-external-knowledge",
  "default_brain_path": "brain/<project>/*",
  "rules": [
    "repo-local contracts, hooks, scripts, checks, and evidence remain authoritative",
    "default brain stores long-lived explanations, runbooks, decisions, references, and patterns",
    "hook runtime may sync explicitly opted-in repo-to-brain entries only; it must not query gbrain, MCP, or unregistered default brain paths"
  ],
  "entries": []
}
BRAIN_MANIFEST_EOF
  fi

  if [[ ! -f ".ai/context/context-map.json" ]]; then
    cat > ".ai/context/context-map.json" <<'CONTEXT_EOF'
{
  "version": 1,
  "profile": "stable-root-progressive-subdir",
  "functional_block_selector": {
    "script": "scripts/select-agent-context-blocks.sh",
    "config_file": ".ai/context/agent-context-blocks.txt",
    "env": "REPO_HARNESS_CONTEXT_BLOCKS",
    "legacy_env": "PROJECT_INITIALIZER_CONTEXT_BLOCKS",
    "rule": "compatibility selector; capability registry is the source of truth"
  },
  "lsp_profiles": {
    "default": "typescript-lsp",
    "selection": "functional-block-first"
  },
  "root_context_files": [
    "CLAUDE.md",
    "AGENTS.md",
    "docs/spec.md",
    "tasks/current.md",
    "tasks/todo.md",
    "tasks/lessons.md",
    ".ai/context/capabilities.json",
    ".ai/harness/policy.json"
  ],
  "discoverable_contexts": [
    {
      "path": "docs/reference-configs/*.md",
      "priority": "low",
      "char_budget": 900,
      "purpose": "deep-doc"
    },
    {
      "path": "tasks/workstreams/**/*.md",
      "priority": "high",
      "char_budget": 1200,
      "purpose": "capability-workstream"
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
new_plan=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --new-plan)
      new_plan=1
      shift
      ;;
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
ensure_current_status_snapshot

active_plan="$(get_active_plan || true)"
if [[ -n "$active_plan" && "$new_plan" -eq 0 ]]; then
  echo "Workflow ready. Active plan: $active_plan"
  exit 0
fi

if [[ ! -f "docs/spec.md" ]]; then
  if [[ -x "scripts/new-spec.sh" ]]; then
    bash "scripts/new-spec.sh"
  fi
fi

if [[ -z "$slug" ]]; then
  if [[ "$new_plan" -eq 1 ]]; then
    echo "--new-plan requires --slug" >&2
    exit 1
  fi
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
