> **Archived**: 2026-08-26 12:42
> **Related Plan**: plans/archive/plan-20260826-0707-me2c-verified-evidence-context.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260826-1242

# Implementation Notes: me2c-verified-evidence-context

> **Status**: Active
> **Plan**: plans/plan-20260826-0707-me2c-verified-evidence-context.md
> **Contract**: tasks/contracts/20260826-0707-me2c-verified-evidence-context.contract.md
> **Review**: tasks/reviews/20260826-0707-me2c-verified-evidence-context.review.md
> **Last Updated**: 2026-08-26 11:46
> **Lifecycle**: notes

## Design Decisions

- Contract semantic authority stays in one exact tracked `.contract.md` JSON catalog. The projection binds commit, blob OID, raw byte digest, sorted IDs and projection digest; working-copy edits cannot change a stored projection.
- `VerifiedEvidenceContextV1` accepts only one root-to-leaf assertion chain that consumes every supplied proposal, round, run ref and result. Extra/unreachable records are ambiguity, not ignorable input.
- Identical evidence refs are deduplicated across proposal/round/assertion records; the same ref with different bytes fails closed.
- Decision publication owns two immutable lookup paths for the same canonical event bytes: transition-id lookup enables same-key recovery, while event-digest lookup binds current readback. Recovery repairs a missing event-digest copy before publishing current.
- Engineer decision actors are revalidated against the exact current active Binding. Human authentication remains the future transport adapter's responsibility; ME-2C freezes only the typed principal wire and actor matrix.
- Four narrow exported effect-boundary functions exist because ArchContext must prove the actual cross-capability calls without truncating a large orchestrator body. Each is on the live runtime path and protects a real boundary: delegated-result read, core compile, binding current read and decision event build.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Separate semantic sidecar | Rejected | Would create a second intent authority beside the Contract. |
| Timestamp/file-order latest assertion | Rejected | Cannot prove uniqueness or recover safely after partial writes. |
| Ignore extra checkpoint inputs | Rejected | Makes caller-provided ambiguity invisible and weakens exact-subject review. |
| Duplicate event bytes under transition/event digest indexes | Accepted | Bounded byte duplication preserves one canonical semantic event while supporting both idempotent recovery and digest-bound current readback. |
| Authenticate Human in CLI | Deferred to transport adapter | The PRD marks Human UI transport unknown; local CLI cannot mint an external identity authority. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Architecture Acceptance: `changeset.docs-projection-90539fd46a3eccb5` / `event.user-approval-20260826-me2c-architecture`
- Accepted projection digest: `sha256:90539fd46a3eccb578644ed59f9f8896fb5e769c114d2f573cce236be4def0dc`
- Final non-major projection input digest: `sha256:3a58fea3493725b023779e743412d25c1278c20e07fa103e6698c4267eee8385`
- Final non-major projection receipt: `sha256:2c149263243ee3992c6506a220d69ddaf01755adc44dae6b2e2ac44a8014a970`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
