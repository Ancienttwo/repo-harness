# Task Contract: acceptance-waiver-grant

> **Status**: Active
> **Plan**: plans/plan-20260721-1531-acceptance-waiver-grant.md
> **Task Profile**: code-change
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-21 15:31
> **Execution Base**: `origin/main@7581e4cfc6f16ddc113855e615d8af460afa8369`
> **Review File**: `tasks/reviews/20260721-1531-acceptance-waiver-grant.review.md`
> **Notes File**: `tasks/notes/20260721-1531-acceptance-waiver-grant.notes.md`

## Why

The first production use of AcceptanceReceipt correctly invalidated exact
receipts after semantic fixes but incorrectly conflated that invalidation with
the lifetime of the owner's waiver decision. The result was repeated requests
for the same owner intent, tied to successive hashes, during one bounded
work-package.

## Goal

Introduce a typed contract/goal-bound UserWaiverGrant. It may materialize new
exact-subject user-waiver receipts after fresh passing verification while the
contract and goal authorities remain unchanged. The old receipt always becomes
stale on semantic change. The grant never becomes external_pass and never
authorizes provider disclosure or merge.

## Scope

- Add UserWaiverGrant host state and strict validation in the receipt helper.
- Cut AcceptanceReceipt to protocol 2 with an explicit waiver-grant fingerprint.
- Remove direct user-waiver receipt authoring; user-waiver record consumes a
  valid grant only.
- Update user-facing prompt guidance and durable docs.
- Mirror packaged/source helper and hook files exactly.
- Add focused tests proving the authorization and invalidation boundaries.

## Out of Scope

- HRD-08/09 implementation.
- Provider calls or private-diff disclosure approval.
- Merge authorization.
- Compatibility reads for protocol-1 receipts or direct subject-scoped waiver
  authoring.
- Changes to semantic subject calculation.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260721-1531-acceptance-waiver-grant.md
  - tasks/contracts/20260721-1531-acceptance-waiver-grant.contract.md
  - tasks/reviews/20260721-1531-acceptance-waiver-grant.review.md
  - tasks/notes/20260721-1531-acceptance-waiver-grant.notes.md
  - scripts/acceptance-receipt.ts
  - assets/templates/helpers/acceptance-receipt.ts
  - assets/hooks/prompt-guard.sh
  - .ai/hooks/prompt-guard.sh
  - .ai/hooks/.projection.json
  - docs/reference-configs/sprint-contracts.md
  - assets/reference-configs/sprint-contracts.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - tests/acceptance-receipt.test.ts
  - tests/hook-runtime.test.ts
```

## Evidence Requirements

```yaml
evidence_requirements:
  benchmark: not_applicable
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_contain:
    - path: scripts/acceptance-receipt.ts
      pattern: "repo-harness-user-waiver-grant"
    - path: tests/acceptance-receipt.test.ts
      pattern: "reuses one owner grant"
  commands_succeed:
    - bun test tests/acceptance-receipt.test.ts tests/hook-runtime.test.ts
    - cmp scripts/acceptance-receipt.ts assets/templates/helpers/acceptance-receipt.ts
    - cmp assets/hooks/prompt-guard.sh .ai/hooks/prompt-guard.sh
    - bun run check:type
    - repo-harness run check-task-workflow --strict
  manual_checks:
    - "A semantic change invalidates the old receipt before fresh verification"
    - "The same valid contract/goal-bound grant can materialize the new exact receipt without another owner decision"
    - "Contract or goal authority changes invalidate the grant"
    - "user_waiver remains distinct from external_pass and merge authorization"
```

## Stop Conditions

- Stop if grant reuse can bypass fresh passing verification.
- Stop if a grant survives contract/goal authority changes.
- Stop if external_pass or reject can consume a waiver grant.
- Stop after three fail/fix/reverify rounds for the same issue.

## Rollback Point

- Execution base: `7581e4cfc6f16ddc113855e615d8af460afa8369`.
- Revert this PR and delete host-owned waiver-grant/receipt files. Do not add a
  protocol-1 compatibility reader.
