# AKN-06b reader retirement and shutdown

## Result and authority

Collaboration and TaskDiff no longer release server capacity when only their HTTP response has ended. An injected reader retains its slot until its Promise settles; a production `node:worker_threads` Worker retains it until `exit`. Cancellation requests termination and invalidates the response, but does not manufacture retirement.

`src/effects/operator/server.ts` remains the sole transport owner. Collaboration preserves repository + Decision cursor coalescing and its existing bounded FIFO queue. A cancelled but unretired same-key observation returns `collaboration_snapshot_busy`. Queued observations can time out without starting. Actual reader completion removes the retiring key, decrements the counter and drains the queue, provided shutdown has not begun.

TaskDiff now uses the existing bounded context/activity reader. These three Task routes share `max_concurrency`; the old separate diff cancellation/slot loop is removed. Its existing query parser, fenced decoder, no-fetch environment and HTTP failure statuses remain unchanged. Both production Workers and injected reader completions participate in shutdown. The two converted private worker entrypoints (`collaboration-worker.ts`, `task-diff-worker.ts`) use the existing `workerData` / `parentPort` convention atomically; there is no second protocol or compatibility reader.

Shutdown closes admission, cancels all observed work and queued subscriptions, then waits for Fleet, Collaboration, Task reads and the existing message-write completion sets. Concurrent `close()` callers await the same completion. Closing a Collaboration response explicitly emits the existing unavailable503 instead of destroying an unstarted response that the client can observe as empty200. No later reader result can replace a cancelled response.

## P1 / P2 / P3

- **Map:** Fleet already held its process slot through collector cleanup. Collaboration conflated subscription settlement with capacity release. TaskDiff duplicated a weaker cancellation-only loop. Context/activity had the needed Worker-exit mechanism, but their injected promises were absent from shutdown's completion set.
- **Trace:** guarded GET → slot → reader → HTTP outcome → resource retirement. Timeout/disconnect ends the subscription first. Capacity remains occupied; same-source retry fails busy. Only actual completion allows a replacement, and closing prevents queued starts.
- **Decision:** Reuse the established Task read owner, preserving route-specific failure statuses. Move Collaboration to the same built-in Worker API so its reader Promise can represent exit. No new service, setting, dependency, browser effect or public payload version is introduced. At 10× load, occupied slots and bounded queues refuse or time out; cancellation cannot increase effective capacity.

## Evidence

On base `5018f0d7469833339b8da51b65d30714870d2cbb`, seven new guards failed before production edits: timeout/disconnect retries incorrectly returned200, close callers resolved before their held readers retired, and shutdown launched a queued repository read. The exact nonzero `PRE_FIX_EXIT=1` output is preserved in `tasks/reviews/20260922-0926-akn06-retirement.review.md` and `.ai/harness/runs/akn06-retirement/pre-fix.log`.

After the change, the seven guards pass. A real default Collaboration Worker blocked in synchronous FIFO reading separately proves the HTTP deadline remains enforceable, same-key retry stays busy, and a different queued cursor cannot start until the blocked Worker exits. The fixture's FIFO writer owns its descriptor directly, so terminating that test process actually unblocks the read. Injected-reader tests verify timeout, disconnect, late completion, shared Task capacity, shutdown with queued work and concurrent close callers. Existing effect tests exercise the production TaskDiff Worker against real isolated Git repositories, preserving exact fenced diff output and machine-path redaction.

Final focused verification passes **86 tests / 565 assertions** across `operator-serve`, `operator-task-diff`, `operator-task-context` and `operator-task-activity`; typecheck and all nine required repository-integrity checks pass. The logs are under `.ai/harness/runs/akn06-retirement/`. Canonical/semantic gates are tracked in the owning review; local tests alone do not constitute stage acceptance.

## Limits and remaining roadmap work

Worker exit is observable but not guaranteed to be immediate. A native blocking read or an injected Promise that never settles can keep its slot and shutdown pending. That is the fail-closed ownership invariant; this package adds no timeout that falsely releases a live resource. The FIFO proof is POSIX-specific; cross-platform injected-reader guards remain portable, and hosted platform CI is not claimed here.

This slice proves retirement for these readers. Aggregate provider budgeting, Fleet/browser epoch decisions, formal history and old head/base/contract evidence invalidation still require their own observed implementation and acceptance. Native Host admission and the installed-package vertical journey remain separate roadmap requirements. Reverting the server and both worker entrypoints together requires no data migration.
