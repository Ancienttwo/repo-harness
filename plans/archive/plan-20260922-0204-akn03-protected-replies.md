> **Archived**: 2026-09-22 14:03
> **Related Plan**: plans/archive/plan-20260922-0204-akn03-protected-replies.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260922-1403
> **Archive Projection V1**: `plans/plan-20260922-0204-akn03-protected-replies.md` => `plans/archive/plan-20260922-0204-akn03-protected-replies.md`
> **Archive Projection V1**: `tasks/notes/20260922-0204-akn03-protected-replies.notes.md` => `tasks/archive/notes-20260922-1403-akn03-protected-replies.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0204-akn03-protected-replies.contract.md` => `tasks/archive/contract-20260922-1403-akn03-protected-replies.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0204-akn03-protected-replies.review.md` => `tasks/archive/review-20260922-1403-akn03-protected-replies.md`

# Plan: AKN-03b: protected Task reply persistence and Engineer MCP

> **Status**: Archived
> **Created**: 20260922-0204
> **Slug**: akn03-protected-replies
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: https://github.com/Ancienttwo/repo-harness/pull/435
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Filesystem crash recovery and exact live authority through Engineer MCP
> **Rollback Surface**: Revert new communication entrypoints and reply-effects writer; preserve original messages and receipts
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260922-1403-akn03-protected-replies.md`
> **Task Review**: `tasks/archive/review-20260922-1403-akn03-protected-replies.md`
> **Implementation Notes**: `tasks/archive/notes-20260922-1403-akn03-protected-replies.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: https://github.com/Ancienttwo/repo-harness/pull/435
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260922-0204-akn03-protected-replies.md`
- Sprint contract: `tasks/archive/contract-20260922-1403-akn03-protected-replies.md`
- Sprint review: `tasks/archive/review-20260922-1403-akn03-protected-replies.md`
- Implementation notes: `tasks/archive/notes-20260922-1403-akn03-protected-replies.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260922-1403-akn03-protected-replies.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260922-0204-akn03-protected-replies.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260922-0204-akn03-protected-replies.md`.

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
- Contract file: `tasks/archive/contract-20260922-1403-akn03-protected-replies.md`
- Review file: `tasks/archive/review-20260922-1403-akn03-protected-replies.md`
- Implementation notes file: `tasks/archive/notes-20260922-1403-akn03-protected-replies.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260922-1403-akn03-protected-replies.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260922-0204-akn03-protected-replies.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert new communication entrypoints and reply-effects writer; preserve original messages and receipts
- **Verification boundary**: Filesystem crash recovery and exact live authority through Engineer MCP
- **Review/acceptance boundary**: `tasks/archive/review-20260922-1403-akn03-protected-replies.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260922-0204-akn03-protected-replies.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260922-1403-akn03-protected-replies.md`, `tasks/archive/review-20260922-1403-akn03-protected-replies.md`, and `tasks/archive/notes-20260922-1403-akn03-protected-replies.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260922-1403-akn03-protected-replies.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert new communication entrypoints and reply-effects writer; preserve original messages and receipts

## Captured Planning Output

## AKN-03b protected communication scope
Implement roadmap sections 5.3, 5.5–5.7: principal-fenced owner consume/ACK/reply, durable intent/event/commit with original-ID recovery, and bounded pending-disposition reader. Expose only named Engineer MCP tools. No browser mutation, runtime scheduler, notification replay, Task/Lease mutation, Host activation or live canary claim. Notification reconciliation (§5.8) and admitted Host vertical acceptance remain the next AKN-03 boundary. Stack on PR #435 at 749e9e92 after its inventory correction received exact owner acceptance and was published. The worktree fast-forward preserved all in-progress AKN-03b edits.

## P1 — Map
Task Inbox owns task locks, canonical Task/Lease validation, events and recipient receipts. task-reply core owns exact chain integrity; principal-store owns mapping under its existing store lock; binding-store owns per-Engineer mutation lock; repo-registry owns access/revision mutation lock. OAuth's live token store is a separate transport authority: revoking OAuth does not revoke principal mappings. MCP CallTool context must pass a current-request-only authorization recheck, never an identity argument. WorkEnvelope is returned by acquire, not durably authored in a worktree file. Use that exact caller-carried snapshot only after matching its complete digest against the immutable ClaimActorReceipt and verifying live Lease/canonical work; do not invent another writer or derive it from filenames.

## P2 — Trace
Authenticated Engineer request -> exact request token check -> mapping selects Engineer -> Binding lock -> Task lock -> mapping lock -> registry lock. Under those locks validate active mapping/Binding, canonical Task, exact actor and original WorkEnvelope, registry authorization revision/read_write, and live OAuth token. Consume marks only original human owner-audience events delivered using the existing receipt channel; ACK remains independent. Reply requires the actual parent digest and current recipient ACK; creates intent, publishes canonical user-audience event, rechecks all authority, writes commit, reads back complete chain. Partial writes remain observable and resume only the same ID/content/fence. Read-only pending projection includes already-ACKed original steers with missing reply and never delivers/ACKs/notifies.

## P3 — Decisions
Keep communication authority local to Task Inbox. Add reply-effects/<parent message UUID>/<recipient key>/{intent,commit}.json, each immutable canonical record using existing checked directories, staging/link/fsync pattern. This keyed location is the unique parent/recipient disposition, not another queue or message body authoring path. Current binding/task/mapping/registry locks remain held over the synchronous bounded transaction. Expose the existing principal-store lock rather than invent a lock. Correct registry lock-order documentation to match the only existing task publication caller; no production registry path waits on a Task lock. OAuth validation is synchronous inside the existing provider/store and rechecked immediately before each mutation; no await within transaction. Old direct tool contexts lacking the real request checker fail closed for new Task tools only.

Explicit MCP consume uses the existing manual pull channel and untrusted framing; it does not impersonate hook_session or agent_runtime_effect without an exact runtime control_ref. Existing hook receipt is retained. Acknowledge checks exact parent digest and same principal/Claim. No reply echo into the owner lane. Completed history retains frozen provenance and can be read structurally even after rotation; mutation never uses historical authority. Bound reads to 50 default/100 max, a finite directory scan, bytes and deadline. Partial coverage is explicit and never means no pending guidance. Missing malformed source fails closed. At 10x inbox volume scanning reaches a visible coverage limit, not unbounded IO or fabricated completeness.

## Files
- src/effects/fleet/task-inbox.ts: existing write/lock owner and bounded recovery projection.
- src/effects/engineers/task-inbox.ts (new): authenticated composition boundary across existing Engineer and Task authorities; existing generic inbox cannot own OAuth/Binding resolution.
- src/effects/engineers/principal-store.ts: expose existing store critical section.
- src/effects/repo-registry.ts: align lock-order documentation with verified callers.
- src/cli/mcp/{oauth,server,tools,engineer-tools}.ts and transports/http.ts: current-request verifier, restricted named tools, strict input declarations.
- tests/effects/task-reply.test.ts (new): meaningful filesystem/crash/revocation oracle distinct from pure protocol tests.
- existing tests/cli/mcp-engineer-tools.test.ts, mcp-http.test.ts, mcp-oauth.test.ts: tool inventory and real auth route coverage.
- docs/researches/20260922-task-reply-protocol.md, existing closed inventory evidence/doc wording, matching architecture projection, own workflow artifacts.

## Verification and limits
Use focused reply/effect/MCP tests and the required nine repository integrity commands plus type checks. Full local suite is not required. Isolated test HOME is mandatory. Freeze source commit, materialize architecture projection, commit projection, then prepare final verification and invoke one independent reviewer; do not review a subject whose projection can still advance. No half-chain, copied digest, ACK or hook receipt can stand in for real Host/H0/notification proof. Do not merge main or install runtime.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Implement original-ID durable reply and bounded recovery projection in the existing Task Inbox owner.
- [x] Compose exact live principal/Binding/Lease/WorkEnvelope/registry and current OAuth authority for restricted Engineer MCP operations.
- [x] Prove physical crash boundaries, exact retries, stale/revoked identity, ACK recovery, direction and bounded reads with focused tests.
- [ ] Freeze source/projection, run canonical verification, record independent acceptance and submit a stage PR.

## Dependency review corrections

AKN-04a cumulative review identified two defects owned by this communication slice. Preserve strict acquisition commit fencing in `src/effects/fleet/acquire.ts`; add a communication validator sharing current registry, canonical Task and exact Plan proof validation while allowing an unrelated canonical commit to advance. The original WorkEnvelope digest, ClaimActor and live Lease fences remain mandatory. Add an authenticated exact-parent recovery selector to the existing messages tool; read only its bounded immutable reply chain, require a persisted intent, and report coverage as exact-parent rather than claiming whole-inbox coverage. This restores known interrupted operations beyond list scan limits without a second index or unbounded traversal. Unknown-parent discovery remains explicitly incomplete at the list budget. Verify both barriers before and after correction in the existing effects suite. The original one-shot review remains spent; new owner acceptance must bind corrected evidence.
