# Plan: AKN-03a: Task reply intent/commit protocol and recovery oracle

> **Status**: Executing
> **Created**: 20260922-0113
> **Slug**: akn03-reply-protocol
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: https://github.com/Ancienttwo/repo-harness/pull/434
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Pure reply chain fault oracle plus required integrity and type checks; no Host acceptance
> **Rollback Surface**: Revert core contract, focused tests and own documentation; no persisted production state
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-0113-akn03-reply-protocol.contract.md`
> **Task Review**: `tasks/reviews/20260922-0113-akn03-reply-protocol.review.md`
> **Implementation Notes**: `tasks/notes/20260922-0113-akn03-reply-protocol.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: https://github.com/Ancienttwo/repo-harness/pull/434
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260922-0113-akn03-reply-protocol.md`
- Sprint contract: `tasks/contracts/20260922-0113-akn03-reply-protocol.contract.md`
- Sprint review: `tasks/reviews/20260922-0113-akn03-reply-protocol.review.md`
- Implementation notes: `tasks/notes/20260922-0113-akn03-reply-protocol.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-0113-akn03-reply-protocol.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-0113-akn03-reply-protocol.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-0113-akn03-reply-protocol.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260922-0113-akn03-reply-protocol.contract.md`
- Review file: `tasks/reviews/20260922-0113-akn03-reply-protocol.review.md`
- Implementation notes file: `tasks/notes/20260922-0113-akn03-reply-protocol.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-0113-akn03-reply-protocol.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-0113-akn03-reply-protocol.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert core contract, focused tests and own documentation; no persisted production state
- **Verification boundary**: Pure reply chain fault oracle plus required integrity and type checks; no Host acceptance
- **Review/acceptance boundary**: `tasks/reviews/20260922-0113-akn03-reply-protocol.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-0113-akn03-reply-protocol.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-0113-akn03-reply-protocol.contract.md`, `tasks/reviews/20260922-0113-akn03-reply-protocol.review.md`, and `tasks/notes/20260922-0113-akn03-reply-protocol.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-0113-akn03-reply-protocol.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert core contract, focused tests and own documentation; no persisted production state

## Captured Planning Output

## AKN-03a scope and stage boundary

Implement the pure Task reply persistence contract and fault oracle from roadmap Revision 3 sections 5.5–5.7. This is the first independently verifiable AKN-03 slice, not completion of Steer or Host acceptance. Source: PR #434, docs/researches/20260921-agent-first-kanban-implementation-roadmap.md. Approved full-roadmap execution authorizes this implementation and its stage PR; no merge or runtime activation is included.

## P1 — Map

TaskMessageEventV1 owns body/envelope; TaskMessageDeliveryReceiptV1 owns actual delivery/ACK. ClaimActorReceiptV1 binds task, Lease, WorkEnvelope and authorization revision; EngineerPrincipalMappingV1 binds authenticated authorization ID to Binding. Their existing validators/digests remain owners. Task Inbox owns the later filesystem transaction and per-task lock. Ordinary MCP audit cannot authenticate replies.

## P2 — Trace

A trusted owner-audience original user/operator steer is delivered to a claim recipient and ACKed. Current isGloballySatisfied hides task-scope ACKs independently of reply. The new pure contract freezes that exact parent, ACK, mapping, ClaimActorReceipt and canonical reply in an intent. Event publication and a commit referencing the intent/event/ACK form the three-record chain. The oracle observes missing or mismatching stages without writing them. This slice takes snapshots as data: matching hashes prove structural integrity only, never Host authentication or current authority.

## P3 — Decide

Add src/core/fleet/task-reply.ts with strict versioned TaskReplyIntentV1 and TaskReplyCommitV1, canonical validators/builders, immutable retry equality and a read-only chain classifier. Reuse existing canonical JSON and source validators. Full snapshots in intent are recovery inputs, not an alternative editable authority; commit binds their digests. Live parent/ACK/event must be supplied separately and match snapshots before chain completeness. Frozen active mapping/actor must match each other, current task/revision/recipient and reply sender. Resume assertion compares live mapping and actor with exact frozen digests; old partial replies cannot finish after rotation, while complete historical chains remain structurally verifiable without current authority.

Freeze reply direction: task scope, user audience, null target, agent/lease_owner, sender_id=ClaimActorReceipt digest, in_reply_to=parent ID. Parent: owner audience, user/operator + local_operator, no in_reply_to, same task/revision, claim scope must match recipient. ACK: acknowledged with original delivery, matching parent ID/revision and exact claim/generation. Effect ID and idempotency key both equal original reply message UUID; no alternate key permits a new logical retry. Commit records effect ID, intent digest, reply event digest, ACK digest and commit timestamp; the intent transitively owns frozen provenance.

Classifier states: absent, intent_only, event_uncommitted, orphan_event, complete, inconsistent. Invalid schema throws typed invalid; valid records with mismatched relations yield inconsistent. Commit without event/intent never succeeds. No authenticated boolean, provider calls, persistence, queue, runtime enablement, new MCP or UI surface in this slice. Those remain subsequent AKN-03 slices. 10x volume: fixed one-chain evaluation stays linear only in bounded record size; whole-task scanning/coverage belongs to the next reader slice.

## Files and acceptance

- src/core/fleet/task-reply.ts (new): independently meaningful cross-file integrity contract shared by planned protected writer and readonly recovery reader.
- tests/unit/task-reply.test.ts (new): protocol fault oracle separate from delivery state tests; no filesystem/provider fixtures needed.
- docs/researches/20260922-task-reply-protocol.md (new): stable contract, trust boundary and verified/remaining stage coverage.
- Own plan/contract/review/notes and generated docs/architecture/.projection-manifest.json only. No changes to user untracked docs or main product paths outside these files.

Existing tests/unit/task-message-v1.test.ts verifies event/receipt shapes; tests/unit/task-inbox-v1.test.ts verifies ACK hiding and claim fencing, neither covers reply commit chains. Lowest sufficient layer is pure core. Focused command: bun test tests/unit/task-reply.test.ts tests/unit/task-message-v1.test.ts (expected seconds, no model or network). Required root integrity checks and bun run check:type stay mandatory via contract Verification Plan. No new full-suite request; existing hosted CI remains required. Any extra failing check is reported and handled under repository scope limits.

Acceptance must cover task and claim parents, rejected self/agent/orchestrator/cross-task/revision parents, missing ACK/wrong recipient, direction spoofing, mismatched mapping/actor, schema tamper, missing intent/event/commit, changed event/ACK, same-ID conflict, response-loss readback, exact current-fence resume, old-fence reject, and complete historical chain after rotation. No test may claim protected storage, fsync, MCP authentication or live Host proof from a pure builder.

## Task Breakdown

- [x] Implement strict TaskReplyIntentV1 / TaskReplyCommitV1 and chain/resume/retry oracle.
- [x] Add protocol negative and recovery cases; preserve original event/receipt behavior.
- [x] Document frozen contract and remaining protected writer, recovery reader, MCP and Host work.
- [x] Freeze implementation subject, run canonical verification and obtain the independent reviewer verdict.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Implement strict TaskReplyIntentV1 / TaskReplyCommitV1 and chain/resume/retry oracle.
- [x] Add protocol negative and recovery cases; preserve original event/receipt behavior.
- [x] Document frozen contract and remaining protected writer, recovery reader, MCP and Host work.
- [x] Freeze implementation subject, run canonical verification and obtain the independent reviewer verdict.

Closeout follows the completed implementation checklist: record the subject-bound AcceptanceReceipt, archive via contract-worktree finish, then submit the stage PR. These publication steps remain pending until their actual receipts/remote readback exist.
