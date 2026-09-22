# Repository snapshot and collector admission

AKN-04d1 adds GET `/api/v1/fleet/repositories/:repository_id/snapshot`. No query selectors are accepted. The route preserves loopback Host/Origin/method checks and no-store behavior. Its protocol1 `operator_repository_snapshot` envelope carries an exact repository ID, server-lifetime UUID epoch, admission generation and the existing Operator6 snapshot. The nested sequence equals the generation and exactly one nested repository matches the requested ID. This is an observation, never write authorization.

## Authority and lifecycle

`collectFleetBoard` still strictly validates the complete registry, then selects the requested registered ID before any repository/provider work, including the deadline-error projection. Unknown ID yields `fleet_repository_not_found`; a malformed global registry remains fatal. Read-only repositories are readable. The original Fleet projection decides placement/counts/errors. The Operator projection removes local roots. No source parser, readiness classifier or state store is added.

Collector start IPC now requires protocol1 and an explicit fleet or repository scope. All emitters, parser and fixtures move together; old implicit-scope payloads are rejected. POSIX process-group ownership and Windows Job assignment-before-start remain the process lifecycle authority.

Global and repository requests share exactly one active provider-capable collector. That collector retains the existing max_concurrency provider limiter, so scopes cannot multiply provider concurrency. Same-scope subscribers coalesce. Distinct scopes wait FIFO with capacity max_concurrency*2; overflow returns fleet_snapshot_busy. The admission deadline includes queue wait. Cancellation/timeout retires the subscription identity immediately, allowing a fresh request to queue, but releases the process slot only when the production promise has proved process-group/Job cleanup. Injected readers hold admission until settlement. Server close cancels all observations and waits for actual active completion.

This trades cross-scope latency for a direct global concurrency bound. At10x load the bounded queue returns busy or timeout rather than accumulating processes. No permanent watcher, cache or retry is introduced. Activity/context/collaboration remain separate provider-free readers. Service epoch and generation are supplied for the later refresh consumer; this slice does not add auto-refresh.

## Regression evidence

Strengthening the existing Fleet disconnect/retry test detected a second collector starting while the first was still cleaning up. `overlap-before.log` records the expected-false/received-true failure; `overlap-after.log` records the passing correction. The canonical owner suite remains `tests/cli/operator-serve.test.ts`, with additional coalescing, FIFO, overflow, queued deadline, shutdown, epoch restart, real process and HTTP guard coverage. Collector tests cover selected-only provider calls, malformed registry and real healthy A/missing B with unchanged registry and Git bytes. Browser tests cover exact identity/generation, closed envelope, no-store and AbortSignal. Runtime logs are under `.ai/harness/runs/akn04-repository-snapshot/`.

## Remaining roadmap boundary

AKN-04d2 adds automation summary from original records. Current source map: controller-store's readAutomationControllerHeadEvent; stored ProgramAuthorization grants joined by exact digest/repository/target; budget-store's readAutomationBudgetBoardSlice projection; readDevelopmentCampaignStatus event chain; storedPlanningIntents and campaign-step's original receipt parser. The board budget reader currently lacks an explicit env argument; campaign-step's private readCampaignJournalSnapshot takes a lock and cannot be called by a domain-read-only GET. A read-only receipt export must reuse its original validator rather than duplicate the parser.

Controller executing is not native Agent-running proof. Current policy mode is a policy observation, not execution admission. A typed Campaign stop reason and a native turn reference are absent from existing public observations; those facts must remain explicitly unavailable until backed by an original record. This GET does not claim to complete the roadmap automation summary, OB-04 write affordances, runtime admission, deployment or stage acceptance.

Rollback removes the scoped route/envelope and shared collector admission without touching durable authority. Local CodeGraph proof, canonical verification and one semantic acceptance remain stage gates before PR closeout. No main merge or runtime installation is included.

## Shared process supervision

Fleet and the provider-free activity/context readers reuse one private server process-tree supervisor. Fleet queue and task-reader admission remain separate. Each transport provides its own process entrypoint, start payload and typed response decoder; both retain POSIX group and Windows Job ownership through cleanup. This closes the task-reader synchronous Git cancellation gap without changing repository snapshot protocol or introducing a fallback worker path.
