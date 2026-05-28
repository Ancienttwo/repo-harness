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

PHASES: research -> spec -> plan -> contract -> implement -> verify -> check -> review -> handoff

ARCHIVE:
  PLAN: plans/archive/
  TODO: tasks/archive/

RULES:
  - Treat repo-local artifact files as the primary cross-agent workflow contract
  - For non-chat tasks, sync tasks/ whenever substantive work changes the repo
  - Research first for unfamiliar areas and persist findings in tasks/research.md
  - Keep stable product intent in docs/spec.md
  - Plan with trade-offs in plans/plan-{timestamp}-{slug}.md
  - Treat .ai/harness/active-plan as authoritative only for this worktree; .ai/harness/active-worktree records the owner; .claude/.active-plan is a legacy fallback during transition
  - Keep multiple active plans in parallel worktrees when tasks diverge; fill workflow inventory before implementation: active plan, owning worktree, contract, review, notes, deferred ledger, checks, runs, scope owner, switching rule, and worktree path
  - Process annotation notes before implementing
  - Extract approved plan tasks into tasks/todo.md
  - Define task contracts in tasks/contracts/{slug}.contract.md
  - Fill tasks/reviews/{slug}.review.md from Waza /check after verification
  - Record only non-obvious implementation decisions, deviations, tradeoffs, and open questions in tasks/notes/{slug}.notes.md
  - Verify contracts before claiming completion
  - Require review pass before claiming completion
  - Keep tasks/todo.md limited to deferred medium/long-term goals, with tradeoff and revisit trigger; do not duplicate plan Task Breakdown
  - Record correction-derived prevention rules in tasks/lessons.md
  - Distill repeated corrections into tasks/lessons.md instead of keeping them in tasks/todo.md
  - Capture deep findings and hidden contracts in tasks/research.md
  - Keep sprint-level verification notes, behavior diffs, and residual risks in tasks/reviews/{slug}.review.md
  - Do not use implementation notes as durable memory or task logs; archive them on close and promote only after evidence shows the rule should outlive the sprint
  - Promote implementation-ready follow-up work into a new plans/plan-{timestamp}-{slug}.md file; keep deferred goals in tasks/todo.md only when intentionally postponed
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
  - .ai/harness/active-plan selects the current active plan only for its owning worktree; .ai/harness/active-worktree records that owner; .claude/.active-plan is a legacy fallback during transition

STATUS:
  ENUM: [Draft, Annotating, Approved, Executing, Archived]
  LOCATION: "> **Status**: {value}" line in plan file (must be exact, no trailing whitespace)
  TRANSITIONS:
    - Draft -> Annotating -> Approved -> Executing -> Archived
    - Annotating -> Draft (rollback when plan direction needs rethinking)
  GUARD: do not implement when status is Draft or Annotating
```

---
