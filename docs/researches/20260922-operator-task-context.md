# Current Task context read contract

AKN-04c adds `GET /api/v1/fleet/tasks/:repository_id/:task_id/context`, an independent protocol 1 `operator_task_context` response. It supports an optional exact `task_revision` expectation and rejects every other or duplicate query parameter. The browser names only registered repository and canonical Task IDs. It cannot select a local path, Git ref, title, Plan cell or Source Ref.

## Authority and source basis

The strict registry resolves a single repository, including read-only registrations. The existing Board reader owns schema2 Task identity, revision, canonical row and Lease projection. `collectRepoTaskOffers` selects the exact Task before per-card plan resolution and retains the existing classifier, blocker owners and Campaign admission checks. An absent Lease or unapproved plan is inspectable state; a missing current Task is `task_not_found` and a mismatched expected revision is `stale`.

The sprint and its Task row come from the explicit canonical target commit. Plan/contract proof comes from current files in the registered worktree through the existing exact Source Ref resolver. The response labels that proof `basis: registered_worktree` and carries its byte digests. It does not imply those source files were read from the sprint's canonical commit. Missing, ambiguous, unapproved or nonprojectable sources remain null with original blocker codes and owners. The Plan cell is never an alternate source selector.

The effect observes Board and selected offer twice and rejects changed revisions/proofs or registry authority. A final registry read covers authority changes during the second source observation. `consistency: observed` describes a stable read window, not a cross-store transaction or write authorization. Every mutation still performs its original lock-time checks.

## Public projection

The DTO exposes canonical target/sprint reference; Task title, mode, acceptance and state; Lease state and recorded Claim ID/generation/state/branch/target ref; original readiness/blockers; exact plan/contract proof; and observation time, Board revision and registry authorization revision. A Claim does not mean an Agent is running. Raw WorkEnvelope, worktree/session paths, provider details, arbitrary diagnostic strings and document bodies are omitted by explicit mapping.

Strict browser and worker-boundary decoding checks identities, version, closed shapes, vocabulary, expected revision, relative source paths and exact Source Ref binding. The serialized response limit is 256 KiB. The endpoint reads no unrelated repository state, providers, notification or execution controller. Bad global registry authority still refuses the request; a registered but unreadable unrelated repository is not collected.

## Lifecycle and limits

Context and activity share one private server admission pool and supervised child-process lifecycle, with the existing server concurrency/deadline configuration. HTTP completion, timeout or disconnect does not release a running process tree's slot. POSIX group cleanup or Windows Job cleanup releases capacity; injected readers release it when settled. Shutdown aborts requests and awaits the same completion. Existing TaskDiff and collaboration paths are unchanged.

The browser transport uses no-store and AbortSignal and preserves the expected revision. Typed failures are unavailable, task_not_found, stale, too_large, busy and timeout. No cache, permanent watcher or domain store is created. At tenfold repository Task/plan volume, existing Board/source scans dominate cost; timeout refuses the read. This slice does not claim exact-task Board scan optimization.

## Verification and remaining roadmap

The effects suite exercises canonical versus dirty source, source basis and exact proof, missing/unapproved preparation, recorded claims without private fields, healthy A with unreadable B, strict selectors, unchanged storage bytes, changed proof/registry refusal and a real HTTP worker. Existing offer tests verify exact-task selection preserves original row order and skips unrelated plan resolution. Existing server/activity/browser suites cover shared cancellation, held capacity, guards and transport identity.

Repository-scoped automation summaries, UI presentation, target-scoped write affordances, refresh scheduling and archived context recovery remain later roadmap slices. In particular this GET does not relax the existing POST authorization or claim completion of OB-04 by itself. Historical messages remain available through activity's exact-ID reader.

Rollback removes the context DTO/GET/readers/transport and internal offer selector while preserving all stored authority. No migration, runtime installation or main merge is part of this slice.

## Blocked synchronous Git cancellation

Thread termination cannot interrupt an in-flight synchronous Git subprocess. A real Git read blocked on a POSIX FIFO at `.git/HEAD` reproduced timeout followed by permanent busy admission and unbounded close for both context and activity. The task readers now use the same process-tree supervisor as Fleet while retaining their own admission pool and DTOs. Their private process stays inert until an explicit start payload; Windows assigns the process to its Job before forwarding start. The retired thread entrypoints are removed.

The existing context effects suite contains the two real blocked-Git regressions. Both fail before the change and pass afterward, proving a later unknown-repository request is admitted and shutdown completes without manually unblocking Git. The existing Windows Job test additionally blocks the collector in execFileSync and requires cleanup acknowledgement after all Job members exit. The CI matrix runs the real context/activity HTTP suites on all three platforms; local macOS evidence alone does not establish the Windows result.
