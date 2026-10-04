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
  - .ai/harness/runs/ (immutable execution records and selected reports)
  - .ai/harness/handoff/current.md
  - plans/

PHASES: request -> branch -> bounded commits -> verify -> PR outcome

ARCHIVE:
  PLAN: plans/archive/
  TASK_ARTIFACTS: tasks/archive/

RULES:
  - Treat repo-local artifact files as the primary cross-agent workflow contract
  - For non-chat tasks, sync tasks/ whenever substantive work changes the repo
  - Research first for unfamiliar areas and persist findings in docs/researches/
  - Keep stable product intent in docs/spec.md
  - Write a plan before cross-module changes, architecture changes, and dependency upgrades. Small changes do not need a plan.
  - Treat .ai/harness/active-plan as authoritative only for this worktree; .ai/harness/active-worktree records the owner
  - Keep optional plans in their owning worktrees. For an explicit contract, check workflow inventory before implementation: owning worktree, contract, exit criteria and verification inputs
  - Process annotation notes before implementing
  - Use plan-to-todo only when the task explicitly requires a contract
  - Define task contracts in tasks/contracts/{plan-stem}.contract.md only when the task explicitly requires a contract
  - For an explicit contract, fill tasks/reviews/{plan-stem}.review.md from Waza /check after verification
  - Record only non-obvious implementation decisions, deviations, tradeoffs, and open questions in tasks/notes/{plan-stem}.notes.md
  - Verify contracts before claiming completion
  - For an explicit contract, require review pass before claiming completion
  - Keep tasks/todos.md limited to deferred medium/long-term goals, with tradeoff and revisit trigger; do not duplicate plan Task Breakdown
  - Record correction-derived prevention rules in tasks/lessons.md
  - Distill repeated corrections into tasks/lessons.md instead of keeping them in tasks/todos.md
  - Capture deep findings and hidden contracts in docs/researches/
  - Keep sprint-level verification notes, behavior diffs, and residual risks in tasks/reviews/{plan-stem}.review.md
  - Do not use implementation notes as durable memory or task logs; before closeout, promote durable truth into docs/architecture/, docs/researches/, docs/spec.md, or tasks/lessons.md, then archive fulfilled plan/contract/review/notes/todo artifacts so root workflow surfaces represent active work only
  - Create a plan file for follow-up work only when the plan rule requires one
  - Treat `.ai/hooks/` as the shared automation entrypoint when repo scripts reference hook-backed workflow checks
  - Treat user-level `~/.claude/settings.json` and `~/.codex/hooks.json` as host adapters; do not add repo-local project hook adapters unless explicitly migrating legacy config
  - For Codex sessions, run `repo-harness run check-task-sync`
  - Update `tasks/workstreams/` only when durable capability progress changes
  - Archive completed/abandoned plans, contracts, reviews, notes, and todos with metadata
{{#IF FACTOR_FACTORY_ENABLED}}
  - Treat `tasks/factors/registry.json` as the source of truth for factor lifecycle state
  - Create factor candidates with the configured factor-lab command for this repo.
  - Promote factors only after hypothesis and backtest summary artifacts exist
  - Run the configured factor-lab check before claiming factor-lab work is complete
{{/IF}}
ACTIVE_PLAN:
  - .ai/harness/active-plan selects the current active plan only for its owning worktree; .ai/harness/active-worktree records that owner

STATUS:
  ENUM: [Draft, Annotating, Approved, Executing, Archived]
  LOCATION: "> **Status**: {value}" line in plan file (must be exact, no trailing whitespace)
  TRANSITIONS:
    - Draft -> Annotating -> Approved -> Executing -> Archived
    - Annotating -> Draft (rollback when plan direction needs rethinking)
  GUARD: when the task uses a plan, do not implement when status is Draft or Annotating
```

---
