# Implementation Notes: axr6-durable-architecture-projection-runtime

> **Status**: Active
> **Plan**: plans/plan-20260808-2311-axr6-durable-architecture-projection-runtime.md
> **Contract**: tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md
> **Review**: tasks/reviews/20260808-2311-axr6-durable-architecture-projection-runtime.review.md
> **Last Updated**: 2026-08-09 11:14
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
- Claude's fourth pass found that an `applied` result could still carry an unresolved-major refresh signal and that transient model/policy preflight failures consumed the provider delivery budget. The orchestrator now dead-letters unresolved-major signals with operator-visible typed details and no source acknowledgement, while `preflight` is a durable non-attempt failure class that resumes automatically after the authority is repaired.
- The fourth repair also serializes the bounded v1 journal migration with PostEdit coalescing, preserves legacy dirty/payload state if an edit arrives before Stop, and accepts the pinned Claude capacity/auth signatures when benign banner or warning lines surround them.
- Claude's fifth pass found that a same-key edit arriving after request capture could keep the old event id and hit the prior receipt on the next Stop. Every coalesced write now advances delivery identity while retaining the same bounded pending file and monotonic dirty state, so selective acknowledgement cannot erase the newer occurrence.
- The same pass found two policy parsers and a real default-refresh checkpoint gap. Stop now reads `failureGate` only through `loadArchitectureProjectionPolicy`; disabled projection normalizes the inactive gate to advisory, invalid enabled policy blocks with its validation error, and the default refresh runner checkpoints each successful action before starting the next bounded action.
- Claude's sixth pass found that rotating an event id also detached its dead-letter budget, and that queue read models could race locked job transitions. Journal v2 now carries a stable slot key separately from its rotating delivery id; jobs and receipts persist both identities, dead-letter overlap uses the stable key, and queue/job/dead-letter reads acquire the same store lock as transitions. The success outcome is rendered only after the provider try/catch, so a read-model failure can no longer be reclassified into an impossible failure transition after the receipt is durable.
- Claude's seventh pass found an OS-process boundary hidden by the durable claim: a host-killed Stop can leave its bounded `archctx` child alive. Fresh abandoned claims are now quarantined for 150 seconds before recovery, so the 120-second provider bound expires before another apply can start. The packed host cycle proves an immediate second Stop does not spawn, then explicitly ages the disposable claim only after the orphan completion marker and recovers attempt 2.
- The seventh repair also reports preflight errors while another job owns the queue, keeps malformed policy advisory when no durable projection queue proves the lane active, separates journal housekeeping errors from the strict projection gate, and refreshes a retrying job's delivery ids for the same stable source slots before snapshot capture.

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
- Full repository tests on final revision `cea71bc3`: 2308 pass, 1 platform skip, 0 fail (`bun run check:ci`), followed by workflow, package dry-run, and tarball install smoke success.
- Packed installed host-cycle: `bun scripts/axr6-stop-host-cycle.ts` returned in 32064 ms after a 31000 ms package-local provider hold; Codex and Claude read back Stop=150/non-Stop=30; one `repo-harness.architecture-projection-receipt/v1` was durable before pending source events reached zero.
- Review repair regression: 123 pass/0 fail across orchestration/provider/Stop/cross-review/bootstrap/session suites; helper projection and typecheck passed. Updated packed host-cycle: legacy 30-second budget timed out at 30008 ms with no receipt, managed lane then completed at 31681 ms with attempt=2 and pendingSourceEvents=0.
- Third review repair regression: 110 pass/0 fail across orchestration, mutation journal, Stop policy, readiness, and cross-review tests; typecheck, hook/helper/reference projections passed. ArchContext snapshot parity regression: 70 pass/0 fail across the CLI protocol and projection-freshness suites. Packed host cycle re-proved legacy timeout at 30008 ms and managed recovery at 31773 ms with durable attempt 2.
- Fourth review repair regression: 78 pass/0 fail across durable orchestration, journal migration, and cross-review classification; typecheck passed. The reviewed snapshot mismatch concern is closed by the paired ArchContext `9c2ae39` change, which ships in `archctx@0.4.0` before repo-harness enables that exact version.
- Fifth review repair regression: 57 pass/0 fail across receipt-race orchestration, Stop policy, default refresh checkpointing, and mutation coalescing; typecheck passed.
- Sixth review repair regression: 59 pass/0 fail across stable dead-letter ownership, concurrent store-lock read serialization, journal schema, and Stop retention; typecheck passed.
- Seventh review repair regression: 60 pass/0 fail across durable orchestration, Stop policy, and journal delivery; typecheck and helper projection passed. Packed installed-host cycle timed out the legacy lane at 30014 ms, then completed a guarded Stop in 1364 ms with no second provider, observed the first provider's completion marker, aged only the disposable claim past its 150-second lease, and recovered a durable attempt-2 receipt in 31746 ms with zero pending source events.
- Final Sprint gate: `repo-harness run verify-sprint --prepare-acceptance` passed all 15 contract checks and froze `.ai/harness/checks/latest.json`; the AcceptanceReceipt remains pending because Claude returned its weekly-capacity limit before issuing a verdict for the current subject.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
