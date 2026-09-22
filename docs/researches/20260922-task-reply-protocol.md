# Task reply intent/commit protocol

AKN-03a implements the pure protocol and interrupted-chain oracle from the [Agent-first roadmap, AKN-03](https://github.com/Ancienttwo/repo-harness/blob/e0c032d18fcf826d1fe08334f4fab5f91060a4ba/docs/researches/20260921-agent-first-kanban-implementation-roadmap.md#55-ack之后崩溃恢复读面与副作用分离). AKN-03b adds protected local persistence and restricted Engineer MCP. Native Host admission, notification reconciliation and full Steer acceptance remain open.

## Source ownership and trust

`src/core/fleet/task-message.ts` remains the authority for message bytes and delivery receipt shapes. `src/core/engineers/principal-claim.ts` remains the authority for mapping and ClaimActorReceipt shapes. `src/core/fleet/task-reply.ts` validates their relationships; it does not authenticate their origin. A caller can construct valid hashes. The protected Task Inbox effect boundary resolves actual snapshots through authenticated MCP authorization and live locked stores.

Task Inbox and Engineer MCP now consume the contract for message disposition only. No `authenticated` flag is emitted. `inspectTaskReplyChain().state === 'complete'` means structural completeness only and must never by itself enable a badge, authorize work, or advance a Task/Lease.

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

Focused pure tests exercise closed parent set, direction spoofing with recomputed hashes, exact ACK/actor relations, all eight intent/event/commit presence combinations, mismatched live records, original-ID response loss and current-versus-historical fence behavior. Existing Task message protocol tests protect unchanged V1 semantics. The pure protocol fixtures establish data integrity only. The effect and HTTP coverage below exercise separate physical and request boundaries.

## Protected persistence and restricted MCP

`src/effects/fleet/task-inbox.ts` owns consume/ACK/reply and immutable `reply-effects/<parent UUID>/<claim recipient key>/{intent,commit}.json` beneath its existing Git-common Task Inbox. The Task lock fences one disposition per parent and recipient. Existing event and delivery V1 bytes remain authoritative and unchanged. Temporary records live under `staging/reply-effects`; exclusive creation, file fsync, immutable link and directory fsync precede success. Event publication uses the existing immutable event writer. No store writes infer Task, Lease, Publication or Acceptance transitions.

`src/effects/engineers/task-inbox.ts` composes Binding → Task → principal mapping → registry locks, reusing each existing owner. The exact original acquire WorkEnvelope is carried by the caller, checked against the immutable ClaimActorReceipt digest, then validated against live Lease, canonical plan and registry authorization. There is no second WorkEnvelope authoring path. Communication uses the current canonical Task revision and exact Plan/contract proof while allowing unrelated canonical commits; acquisition and acquisition replay still require the original commit OID. Rewriting the supplied envelope still fails its sealed ClaimActor digest. Live token verification is injected from the current HTTP request through the SDK's `extra.authInfo`; missing verifier or mismatched authorization fails closed. The same OAuth provider exposes synchronous verification so mutation and recheck cannot yield between them. Mapping/Binding/Lease remain protected by their owner locks; token expiry is rechecked immediately before publishing each reply record, including after staging file fsync.

The closed Engineer inventory adds `engineer_task_messages`, `engineer_task_message_consume`, `engineer_task_message_ack` and `engineer_task_reply`. Sender trust, actor, session and commit state are never caller-chosen arguments. Explicit pull uses the existing `manual` channel; an existing hook/effect receipt retains its original channel and reference. ACK does not imply reply or adoption. Reply requires the same recipient's exact ACK, emits only to `audience=user`, and freezes original ID/content/fence before event publication. An orphan event cannot be retroactively authenticated. Resume requires the original intent and current matching authority; historical chain inspection can still explain an old complete reply after revocation.

The readonly recovery view bypasses ordinary globally-satisfied filtering, so ACKed unanswered steers remain visible. It does not deliver, ACK, notify or repair records. Original steer bodies are framed as untrusted guidance. Partial chains additionally expose `recovery` with frozen parent ID/digest, reply ID, exact body and intent digest from the already validated intent. These bytes are opaque retry data, not a new instruction or authority; a restarted caller can recover without retaining its old request. The existing reply entrypoint still checks the current fence before resuming. MCP validates body type without trimming indentation or newlines, so whitespace changes on retry conflict. Reads use a default page of 50, maximum 100, at most 1,000 directory entries, 2 MiB and a 250 ms deadline after authority validation. `coverage.complete=false` and a typed reason distinguish page/scan/byte/deadline exhaustion from an empty inbox. The UUID cursor only advances a complete scan's page; a hard coverage limit is explicit and never silently skips records. For a known interrupted operation, pass paired `parent_message_id` and `parent_event_digest` without `limit` or `after` to `engineer_task_messages`. This authenticated exact-parent read loads one parent and its fixed-size intent/event/commit/ACK chain under the same current fences and byte/deadline limits, requires a persisted original intent, and reports `coverage.scope=exact_parent`. It remains usable beyond list scan and byte ceilings; it does not claim discovery of unknown parents or detect unrelated orphan events. List results report `coverage.scope=inbox`. Git-common resolution is reused per scan rather than spawning Git per event.

These transactions synchronously hold global principal and registry locks while validating canonical Git facts. This prioritizes exact authorization over throughput; tenfold concurrent request volume will first contend on those existing locks. The scan budget excludes initial authority validation and is not an end-to-end latency guarantee.

Effect tests terminate a child process at intent fsync, intent publication, event publication, commit fsync and commit publication, then recover with the original ID. They also cover revocation at publication, stale Lease, missing ACK, forged parent/envelope, orphan event, missing event under commit, bounded scans/pages and hook-channel preservation. The existing real HTTP OAuth test proves the request token reaches the restricted communication validator; OAuth tests prove the synchronous verifier observes revocation and registry revision changes. Fixture evidence does not establish the native Host/H0 isolation boundary.

## Remaining AKN-03 acceptance

Notification effects still need bounded reconciliation under the original control reference (§5.8), including accepted-but-unknown results and missing receipt exhaustion. Real ST/AF canaries require H0 and legal Campaign prerequisites. No record digest, local crash fixture, ACK, hook receipt or HTTP smoke closes those Host and notification acceptance items.

## Cursor ordering correction

Protected steer paging compares original UUID strings in code-point order for both sorting and exclusive cursor filtering. UUIDs remain case-preserving protocol identifiers; no normalization or alternate identity is introduced. Locale sorting is unsuitable because uppercase and lowercase UUIDs are both valid. A mixed-case three-steer regression reproduced an omitted uppercase entry on the old comparator and now requires every original ID exactly once. The historical activity reader already uses the same code-point order.

## Cross-platform HTTP fixture boundary

The OAuth transport fixture seeds Binding event/current and principal mapping records using the canonical core constructors and serializers. This lets the same authenticated HTTP reader assertions run on Windows, where directory fsync in the production Binding writer failed before the test reached those assertions (PR #437, run 35693364932, job 106634890098). Production durability remains unchanged; this fixture does not establish Windows writable-runtime admission.
