# Implementation Notes: archive-acceptance-authority

> **Status**: Active
> **Plan**: plans/plan-20260831-0345-archive-acceptance-authority.md
> **Contract**: tasks/contracts/20260831-0345-archive-acceptance-authority.contract.md
> **Review**: tasks/reviews/20260831-0345-archive-acceptance-authority.review.md
> **Last Updated**: 2026-08-31 03:45
> **Lifecycle**: notes

## Design Decisions

- Archive output carries a versioned exact live-to-archive path projection, and
  AcceptanceReceipt reverses only that validated projection before authority
  hashing. The archive writer is the only boundary that knows every
  collision-safe destination; repeating the small map in every artifact keeps
  each file independently verifiable and avoids a second archive-index authority.
- The projection rewrites exact path substrings throughout artifact bodies,
  including `allowed_paths` and `artifacts_exist`. Historical
  `verify-sprint --contract <archive>` can then consume the archived contract
  normally, without heuristic fallback.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Leave body pointers unchanged and teach every reader to search archives | Reject | Creates multiple path-resolution authorities and leaves human-visible links broken. |
| Strip pointer-bearing lines from the authority fingerprint | Reject | Weakens semantic binding beyond the lifecycle transformation. |
| Exact versioned path projection plus inverse normalization | Use | Preserves all non-path bytes and makes the authorized rewrite explicit. |

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
