> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260610-2053-sprint-program-layer-slice2.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: sprint-program-layer-slice2

> **Status**: Fulfilled
> **Plan**: plans/plan-20260610-2053-sprint-program-layer-slice2.md
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-06-10 20:53
> **Review File**: `tasks/reviews/20260610-2053-sprint-program-layer-slice2.review.md`
> **Notes File**: `tasks/notes/20260610-2053-sprint-program-layer-slice2.notes.md`

## Goal

Wire the Sprint program layer into the execution and distribution surfaces: `sprint-backlog.sh start-task` (plan capture from backlog rows) + mutation lock + `--sprint` override, warn-only finish back-fill in `contract-worktree.sh`, the `repo-harness-sprint` command facade with full registrations (manifest, root SKILL.md, README, flow docs, evals, tests), and downstream distribution wiring (workflow-contract helpers/runtimeFiles, init-lib helpers/templates/policy/runtime entries).

## Scope

- In scope: sprint-backlog.sh start-task/lock/--sprint (+ helpers parity), contract-worktree.sh finish back-fill (+ helpers parity), capture-plan source registration (self-host policy.json + init-lib policy heredoc + usage text), repo-harness-sprint SKILL facade + manifest/docs/evals/tests registrations, workflow-contract v1 + installed copy wiring, init-lib helpers fallback+chmod alignment + sprint template branch + runtime entries + downstream current.md heredoc, root CLAUDE.md/AGENTS.md canonical-files lines, 02-operating-mode task-contract wording, test updates.
- Out of scope: goal mode / Stop hook (Slice 3), facade `run --goal`, renaming `verify-sprint.sh`/`new-sprint.sh`, downstream `.ai/hooks` un-vendoring, multi-sprint queueing, contract-template wording churn.

## Workflow Inventory

- Source plan: `plans/plan-20260610-2053-sprint-program-layer-slice2.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260610-2053-sprint-program-layer-slice2.review.md`
- Notes file: `tasks/notes/20260610-2053-sprint-program-layer-slice2.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todo.md
  - tasks/current.md
  - tasks/contracts/20260610-2053-sprint-program-layer-slice2.contract.md
  - tasks/reviews/20260610-2053-sprint-program-layer-slice2.review.md
  - tasks/notes/20260610-2053-sprint-program-layer-slice2.notes.md
  - scripts/sprint-backlog.sh
  - scripts/contract-worktree.sh
  - scripts/capture-plan.sh
  - scripts/create-project-dirs.sh
  - scripts/lib/project-init-lib.sh
  - assets/templates/helpers/sprint-backlog.sh
  - assets/templates/helpers/contract-worktree.sh
  - assets/templates/helpers/capture-plan.sh
  - assets/skill-commands/
  - assets/workflow-contract.v1.json
  - .ai/harness/workflow-contract.json
  - .ai/harness/policy.json
  - SKILL.md
  - README.md
  - CLAUDE.md
  - AGENTS.md
  - docs/reference-configs/agentic-development-flow.md
  - assets/reference-configs/agentic-development-flow.md
  - assets/partials-agents/02-operating-mode.partial.md
  - evals/evals.json
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - assets/skill-commands/repo-harness-sprint/SKILL.md
    - scripts/sprint-backlog.sh
    - assets/templates/helpers/sprint-backlog.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260610-2053-sprint-program-layer-slice2.notes.md
  tests_pass:
    - path: tests/sprint-backlog.test.ts
    - path: tests/action-command-skills.test.ts
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
  files_contain:
    - path: scripts/sprint-backlog.sh
      pattern: "start-task"
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
