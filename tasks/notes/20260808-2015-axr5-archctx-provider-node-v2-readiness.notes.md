# Implementation Notes: axr5-archctx-provider-node-v2-readiness

> **Status**: Active
> **Plan**: plans/plan-20260808-2015-axr5-archctx-provider-node-v2-readiness.md
> **Contract**: tasks/contracts/20260808-2015-axr5-archctx-provider-node-v2-readiness.contract.md
> **Review**: tasks/reviews/20260808-2015-axr5-archctx-provider-node-v2-readiness.review.md
> **Last Updated**: 2026-08-08 23:58
> **Lifecycle**: notes

## Design Decisions

- Provider resolution is rooted at the installed repo-harness package/consumer root;
  PATH is never a candidate.
- Projection provider and capability source are orthogonal policy dimensions.
- Node v2 parser/exporter/self-host files move atomically; v1 is rejected without fallback.
- The consumer reproduces ArchContext's public fixed-point snapshot contract: canonical
  repo/workspace identity plus a content digest that excludes architecture docs and
  declared agent-context targets. It checks the snapshot both before and after projection.
- A sticky ArchContext `baseHeadSha` is retained as generation provenance and is not
  confused with the request's current `headSha`; worktree identity remains the CAS boundary.
- The external review proved that AXR0 had published the request/result contracts without a
  producer command that actually accepted `ProjectionRequestV1`. ArchContext commit
  `309588e951d0f4612b177ceb154526ff8c9d5b9a` now owns that wire through
  `archctx projection run --request-json`; repo-harness only validates and returns the typed
  result. It does not synthesize status, receipts, refresh signals, or output snapshots.

## Deviations From Plan Or Spec

- The clean-room proof was strengthened from capability handshake only to a real packed
  `ProjectionRequestV1 -> ProjectionResultV1` call. The fixture has one node/v2 capability,
  registry access is disabled, and a conflicting PATH binary is present.
- The disposable fixture intentionally has no `.codegraph` index. The result therefore
  records the real package-local CodeGraph 1.5.0 binary digest with `unavailable` status and
  returns `human-action-required`; AXR7 owns a ready-index semantic projection proof.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Runtime `archctx` dependency in product manifest | Deferred to AXR8 | AXR5-AXR7 test packed tarballs without publishing or committing `file:` pins. |
| Mermaid skill as runtime dependency | Rejected | It remains an external authoring/review skill; exact Mermaid CLI stays a release validator in arch-context. |
| v1/v2 union reader | Rejected | A dual reader recreates semantic authority drift. |

## Open Questions

- None inside AXR5. Durable Stop orchestration and ready-index E2E remain explicitly owned
  by AXR6 and AXR7 rather than hidden as provider fallbacks.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Clean-room package/provider readback:
  `docs/verification/axr5-archctx-clean-room-readback.json`
- ArchContext producer verification at `309588e951d0f4612b177ceb154526ff8c9d5b9a`:
  `bun run verify` passed 1221 tests with 0 failures, including package boundary, Mermaid,
  packaged CLI smoke, privacy, production readback, and evaluation gates.
- Focused consumer suite after the review repair: 100 pass, 0 fail, 451 expects across the
  eight contract test files; `bun run check:type` and `bun run check:helpers` also pass.
- The regenerated clean-room fixture installs packed 0.4.0 artifacts with registry access
  disabled, proves the authoritative node schema is `archcontext.node/v2`, ignores a
  conflicting PATH binary, and executes the typed producer command with a valid receipt.
- First full suite: 2262 pass, 1 skip, 1 transient review-subject concurrency failure;
  isolated `tests/archive-evidence-gates.test.ts --rerun-each=2` passed 22/22.
- Canonical pre-review `bun run check:ci`: 2263 pass, 1 skip, 0 fail across 180 files; type,
  boundary, helper/reference projections, workflow gates, inspection, package dry-run,
  tarball install smoke and architecture/task sync gates all completed successfully.
- Canonical post-review-repair `bun run check:ci`: 2264 pass, 1 skip, 0 fail across
  180 files with 17506 expects; the same full gate, package dry-run, and tarball install
  smoke completed successfully.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
