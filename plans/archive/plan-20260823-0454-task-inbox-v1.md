# Plan: Task Inbox V1

> **Status**: Archived
> **Created**: 20260823-0454
> **Slug**: task-inbox-v1
> **Planning Source**: codex-plan
> **Orchestration Kind**: user-approved-plan
> **Source Ref**: prd:fleet-acquire-publication-readiness#module-6a
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: WP3-A protocol/store/CLI/cross-host hook acceptance plus lease-byte invariance and root checks
> **Rollback Surface**: Revert the single WP3-A publication unit; WP0-WP2 remain intact
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260823-0454-task-inbox-v1.contract.md`
> **Task Review**: `tasks/reviews/20260823-0454-task-inbox-v1.review.md`
> **Implementation Notes**: `tasks/notes/20260823-0454-task-inbox-v1.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: prd:fleet-acquire-publication-readiness#module-6a
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260823-0454-task-inbox-v1.md`
- Sprint contract: `tasks/contracts/20260823-0454-task-inbox-v1.contract.md`
- Sprint review: `tasks/reviews/20260823-0454-task-inbox-v1.review.md`
- Implementation notes: `tasks/notes/20260823-0454-task-inbox-v1.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260823-0454-task-inbox-v1.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260823-0454-task-inbox-v1.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260823-0454-task-inbox-v1.md`.

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
- Contract file: `tasks/contracts/20260823-0454-task-inbox-v1.contract.md`
- Review file: `tasks/reviews/20260823-0454-task-inbox-v1.review.md`
- Implementation notes file: `tasks/notes/20260823-0454-task-inbox-v1.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260823-0454-task-inbox-v1.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260823-0454-task-inbox-v1.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single WP3-A publication unit; WP0-WP2 remain intact
- **Verification boundary**: WP3-A protocol/store/CLI/cross-host hook acceptance plus lease-byte invariance and root checks
- **Review/acceptance boundary**: `tasks/reviews/20260823-0454-task-inbox-v1.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260823-0454-task-inbox-v1.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260823-0454-task-inbox-v1.contract.md`, `tasks/reviews/20260823-0454-task-inbox-v1.review.md`, and `tasks/notes/20260823-0454-task-inbox-v1.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260823-0454-task-inbox-v1.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single WP3-A publication unit; WP0-WP2 remain intact

## Captured Planning Output

## Goal and success criteria

Implement PRD v3 WP3-A as one Task Inbox V1 work-package. Users, orchestrators, Claude workers, and Codex workers can exchange bounded task-addressed messages through immutable events and per-recipient delivery receipts. Success means claim-scoped messages never cross takeover generations, task-scoped messages follow the task until one valid acknowledgement, Claude and Codex receive at most one bounded untrusted block at a real `UserPromptSubmit` boundary, and every send/deliver/ack/supersede step leaves lease bytes unchanged.

## Scope

- Pure `TaskMessageEventV1` and `TaskMessageDeliveryReceiptV1` contracts, exact parsing, canonical bytes/digests, bounded UTF-8 bodies, closed scope/audience/state transitions, and typed failures.
- Git-common-dir store at `repo-harness/task-inbox/v1/<task-id>/`, create-if-absent immutable events, separate atomic mutable recipient receipts, symlink/non-regular/malformed fail-closed behavior.
- Explicit canonical source resolution and task-lock revalidation of task revision, current lease, claim ID, generation, and execution worktree where owner delivery applies.
- CLI `fleet message send`, `fleet inbox list`, and `fleet inbox ack` with JSON results. Sender kind/trust and recipient keys are derived by the invocation/consumer boundary, never caller-provided paths or trust claims.
- One new typed `UserPromptSubmit.inbox` hook route shared by Claude and Codex. It runs after normal prompt classification as an independent handler, returns structured additional context only when messages exist, and injects one explicitly delimited untrusted peer-message block.
- Focused protocol/store/CLI/hook/installer tests plus PRD Acceptance Script 4, root required checks, independent gatekeeper review, Change Assessment, and AcceptanceReceipt.

## Public contracts and limits

- Event fields are the PRD v3 `TaskMessageEventV1` fields. `event_digest` hashes canonical immutable fields excluding itself; `body_sha256` hashes exact UTF-8 body bytes. Persisted event bytes are canonical JSON plus one newline.
- `message_id` is UUID. `task_id` and `task_revision` use existing 64-hex task digest validation. Claim-scoped events require `audience=owner` and freeze exact `target_claim_id + target_generation`.
- Identical retry with the same message ID is idempotent. For retry comparison, the existing event's frozen `created_at` is reused; any other canonical difference returns `message_id_conflict` and never overwrites.
- Body maximum is 8 KiB UTF-8. One hook turn injects at most 8 messages and at most 24 KiB, ordered by `(created_at, message_id)`; excess remains pending. No transcript file is ever read and no regex-based secret/transcript inference is introduced.
- Owner recipient keys are internally derived as `claim:<claim-id>:g<generation>`. Controlled manual boundaries derive `user:<id>` or `orchestrator:<id>`; raw recipient paths are never accepted.
- Delivery transitions are `pending -> delivered -> acknowledged` and `pending|delivered -> superseded`. Hook persists `delivered` before returning context, accepting a documented at-most-once crash window rather than creating session authority.
- Task-scoped owner messages are globally satisfied after the first valid acknowledgement. Claim-scoped messages encountered by a successor are superseded for the frozen target recipient and never rendered.

## Out of scope

- MCP mirror, provider feedback/WP3, fleet board/WP4, daemon/webhook/SSE, PTY/tmux, `codex exec resume`, `claude --resume`, host wake/liveness, transcript exchange, handoff/resume writes, new lease state/schema, lease mutation, remote claims, broadcast delivery, compatibility aliases, or changes to `COORDINATION_PROTOCOL` and task digest domains.

## P1 architecture map

- `src/core/fleet/task-message.ts` owns immutable protocol validation and pure receipt transitions.
- `src/effects/fleet/task-inbox.ts` owns canonical/lease fences, common-dir storage, recipient derivation, delivery/ack effects, and zero-lease-write enforcement.
- `src/cli/commands/fleet.ts` owns the three JSON CLI surfaces over the shared effect.
- `src/cli/hook/task-inbox-handler.ts`, `route-registry.ts`, `handler-registry.ts`, and `runtime.ts` own the typed host adapter path; existing prompt routing remains independent.
- Canonical sprint rows remain task authority; lease owner records remain execution authority; message events/receipts own communication history only.

## P2 concrete traces

1. Send: explicit task/canonical source -> canonical row resolves exact task ID/revision -> claim scope re-reads lease under task lock -> invocation boundary derives sender metadata -> immutable event create-if-absent -> JSON result. No lease write occurs.
2. Owner hook: active plan -> worktree claim token -> exact task/claim -> task lock -> canonical row + current bound lease + generation + execution worktree revalidation -> stable pending event scan -> stale claim receipt superseded without reading body -> eligible task message receipt delivered before rendering -> structured untrusted block.
3. Ack/list: controlled consumer derives recipient key -> canonical and owner fence revalidated -> receipt transition/read projection -> JSON result. A task-scoped first valid acknowledgement globally satisfies the event.
4. Failure: changed revision, missing owner, claim mismatch, unsafe path, unreadable/malformed event or receipt, reused ID with different bytes, or unavailable recipient fails typed and never retargets, infers generation, mutates lease, or wakes a process.

## P3 decisions

- Use a separate `UserPromptSubmit.inbox` route rather than coupling peer content to prompt classification or SessionStart/SubagentStart semantics.
- Reuse claim-token plus canonical/lease revalidation rather than scanning all leases or trusting EffectiveState task labels.
- Use publication receipt's durable create-if-absent pattern; do not create another authority or a compatibility parser.
- Do not add MCP until the transport provides a verifiable recipient principal.
- At 10x load the first pressure is per-task directory scan/task-lock wait; bounded scan/render is sufficient for v1 and daemon/cursor work remains measured-evidence gated.

## File boundary

- Product: `src/core/fleet/task-message.ts`, `src/effects/fleet/task-inbox.ts`, `src/cli/commands/fleet.ts`, `src/cli/hook/task-inbox-handler.ts`, `src/cli/hook/route-registry.ts`, `src/cli/hook/handler-registry.ts`, `src/cli/hook/runtime.ts`, and only the minimal installer/profile inventory files mechanically required by the new typed route.
- Tests: focused new task-message/task-inbox/CLI/hook tests and existing hook/install contract tests whose exact route inventory changes.
- Workflow evidence: the generated plan, contract, review, notes, current-status/architecture projections, and ignored verification receipts.

## Task Breakdown

- [x] Freeze pure message/event/receipt contracts, canonicalization, limits, errors, and exhaustive unit tests.
- [x] Implement create-if-absent event persistence, canonical/lease fences, list/deliver/ack/supersede effects, and lease-byte invariance tests.
- [x] Add the CLI send/list/ack JSON surfaces with explicit canonical source and boundary-derived identities.
- [x] Add the cross-host `UserPromptSubmit.inbox` typed route and bounded untrusted rendering without changing prompt classification.
- [ ] Run focused Acceptance Script 4 tests, host route/install parity, full root checks, independent gate, Change Assessment, AcceptanceReceipt, and local closeout.

## Verification

- Focused tests cover identical retry, conflicting ID, malformed/symlink paths, body/count/total limits, canonical revision drift, unowned claim, C/G -> C2/G+1 takeover supersession, task-scope successor delivery, idempotent hook/ack, global satisfaction, exact lease-byte equality, and absence of PTY/resume calls.
- Claude and Codex adapter fixtures both receive exactly one structured `[TaskInboxUntrustedPeerMessages]...[/TaskInboxUntrustedPeerMessages]` block; ordinary prompt route output is unchanged.
- `bun run check:type`, focused Bun tests, `bun test --timeout 60000`, helper/architecture/task workflow checks, dry-run init, independent gatekeeper review, exact-subject AcceptanceReceipt.

## Failure and rollback

- All malformed, stale, ambiguous, unsafe, and mismatched states fail closed with typed codes; no fallback targeting or inferred body exists.
- Revert WP3-A as one publication unit. WP0-WP2 remain usable because message history is non-authoritative and no lease schema changes.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze pure message/event/receipt contracts, canonicalization, limits, errors, and exhaustive unit tests.
- [x] Implement create-if-absent event persistence, canonical/lease fences, list/deliver/ack/supersede effects, and lease-byte invariance tests.
- [x] Add the CLI send/list/ack JSON surfaces with explicit canonical source and boundary-derived identities.
- [x] Add the cross-host `UserPromptSubmit.inbox` typed route and bounded untrusted rendering without changing prompt classification.
- [ ] Run focused Acceptance Script 4 tests, host route/install parity, full root checks, independent gate, Change Assessment, AcceptanceReceipt, and local closeout.
