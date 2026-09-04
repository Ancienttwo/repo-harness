> **Archived**: 2026-09-05 00:47
> **Related Plan**: plans/archive/plan-20260905-0040-archctx-readback-stability.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260905-0047
> **Archive Projection V1**: `plans/plan-20260905-0040-archctx-readback-stability.md` => `plans/archive/plan-20260905-0040-archctx-readback-stability.md`
> **Archive Projection V1**: `tasks/notes/20260905-0040-archctx-readback-stability.notes.md` => `tasks/archive/notes-20260905-0047-archctx-readback-stability.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0040-archctx-readback-stability.contract.md` => `tasks/archive/contract-20260905-0047-archctx-readback-stability.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0040-archctx-readback-stability.review.md` => `tasks/archive/review-20260905-0047-archctx-readback-stability.md`

# Implementation Notes: archctx-readback-stability

> **Status**: Active
> **Plan**: plans/archive/plan-20260905-0040-archctx-readback-stability.md
> **Contract**: tasks/archive/contract-20260905-0047-archctx-readback-stability.md
> **Review**: tasks/archive/review-20260905-0047-archctx-readback-stability.md
> **Last Updated**: 2026-09-05 00:40
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:eb2d3299fd0e30bf5dc9950adebb489be7cc8a97eaf13b8f59f3ee207d752cea`

## Design Decisions

- The tracked readback records only stable evidence: exact source revision,
  package names/versions/files, schema digest, capability handshake, renderer
  identity, and worktree-match proof. Temporary pack tarball hashes are excluded
  because they are neither reproducible nor the published registry authority.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep temporary tarball hashes | Reject | Equivalent source builds produced different archive bytes and dirtied the verification subject. |
| Record published registry integrity | Reject for this readback | The command verifies a source archive and local pack, not a registry download; claiming registry authority here would be false. |
| Retain stable semantic/provenance fields | Use | These fields prove the exact version and provider contract without binding incidental archive bytes. |

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
