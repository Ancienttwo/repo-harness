> **Archived**: 2026-08-15 03:23
> **Related Plan**: plans/archive/plan-20260815-0230-change-assessment-oracle-redaction.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260815-0323

# Task Contract: change-assessment-oracle-redaction

> **Status**: Fulfilled
> **Plan**: plans/plan-20260815-0230-change-assessment-oracle-redaction.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-15 02:30
> **Review File**: `tasks/reviews/20260815-0230-change-assessment-oracle-redaction.review.md`
> **Notes File**: `tasks/notes/20260815-0230-change-assessment-oracle-redaction.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Evidence materialization currently corrupts the signed Change Assessment
envelope whenever a committed oracle ID contains a 32-byte entropy-shaped run.
The resulting `checks/latest.json` cannot be consumed by AcceptanceReceipt, so
strict releases fail after otherwise passing verification.

## Goal

Preserve Change Assessment oracle IDs byte-identically through event redaction
and checks materialization while retaining known-secret redaction and entropy
redaction for unrelated `id` fields.

## Scope

- In scope: structural redaction classification for `required_oracles[].id`,
  direct regression tests, and an end-to-end materialization regression.
- Out of scope: general `id` exemptions, weaker secret matching, fingerprint
  compatibility, release metadata, or AcceptanceReceipt fallback behavior.
- Taste constraints: exempt only the closed fingerprinted oracle path; known
  secrets must still win before entropy exemption.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the narrow path exemption still changes a committed oracle ID, exempts an
unrelated ID, or leaks a known secret in that position, this direction is
wrong. The cheapest proof is the focused redaction regression.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/core/evidence/redaction.ts:isEntropyExemptLeaf` classifies only key/value, so a long committed `required_oracles[].id` is entropy-hashed while its enclosing Change Assessment fingerprints remain unchanged.
- repro: `bun test tests/evidence-event-store.test.ts --test-name-pattern "Change Assessment oracle IDs survive"`.
- regression_guard: tests/evidence-event-store.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/20260815-change-assessment-oracle-redaction-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260815-0230-change-assessment-oracle-redaction.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260815-0230-change-assessment-oracle-redaction.review.md`
- Notes file: `tasks/notes/20260815-0230-change-assessment-oracle-redaction.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"change-assessment-oracle-redaction-regressions","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/core/evidence/redaction.ts
  - tests/evidence-event-store.test.ts
  - tests/evidence-checks-materializer.test.ts
  - plans/plan-20260815-0230-change-assessment-oracle-redaction.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260815-0230-change-assessment-oracle-redaction.contract.md
  - tasks/reviews/20260815-0230-change-assessment-oracle-redaction.review.md
  - tasks/notes/20260815-0230-change-assessment-oracle-redaction.notes.md
  - docs/architecture/.projection-manifest.json
  - docs/architecture/modules/runtime-harness/evidence-store.md
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
    - src/core/evidence/redaction.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260815-0230-change-assessment-oracle-redaction.notes.md
    - .ai/harness/runs/20260815-change-assessment-oracle-redaction-pre-fix.log
  tests_pass:
    - path: tests/evidence-event-store.test.ts
    - path: tests/evidence-checks-materializer.test.ts
    - path: tests/acceptance-receipt-evidence-fingerprint.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior: fingerprinted Change Assessment envelopes survive ledger materialization byte-identically.
- Edge cases: unrelated IDs remain entropy-redacted and known-secret matches remain redacted at the exempt path.
- Regression risks: an over-broad path match could expose unrelated entropy-shaped identifiers.

## Rollback Point

- Commit / checkpoint: pre-fix `main@f12380487cb882040251251309666f3927edfed7`.
- Revert strategy: revert the narrow classifier and its regressions before release integration.
