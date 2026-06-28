## Task Management Protocol

```yaml
TASK_SOURCES:
  - docs/spec.md
  - docs/researches/
  - tasks/todos.md
  - tasks/contracts/
  - tasks/reviews/
  - tasks/notes/
  - tasks/lessons.md
  - .ai/harness/checks/latest.json (ignored runtime evidence)
  - .ai/harness/handoff/current.md
  - plans/

PHASES: research -> spec -> plan -> contract -> implement -> verify -> check -> review -> handoff

ARCHIVE:
  PLAN: plans/archive/
  TASK_ARTIFACTS: tasks/archive/

RULES:
  - Treat repo-local artifact files as the primary cross-agent workflow contract
  - For non-chat tasks, sync tasks/ whenever substantive work changes the repo
  - Research first for unfamiliar areas and persist findings in docs/researches/
  - Keep stable product intent in docs/spec.md
  - Plan with trade-offs in plans/plan-{timestamp}-{slug}.md
  - Treat .ai/harness/active-plan as authoritative only for this worktree; .ai/harness/active-worktree records the owner; .claude/.active-plan is a legacy fallback during transition
  - Keep multiple active plans in parallel worktrees when tasks diverge; fill workflow inventory before implementation: active plan, owning worktree, contract, review, notes, deferred ledger, checks, runs, scope owner, switching rule, and worktree path
  - Process annotation notes before implementing
  - Project approved plans with .ai/harness/scripts/plan-to-todo.sh only after a concrete Promotion Gate; the execution checklist stays in the plan ## Task Breakdown, inline sprint rows stay inline, and only contract rows generate contract/review/notes artifacts
  - Define task contracts in tasks/contracts/{plan-stem}.contract.md
  - Fill tasks/reviews/{plan-stem}.review.md from Waza /check after verification
  - Record only non-obvious implementation decisions, deviations, tradeoffs, and open questions in tasks/notes/{plan-stem}.notes.md
  - Verify contracts before claiming completion
  - Require review pass before claiming completion
  - Keep tasks/todos.md limited to deferred medium/long-term goals, with tradeoff and revisit trigger; do not duplicate plan Task Breakdown
  - Record correction-derived prevention rules in tasks/lessons.md
  - Distill repeated corrections into tasks/lessons.md instead of keeping them in tasks/todos.md
  - Capture deep findings and hidden contracts in docs/researches/
  - Keep sprint-level verification notes, behavior diffs, and residual risks in tasks/reviews/{plan-stem}.review.md
  - Do not use implementation notes as durable memory or task logs; before closeout, promote durable truth into docs/architecture/, docs/researches/, docs/spec.md, or tasks/lessons.md, then archive fulfilled plan/contract/review/notes/todo artifacts so root workflow surfaces represent active work only
  - Promote implementation-ready follow-up work into a new plans/plan-{timestamp}-{slug}.md file; keep deferred goals in tasks/todos.md only when intentionally postponed
  - Treat `.ai/hooks/` as the shared automation entrypoint when repo scripts reference hook-backed workflow checks
  - Treat user-level `~/.claude/settings.json` and `~/.codex/hooks.json` as host adapters; do not add repo-local project hook adapters unless explicitly migrating legacy config
  - For Codex sessions, treat `bash .ai/harness/scripts/check-task-sync.sh` and `bash .ai/harness/scripts/check-task-workflow.sh --strict` as required repo-local checks
  - Before ending a session, refresh `.ai/harness/handoff/current.md` when the task state changed
  - Update `tasks/workstreams/` only when durable capability progress changes
  - Archive completed/abandoned plans, contracts, reviews, notes, and todos with metadata
{{#IF FACTOR_FACTORY_ENABLED}}
  - Treat `tasks/factors/registry.json` as the source of truth for factor lifecycle state
  - Create factor candidates with `bash .ai/harness/scripts/factor-lab-new.sh --name <slug>`
  - Promote factors only after hypothesis and backtest summary artifacts exist
  - Run `bash .ai/harness/scripts/factor-lab-check.sh` before claiming factor-lab work is complete
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
