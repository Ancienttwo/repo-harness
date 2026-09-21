# Plan: AKN-04d1: repository snapshot and shared collector admission

> **Status**: Executing
> **Created**: 20260922-0519
> **Slug**: akn04-repository-snapshot
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: docs/researches/20260921-agent-first-kanban-implementation-roadmap.md
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Repository scope and process exit-held global provider limit
> **Rollback Surface**: Remove scoped reads without changing durable authority
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-0519-akn04-repository-snapshot.contract.md`
> **Task Review**: `tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md`
> **Implementation Notes**: `tasks/notes/20260922-0519-akn04-repository-snapshot.notes.md`

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

- Active plan: `plans/plan-20260922-0519-akn04-repository-snapshot.md`
- Sprint contract: `tasks/contracts/20260922-0519-akn04-repository-snapshot.contract.md`
- Sprint review: `tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md`
- Implementation notes: `tasks/notes/20260922-0519-akn04-repository-snapshot.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-0519-akn04-repository-snapshot.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-0519-akn04-repository-snapshot.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-0519-akn04-repository-snapshot.md`.

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
- Contract file: `tasks/contracts/20260922-0519-akn04-repository-snapshot.contract.md`
- Review file: `tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md`
- Implementation notes file: `tasks/notes/20260922-0519-akn04-repository-snapshot.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-0519-akn04-repository-snapshot.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-0519-akn04-repository-snapshot.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Remove scoped reads without changing durable authority
- **Verification boundary**: Repository scope and process exit-held global provider limit
- **Review/acceptance boundary**: `tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-0519-akn04-repository-snapshot.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-0519-akn04-repository-snapshot.contract.md`, `tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md`, and `tasks/notes/20260922-0519-akn04-repository-snapshot.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Remove scoped reads without changing durable authority

## Captured Planning Output

## Goal
Implement AKN-04d1 repository-scoped snapshot collection and shared exit-held admission for Fleet observations. The approved roadmap AKN-04d2 will independently add automation summary from original authorities; this slice makes no automation or native-execution claim.

## Design
P1: Fleet collector owns strict registry and per-repository Board/provider observations; core Operator projection owns public DTO redaction; server owns process-group/Windows Job cancellation. Existing browser Fleet decoder owns nested shape validation. Reuse these boundaries without a second authority.
P2: GET repository ID -> shared scope observation -> strict registry -> select before collecting -> existing Fleet5 -> Operator6 projection -> repository envelope -> strict browser decoder. Global and repository requests share one active collector and bounded FIFO, same-scope subscribers share one observation. Cancel or timeout retires a scope immediately for new subscribers, but capacity releases only when the existing collector promise settles after process-group/Job cleanup. Pending scopes time out from initial admission, not process start. Server shutdown cancels all and awaits actual settlement.
P3: Exactly one provider-capable collection runs at once, using existing max_concurrency inside that round; this proves the global provider cap. Queue capacity=max_concurrency*2. At10x request volume a new distinct scope receives typed busy, never unbounded processes. Slow cleanup keeps its slot; queued requests can time out. No cache, watcher, retry, provider mutation, new dependency/configuration/credential. Observation is not write authority. Rollback removes endpoint and restores shared collector implementation without data migration.

Public GET /api/v1/fleet/repositories/:repository_id/snapshot has no query parameters. Response protocol1 kind operator_repository_snapshot with repository_id, service_epoch UUID, generation positive safe integer and snapshot Operator6 containing exactly requested repository. Global endpoint remains Operator6; no legacy/dual read. One server epoch per server lifetime; generation bound to collection admission and nested snapshot sequence. Empty/unknown registered ID yields typed 404 fleet_repository_not_found; malformed registry remains fatal. Missing/unreadable selected repo retains existing Fleet error observation. Read-only registration allowed. No arbitrary filesystem paths.

Internal collector start IPC requires protocol1 and explicit scope {kind:fleet}|{kind:repository,repository_id}. All owners and fixtures change in the same package; no old payload fallback. Existing inert-start and Windows Job ownership remain. Scope is validated at IPC and collector selection. Server independently verifies exactly one matching repository before public projection. Injected readers obey identical hold-until-settlement admission. Provider-free activity/context/collaboration paths remain separate.

Minimal alternative filtering global snapshots is rejected because it observes unrelated repositories/providers and cannot bound amplification. The single active collector is sufficient and intentionally trades cross-scope latency for a provable global bound. Automation summary remains a separate independently verified roadmap increment, not fabricated nulls in this protocol.

## Files and Verification
More than8 paths: src/core/operator/repository-snapshot.ts; src/effects/operator/server.ts and fleet-collector-process.ts; src/effects/fleet/board.ts; src/operator-web/repository-snapshot.ts; existing tests/cli/operator-serve.test.ts, tests/effects/fleet-collector-process.test.ts, tests/effects/fleet-board.test.ts, tests/unit/operator-web-types.test.ts and tests/effects/operator-write-boundary.test.ts; durable research and own workflow files. No new suite unless no owning test exists.
Check selected-only collector calls, invalid/missing identity, malformed registry, healthy A with unreadable B, same-scope coalescing, distinct-scope FIFO/global provider cap, cancellation overlap before/after settlement, queued timeout/overflow, shutdown waiting, fresh epoch across restart, strict browser identity/generation/no-store/AbortSignal, route Host/Origin/method/query guards and existing IPC lifecycle. Capture pre-fix cancellation-overlap regression before production edit. Run owning suites, type, browser bundle and all9 integrity checks under unique contract Verification Plan. Architecture index remains user-scoped and not granted for this new worktree; no independent acceptance or PR completion until canonical gates.

## Task Breakdown
- [x] Implement selected repository collection and versioned internal IPC.
- [x] Implement shared exit-held observation admission and scoped HTTP/browser envelope.
- [x] Verify concurrency, identity and no-write behavior; document original authority boundary.
- [ ] Freeze architecture/canonical evidence, obtain one semantic acceptance and submit stage PR.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

