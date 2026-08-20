> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260610-1746-sprint-program-layer-slice1.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: sprint-program-layer-slice1

> **Status**: Fulfilled
> **Plan**: plans/plan-20260610-1746-sprint-program-layer-slice1.md
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-06-10 17:46
> **Review File**: `tasks/reviews/20260610-1746-sprint-program-layer-slice1.review.md`
> **Notes File**: `tasks/notes/20260610-1746-sprint-program-layer-slice1.notes.md`

## Goal

Land Slice 1 of the Sprint program layer as a purely additive surface: a `tasks/sprints/` schema with template, a `scripts/sprint-backlog.sh` helper (init/status/next/complete-task), strict-mode sprint validation in `check-task-workflow.sh`, active-sprint projection into `tasks/current.md` and the session-start context hook, a two-layer terminology glossary (Sprint = program level, Task Contract = execution slice), and the deferred-ledger drift sweep across `assets/partials*/`.

## Scope

- In scope: sprint schema/template, sprint-backlog helper + assets parity copy, policy.json `sprints` node, check-task-workflow sprint validation (both copies), refresh-current-status + session-start-context projection (both hook copies), sprint-contracts.md glossary (both copies), 8 stale todo.md checklist references in assets/partials*/, fixture tests, tasks/ sync.
- Out of scope: `start-task`/capture-plan wiring, `contract-worktree.sh finish` back-fill, `repo-harness-sprint` command facade + registrations, goal mode / Stop hook changes, downstream policy template (`project-init-lib.sh`), any rename of `verify-sprint.sh` or contract/review file stems, global `~/.claude` cleanup.

## Workflow Inventory

- Source plan: `plans/plan-20260610-1746-sprint-program-layer-slice1.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260610-1746-sprint-program-layer-slice1.review.md`
- Notes file: `tasks/notes/20260610-1746-sprint-program-layer-slice1.notes.md`
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
  - tasks/sprints/
  - tasks/contracts/20260610-1746-sprint-program-layer-slice1.contract.md
  - tasks/reviews/20260610-1746-sprint-program-layer-slice1.review.md
  - tasks/notes/20260610-1746-sprint-program-layer-slice1.notes.md
  - .claude/templates/sprint.template.md
  - .ai/harness/policy.json
  - .ai/hooks/session-start-context.sh
  - assets/hooks/session-start-context.sh
  - scripts/sprint-backlog.sh
  - scripts/check-task-workflow.sh
  - scripts/refresh-current-status.sh
  - assets/templates/helpers/sprint-backlog.sh
  - assets/templates/helpers/check-task-workflow.sh
  - assets/templates/helpers/refresh-current-status.sh
  - assets/templates/sprint.template.md
  - assets/partials/
  - assets/partials-agents/
  - .gitignore
  - docs/reference-configs/sprint-contracts.md
  - assets/reference-configs/sprint-contracts.md
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/sprint-backlog.sh
    - assets/templates/helpers/sprint-backlog.sh
    - .claude/templates/sprint.template.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260610-1746-sprint-program-layer-slice1.notes.md
  tests_pass:
    - path: tests/sprint-backlog.test.ts
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
  files_contain:
    - path: scripts/sprint-backlog.sh
      pattern: "complete-task"
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: sprint init/status/next/complete-task round-trips on a fixture sprint; `check-task-workflow --strict` rejects an Approved sprint with missing acceptance and accepts a Draft skeleton; current.md and session-start output show the active sprint only when the marker exists.
- Edge cases: no `tasks/sprints/` dir (all checks skip), stale marker pointing at a deleted sprint, malformed backlog table, repeated complete-task on the same row.
- Regression risks: partials sweep changes downstream-generated CLAUDE/AGENTS text (template assembly tests); check-task-workflow is a required gate for every repo.

## Rollback Point

- Commit / checkpoint: branch `codex/sprint-program-layer-slice1` off `main` (2cf0d11).
- Revert strategy: drop the branch before merge; after merge, revert the merge commit — all surfaces are additive except the partials wording and check-task-workflow validation, which revert cleanly with the commit.
