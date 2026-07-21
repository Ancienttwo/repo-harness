# Plan: Acceptance Waiver Grant

> **Status**: Review
> **Created**: 20260721-1531
> **Slug**: acceptance-waiver-grant
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: targeted AcceptanceReceipt and hook guidance tests, helper projection parity, strict workflow checks
> **Rollback Surface**: revert this PR and delete host-owned waiver-grant/receipt state; no compatibility reader remains
> **Task Contract**: `tasks/contracts/20260721-1531-acceptance-waiver-grant.contract.md`
> **Task Review**: `tasks/reviews/20260721-1531-acceptance-waiver-grant.review.md`
> **Implementation Notes**: `tasks/notes/20260721-1531-acceptance-waiver-grant.notes.md`

## Context

The first real closeout on the new single-acceptance path invalidated the exact
AcceptanceReceipt after corrective semantic changes. That invalidation was
correct, but the workflow had no durable representation of the owner's broader
decision to waive semantic acceptance for the bounded contract. The agent
therefore asked the same owner to restate the waiver for successive subject
hashes. The user explicitly rejected that repeated authorization ceremony.

## Goal

Keep every AcceptanceReceipt exact-subject-bound while introducing one typed,
host-owned `UserWaiverGrant` bound to the contract and goal authorities. A
single explicit owner decision creates the grant. Corrective changes still
invalidate the old receipt and require fresh verification, but a new exact
receipt can be materialized from the same still-valid grant without asking the
owner again. Contract/goal authority changes invalidate the grant. External
acceptance, private-diff disclosure approval, and merge authorization remain
separate decisions.

## P1: Architecture Map

- `scripts/acceptance-receipt.ts` and its packaged helper mirror own the typed
  acceptance authority and host state.
- `src/effects/review/diff-fingerprint.ts` owns the normalized semantic subject;
  it stays unchanged.
- `verify-sprint`, `contract-worktree`, `ship-worktrees`, and `merge-gate`
  consume the receipt and stay consumer-only.
- `prompt-guard.sh` owns user-facing closeout guidance.
- Contract/goal Markdown authority fingerprints already normalize only declared
  lifecycle fields and therefore provide the correct stable grant boundary.

## P2: Concrete Trace

Current: owner waiver -> exact receipt -> semantic correction -> receipt stale
-> fresh verification -> agent asks owner for another hash-specific waiver.

Target: owner decision -> contract/goal-bound WaiverGrant -> exact receipt ->
semantic correction -> receipt stale -> fresh verification -> deterministic
receipt rematerialization from the same grant. A changed contract/goal or a
forbidden waiver policy fails closed and requires a new owner decision.

## P3: Design Decision

Separate authorization from acceptance evidence. The grant records the durable
human decision and its bounded authority; the receipt remains the exact current
acceptance projection. Do not make receipts survive semantic changes, do not
infer an owner decision from prose, and do not keep the direct subject-scoped
waiver authoring path as a fallback.

## Task Breakdown

- [x] Add strict UserWaiverGrant host state, record/verify/revoke commands, and receipt protocol cutover.
- [x] Materialize user-waiver receipts only from a valid grant; preserve exact subject and evidence invalidation.
- [x] Update closeout guidance and architecture/reference docs to request one contract-scoped owner decision without requiring a subject hash.
- [x] Add fixtures for reuse after semantic correction, grant invalidation, typed distinction, revocation, and external-pass isolation.
- [x] Verify helper mirrors and targeted workflow gates, then close/archive the package before HRD-08.

## Promotion Gate

- **Merge/PR unit**: one authorization-boundary PR before HRD-08.
- **Rollback surface**: revert this PR and delete host-owned waiver-grant/receipt state; no protocol-1 compatibility reader remains.
- **Verification boundary**: focused AcceptanceReceipt, merge-seal, and hook-guidance tests plus helper projection parity and strict workflow checks.
- **Review/acceptance boundary**: one typed receipt records external acceptance or a user waiver materialized from one valid contract-bound grant.
- **High-risk surface**: the owner authorization lifetime changes; contract/goal drift, stale verification, revocation, and disposition separation all fail closed.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: this plan's Task Breakdown plus its contract, review, and implementation notes.
- **Verification evidence**: `.ai/harness/checks/latest.json` and the focused commands in the task contract.
- **Evaluator rubric**: exact receipts remain semantic-subject/evidence-bound; the grant records only the bounded owner decision.
- **Stop condition**: no valid grant means user waiver cannot be materialized; no fresh passing verification means no new receipt.
- **Rollback surface**: revert this PR and delete host-owned grant/receipt state.

## Non-goals

- HRD-08/09 runtime work, provider invocation, Codex safety approval, merge authorization, and compatibility readers.
