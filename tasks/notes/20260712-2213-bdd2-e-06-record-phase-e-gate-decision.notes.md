# Implementation Notes: bdd2-e-06-record-phase-e-gate-decision

> **Status**: Active
> **Plan**: plans/plan-20260712-2213-bdd2-e-06-record-phase-e-gate-decision.md
> **Contract**: tasks/contracts/20260712-2213-bdd2-e-06-record-phase-e-gate-decision.contract.md
> **Review**: tasks/reviews/20260712-2213-bdd2-e-06-record-phase-e-gate-decision.review.md
> **Last Updated**: 2026-07-12 22:13

## Decisions

- Preserve S=`Reshape` and A=`Kill` exactly; E-06 does not reinterpret metrics.
- Resolve Browser and ImageGen separately as `Defer`. Their value remains plausible
  but unverified because the shared E prerequisite never opened.
- Resolve implementation pilot as `Defer`; running it would violate the protocol.
- Stop current productization. No public skill/catalog/tool/hook is created.
- Keep Sprint row E-06 and the final merge-dependent definition-of-done item open
  until the decision PR has passed hosted checks and merged. E-03/E-04/E-05 are
  already resolved; a pending E-06 review must not be projected as completed.

## Tradeoff

Marking gated rows resolved avoids an indefinitely open Sprint while preserving the
distinction between negative evidence and no evidence. A generic machine-readable
gate sidecar was rejected because this is one decision projection with no second
consumer.

## Open Questions

- None inside the approved Phase E protocol. Any rerun is a separately approved
  evaluation revision.
