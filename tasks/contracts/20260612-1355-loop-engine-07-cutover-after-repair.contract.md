# Sprint Contract: loop-engine-07-cutover-after-repair

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260612-1355-loop-engine-07-cutover-after-repair.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 13:58
> **Review File**: `tasks/reviews/20260612-1355-loop-engine-07-cutover-after-repair.review.md`
> **Notes File**: `tasks/archive/notes-20260612-1401-loop-engine-07-cutover-after-repair.md`

## Goal

Add a machine-readable G2 cutover gate for Track A. Because row 3's second G1 is go but no shadow divergence report exists yet, this slice must block classifier deletion, prove the TypeScript classifier remains present and authoritative, and write a cutover-gate report for the next shadow/cutover slice.

## Scope

- In scope: `scripts/loop-engine-cutover-gate.ts`, a row7 gate report under `.ai/harness/runs/`, focused tests, and reference documentation for G2.
- Out of scope: deleting or weakening `src/cli/hook/prompt-intents.ts`, changing prompt-guard runtime authority, injecting shadow decisions into hooks, installing a shadow scheduler, or changing generated-repo assets.

## Workflow Inventory

- Source plan: `plans/archive/plan-20260612-1355-loop-engine-07-cutover-after-repair.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-1355-loop-engine-07-cutover-after-repair.review.md`
- Notes file: `tasks/archive/notes-20260612-1401-loop-engine-07-cutover-after-repair.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - .ai/harness/runs/loop-engine-07-cutover-gate.json
  - docs/reference-configs/loop-engine-cutover-gate.md
  - docs/spec.md
  - plans/
  - scripts/loop-engine-cutover-gate.ts
  - tasks/todo.md
  - tasks/contracts/20260612-1355-loop-engine-07-cutover-after-repair.contract.md
  - tasks/reviews/20260612-1355-loop-engine-07-cutover-after-repair.review.md
  - tasks/archive/notes-20260612-1401-loop-engine-07-cutover-after-repair.md
  - .ai/context/capabilities.json
  - tests/loop-engine-cutover-gate.test.ts
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
    - docs/spec.md
    - scripts/loop-engine-cutover-gate.ts
    - docs/reference-configs/loop-engine-cutover-gate.md
    - src/cli/hook/prompt-intents.ts
    - src/cli/hook/prompt-guard-decision.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/loop-engine-07-cutover-gate.json
    - tasks/archive/notes-20260612-1401-loop-engine-07-cutover-after-repair.md
  tests_pass:
    - path: tests/loop-engine-cutover-gate.test.ts
  commands_succeed:
    - bun scripts/loop-engine-cutover-gate.ts --repo . --json --out .ai/harness/runs/loop-engine-07-cutover-gate.json
    - bun scripts/route-nl-vs-ts-eval.ts --check-report .ai/harness/runs/route-nl-vs-ts-report.json
    - bash scripts/check-task-workflow.sh --strict
  files_contain:
    - path: .ai/harness/runs/loop-engine-07-cutover-gate.json
      pattern: "\"allowed\": false"
    - path: .ai/harness/runs/loop-engine-07-cutover-gate.json
      pattern: "missing_shadow_divergence_report"
    - path: scripts/loop-engine-cutover-gate.ts
      pattern: "src/cli/hook/prompt-intents.ts"
    - path: docs/reference-configs/loop-engine-cutover-gate.md
      pattern: "G2"
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: the cutover gate writes `.ai/harness/runs/loop-engine-07-cutover-gate.json`; current output blocks cutover because shadow divergence evidence is missing while row3 G1 is go and the TypeScript classifier files remain present.
- Edge cases: a no-go G1 blocks cutover even when shadow is go; a missing classifier before G2 exits nonzero as a guardrail violation.
- Regression risks: no prompt-guard runtime behavior changed; future cutover still needs a real shadow divergence report and phase-probe evidence before deleting classifier code.

## Rollback Point

- Commit / checkpoint: row7 branch `codex/loop-engine-07-cutover-after-repair-clean` before finish commit.
- Revert strategy: revert the row7 commit to remove the gate script, focused test, doc, report artifact reference, and workflow artifacts; prompt-guard runtime files are untouched.
