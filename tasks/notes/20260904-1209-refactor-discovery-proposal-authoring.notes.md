# Implementation Notes: refactor-discovery-proposal-authoring

> **Status**: Active
> **Plan**: plans/plan-20260904-1209-refactor-discovery-proposal-authoring.md
> **Contract**: tasks/contracts/20260904-1209-refactor-discovery-proposal-authoring.contract.md
> **Review**: tasks/reviews/20260904-1209-refactor-discovery-proposal-authoring.review.md
> **Last Updated**: 2026-09-04 12:09
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:a8448f363e23bc84fd60f0aacf333b67ad76da6a6d31bbebac1f284d7db9f9a6`

## Design Decisions

- Keep discovery/authoring stateless. Module 4 remains the sole owner of program events, current projection, author dispatch, and CLI lifecycle.
- Bind short aliases to the provider-owned `recommendationId` and fingerprint; do not copy recommendation status or infer a local score.
- Reject directory, glob, missing, and repository-escaping `scopePaths` before the proposal-bearing provider call. The provider remains the only scale authority.

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
