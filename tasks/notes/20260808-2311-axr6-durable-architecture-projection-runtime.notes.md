# Implementation Notes: axr6-durable-architecture-projection-runtime

> **Status**: Active
> **Plan**: plans/plan-20260808-2311-axr6-durable-architecture-projection-runtime.md
> **Contract**: tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md
> **Review**: tasks/reviews/20260808-2311-axr6-durable-architecture-projection-runtime.review.md
> **Last Updated**: 2026-08-09 10:10
> **Lifecycle**: notes

## Design Decisions

- PostEdit only writes schema v2 observations. The sole v1 compatibility lane is a bounded one-way rewrite before the v2-only reader.
- Stop coalesces all eligible source events into one locked job and acknowledges only the event ids bound to a durable receipt.
- Contract verification and minimal-change effects are persisted as completed independently of the architecture source ack, so provider failure cannot starve orthogonal Stop work.
- Refresh work consumes only typed `ArchitectureRefreshSignalV1`; no path/diff-size heuristic invents major-change meaning.
- One repository has at most one running provider process. Duplicate source paths share one canonical job identity; dead letters have an explicit retry transition and SessionStart exposes the exact id.
- Package-local `archctx@0.4.0` remains the provider authority. Source and bundled runtimes locate the consumer package by walking upward from the actual `import.meta.dir`.

## Deviations From Plan Or Spec

- The first packed host-cycle exposed that the pre-AXR6 consumer-root resolver assumed the unbundled `src/effects/architecture` depth. In `dist/hook-entry.js` that fixed three-level jump skipped the installed package and produced `repo-harness package root is unavailable`. AXR6 corrected the resolver to walk from the current source/bundle directory; no compatibility fallback was added.
- External Claude review found five merge-blocking delivery defects plus a review-parser defect that had mislabeled Markdown `## [P1]` findings as PASS. The repair pass separated journal effects/ack, serialized runners, canonicalized job ids, removed queue-output inference from typed refresh, split projection failure gating from freshness, added dead-letter retry, and taught the parser heading syntax.
- Claude's second pass found that adding a new event could change the aggregate id and bypass an older dead letter, and that policy/model preflight failures still happened before job ownership. The second repair binds dead-letter blocking to overlapping source event ids and persists preflight failures through the same three-attempt state machine.
- The second pass also hardened claim ownership, host-killed third-attempt recovery, manual-drain acknowledgement, SessionStart corruption reporting, and per-action refresh progress. The packed host cycle now proves a real 30-second process kill followed by a recovered 150-second success on attempt 2.
- Claude CLI `--bare` was rejected because it intentionally disables OAuth keychain reads. The runner uses `--safe-mode` instead: hooks/plugins/instructions stay isolated while OAuth remains available. Opus fallback is now limited to the pinned Fable capacity signal.
- Claude's third pass found four remaining delivery hazards: a consumed event identity could suppress a later same-session edit, disabled policy could fail before the provider gate, phase-local timeouts could exceed the Stop budget, and non-terminal typed outcomes could be acknowledged. The repair assigns a fresh identity after each acknowledged delivery, validates only active provider policy, shares one absolute deadline across handshake/projection/refresh, and retains or dead-letters every non-terminal result.
- The same pass exposed two crash/concurrency boundaries. Source observation coalescing and acknowledgement now share a per-key lock and compare `updated_at` before removal; projection receipt recovery treats an already-durable receipt as authoritative over a stale running marker.
- Cross-repository inspection found a real snapshot-contract mismatch: repo-harness excluded `.ai/harness/**`, while ArchContext's repo-harness projection digest still included it. ArchContext commit `9c2ae39` now excludes operational harness state and its CLI protocol test mutates the pending journal between request capture and execution.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Ack observations before provider execution | Reject | A Stop crash or provider failure would lose the only delivery evidence. |
| Persistent dual v1/v2 reader | Reject | It creates two semantic authorities; the bounded migration is sufficient. |
| Infer major changes from file paths or diff size | Reject | ArchContext typed refresh signals are the semantic authority. |
| Widen every hook timeout | Reject | Only Stop owns the 120 second provider lane; the other routes stay at 30 seconds. |
| Reuse `architecture.freshness_gate` for Stop projection delivery | Reject | It is existing merge/drift policy; `projection_failure_gate` is the independent delivery control. |
| Treat missing legacy queue marker as refresh failure | Reject | The typed refresh signal is the semantic authority; helper stdout cannot veto it. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused regression: orchestration 9 pass/0 fail after adding crash recovery; provider plus packed-bundle tests 22 pass/0 fail; installer/Stop/orchestration batch 40 pass/0 fail before the packed-root correction.
- Full repository tests: 2301 pass, 1 platform skip, 0 fail (`bun run check:ci`), followed by workflow, package dry-run, and tarball install smoke success.
- Packed installed host-cycle: `bun scripts/axr6-stop-host-cycle.ts` returned in 32064 ms after a 31000 ms package-local provider hold; Codex and Claude read back Stop=150/non-Stop=30; one `repo-harness.architecture-projection-receipt/v1` was durable before pending source events reached zero.
- Review repair regression: 123 pass/0 fail across orchestration/provider/Stop/cross-review/bootstrap/session suites; helper projection and typecheck passed. Updated packed host-cycle: legacy 30-second budget timed out at 30008 ms with no receipt, managed lane then completed at 31681 ms with attempt=2 and pendingSourceEvents=0.
- Third review repair regression: 110 pass/0 fail across orchestration, mutation journal, Stop policy, readiness, and cross-review tests; typecheck, hook/helper/reference projections passed. ArchContext snapshot parity regression: 70 pass/0 fail across the CLI protocol and projection-freshness suites. Packed host cycle re-proved legacy timeout at 30008 ms and managed recovery at 31773 ms with durable attempt 2.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
