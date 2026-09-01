> **Archived**: 2026-09-01 09:19
> **Related Plan**: plans/archive/plan-20260901-0432-archive-codex-plugin-source.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260901-0919
> **Archive Projection V1**: `plans/plan-20260901-0432-archive-codex-plugin-source.md` => `plans/archive/plan-20260901-0432-archive-codex-plugin-source.md`
> **Archive Projection V1**: `tasks/notes/20260901-0432-archive-codex-plugin-source.notes.md` => `tasks/archive/notes-20260901-0919-archive-codex-plugin-source.md`
> **Archive Projection V1**: `tasks/contracts/20260901-0432-archive-codex-plugin-source.contract.md` => `tasks/archive/contract-20260901-0919-archive-codex-plugin-source.md`
> **Archive Projection V1**: `tasks/reviews/20260901-0432-archive-codex-plugin-source.review.md` => `tasks/archive/review-20260901-0919-archive-codex-plugin-source.md`

# Task Contract: archive-codex-plugin-source

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260901-0432-archive-codex-plugin-source.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-01 04:35
> **Review File**: `tasks/archive/review-20260901-0919-archive-codex-plugin-source.md`
> **Notes File**: `tasks/archive/notes-20260901-0919-archive-codex-plugin-source.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Current Codex-host protocol-2 acceptance receipts cannot satisfy the historical sealed-terminal classifier because the classifier hard-codes the other supported host route's source. Accepted workflows therefore remain active and cannot be archived, leaving the task board and active workflow surfaces stale.

## Goal

Make the classifier and installed template validate receipt identity against the contract's frozen acceptance policy, support the current Claude-host and Codex-host protocol-2 routes without accepting mismatches, and archive the already accepted WP2 workflow only after its exact sealed-terminal evidence passes.

## Scope

- In scope: policy-bound classifier and template identity validation, focused regression tests, WP2 lifecycle promotion and sealed-terminal archive, workflow artifacts for this bugfix.
- Out of scope: acceptance receipt schema changes, provider execution changes, new source aliases, archival of any workflow other than WP2.
- Taste constraints: Reuse the acceptance-policy authority and fail closed when policy is absent, malformed, or mismatched.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the current WP2 review returns `true` from `hasRecordedAcceptanceReceipt` without changing its source, the stale literal is not the root cause. The cheapest proof is the direct one-variable in-memory substitution recorded in `DEBUG.md`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/classify-historical-plans.ts:70` hard-codes one host route's source instead of matching the receipt to the contract's frozen policy, so a valid receipt from the other route is classified as absent; a literal replacement would invert the same bug.
- repro: `bun scripts/classify-historical-plans.ts --verify-sealed-contract tasks/contracts/20260901-0205-external-source-binding-wp2.contract.md --verify-sealed-review tasks/reviews/20260901-0205-external-source-binding-wp2.review.md`
- regression_guard: tests/historical-plan-classifier.test.ts
- pre_fix_failure_artifact: tasks/notes/20260901-0432-archive-codex-plugin-source.pre-fix.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260901-0432-archive-codex-plugin-source.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260901-0919-archive-codex-plugin-source.md`
- Notes file: `tasks/archive/notes-20260901-0919-archive-codex-plugin-source.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - DEBUG.md
  - scripts/classify-historical-plans.ts
  - assets/templates/helpers/classify-historical-plans.ts
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260901-0205-external-source-binding-wp2.contract.md
  - tasks/reviews/20260901-0205-external-source-binding-wp2.review.md
  - tasks/notes/20260901-0205-external-source-binding-wp2.notes.md
  - tasks/archive/contract-20260901-0919-archive-codex-plugin-source.md
  - tasks/archive/review-20260901-0919-archive-codex-plugin-source.md
  - tasks/archive/notes-20260901-0919-archive-codex-plugin-source.md
  - tasks/notes/20260901-0432-archive-codex-plugin-source.pre-fix.log
  - tasks/archive/
  - plans/archive/
  - docs/architecture/
  - tests/historical-plan-classifier.test.ts
  - tests/archive-evidence-gates.test.ts
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
    - DEBUG.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260901-0919-archive-codex-plugin-source.md
  tests_pass:
    - path: tests/historical-plan-classifier.test.ts
    - path: tests/archive-evidence-gates.test.ts
  commands_succeed:
    - bun run check:type
    - bun scripts/classify-historical-plans.ts --verify-sealed-contract tasks/archive/contract-20260901-0439-external-source-binding-wp2.md --verify-sealed-review tasks/archive/review-20260901-0439-external-source-binding-wp2.md
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: A Codex plugin receipt satisfies a `codex-plugin` policy, a direct Codex receipt satisfies a `codex-review` policy, and WP2 archives after lifecycle completion.
- Edge cases: Missing/malformed policy, policy-source mismatch, forbidden waiver, and reviewer/source mismatch remain rejected.
- Regression risks: Runtime/template drift and archive fixtures lacking an acceptance policy.

## Rollback Point

- Commit / checkpoint: implementation commit on `codex/archive-codex-plugin-source`.
- Revert strategy: Revert the classifier/template/test change and restore the WP2 workflow family from the same commit.
