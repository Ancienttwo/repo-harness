# Implementation Notes: acceptance-waiver-grant

> **Status**: Active
> **Plan**: plans/plan-20260721-1531-acceptance-waiver-grant.md
> **Contract**: tasks/contracts/20260721-1531-acceptance-waiver-grant.contract.md
> **Review**: tasks/reviews/20260721-1531-acceptance-waiver-grant.review.md
> **Last Updated**: 2026-07-21 15:31
> **Lifecycle**: notes

## Decision Record

- Preserve exact AcceptanceReceipt invalidation on every semantic change.
- Move reusable owner intent into a separate UserWaiverGrant bound to the
  normalized contract and goal authorities.
- Fresh verification is mandatory before every rematerialized receipt.
- Direct subject-scoped waiver receipt authoring is removed, not kept as a
  fallback.
- Private-diff disclosure and merge authorization are separate and unaffected.

## Open Questions

- None.

## Verification Notes

- Focused AcceptanceReceipt and merge-seal tests passed.
- Hook runtime plus AcceptanceReceipt suite passed 80/80.
- Full `bun test` reached 1766 pass / 1 skip with two unrelated `state-concurrency` startup-barrier flakes; the isolated file rerun immediately passed 11/11.
- Source/package receipt helpers, hook projections, and reference-doc mirrors are byte-identical.
