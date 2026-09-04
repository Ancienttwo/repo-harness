# Implementation Notes: refactor-discovery-proposal-authoring

> **Status**: Active
> **Plan**: plans/plan-20260904-1209-refactor-discovery-proposal-authoring.md
> **Contract**: tasks/contracts/20260904-1209-refactor-discovery-proposal-authoring.contract.md
> **Review**: tasks/reviews/20260904-1209-refactor-discovery-proposal-authoring.review.md
> **Last Updated**: 2026-09-04 12:09
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:dd4de2a178961e92b0aa09ed898220e37c1e904dd91ebd95a2b531d1b1301e13`

## Design Decisions

- Keep discovery/authoring stateless. Module 4 remains the sole owner of program events, current projection, author dispatch, and CLI lifecycle.
- Bind short aliases to the provider-owned `recommendationId` and fingerprint; do not copy recommendation status or infer a local score.
- Reject directory, glob, missing, and repository-escaping `scopePaths` before the proposal-bearing provider call. The provider remains the only scale authority.
- Register the Refactor Program as its own ArchContext capability boundary so the remaining modules resolve to one explicit architecture owner instead of the root fallback.
- Keep Module 4 program state outside candidate worktrees under the Git common directory; immutable events are authoritative and `current.json` is only a validated, rebuildable projection.
- Reuse the account-level `ProgramAuthorizationV1` by exact id and digest. Its `target_revision` is a full Git object id (SHA-1 or SHA-256 repository format), so policy is read from that protected revision and never from candidate content.
- Treat explicit `stop` as terminal `stopped`, not `complete`; completion remains reserved for the verified post-merge resolution path.
- Map `scale = null` deterministically to `no_action`: whether observations deserve proposal authoring belongs to Module 2 before routing and cannot become an undeclared fourth route input.
- Keep materialization semantic inputs caller-owned, but bind every acceptance and rollback revision to the exact bytes published in the same Git commit. The effect performs no local structural inference.
- Publish Program bindings, Sprint rows, Plans, Work Graph, acceptance policies, and rollback boundaries through one temporary-index Git CAS. A post-CAS crash leaves state at `materializing`; exact replay recognizes only the authorized child commit and appends `begin_plan`.
- Preserve the execution hop chain by emitting `execution_surface: contract` Work Packages only. Materialization has no Lease write path.
- Read accepted recommendation state from ArchContext Book at materialization time and bind the provider fingerprint as `recommendationDigest`; the Program never stores lifecycle status.
- Enforce the operator-minted `allowed_work_package_ids` before the program enters `materializing`.
- Derive the architecture approval reference from the complete provider-owned target delta, then require the existing `architecture-projection accept` receipt to bind that reference, affected nodes, and major-change reasons.
- Commit projection-owned architecture file changes in the same CAS as architecture-route Program artifacts; this lane consumes provider output bytes and never renders architecture docs.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Persist authoring state in Module 2 | Rejected | It would create a second lifecycle authority before Module 4 lands. |
| Accept author-provided scale/route and ignore it | Rejected | Silent field dropping would accept authority the proposal author does not own. The closed input rejects extra fields. |
| Reimplement proposal validation | Rejected | `archctx-contracts@0.5.2` exports the author pairs, digest, and invariant validator. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
