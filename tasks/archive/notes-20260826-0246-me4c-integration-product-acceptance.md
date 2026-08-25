> **Archived**: 2026-08-26 02:46
> **Related Plan**: plans/archive/plan-20260826-0115-me4c-integration-product-acceptance.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260826-0246

# Implementation Notes: me4c-integration-product-acceptance

> **Status**: Active
> **Plan**: plans/plan-20260826-0115-me4c-integration-product-acceptance.md
> **Contract**: tasks/contracts/20260826-0115-me4c-integration-product-acceptance.contract.md
> **Review**: tasks/reviews/20260826-0115-me4c-integration-product-acceptance.review.md
> **Last Updated**: 2026-08-26 01:16
> **Lifecycle**: notes

## Design Decisions

- Use one existing Git commit/tree as the combined-candidate carrier. The envelope proves the base and every selected Publication head are ancestors of that exact candidate instead of constructing or ordering merges.
- Keep `AcceptanceReceipt` as the sole product-verdict authority. `ProductAcceptanceProjectionV1` verifies and references the existing protocol-2 receipt; it cannot sign, waive, merge, or mutate acceptance state.
- Bind every mutable read to exact bytes and digests: Approved PRD/spec, repository identity, current Publication pointer, reviewing Lease observation, cached immutable PublicationReceipt, Git refs/tree, matrix evidence, and target revision.
- Persist IntegrationContract, IntegrationEnvelope, AcceptanceMatrix, and ProductAcceptanceProjection as immutable content-addressed records under the Git common directory, with no mutable current pointer.
- Reject lexical and resolved symlink evidence at both CLI-input and repository-evidence boundaries so a later retarget cannot alter the frozen subject.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Build a merge candidate inside ME-4C | Reject | Git already owns commit construction and ordering; adding merge effects would widen authority and rollback scope. |
| Introduce a second product verdict | Reject | The existing verified `AcceptanceReceipt` is authoritative; a second signer would create irreconcilable dual truth. |
| Store mutable integration pointers | Reject | Content addressing plus explicit IDs is sufficient for the bounded local CLI and avoids a new coordination plane. |
| Re-read and revalidate all fences on acceptance | Use | It costs repeated Git/filesystem reads, but makes stale pointer, evidence, requirement, and candidate drift fail closed. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- None. The authority split is already captured by the approved PRD and ArchContext module; no second durable-memory surface is needed.
