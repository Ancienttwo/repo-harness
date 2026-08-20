> **Archived**: 2026-08-20 19:05
> **Related Plan**: plans/archive/plan-20260820-1605-projection-publication-ownership.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1905

# Task Contract: projection-publication-ownership

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-1605-projection-publication-ownership.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-20 17:13
> **Review File**: `tasks/reviews/20260820-1605-projection-publication-ownership.review.md`
> **Notes File**: `tasks/notes/20260820-1605-projection-publication-ownership.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The automatic architecture projection currently runs after contract publication. It rewrites the generated projection manifest in the primary worktree, while the next contract closeout explicitly restores that file to `HEAD`. The manifest therefore oscillates as an unowned standalone WIP instead of being reviewed and published with the contract that caused it.

## Goal

Materialize automatic architecture projections before `verify-sprint --prepare-acceptance` freezes the review subject, treat only `docs/architecture/.projection-manifest.json` as an exact workflow-owned publication output, and acknowledge the exact manifest-bearing publication in the architecture drift cursor so post-publication Stop processing does not replay the same source delta.

## Scope

- In scope:
  - Acceptance-time automatic architecture projection in `verify-sprint`.
  - Exact manifest ownership in both sprint scope verification and contract closeout.
  - Fail-closed publication acknowledgement after the synthesized tree lands, including recovery reconciliation.
  - Packaged helper mirrors, behavioral regression coverage, and contract documentation.
  - Human-authorized co-publication of the pre-existing primary-worktree WIP: archive the two superseded v0.5 refactor plan drafts and add the model-infra boundary research note in this same reviewed publication.
- Out of scope:
  - changing architecture rendering semantics, lease semantics, generic workflow archival, or allowing arbitrary generated architecture files outside a contract.
- Taste constraints: Fail closed when the automatic provider is unavailable or writes any non-manifest path outside the contract; do not add a broad `docs/architecture/` exemption.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a manifest-bearing synthesized publication is acknowledged but the next architecture drift changed set is non-empty on a clean target, then publication ownership is still incomplete. The cheapest proof is a disposable git fixture that acknowledges a publication commit and immediately recomputes the drift set.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/verify-sprint.sh` fingerprints the review subject without materializing automatic projection output, `scripts/contract-worktree.sh:restore_machine_owned_projection_output` discards the later Stop-generated manifest, and no publication acknowledgement advances `src/cli/hook/architecture-drift.ts` to the exact manifest-bearing publication SHA.
- repro: finish any contract that changes an architecture capability, let the Stop hook drain automatic projection, then run `git status --short -- docs/architecture/.projection-manifest.json`; the file appears as an unowned modification and the next finish restores it.
- regression_guard: tests/unit/projection-publication-ownership.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/projection-publication-ownership-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260820-1605-projection-publication-ownership.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-1605-projection-publication-ownership.review.md`
- Notes file: `tasks/notes/20260820-1605-projection-publication-ownership.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"projection-publication-deterministic","kind":"deterministic_test","paths":["*"]},{"id":"projection-publication-runtime","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - assets/reference-configs/sprint-contracts.md
  - assets/templates/helpers/contract-worktree.sh
  - assets/templates/helpers/verify-sprint.sh
  - docs/architecture/.projection-manifest.json
  - docs/reference-configs/sprint-contracts.md
  - docs/researches/20260820-model-infra-harness-boundary.md
  - plans/plan-20260820-1605-projection-publication-ownership.md
  - plans/repo-harness-v0.5-refactor-plan-v2.md
  - plans/repo-harness-v0.5-refactor-plan.md
  - scripts/contract-worktree.sh
  - scripts/verify-sprint.sh
  - src/cli/commands/architecture-projection.ts
  - src/cli/hook/architecture-drift.ts
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260820-1605-projection-publication-ownership.contract.md
  - tasks/reviews/20260820-1605-projection-publication-ownership.review.md
  - tasks/notes/20260820-1605-projection-publication-ownership.notes.md
  - tests/contract-worktree-single-publication.test.ts
  - tests/architecture-drift.test.ts
  - tests/helper-scripts.test.ts
  - tests/unit/contract-worktree-projection-restore.test.ts
  - tests/unit/projection-publication-ownership.test.ts
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/verify-sprint.sh
    - assets/templates/helpers/verify-sprint.sh
    - scripts/contract-worktree.sh
    - assets/templates/helpers/contract-worktree.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/projection-publication-ownership-pre-fix.log
    - tasks/notes/20260820-1605-projection-publication-ownership.notes.md
  tests_pass:
    - path: tests/architecture-drift.test.ts
    - path: tests/contract-worktree-single-publication.test.ts
    - path: tests/unit/contract-worktree-projection-restore.test.ts
    - path: tests/unit/projection-publication-ownership.test.ts
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - cmp scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh
    - cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior: Automatic projection runs before the acceptance subject is computed and the manifest is included in the publication tree.
- Edge cases: Disabled/manual projection modes are unchanged; automatic readiness failures and unexpected generated paths fail closed.
- Regression risks: `--prepare-acceptance` gains one provider invocation when automatic projection is enabled; because provider provenance may restamp on a new HEAD, the post-publication cursor acknowledgement is the no-replay invariant.

## Rollback Point

- Commit / checkpoint: the single contract publication commit.
- Revert strategy: revert that commit; no data migration or compatibility path exists.
