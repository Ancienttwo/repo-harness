# Plan: AKN-04b: bounded historical Task activity GET

> **Status**: Executing
> **Created**: 20260922-0418
> **Slug**: akn04-activity
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: docs/researches/20260921-agent-first-kanban-implementation-roadmap.md
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Historical revision/provenance, read-only HTTP and bounded cancellation
> **Rollback Surface**: Revert new read entrypoints; preserve all Inbox and actor records
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-0418-akn04-activity.contract.md`
> **Task Review**: `tasks/reviews/20260922-0418-akn04-activity.review.md`
> **Implementation Notes**: `tasks/notes/20260922-0418-akn04-activity.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: docs/researches/20260921-agent-first-kanban-implementation-roadmap.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260922-0418-akn04-activity.md`
- Sprint contract: `tasks/contracts/20260922-0418-akn04-activity.contract.md`
- Sprint review: `tasks/reviews/20260922-0418-akn04-activity.review.md`
- Implementation notes: `tasks/notes/20260922-0418-akn04-activity.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-0418-akn04-activity.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-0418-akn04-activity.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-0418-akn04-activity.md`.

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
- Contract file: `tasks/contracts/20260922-0418-akn04-activity.contract.md`
- Review file: `tasks/reviews/20260922-0418-akn04-activity.review.md`
- Implementation notes file: `tasks/notes/20260922-0418-akn04-activity.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-0418-akn04-activity.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-0418-akn04-activity.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert new read entrypoints; preserve all Inbox and actor records
- **Verification boundary**: Historical revision/provenance, read-only HTTP and bounded cancellation
- **Review/acceptance boundary**: `tasks/reviews/20260922-0418-akn04-activity.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-0418-akn04-activity.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-0418-akn04-activity.contract.md`, `tasks/reviews/20260922-0418-akn04-activity.review.md`, and `tasks/notes/20260922-0418-akn04-activity.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-0418-akn04-activity.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert new read entrypoints; preserve all Inbox and actor records

## Captured Planning Output

## AKN-04b historical activity

Approved whole-roadmap implementation, section 8.2/8.3. Independent read-only activity API and browser transport, based on AKN-04a da2cc640. Acceptance of prior stages remains separate. No provider, runtime install, main merge, controller execution, browser write or new persistent event authority.

P1: Task Inbox owns event/receipt/reply bytes; ClaimActor store owns immutable actor receipts; registry owns repository paths. Operator server owns loopback Host/Origin/method guards, workers, timeouts and cancellation. TaskDiff's active Task/Lease fence is unsuitable for old revision history.
P2: GET /api/v1/fleet/tasks/:repository_id/:task_id/activity -> registry re-resolution -> bounded immutable event and mutable receipt reads -> original reply-chain oracle and stored ClaimActor match -> allowlisted DTO -> worker message validation -> browser transport decode. Exact message_id bypasses directory-wide discovery and works without active sprint, Lease, Claim or Binding. Browser never supplies local paths, git refs or execution authority.
P3: Use existing stores and pure reply oracle. Introduce protocol 1 operator_task_activity as an independent response; Fleet 5/Operator 6 snapshots do not change. History read is observational, not a cross-store atomic snapshot or a current authorization claim. Replies expose original recorded actor only when their chain and stored ClaimActor match. Missing provenance stays explicit. Do not expose raw intent, WorkEnvelope, principal mapping, local paths or tokens. Event bodies are opaque untrusted text. A complete reply proves the recorded chain, not adoption or runtime success.

Request: repository_id/task_id from path; optional limit integer 1..100 (default50), after UUID cursor; optional exact message_id UUID excludes limit/after. Closed query names reject duplicates and invalid values. Response echoes normalized selector, protocol/kind, observed_at, entries and explicit scope/coverage. Pages order by message UUID; after is exclusive. Directory scan budget1000, total read2MiB, elapsed250ms after registry/identity resolution, serialized response1MiB, individual record64KiB. A hard discovery limit is partial and has no misleading next cursor; exact known-message reads remain available. At10x history discovery reaches the explicit ceiling, while exact recovery avoids unrelated events. Missing exact message/task history is history_unavailable; malformed store is unavailable, never empty. No new polling/watch/index/journal.

Entries project original event identities/revision/sender/audience/body/digests plus per-recipient original receipts, reply state and immutable actor identity where proven. For a reply event resolve its parent and exact matching reply chain. A chain without matching stored actor is unverified. Old actors are not checked against current Binding/Lease. Shared budgets include nested receipt/chain scans. Reads do not create directories or locks, deliver, ACK, notify or mutate Lease. Worker/HTTP reports busy/timeout/unavailable/history_unavailable without internal error paths.

Server reuses global loopback guards. Activity workers have bounded admission and cancellation; hold their admission slot until worker exit after timeout/disconnect, abort injected readers and hold their slot until settlement. Browser fetch uses no-store, AbortSignal and exact response identity validation. Same-scope refresh scheduling and UI presentation are later AKN-05/06, not a hidden dependency of the usable GET.

Production paths (more than8 files including tests): src/core/operator/task-activity.ts (new browser-safe DTO/decoder), src/effects/fleet/task-inbox.ts (bounded history read using existing parsers), src/effects/engineers/claim-actor-store.ts (bounded historical receipt read), src/effects/operator/task-activity.ts (new registry/allowlist effect), src/effects/operator/task-activity-worker.ts (new isolation adapter), src/effects/operator/server.ts (GET/inventory/cancel), src/operator-web/task-activity.ts (new fetch/decode transport), tests/effects/operator-task-activity.test.ts (new historical/bounds/provenance oracle), tests/cli/operator-serve.test.ts (existing route/cancel/identity), tests/unit/operator-web-types.test.ts (existing decoder oracle), tests/unit/collaboration-authority-baseline.test.ts (consumer inventory if required), docs/researches/20260922-operator-task-activity.md and projection manifest. New files protect independent wire, runtime isolation and registry boundary; no new service or dependency.

Verification: new historical effects test; existing TaskReply effects, inbox effects, ClaimActor/Engineer principal suites identified from package tests; existing operator server and write-boundary inventory tests; existing browser types; typecheck and browser transport compile; all9 required integrity checks. Cover historical exact read after revision/Lease/Binding rotation; completed and interrupted replies, missing/forged actor, read-only registry, A/B identity mismatch, missing history vs empty, no read mutations, unsafe/symlink/mismatched paths, nested scan/byte/output limits, exact read beyond directory bound, paging and invalid selectors, HTTP method/Host/Origin/query refusal, disconnect/timeout/worker exit slot release, strict browser decoder. Use isolated test HOME. Freeze source/projection before canonical acceptance and one independent review. No full suite unless a gate requires it.

Rollback: revert GET/transport/readers; existing event/receipt/intent/commit/actor bytes are untouched. No data migration, external accounts or credentials.

## Task Breakdown
- [x] Freeze historical activity DTO and protected storage reader.
- [x] Wire registry effect, bounded worker route and browser transport.
- [x] Verify history, provenance, bounds, cancellation and read-only behavior; document semantics.
- [ ] Freeze architecture proof, canonical verification, independent acceptance and stage PR.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Upstream acceptance integration

Pin the refreshed #438 branch after its integration acceptance. Preserve the historical GET and browser transport scope; propagate accepted #437 publication fences and its single core 64 KiB total-record contract into the shared historical reader. Merge upstream workflow archives, regenerate the architecture manifest and rebind verification to the combined source before this package's single independent review. Source inspection shows the historical ClaimActor reader still references the retired local reply-size constant; update that consumer to the canonical exported limit in this slice. No new storage or authorization authority is introduced.
