# Task Contract: acceptance-redaction-idempotence

> **Status**: Active
> **Plan**: plans/plan-20260904-0517-acceptance-redaction-idempotence.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-09-04 05:17
> **Review File**: `tasks/reviews/20260904-0517-acceptance-redaction-idempotence.review.md`
> **Notes File**: `tasks/notes/20260904-0517-acceptance-redaction-idempotence.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`verify-sprint` finalization re-emits already-redacted command evidence. The evidence writer then hashes an embedded redaction digest a second time, so an exact frozen subject loses its valid AcceptanceReceipt during the publication path. This currently blocks BYOK Step 4a after its full verification and acceptance have passed.

## Goal

Make `verify-sprint` finalization replay the immutable prepared run snapshot so repeated finalization preserves the exact receipt-bound command semantics and does not re-redact a materialized projection.

## Scope

- In scope:
  - Resolve and validate the immutable prepared run snapshot referenced by the receipt-verified checks projection.
  - Build the acceptance overlay from that raw snapshot, not from `.ai/harness/checks/latest.json`.
  - Make repeated finalization a no-op once the same receipt-bound evidence is already finalized.
  - Keep the source helper and packaged helper mirror synchronized.
- Out of scope:
  - weakening secret detection, accepting stale receipts, changing BYOK product code, or adding compatibility/fallback semantics.
- Taste constraints: preserve full `commands` in the AcceptanceReceipt fingerprint and preserve persisted-event redaction as the fail-closed security authority.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If replaying the raw prepared snapshot cannot reproduce the same materialized command evidence after one redaction pass, this direction is wrong. The cheapest proof is the projection-drift test that runs the shipped finalize overlay through the real event writer/materializer twice.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/verify-sprint.sh:949-981` rebuilds finalized evidence from materialized `.ai/harness/checks/latest.json`; the evidence writer redacts its embedded `sha256:<digest>` command marker again, so `scripts/acceptance-receipt.ts` correctly detects a changed `commands` fingerprint.
- repro: run the focused repeated-finalize guard in `tests/evidence-projection-drift.test.ts` against the unfixed source; the second materialization changes the command string from one redaction marker to two.
- regression_guard: tests/evidence-projection-drift.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/pre-fix-acceptance-redaction-idempotence.log

## Workflow Inventory

- Source plan: `plans/plan-20260904-0517-acceptance-redaction-idempotence.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260904-0517-acceptance-redaction-idempotence.review.md`
- Notes file: `tasks/notes/20260904-0517-acceptance-redaction-idempotence.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"verify-sprint-finalize-projection-tests","kind":"deterministic_test","paths":["scripts/verify-sprint.sh","assets/templates/helpers/verify-sprint.sh","tests/evidence-projection-drift.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/contracts/20260904-0517-acceptance-redaction-idempotence.contract.md
  - tasks/reviews/20260904-0517-acceptance-redaction-idempotence.review.md
  - tasks/notes/20260904-0517-acceptance-redaction-idempotence.notes.md
  - .ai/harness/runs/
  - .ai/harness/checks/latest.json
  - scripts/verify-sprint.sh
  - assets/templates/helpers/verify-sprint.sh
  - tests/evidence-projection-drift.test.ts
  - tests/helper-scripts.test.ts
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
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260904-0517-acceptance-redaction-idempotence.notes.md
  tests_pass:
    - path: tests/evidence-projection-drift.test.ts
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: prepare and finalize command evidence materialize the same command identity, and a second finalize emits no divergent event.
- Edge cases: missing, unsafe, stale, or subject-mismatched run snapshots fail closed.
- Regression risks: trusting a mutable or unrelated snapshot would weaken the evidence chain, so the source snapshot must be validated against the receipt-verified projection before emission.

## Rollback Point

- Commit / checkpoint: exact branch subject recorded by `verify-sprint --prepare-acceptance`.
- Revert strategy: revert the helper, packaged mirror, focused test, and workflow artifacts as one unit.
