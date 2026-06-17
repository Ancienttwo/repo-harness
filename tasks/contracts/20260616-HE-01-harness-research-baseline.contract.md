# Task Contract: HE-01 Harness Research Baseline

> **Status**: Active
> **Plan**: `plans/plan-20260616-HE-01-harness-research-baseline.md`
> **Task Profile**: docs-only
> **Owner**: Codex
> **Capability ID**: workflow-engine/harness-optimization
> **Last Updated**: 2026-06-17
> **Review File**: `tasks/reviews/20260616-HE-01-harness-research-baseline.review.md`
> **Notes File**: `tasks/notes/20260616-HE-01-harness-research-baseline.notes.md`

## Goal

Create the HE-01 baseline research artifact that maps external harness
engineering patterns to repo-harness surfaces and produces a local 10-rule
principle card for the rest of the Sprint.

## Scope

- In scope:
  - Add the research baseline under `docs/researches/`.
  - Add HE-01 plan, contract, notes, and review artifacts.
  - Update the Sprint HE-01 row and checklist.
- Out of scope:
  - Runtime code changes.
  - Template enforcement changes.
  - Trace schema implementation.
  - Delegation runner changes.

## Workflow Inventory

- Source plan: `plans/plan-20260616-HE-01-harness-research-baseline.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260616-HE-01-harness-research-baseline.review.md`
- Notes file: `tasks/notes/20260616-HE-01-harness-research-baseline.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: research doc exists, review recommends pass, and task-specific checks pass.

## Allowed Paths

```yaml
allowed_paths:
  - docs/researches/20260616-harness-engineering-frameworks.md
  - plans/prds/repo-harness Plan to Closeout 工作流对标报告.md
  - "plans/sprints/20260617-Sprint: Harness Engineering Optimization - State, Review, Eval, Delegation.md"
  - "plans/sprints/20260617-Sprint: Harness Engineering Optimization — State, Review, Eval, Delegation.md"
  - plans/plan-20260616-HE-01-harness-research-baseline.md
  - tasks/contracts/20260616-HE-01-harness-research-baseline.contract.md
  - tasks/reviews/20260616-HE-01-harness-research-baseline.review.md
  - tasks/notes/20260616-HE-01-harness-research-baseline.notes.md
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent: narrate_and_gatekeep
    worker: implement_contract
    verifier: review_exit_criteria
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/researches/20260616-harness-engineering-frameworks.md
    - plans/plan-20260616-HE-01-harness-research-baseline.md
    - tasks/reviews/20260616-HE-01-harness-research-baseline.review.md
    - tasks/notes/20260616-HE-01-harness-research-baseline.notes.md
  artifacts_exist:
    - tasks/contracts/20260616-HE-01-harness-research-baseline.contract.md
  commands_succeed:
    - grep -n "Harness Engineering 10 Rules" docs/researches/20260616-harness-engineering-frameworks.md
    - grep -n "Claude Code memory docs" docs/researches/20260616-harness-engineering-frameworks.md
    - grep -n "Harness-Bench paper" docs/researches/20260616-harness-engineering-frameworks.md
    - grep -n "AGENTS.md" docs/researches/20260616-harness-engineering-frameworks.md
    - grep -n ".ai/harness/policy.json" docs/researches/20260616-harness-engineering-frameworks.md
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: no runtime behavior changes.
- Edge cases: the source Sprint filename contains an em dash; the contract allows both the source name and an ASCII fallback reference.
- Regression risks: external links may drift; claims are intentionally bounded to stable harness patterns.

## Rollback Point

- Commit / checkpoint: branch `codex/harness-engineering-optimization` before HE-01 staging.
- Revert strategy: remove the HE-01 research/plan/contract/review/notes files and uncheck HE-01 in the Sprint file.
