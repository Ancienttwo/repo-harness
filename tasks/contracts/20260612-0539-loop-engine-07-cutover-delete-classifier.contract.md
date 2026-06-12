# Sprint Contract: loop-engine-07-cutover-delete-classifier

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-0539-loop-engine-07-cutover-delete-classifier.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 05:39
> **Review File**: `tasks/reviews/20260612-0539-loop-engine-07-cutover-delete-classifier.review.md`
> **Notes File**: `tasks/notes/20260612-0539-loop-engine-07-cutover-delete-classifier.notes.md`

## Goal

Cut over from the TypeScript semantic classifier under explicit owner override of G2. Current evidence shows G2 is not satisfied (`prompt_count=1`, `timebox.complete=false`, `recommendation=continue_shadow`), and the owner instructed this Goal to continue; record that as a manual override, not as G2 pass.

## Scope

- In scope:
  - Verify G2 evidence from row3 shadow summary and trace.
  - Record owner override when shadow timebox and key-route evidence are insufficient.
  - Delete the old `prompt-intents.ts` semantic-classifier surface and replace it with explicit trigger facts.
  - Replace the intent x plan-state TypeScript decision table with deterministic branch logic.
  - Slim `prompt-guard.sh` to a small entrypoint by moving the runtime body into hook lib files.
  - Sync self-host `.ai/hooks` and generated `assets/hooks` mirrors.
  - Update README, hook operations docs, lessons, and focused tests.
- Out of scope:
  - Claiming G2 passed.
  - Treating Claude validation skip as an independent cutover gate pass.
  - Generating synthetic shadow traffic to satisfy the timebox.

## Delegation Fields (κ)

These fields are optional delegation defaults for `contract-run` and child
agent calls. They do not loosen `allowed_paths`, exit criteria, or local
approval policy; omitted values inherit repo policy defaults.

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    filesystem: allowed_paths
    network: none
    approvals: owner
  roles:
    parent: narrate_only
    worker: implement_within_contract
    verifier: verify_exit_criteria
```

## Workflow Inventory

- Source plan: `plans/plan-20260612-0539-loop-engine-07-cutover-delete-classifier.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-0539-loop-engine-07-cutover-delete-classifier.review.md`
- Notes file: `tasks/notes/20260612-0539-loop-engine-07-cutover-delete-classifier.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todo.md
  - tasks/contracts/20260612-0539-loop-engine-07-cutover-delete-classifier.contract.md
  - tasks/reviews/20260612-0539-loop-engine-07-cutover-delete-classifier.review.md
  - tasks/notes/20260612-0539-loop-engine-07-cutover-delete-classifier.notes.md
  - .ai/context/capabilities.json
  - src/
  - tests/
  - .ai/hooks/prompt-guard.sh
  - .ai/hooks/lib/prompt-guard-runtime.sh
  - assets/hooks/prompt-guard.sh
  - assets/hooks/lib/prompt-guard-runtime.sh
  - README.md
  - README.zh-CN.md
  - README.ja.md
  - README.fr.md
  - README.es.md
  - docs/reference-configs/hook-operations.md
  - assets/reference-configs/hook-operations.md
  - tasks/lessons.md
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-0539-loop-engine-07-cutover-delete-classifier.notes.md
  tests_pass:
    - path: tests/unit/loop-engine-07-cutover-delete-classifier.test.ts
    - path: tests/cli/prompt-triggers.test.ts
    - path: tests/cli/prompt-guard-decision.test.ts
  commands_succeed:
    - bun test tests/unit/loop-engine-07-cutover-delete-classifier.test.ts tests/cli/prompt-triggers.test.ts tests/cli/prompt-guard-decision.test.ts
    - bash scripts/check-task-workflow.sh --strict
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: owner override allows cutover work despite `.ai/harness/runs/loop-engine-03-shadow-summary.json` reporting `prompt_count=1`, `timebox.complete=false`, and `recommendation=continue_shadow`.
- Edge cases: zero divergence over one prompt is not enough to prove key-route zero miss; the 100-prompt or 14-day shadow timebox remains open until 2026-06-25 and remains a residual risk.
- Regression risks: cutover must preserve deterministic explicit triggers and done/evidence gates while removing the semantic-classifier and intent-table authority.

## Rollback Point

- Commit / checkpoint: row7 cutover commit created only with G2 recorded as owner override.
- Revert strategy: revert the row7 branch commit and restore `prompt-intents.ts` / `prompt-guard-decision.ts` table if prompt routing regresses.
