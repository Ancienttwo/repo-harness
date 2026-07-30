# Task Contract: receipt-fingerprint-normalization

> **Status**: Active
> **Plan**: plans/plan-20260731-0612-receipt-fingerprint-normalization.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-31 06:12
> **Review File**: `tasks/reviews/20260731-0612-receipt-fingerprint-normalization.review.md`
> **Notes File**: `tasks/notes/20260731-0612-receipt-fingerprint-normalization.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`verification_evidence_sha256` is computed with key-order-sensitive `JSON.stringify` over objects whose key order depends on the evidence ledger's inline/blob storage split (blob path canonicalizes keys, inline preserves producer order). A semantics-preserving re-materialization of `checks/latest.json` therefore flips the fingerprint whenever the payload crosses the 8192-byte inline cap, and `verifyAcceptance` fails closed with "verification evidence is stale" — blocking seal and final verify non-deterministically. This is currently stalling the last pending work-package (`codex/reference-configs-projection`) and will bite any future package whose run trace rides the cap boundary.

## Goal

The evidence fingerprint becomes a key-order invariant: `scripts/acceptance-receipt.ts:244` uses the existing `stableJson` helper (same file, `:105-110`, already the pattern for `waiverGrantFingerprint`) instead of raw `JSON.stringify`; the new regression guard passes (semantics-preserving re-encoding keeps the receipt valid) while the fail-closed negative control stays green (semantic change still invalidates); the misattributed todos row is rewritten to accurately describe the separate embedded-provenance defect (verify-sprint.sh:547), which this package does NOT fix.

## Scope

- In scope: one-line fix in `scripts/acceptance-receipt.ts`; new guard `tests/acceptance-receipt-evidence-fingerprint.test.ts` (text frozen in the source plan appendix, RED-first with pre-fix artifact); rewrite of the misattributed todos deferred row; notes file.
- Out of scope: `scripts/verify-sprint.sh`, `src/effects/evidence/*`, `src/core/evidence/*`, `tests/evidence-projection-drift.test.ts` (embedded-provenance defect is a separate contract); the projection package branch; any storage-layer change.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the fingerprint change lets a semantically different verification evidence (added command, flipped status) verify against an old receipt, the fix has widened fail-closed semantics instead of removing a non-semantic sensitivity, and the direction is wrong. Cheapest proof point: guard test 2 ("still fails closed when the verification evidence changes semantically") passes on unfixed code and must still pass post-fix.

## Root Cause Evidence

- root_cause: `scripts/acceptance-receipt.ts:244` computes `verification_evidence_sha256` as `sha256(JSON.stringify(canonical))` where `canonical.benchmark_evidence`/`canonical.commands` are pass-through object references, so key order — which flips when `src/effects/evidence/event-writer.ts:82-92` offloads a >=8192-byte payload to the blob path (`canonicalize` sorts keys recursively) — changes the fingerprint of semantically identical evidence, making `scripts/acceptance-receipt.ts:624` fail closed.
- repro: deterministic sandbox test (frozen in the source plan appendix); on unfixed code test 1 fails at `acceptance-receipt.ts:624` with "verification evidence is stale" after a pure `deepSortKeys` re-encoding of `checks/latest.json`.
- regression_guard: tests/acceptance-receipt-evidence-fingerprint.test.ts
- pre_fix_failure_artifact: tasks/notes/20260731-receipt-fingerprint.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260731-0612-receipt-fingerprint-normalization.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260731-0612-receipt-fingerprint-normalization.review.md`
- Notes file: `tasks/notes/20260731-0612-receipt-fingerprint-normalization.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260731-0612-receipt-fingerprint-normalization.contract.md
  - tasks/reviews/20260731-0612-receipt-fingerprint-normalization.review.md
  - tasks/notes/20260731-0612-receipt-fingerprint-normalization.notes.md
  - tasks/notes/20260731-receipt-fingerprint.pre-fix.log
  - .ai/context/capabilities.json
  - .claude/templates/
  - scripts/acceptance-receipt.ts
  - assets/templates/helpers/acceptance-receipt.ts
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260731-0612-receipt-fingerprint-normalization.notes.md
  tests_pass:
    - path: tests/acceptance-receipt-evidence-fingerprint.test.ts
    - path: tests/acceptance-receipt.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: main tip at worktree creation (branch `codex/receipt-fingerprint-normalization`)
- Revert strategy: single-line production change; revert restores the key-order-sensitive fingerprint (guard test 1 fails again by design). No stored-data migration — receipts recorded under the new algorithm would need re-recording after a revert, and none will exist before this ships.
