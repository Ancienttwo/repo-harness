# Plan: Provider Feedback V1

> **Status**: Archived
> **Created**: 20260823-0626
> **Slug**: provider-feedback
> **Planning Source**: codex-plan
> **Orchestration Kind**: user-approved-plan
> **Source Ref**: prd:fleet-acquire-publication-readiness#module-6
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: WP3 provider observation, immutable inbox, repair-loop and no-progress acceptance
> **Rollback Surface**: Revert the single WP3 provider-feedback publication unit; WP0-WP2 and WP3-A remain intact
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260823-0626-provider-feedback.contract.md`
> **Task Review**: `tasks/reviews/20260823-0626-provider-feedback.review.md`
> **Implementation Notes**: `tasks/notes/20260823-0626-provider-feedback.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: prd:fleet-acquire-publication-readiness#module-6
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260823-0626-provider-feedback.md`
- Sprint contract: `tasks/contracts/20260823-0626-provider-feedback.contract.md`
- Sprint review: `tasks/reviews/20260823-0626-provider-feedback.review.md`
- Implementation notes: `tasks/notes/20260823-0626-provider-feedback.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260823-0626-provider-feedback.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260823-0626-provider-feedback.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260823-0626-provider-feedback.md`.

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
- Contract file: `tasks/contracts/20260823-0626-provider-feedback.contract.md`
- Review file: `tasks/reviews/20260823-0626-provider-feedback.review.md`
- Implementation notes file: `tasks/notes/20260823-0626-provider-feedback.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260823-0626-provider-feedback.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260823-0626-provider-feedback.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single WP3 provider-feedback publication unit; WP0-WP2 and WP3-A remain intact
- **Verification boundary**: WP3 provider observation, immutable inbox, repair-loop and no-progress acceptance
- **Review/acceptance boundary**: `tasks/reviews/20260823-0626-provider-feedback.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260823-0626-provider-feedback.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260823-0626-provider-feedback.contract.md`, `tasks/reviews/20260823-0626-provider-feedback.review.md`, and `tasks/notes/20260823-0626-provider-feedback.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260823-0626-provider-feedback.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single WP3 provider-feedback publication unit; WP0-WP2 and WP3-A remain intact

## Captured Planning Output

## Goal and success criteria

Implement PRD v3 WP3 Provider Feedback as one independent work-package. A manual provider observation persists immutable, reconstructible feedback facts for the current publication; a separate delivery receipt tracks notification state; a derived repair offer re-enters the existing reopen/takeover lifecycle; and two completed same-token repairs halt automatic re-offering with user attention. Success means duplicate intake is idempotent, provider/pointer failures write nothing, observers never write reaction receipts or leases, and repair execution reuses the existing lifecycle state machine.

## Scope

- Pure `FeedbackEventV1`, `FeedbackDeliveryReceiptV1`, `ReactionAttemptReceiptV1`, `RepairOfferV1`, canonical encodings/digests, receipt transitions, reaction-token construction, and `evaluateNoProgress`.
- Git-common-dir inbox under `repo-harness/feedback/v1/<publication-id>/`, immutable create-if-absent provider events, separate atomic mutable delivery receipts, append-only reaction attempts, and strict malformed/symlink/non-regular-file rejection.
- GitHub observation through `gh` using provider object IDs and complete pagination. Missing IDs, unknown enums, incomplete pagination, auth/provider failure, and pointer mismatch fail closed before any feedback write.
- CLI `fleet feedback intake [--publication-id]`, JSON output, and focused fake-`gh` tests.
- Read-only pending-feedback projection into a derived `RepairOfferV1`; repair dispatch calls existing `reopenPublication` or `takeoverPublication` and injects a bounded feedback summary into the ephemeral work envelope. It does not create a normal acquisition offer.
- Durable repair-dispatch proof, independent ship-complete verification, idempotent completed repair-attempt recording, and deterministic no-progress evaluation; abandoned attempts never count.

## Public contracts

- `FeedbackEventV1` freezes `protocol`, `kind`, `provider`, `provider_event_id`, `publication_id`, `head_sha`, sorted unique failing-check object IDs with conclusions, sorted unique unresolved review-thread IDs, sorted unique changes-requested review IDs, mergeability state, bounded `summary`, `provider_url`, `observed_at`, and `observed_digest`. `observed_digest` hashes canonical immutable fields excluding itself. Persisted bytes are canonical JSON plus one newline.
- `FeedbackDeliveryReceiptV1` keys one provider event and carries only `delivery_state=pending|delivered|acknowledged|superseded`, `delivery_channel=none|hook_session|host_adapter|manual`, and nullable transition timestamps. Delivery state never participates in event identity or workflow authorization.
- `RepairDispatchProofV1` is evidence-only under the source publication inbox. It freezes an internally derived `repair_id`, the source publication pointer including its ship transaction key, source task/revision/claim/generation, feedback revision, before token, action, and a `prepared|dispatched` phase. `dispatched` additionally freezes the actual lifecycle successor claim/generation/state. It never authorizes a lease transition.
- `ReactionAttemptReceiptV1` freezes `protocol`, `kind`, source `publication_id`, internally derived `repair_id` and `completion_id`, exact successor claim/generation, the verified completion publication/receipt/head/ship transaction, `before_reaction_token`, `after_reaction_token`, `outcome=completed|abandoned`, and `recorded_at`. It is a separate append-only ledger, is idempotent by `completion_id`, and never reuses `AttemptReceiptV1`.
- `RepairOfferV1` is derived only: `kind`, `task_id`, `publication_id`, `expected_claim_id`, `expected_generation`, `expected_head_sha`, `feedback_revision`, `attention_owner`, and closed `allowed_actions=resume_same_owner|explicit_takeover`.
- Canonical provider-event identity must use a stable GitHub object/delivery identifier supplied by the provider observation. No timestamp, summary text, local sequence, URL parsing, count bucket, or synthesized fallback may stand in for that ID.
- `reaction_token` is a SHA-256 over the publication ID, exact observed head SHA, sorted unique failing check object IDs plus conclusions, sorted unique unresolved review-thread object IDs, and mergeability state. Changes-requested review IDs remain immutable feedback facts that affect `feedback_revision`, but they do not enter the breaker token. Summary text, URLs, delivery state, timestamps, and local attempt metadata are excluded.

## Out of scope

- Task Inbox WP3-A, fleet board WP4, daemon/webhook/SSE, polling/watch loops, host wake/liveness, PTY/session resume, full review-comment body persistence, normal fleet acquire changes, new lease states/schema, remote claims, automatic merge, compatibility parsers, or changes to `COORDINATION_PROTOCOL` and task digest domains.

## P1 architecture map

- `src/core/publication/feedback.ts` owns immutable protocol validation, canonical digests, reaction-token calculation, delivery transitions, repair-offer projection, and pure no-progress evaluation.
- `src/effects/publication/provider-feedback.ts` owns `gh` observation, complete pagination, publication-pointer fencing, common-dir storage, task-lock revalidation, reaction-attempt persistence, and zero-write failure behavior.
- `src/cli/commands/fleet.ts` owns the manual JSON intake surface.
- Existing publication receipt and lifecycle modules remain the authority for publication identity and reopen/takeover; existing lease storage remains the only current-publication authority.

## P2 concrete traces

1. Intake: explicit/current publication ID -> resolve immutable receipt -> under task lock re-read current publication pointer, claim and generation -> observe exact PR head/check/thread object IDs through fakeable `gh` runner with complete pagination -> construct canonical event -> create immutable event once -> initialize separate pending delivery receipt -> return JSON. Provider or fence failure performs zero writes and no lease mutation.
2. Duplicate: the same provider event ID and canonical bytes resolves the existing event idempotently; the same ID with different canonical bytes fails `provider_event_conflict` and never overwrites.
3. Repair offer: scan exact current-publication inbox -> validate every persisted record -> summarize pending events -> hash the canonical event set as `feedback_revision` -> compare only completed trailing reaction attempts -> emit a repair offer or `no_progress` with `attention_owner=user`. This path is read-only.
4. Repair dispatch: validate the offer against current pointer/claim/generation/head -> write a deterministic prepared dispatch proof -> call existing reopen for the same owner with a live worktree or takeover through `reviewing -> reserving(generation+1)` -> revalidate the actual successor -> deliver feedback -> promote the proof to dispatched -> inject the bounded ephemeral repair envelope. It never enters normal acquire and bind remains the only writer of `bound` after takeover.
5. Completion: task-lock read the dispatched proof -> require the exact successor to have shipped back to `reviewing` -> verify the distinct final ship transaction through the existing lifecycle ship-journal verifier -> derive after feedback/token from persisted final-publication material -> append once by deterministic completion ID. Caller-supplied tokens, attempt IDs, or ship claims are never proof. Observer/intake/list/projection paths append none.

## P3 decisions

- Reuse publication receipt/pointer/task-lock and lifecycle commands rather than copying their state machine.
- Use provider object IDs and complete pagination as the observation contract; fail closed when GitHub cannot prove a complete snapshot.
- Keep provider events immutable and delivery mutable so notifications cannot alter provider identity.
- Keep repair offers outside normal acquire because repair is bound to an existing publication and expected claim/generation.
- Reuse only the pure trailing-two completed-attempt algorithm shape from continuation; the reaction ledger remains a distinct artifact and digest domain.
- A mutable dispatch transaction is the minimum crash-recoverable bridge between feedback delivery and a later ship. Delivery receipts are notification evidence and cannot prove execution; the final `complete` ship journal remains the independent completion proof.
- At 10x repository count, `gh` pagination/rate limit is the first pressure point. P1 stays manual and one-publication-at-a-time; daemon/cursor/cache work remains deferred until measured.

## File boundary

- Product: `src/core/publication/feedback.ts`, `src/effects/publication/feedback-store.ts`, `src/effects/publication/feedback.ts`, `src/cli/commands/fleet.ts`, and one read-only export from `src/effects/publication/publication-lifecycle.ts` for its existing ship-journal verifier.
- Tests: focused pure protocol, store/effect, fake-`gh` intake, CLI, lifecycle integration, and PRD Acceptance Script 3 tests.
- Workflow evidence: generated plan, contract, review, notes, current-status/architecture projections, and ignored verification receipts.

## Typed failures

- `feedback_provider_failed`, `feedback_provider_incomplete`, `feedback_provider_shape_invalid`, `feedback_event_id_missing`, `feedback_unreadable`, `provider_event_conflict`, `publication_not_found`, `publication_claim_mismatch`, `head_moved`, `feedback_revision_mismatch`, `repair_offer_stale`, `repair_dispatch_conflict`, `repair_not_dispatched`, `repair_completion_unverified`, `repair_completion_not_distinct`, `reaction_receipt_conflict`, and `no_progress`.
- Every malformed, stale, ambiguous, unsafe-path, provider-incomplete, or pointer-mismatched condition fails closed. No local reconstruction or inferred provider identifier is permitted.

## Task Breakdown

- [x] Freeze pure event/delivery/reaction/offer contracts, canonical digests, state transitions, reaction-token domain, typed errors, and exhaustive unit tests.
- [x] Implement common-dir feedback store, immutable idempotency, delivery/reaction ledgers, symlink/malformed fences, and lease-byte/zero-write invariance tests.
- [x] Implement fakeable GitHub observation with exact object IDs, complete pagination, current-publication fencing, manual intake effect, and CLI JSON surface.
- [x] Implement pending-feedback repair-offer projection, durable dispatch transaction, existing reopen/takeover reuse, and verified idempotent repair completion without changing normal acquire.
- [ ] Run PRD Acceptance Script 3, focused tests, full root checks, independent gatekeeper review, Change Assessment, AcceptanceReceipt, and local closeout.

## Verification

- Fake-`gh` fixtures cover multiple pages, stable object IDs, duplicate event, conflicting event, changed head, missing/unknown fields, auth failure, truncated pagination, and ensure every failed observation writes zero bytes.
- Tests prove undispatched completion is rejected; reopen/takeover must reach their real successor and a distinct verified complete ship before one idempotent reaction is recorded; two such same-token completions yield `no_progress`; a token change resets naturally; observer/intake calls do not count; and `AttemptReceiptV1` is untouched.
- Tests prove pointer/claim/generation/head mismatch blocks dispatch, same-owner reopen requires a live worktree, takeover reaches `bound` only through existing reserving/bind behavior, and every observation/projection path leaves lease bytes exactly unchanged.
- Run `bun run check:type`, focused Bun tests, `bun test --timeout 60000`, all root required checks, independent gatekeeper review, exact-subject Change Assessment and AcceptanceReceipt.

## Failure and rollback

- Revert WP3 as one publication unit. WP0-WP2 and WP3-A remain usable because feedback events and repair offers do not own lease or task authority.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze pure event/delivery/reaction/offer contracts, canonical digests, state transitions, reaction-token domain, typed errors, and exhaustive unit tests.
- [x] Implement common-dir feedback store, immutable idempotency, delivery/reaction ledgers, symlink/malformed fences, and lease-byte/zero-write invariance tests.
- [x] Implement fakeable GitHub observation with exact object IDs, complete pagination, current-publication fencing, manual intake effect, and CLI JSON surface.
- [x] Implement pending-feedback repair-offer projection, durable dispatch transaction, existing reopen/takeover reuse, and verified idempotent repair completion without changing normal acquire.
- [ ] Run PRD Acceptance Script 3, focused tests, full root checks, independent gatekeeper review, Change Assessment, AcceptanceReceipt, and local closeout.
