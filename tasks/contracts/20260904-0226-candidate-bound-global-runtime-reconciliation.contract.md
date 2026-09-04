# Task Contract: candidate-bound-global-runtime-reconciliation

> **Status**: Fulfilled
> **Plan**: plans/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-global-runtime-reconciliation
> **Last Updated**: 2026-09-04 02:26
> **Review File**: `tasks/reviews/20260904-0226-candidate-bound-global-runtime-reconciliation.review.md`
> **Notes File**: `tasks/notes/20260904-0226-candidate-bound-global-runtime-reconciliation.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The update transaction can commit a new global package with predecessor-generated host adapters and a stale ownership ledger. This creates mixed-version runtime state while status may still report ready.

## Goal

Make handoff-capable global runtime updates semantically atomic: the installed candidate version owns post-install reconciliation, emits a transaction-bound receipt, and is committed only after exact projection and ledger verification. Bound migration from pre-handoff releases to an explicit bootstrap invocation followed by one candidate-owned update.

## Scope

- In scope: candidate absolute-path handoff; typed receipt; exact adapter projection diagnostics; ownership-ledger convergence; doctor update action; rollback and version-bound fixtures.
- Out of scope: repo-local adoption semantics, unrelated architecture projection behavior, compatibility fallbacks, or a second managed-entry ownership detector.
- Taste constraints: Reuse the existing transaction, `isManagedEntry`, strip/merge projection, and `applyInstallProfile` authorities; fail closed on any candidate or receipt mismatch.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a fixture with an old parent builder returning timeout 30 produces timeout 150 after one update without a candidate process owning the write, the handoff diagnosis is wrong. The cheapest proof is a boundary test that records which process/version generated the adapter.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `runGlobalRuntimeSetup()` in `src/cli/commands/global-runtime.ts` installs the candidate and then invokes the already-loaded parent `installHostAdapters()`, while `reconcileManagedRuntime()` verifies dependencies only, allowing predecessor adapter semantics and stale install-state to commit.
- repro: install a fixture candidate whose managed Stop timeout is 150 under an old updater fixture whose builder emits 30, run one update, then inspect the committed adapter and ledger.
- regression_guard: tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
- pre_fix_failure_artifact: .ai/harness/checks/candidate-bound-global-runtime-reconciliation.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260904-0226-candidate-bound-global-runtime-reconciliation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260904-0226-candidate-bound-global-runtime-reconciliation.review.md`
- Notes file: `tasks/notes/20260904-0226-candidate-bound-global-runtime-reconciliation.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"candidate-reconciliation-regressions","kind":"deterministic_test","paths":["*"]},{"id":"candidate-projection-runtime-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260904-0226-candidate-bound-global-runtime-reconciliation.contract.md
  - tasks/reviews/20260904-0226-candidate-bound-global-runtime-reconciliation.review.md
  - tasks/notes/20260904-0226-candidate-bound-global-runtime-reconciliation.notes.md
  - .ai/harness/checks/candidate-bound-global-runtime-reconciliation.pre-fix.log
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260904-0226-candidate-bound-global-runtime-reconciliation.notes.md
  tests_pass:
    - path: tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
    - path: tests/cli/status.test.ts
    - path: tests/cli/init-hook.test.ts
    - path: tests/cli/doctor.test.ts
    - path: tests/cli/global-runtime-init.test.ts
  commands_succeed:
    - bun run check:type
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: Candidate absolute-path reconciliation owns selected projections, exact verification, ledger refresh, and the receipt before parent commit.
- Edge cases: Same-count field drift, duplicate/extra routes, unmanaged siblings, forged/replayed capabilities, rollback, no-hooks partial state, and frozen legacy bootstrap are covered.
- Regression risks: Pre-handoff binaries cannot be retroactively made candidate-atomic; operators crossing that boundary must run the documented second update.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
