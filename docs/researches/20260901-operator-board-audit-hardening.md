# Operator Task Board audit hardening (#242–#251)

## Scope and baseline

- Repository: `Ancienttwo/repo-harness`
- Audit baseline: `4b5672d5c401a8567f89b2d6c8a946c9be3584d0`
- Issues: #242 through #251
- Boundary: Operator Fleet snapshot reads, selected-repository collaboration reads, and the single Task Message write. No GitHub mutation, PR, label, or assignee change is part of this implementation slice.

## P1 · Architecture map

The browser Task Board in `src/operator-web/App.tsx` consumes two independent authorities: the Fleet projection from `src/effects/fleet/board.ts` through `src/effects/operator/server.ts`, and the selected repository's collaboration projection from `src/effects/operator/collaboration.ts`. Task Message is the only write: the browser POSTs through the Operator server to `src/effects/fleet/task-message-request.ts`, which resolves the registered repository and writes under the canonical task lock.

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
- Task and claim identifiers fail closed at the browser transport boundary: lowercase 64-hex task/revision digests, UUID claims, positive generations, and coherent claim/generation nullability.
- Fleet runtime-effect failures and collaboration payload failures retain dedicated codes and copy; neither borrows an adjacent error category.
- Group expansion keeps explicit user collapse/expand separate from automatic reveal, so newly urgent work appears without erasing user intent.
- The production collaboration collector is isolated because a timer on the same event loop cannot preempt synchronous filesystem work. At 10× repository/store cost, worker startup and one worker per collaboration request are the first scaling costs; the current selected-repository-only request model and bounded deadline keep that cost contained.

The implementation is the smallest coherent change that preserves the existing authorities: it adds no alternate parser, fallback identity, compatibility envelope, or shadow source of truth.
