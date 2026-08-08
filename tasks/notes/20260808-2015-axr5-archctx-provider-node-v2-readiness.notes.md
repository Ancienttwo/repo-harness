# Implementation Notes: axr5-archctx-provider-node-v2-readiness

> **Status**: Active
> **Plan**: plans/plan-20260808-2015-axr5-archctx-provider-node-v2-readiness.md
> **Contract**: tasks/contracts/20260808-2015-axr5-archctx-provider-node-v2-readiness.contract.md
> **Review**: tasks/reviews/20260808-2015-axr5-archctx-provider-node-v2-readiness.review.md
> **Last Updated**: 2026-08-08 20:15
> **Lifecycle**: notes

## Design Decisions

- Provider resolution is rooted at the installed repo-harness package/consumer root;
  PATH is never a candidate.
- Projection provider and capability source are orthogonal policy dimensions.
- Node v2 parser/exporter/self-host files move atomically; v1 is rejected without fallback.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Runtime `archctx` dependency in product manifest | Deferred to AXR8 | AXR5-AXR7 test packed tarballs without publishing or committing `file:` pins. |
| Mermaid skill as runtime dependency | Rejected | It remains an external authoring/review skill; exact Mermaid CLI stays a release validator in arch-context. |
| v1/v2 union reader | Rejected | A dual reader recreates semantic authority drift. |

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
