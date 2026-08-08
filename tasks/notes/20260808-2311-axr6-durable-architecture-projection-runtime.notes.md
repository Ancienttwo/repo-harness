# Implementation Notes: axr6-durable-architecture-projection-runtime

> **Status**: Active
> **Plan**: plans/plan-20260808-2311-axr6-durable-architecture-projection-runtime.md
> **Contract**: tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md
> **Review**: tasks/reviews/20260808-2311-axr6-durable-architecture-projection-runtime.review.md
> **Last Updated**: 2026-08-08 23:11
> **Lifecycle**: notes

## Design Decisions

- PostEdit only writes schema v2 observations. The sole v1 compatibility lane is a bounded one-way rewrite before the v2-only reader.
- Stop coalesces all eligible source events into one locked job and acknowledges only the event ids bound to a durable receipt.
- Refresh work consumes only typed `ArchitectureRefreshSignalV1`; no path/diff-size heuristic invents major-change meaning.
- Package-local `archctx@0.4.0` remains the provider authority. Source and bundled runtimes locate the consumer package by walking upward from the actual `import.meta.dir`.

## Deviations From Plan Or Spec

- The first packed host-cycle exposed that the pre-AXR6 consumer-root resolver assumed the unbundled `src/effects/architecture` depth. In `dist/hook-entry.js` that fixed three-level jump skipped the installed package and produced `repo-harness package root is unavailable`. AXR6 corrected the resolver to walk from the current source/bundle directory; no compatibility fallback was added.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Ack observations before provider execution | Reject | A Stop crash or provider failure would lose the only delivery evidence. |
| Persistent dual v1/v2 reader | Reject | It creates two semantic authorities; the bounded migration is sufficient. |
| Infer major changes from file paths or diff size | Reject | ArchContext typed refresh signals are the semantic authority. |
| Widen every hook timeout | Reject | Only Stop owns the 120 second provider lane; the other routes stay at 30 seconds. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused regression: orchestration 9 pass/0 fail after adding crash recovery; provider plus packed-bundle tests 22 pass/0 fail; installer/Stop/orchestration batch 40 pass/0 fail before the packed-root correction.
- Full repository tests: 2279 pass, 1 platform skip, 0 fail (`bun run check:ci`; workflow task-sync was the only subsequent failure before this notes synchronization).
- Packed installed host-cycle: `bun scripts/axr6-stop-host-cycle.ts` returned in 32064 ms after a 31000 ms package-local provider hold; Codex and Claude read back Stop=150/non-Stop=30; one `repo-harness.architecture-projection-receipt/v1` was durable before pending source events reached zero.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
