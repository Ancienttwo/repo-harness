# AKN-06a browser observation cadence

## Delivered boundary

Visible browser observations refresh 30 seconds after their own previous read completes. The shared `src/operator-web/useObservationRefresh.ts` lifecycle serves Fleet and Collaboration in `App.tsx`, repository observations in `AutomationSummary.tsx`, and context/activity in `TaskEvidence.tsx`. Each owner retains its original decoder, scoped state, failure display and authority checks. The lifecycle holds only timers, cancellation tokens, one queued request and a capped failure count; it cannot authorize a Task or produce domain values.

Failed reads wait 60 seconds, then 120 seconds, capped at 120 seconds. Success restores 30 seconds. Hiding the document cancels its timers and aborts the current reads. Becoming visible requests fresh observations immediately; an already-aborted promise that ignores cancellation must settle before its same lifecycle can start the queued request. Scope changes abort and invalidate the former lifecycle, and late responses cannot publish or reschedule it. Unmount removes listeners and timers and invalidates even the last completed token.

The Fleet HTTP reader passes AbortSignal through its existing uncached, strictly decoded request. Automatic reads retain the current Decision cursor and exact activity query. Explicit manual refresh retains the original first-page Decision behavior and scoped generation refresh. Composer state, retry identity, Task and Claim fences remain under the existing Composer owner; automatic observation never sends a message or rebinds stored drafts. Static injected Collaboration fixtures do not poll. Injected initial Fleet observations start with a 30-second wait. TaskDiff remains explicitly requested.

## P1 / P2 / P3

- **Map:** Four existing reader owners previously repeated request cancellation; App separately owned manual Fleet single-flight. Repository observations already have service epoch/generation guards. Backend collection slots, Worker retirement and history authorities are separate boundaries.
- **Trace:** source scope → lifecycle → existing read/decode → owner state → completion → next timer. Manual or visible requests coalesce behind an active promise. An abort invalidates publishing regardless of whether transport cooperates. A slow source does not delay unrelated sources.
- **Decision:** One lifecycle is justified by these existing consumers and their shared cancellation invariant. Fixed 30/60/120-second cadence adds no settings or provider calls. At 10× browser load, each lifecycle remains bounded to one active promise and one queued request, while aggregate server capacity remains the server's responsibility. Scope replacement can start a new lifecycle before a cancelled old transport retires; backend resource retirement therefore requires separate proof.

## Verification evidence

The five focused browser/type suites pass **254 tests / 1,347 assertions**. Controlled-clock tests cover slow completion, 30-second scheduling, manual coalescing, failure backoff/reset, initial hidden state, hidden abort, visible resume, uncooperative late results, scope replacement and unmount cleanup. The integrated App test drives all five reads, preserves a non-first Decision page and exact reply lookup across automatic/visible refresh, retains the same Composer node and byte-identical stored draft, and records zero message writes. Existing manual-refresh, scope, revision, IME and TaskDiff regression cases remain in the same suites.

The production browser build on a temporary GET-only fixture advanced Fleet sequence 19 → 20 without pressing Refresh, retained the selected second Decision page and showed no horizontal overflow at 1280 pixels. The document reported `visibilityState: visible`. Hidden/resume timing is controlled-DOM evidence; this browser observation does not claim an installed-package or native Host journey. Logs are under `.ai/harness/runs/akn06-refresh/`; typecheck, production build and all nine required repository-integrity checks also pass. Canonical verification and semantic acceptance remain separate gates.

## Remaining server and history boundary

Read-only research against parent `44fbe2c2d7a848f9493d275d6116c76442f23bc0`, confirmed in this worktree, found:

- Fleet already keeps its active observation until collector process-group/Windows Job cleanup completes (`src/effects/operator/server.ts`, `activeFleetObservation` / `fleetCompletions`; disconnect/retry coverage in `tests/cli/operator-serve.test.ts`). Reuse that evidence.
- Collaboration cancellation calls `settleCollaborationObservation`, immediately decrements `activeCollaborationWorkers` and drains its queue. The default Worker termination does not await `exit`; shutdown has no Collaboration completion collection.
- TaskDiff `finish` removes its canceller and terminates its Worker on timeout/disconnect/message. Shutdown has no TaskDiff completion collection. Cancellation tests do not establish exit-before-reentry.
- Repository snapshots carry service epoch/generation; the Fleet browser envelope, Collaboration and TaskDiff need separate freshness/identity decisions. Current TaskDiff rereads live canonical target/lease/HEAD and returns base/head SHA, but has no contract SHA or historical evidence ID. Exact Activity message lookup is already based on persisted message IDs, not display names.

The next server slice needs timeout/disconnect → unretired reader stays busy → completion admits retry tests, plus shutdown-awaits-completion tests for Collaboration and TaskDiff. Those changes, formal history and head/base/contract evidence invalidation are outside this browser cadence package. The native H0 admission and AKN-07 installed journey remain unproven by these UI reads.
