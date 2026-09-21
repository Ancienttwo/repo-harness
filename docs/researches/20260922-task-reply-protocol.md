# Task reply intent/commit protocol

AKN-03a implements the pure protocol and interrupted-chain oracle from the [Agent-first roadmap, AKN-03](https://github.com/Ancienttwo/repo-harness/blob/e0c032d18fcf826d1fe08334f4fab5f91060a4ba/docs/researches/20260921-agent-first-kanban-implementation-roadmap.md#55-ack之后崩溃恢复读面与副作用分离). This is a protocol foundation, not completed Steer, authenticated storage, or native Host acceptance.

## Source ownership and trust

`src/core/fleet/task-message.ts` remains the authority for message bytes and delivery receipt shapes. `src/core/engineers/principal-claim.ts` remains the authority for mapping and ClaimActorReceipt shapes. `src/core/fleet/task-reply.ts` validates their relationships; it does not authenticate their origin. A caller can construct valid hashes. Only the future protected effect boundary can establish that snapshots came from authenticated MCP authorization and live locked stores.

No CLI, MCP, worker, hook, inbox filesystem writer or UI imports the new contract in this slice. No `authenticated` flag is emitted. `inspectTaskReplyChain().state === 'complete'` means structural completeness only and must never by itself enable a badge, authorize work, or advance a Task/Lease.

The [C0 authority criterion](20260829-c0-collaboration-two-plane-authority-freeze.md#納入判據與排除清單) classifies this as messaging provenance, outside the five delivery authority planes (C-1); its pure records also decide no cross-agent ownership, publication or acceptance (C-2). The existing `collaboration-authority-baseline.test.ts` closed scan explicitly records this exclusion. The frozen delivery inventory digest is unchanged; future consumers must preserve or re-adjudicate this boundary.

## Frozen protocol v1

`TaskReplyIntentV1` has exact fields: `protocol`, `kind`, `effect_id`, `idempotency_key`, `parent`, `acknowledgement`, `principal_mapping`, `claim_actor`, `reply`, `prepared_at`, `intent_sha256`. Both identity fields equal the original reply UUID. Full validated snapshots freeze recovery input; they cannot overwrite the canonical event, ACK, mapping or actor stores. The canonical reply event owns the actual published body. An immutable intent retains the requested bytes so a later effect can retry exactly those bytes.

The parent must be an original `user|operator` + `local_operator` message addressed to `owner`, with no `in_reply_to`. Task/revision and any claim target match the actor. The acknowledged receipt must match that parent ID, revision and exact claim recipient/generation. Mapping is frozen active and matches actor repository, Engineer, Binding generation and contract revision. The actor snapshot additionally binds authorization revision, WorkEnvelope, worktree and session.

The builder derives the reply as `scope=task`, `audience=user`, null claim targets, `sender_kind=agent`, `sender_trust=lease_owner`, `sender_id=claim_actor.receipt_sha256`, and `in_reply_to=parent.message_id`. Creation time equals preparation time. Validation recomputes this shape, so even a rehashed caller-forged direction fails.

`TaskReplyCommitV1` has exact fields: `protocol`, `kind`, `effect_id`, `intent_sha256`, `reply_event_digest`, `acknowledgement_sha256`, `committed_at`, `commit_sha256`. Provenance is transitively bound through the complete intent; commit does not duplicate body. Both records use deterministic canonical JSON and content digests. Unknown fields, invalid source records and stale digests fail with `task_reply_invalid`.

## Recovery oracle

The caller supplies separately observed parent, original recipient ACK, intent, reply event and commit. The oracle never fills a missing record or writes anything.

| Observation | Structural result |
|---|---|
| No reply records | `absent` |
| Intent only, matching parent/ACK | `intent_only` |
| Matching intent/event without commit | `event_uncommitted` |
| Event without intent or commit | `orphan_event` |
| Matching intent/event/commit and original parent/ACK | `complete` |
| Commit missing intent/event | `inconsistent/commit_missing_records` |
| Changed parent/ACK, event, or commit links | `inconsistent/source_mismatch`, `event_mismatch`, or `commit_mismatch` |

Malformed records throw a typed validation error rather than masquerading as absent. Response loss is handled by observing the same records. `assertTaskReplyRetry` compares complete frozen canonical intent bytes and rejects a changed UUID, timestamp, body or fence with `task_reply_conflict`.

`assertTaskReplyResumeFence` compares current mapping and actor snapshots with the exact frozen digests; revocation or any Claim/Binding/authorization/WorkEnvelope/session change rejects with `task_reply_fence_changed`. It does not resolve live authority. The effect caller must do so under its authorization/Task lock ordering, before preparation and again before commit. Complete historical chains are verified against their frozen original records, independently of today's owner; that does not allow an old partial chain to resume.

Hook delivery stays `hook_session` with its existing null `delivery_ref`. Neither ACK nor a complete reply chain proves a separate runtime notification's exact control reference.

## Verification and remaining work

Focused pure tests exercise closed parent set, direction spoofing with recomputed hashes, exact ACK/actor relations, all eight intent/event/commit presence combinations, mismatched live records, original-ID response loss and current-versus-historical fence behavior. Existing Task message protocol tests protect unchanged V1 semantics. These fixtures establish data integrity only; they do not prove filesystem crash durability or any real principal/Host behavior.

Next AKN-03 slice must integrate the original protected Task Inbox lock/write primitives: intent fsync → original event publication → authority recheck → commit fsync/readback, single parent/recipient disposition under the task lock, and bounded readonly pending-disposition projection that ignores ordinary globally-satisfied filtering. It must add authenticated Engineer MCP consumption/ACK/reply, freeze actual reply-effects paths, preserve unknown notification effects under the original control reference, and prove failure injection at physical write boundaries. Real ST/AF canaries still require H0 and legal Campaign prerequisites. No protocol fixture closes those acceptance items.
