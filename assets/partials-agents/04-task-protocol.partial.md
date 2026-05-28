## Task Management Protocol

```yaml
TASK_SOURCES:
  - docs/spec.md
  - tasks/research.md
  - tasks/todo.md
  - tasks/contracts/
  - tasks/reviews/
  - tasks/notes/
  - tasks/lessons.md
  - .ai/harness/checks/latest.json
  - .ai/harness/handoff/current.md
  - plans/

PHASES: research -> spec -> plan -> contract -> todo -> implement -> verify -> review -> handoff

ARCHIVE:
  PLAN: plans/archive/
  TODO: tasks/archive/

RULES:
  - Treat repo-local artifact files as the primary cross-agent workflow contract
  - For non-chat tasks, sync tasks/ whenever substantive work changes the repo
  - Research first for unfamiliar areas and persist findings in tasks/research.md
  - Keep stable product intent in docs/spec.md
  - Plan with trade-offs in plans/plan-{timestamp}-{slug}.md
  - Treat .claude/.active-plan as authoritative when present; latest non-archived plans/plan-*.md is a compatibility fallback
  - Switch between concurrent plans with bash scripts/switch-plan.sh --plan <plan-file>; fill workflow inventory before implementation: active plan, contract, review, notes, todo, checks, runs, scope owner, switching rule, and worktree path
  - Process annotation notes before implementing
  - Extract approved plan tasks into tasks/todo.md
  - Define task contracts in tasks/contracts/{slug}.contract.md
  - Define evaluator verdicts and verification evidence in tasks/reviews/{slug}.review.md
  - Record only non-obvious implementation decisions, deviations, tradeoffs, and open questions in tasks/notes/{slug}.notes.md
  - Verify contracts before claiming completion
  - Require review pass before claiming completion
  - Keep tasks/todo.md limited to metadata plus the active execution checklist
  - Record correction-derived prevention rules in tasks/lessons.md
  - Distill repeated corrections into tasks/lessons.md instead of keeping them in tasks/todo.md
  - Capture deep findings and hidden contracts in tasks/research.md
  - Keep sprint-level verification notes, behavior diffs, and residual risks in tasks/reviews/{slug}.review.md
  - Do not use implementation notes as durable memory or task logs; archive them on close and promote only after evidence shows the rule should outlive the sprint
  - Promote worthwhile follow-up work into a new plans/plan-{timestamp}-{slug}.md file
  - Treat `.ai/hooks/` as the shared automation entrypoint when repo scripts reference hook-backed workflow checks
  - Treat `.claude/settings.json` and `.codex/hooks.json` as host-specific adapters, not the cross-agent source of truth
  - For Codex sessions, treat `bash scripts/check-task-sync.sh` and `bash scripts/check-task-workflow.sh --strict` as required repo-local checks
  - Before ending a session, refresh `.ai/harness/handoff/current.md` when the task state changed
  - Update `tasks/workstreams/` only when durable capability progress changes
  - Archive completed/abandoned plans and todos with metadata
{{#IF FACTOR_FACTORY_ENABLED}}
  - Treat `tasks/factors/registry.json` as the source of truth for factor lifecycle state
  - Create factor candidates with `bash scripts/factor-lab-new.sh --name <slug>`
  - Promote factors only after hypothesis and backtest summary artifacts exist
  - Run `bash scripts/factor-lab-check.sh` before claiming factor-lab work is complete
{{/IF}}

ACTIVE_PLAN:
  - .claude/.active-plan selects the current active plan when present; plans/ is the timestamped catalog and compatibility fallback

STATUS:
  ENUM: [Draft, Annotating, Approved, Executing, Archived]
  LOCATION: "> **Status**: {value}" line in plan file (must be exact, no trailing whitespace)
  TRANSITIONS:
    - Draft -> Annotating -> Approved -> Executing -> Archived
    - Annotating -> Draft (rollback when plan direction needs rethinking)
  GUARD: do not implement when status is Draft or Annotating
```

---
