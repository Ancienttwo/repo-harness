# Operator Task Board audit hardening (#242–#251)

> Historical record. PR #482 made the Kanban browser read-only.
> The unused Task Message request builder and child process are now removed.

## Scope and baseline

- Repository: `Ancienttwo/repo-harness`
- Audit baseline: `4b5672d5c401a8567f89b2d6c8a946c9be3584d0`
- Issues: #242 through #251
- Boundary: Operator Fleet snapshot reads, selected-repository collaboration reads, and the single Task Message write. No GitHub mutation, PR, label, or assignee change is part of this implementation slice.

## P1 · Architecture map

The browser Task Board in `src/operator-web/App.tsx` consumes two independent authorities: the Fleet projection from `src/effects/fleet/board.ts` through `src/effects/operator/server.ts`, and the selected repository's collaboration projection from `src/effects/operator/collaboration.ts`. Task Message is the only write: the browser POSTs through the Operator server to the retired Operator Task Message request builder, which resolves the registered repository and writes under the canonical task lock.

The authoritative boundaries remain separate:

- Fleet collection owns snapshot sequence, repository errors, and task/claim facts.
- Collaboration collection owns its own payload validation, repository identity, refresh lifecycle, and timeout.
- Canonical sprint state plus the live claim lease own whether a Task Message may commit.
- The browser is a strict decoder and presentation client; it does not infer missing task or claim identity.

## P2 · Concrete traces

### Task Message

Fleet card → composer draft captures `task_revision` and the claim id/generation pair → POST envelope carries that fence → transport validates the exact six-field shape and decoded body size → Task Message effect resolves the registered repository → canonical task revision and claim lease are rechecked → `sendTaskMessage` rechecks the same facts while holding the task lock → one idempotent message event is written or a typed conflict is returned.

### Collaboration refresh

Explicit Board refresh increments a collaboration refresh generation → only the selected repository is requested → response decoding validates the collaboration contract and requested `repository_id` → an obsolete effect cleanup suppresses a late response. The HTTP route places the synchronous production collector in a terminable worker, while the parent request owns the deadline, client-disconnect abort, and server-shutdown abort. A timeout terminates the worker and returns `collaboration_snapshot_timeout`; a later request starts from a clean worker.

## P3 · Decisions and preserved invariants

- Snapshot sequence is server-local and increments once per completed refresh start; concurrent callers share one in-flight sequence.
- The message body remains exactly 8 KiB after JSON decoding. The raw envelope cap separately budgets fixed fields plus six-byte worst-case JSON escaping per input byte.
- A draft keeps the fence it opened with. Refreshing the card cannot silently retarget already-written text.
- Browser draft recovery stores only body, message id, and the original fence in same-origin localStorage under the repository/task key. Remount restores editor state without sending; the existing transport and server still reject stale identities. Explicit rebind updates the stored fence, while acknowledged sends and explicit emptying remove the draft. Malformed or unavailable storage is visible and never supplies a replacement identity. One task has one local draft (the latest browser-tab edit wins); browser quota is the first limit as abandoned drafts accumulate. There is no scratch API or additional browser write route.
- Task and claim identifiers fail closed at the browser transport boundary: lowercase 64-hex task/revision digests, UUID claims, positive generations, and coherent claim/generation nullability.
- Fleet runtime-effect failures and collaboration payload failures retain dedicated codes and copy; neither borrows an adjacent error category.
- Group expansion keeps explicit user collapse/expand separate from automatic reveal, so newly urgent work appears without erasing user intent.
- The production collaboration collector is isolated because a timer on the same event loop cannot preempt synchronous filesystem work. At 10× repository/store cost, worker startup and one worker per collaboration request are the first scaling costs; the current selected-repository-only request model and bounded deadline keep that cost contained.

The implementation is the smallest coherent change that preserves the existing authorities: it adds no alternate parser, fallback identity, compatibility envelope, or shadow source of truth.

## Task worktree diff

The task detail pane offers an on-demand, read-only comparison. The browser sends only repository/task identity and the observed task revision, claim id and generation to `GET /api/v1/fleet/tasks/:repository/:task/diff`. Registry, canonical sprint and the bound lease resolve the execution tree locally; the API never accepts a worktree path or an arbitrary Git ref.

The base is the canonical target commit observed during this read, not the task's start commit. The lease has a `target_ref` but no task-start commit; `unit_ref` is a plan reference, not a key for legacy contract worktree metadata. The response includes target ref, base SHA, branch, HEAD and observation time. The patch compares that base against tracked working files, including committed and uncommitted changes. It does not attribute individual lines to a task. Untracked filenames are listed separately without loading their contents. Git binary/submodule summaries remain Git output.

The reader proves the execution worktree's real path, shared Git common directory and symbolic branch against topology. It rechecks registry/canonical/lease binding, HEAD, patch and untracked names before returning. Changes observed during the read produce a stale refusal. This is a bounded live observation, not an atomic filesystem snapshot or a delivery receipt. Missing/cleaned bindings have no historical fallback.

Synchronous authority and Git operations run in a disposable worker so the HTTP deadline remains enforceable. Active diff requests are bounded by the server concurrency limit, with no unbounded queue. Disconnect, deadline and shutdown terminate the reader; individual diff Git commands additionally have a five-second timeout. Each patch and untracked filename stream is capped at 512 KiB, with at most 1,000 untracked paths. Oversize output is refused, never silently truncated. External diff, textconv and fsmonitor are disabled. Repositories whose effective Git configuration contains an external clean/process filter command are refused explicitly, preserving their comparison semantics rather than ignoring transformations. The config probe uses the same worktree and environment as the diff; this is not an atomic defense against a local process maliciously rewriting Git configuration during the read. The browser renders patch text through React, resets on the complete task/claim fence and discards aborted responses.

The structural route inventory still has exactly one write: Task Message. No new dependency, editing, commit, merge, publication history, or TeamAI integration is introduced. The new core file owns the HTTP payload/decoder; the effect file owns local read authority; the worker isolates blocking reads; `TaskDiff.tsx` owns only the on-demand display lifecycle. Focused real-Git, HTTP worker/route and browser tests cover these boundaries.

Task diff also refuses assume-unchanged index entries instead of presenting incomplete tracked changes. The production worker disables Git lazy fetching for diff and canonical authority reads; missing local objects fail unavailable without downloading them.

Git/Node paths can retain different Windows short and long spellings. Task diff validates common-directory, topology and top-level through nonzero device/inode directory identity, while retaining the original canonical owner-path and claim/task/branch fences.
