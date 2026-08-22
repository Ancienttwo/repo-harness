# Plan: Publication Recovery and Integration Reconcile

> **Status**: Executing
> **Created**: 20260822-1915
> **Slug**: publication-recovery-reconcile
> **Planning Source**: codex-plan
> **Orchestration Kind**: user-approved-plan
> **Source Ref**: prd:fleet-acquire-publication-readiness#module-3
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Provider fetch/OID fencing, canonical completion proof, exact lease clearance, recovery convergence, full repository checks, and independent AcceptanceReceipt.
> **Rollback Surface**: Revert WP0-C as one unit; WP0-A receipts and WP0-B reviewing leases remain intact and actionable.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260822-1915-publication-recovery-reconcile.contract.md`
> **Task Review**: `tasks/reviews/20260822-1915-publication-recovery-reconcile.review.md`
> **Implementation Notes**: `tasks/notes/20260822-1915-publication-recovery-reconcile.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: prd:fleet-acquire-publication-readiness#module-3
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260822-1915-publication-recovery-reconcile.md`
- Sprint contract: `tasks/contracts/20260822-1915-publication-recovery-reconcile.contract.md`
- Sprint review: `tasks/reviews/20260822-1915-publication-recovery-reconcile.review.md`
- Implementation notes: `tasks/notes/20260822-1915-publication-recovery-reconcile.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260822-1915-publication-recovery-reconcile.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260822-1915-publication-recovery-reconcile.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260822-1915-publication-recovery-reconcile.md`.

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
- Contract file: `tasks/contracts/20260822-1915-publication-recovery-reconcile.contract.md`
- Review file: `tasks/reviews/20260822-1915-publication-recovery-reconcile.review.md`
- Implementation notes file: `tasks/notes/20260822-1915-publication-recovery-reconcile.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260822-1915-publication-recovery-reconcile.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260822-1915-publication-recovery-reconcile.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert WP0-C as one unit; WP0-A receipts and WP0-B reviewing leases remain intact and actionable.
- **Verification boundary**: Provider fetch/OID fencing, canonical completion proof, exact lease clearance, recovery convergence, full repository checks, and independent AcceptanceReceipt.
- **Review/acceptance boundary**: `tasks/reviews/20260822-1915-publication-recovery-reconcile.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260822-1915-publication-recovery-reconcile.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260822-1915-publication-recovery-reconcile.contract.md`, `tasks/reviews/20260822-1915-publication-recovery-reconcile.review.md`, and `tasks/notes/20260822-1915-publication-recovery-reconcile.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260822-1915-publication-recovery-reconcile.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert WP0-C as one unit; WP0-A receipts and WP0-B reviewing leases remain intact and actionable.

## Captured Planning Output

## Goal and success criteria

Implement PRD v3 WP0-C as one recovery and provider-driven integration-closeout boundary. `publication recover` must inspect incomplete `completing` publications and either resume the existing deterministic push/PR/receipt/marker path or perform an explicit fenced abort. `publication reconcile` must fetch the provider target into a collision-resistant isolated observation ref, prove the canonical sprint row is `[x]` at the fetched commit, revalidate receipt/current pointer/claim/generation under the task lock, remove only the exact `reviewing` lease, and persist immutable integration evidence.

Success means:

- No reconcile path calls or delegates to `sprint reconcile`, assumes the local target is current, or uses a caller-supplied ref as provider truth.
- Observation fetch writes only the isolated observation namespace, resolves a fetched commit OID, and reports that exact OID on canonical-row refusal.
- Integration classification reuses the existing `worktree_merge_mode` semantics and records only `merged | ancestor | absorbed`; `provider_state=open` plus `absorbed` is a successful integrated/superseded outcome.
- Lease clearance happens only after provider/receipt/pointer/task/claim/generation/head and fetched canonical `[x]` proof are revalidated inside the task lock. A stale or unknown lease is never removed.
- Closed-unmerged publications remain reviewing and route to `publication abandon` or provider reopen; legacy unattributable records remain non-mutating and require explicit operator resolution.
- Recovery retries deterministic receipt/marker/ship evidence idempotently, while abort is explicit and refuses once an external effect or review authority makes rollback unsafe.

## Scope

- Pure recovery/reconcile result types, integration-state validation, and typed error vocabulary.
- Provider and git effects for PR observation, isolated fetch, fetched-OID canonical parsing, and existing merge-mode classification.
- Task-locked exact-owner lease clearance plus immutable integration evidence beside the publication store.
- Publication CLI surfaces for recover inspect/reconcile/abort and integration reconcile, with JSON output.
- Board/action projection only where required to expose the new recovery/reconcile verbs.
- Focused unit/integration/concurrency tests and full repository verification.

## Out of scope

- WP1 readiness, WP2 fleet acquire/MCP mirror, provider feedback, Task Inbox, daemon polling, auto-merge, remote claim refs, session liveness, or provider-side PR closing.
- Silent marker synthesis, markerless PR adoption, heuristic legacy attribution, local-target freshness assumptions, or changes to `COORDINATION_PROTOCOL`/task digest preimages.
- Reimplementing canonical sprint parsing or `worktree_merge_mode`.

## P1 architecture map

- `src/core/publication/` owns immutable recovery/reconcile contracts and pure integration projections.
- `src/effects/publication/` owns `gh`, git fetch/observation refs, receipt/marker/journal reconstruction, task-lock revalidation, integration evidence persistence, and exact lease removal.
- `src/cli/commands/publication.ts` owns operator/public JSON commands; `src/cli/commands/sprint.ts` remains deliberately separate and must reject reviewing.
- `src/effects/state/coordination-lease-store.ts` remains the sole durable lease/lock boundary; canonical sprint parsing is reused from the existing coordination path.
- Existing merge classification in the worktree merge helper is authoritative; the new path may adapt its result but may not create a second ancestry/absorption algorithm.

## P2 concrete traces

1. Integration reconcile: exact publication/claim/generation input -> live provider PR observation -> fetch provider base/target to an isolated observation ref -> resolve fetched commit OID -> parse sprint row at that OID and require `[x]` -> classify head integration against fetched target through existing merge mode -> task lock -> reread reviewing lease and receipt/pointer -> repeat every mutation-relevant fence -> append immutable integration evidence -> publish released/remove exact lease.
2. Open absorbed: provider PR remains OPEN but head tree is absorbed by fetched target -> record `absorbed`, clear exact reviewing lease, return `superseded_attention`; never demand a second merge or close the PR automatically.
3. Closed unmerged: live PR CLOSED with no merge/ancestry/absorption proof -> typed `closed_unmerged`, retain reviewing lease and point to abandon/reopen.
4. Recovery: incomplete completing lease plus durable ship journal/create intent -> inspect classification -> explicit reconcile replays only missing deterministic external steps and converges on the same publication id -> review entry; explicit abort is allowed only while the existing closeout journal proves no external effect landed.

## P3 decision rationale

- Provider truth is an observation, not a ref name: isolate every fetch and bind all later proof to the returned OID.
- `current_publication` remains the sole current authority; integration evidence is immutable audit and never authorizes a mutation by itself.
- Keep recovery orchestration adjacent to existing receipt/lifecycle effects so it can reuse marker, journal, provider, and lock proofs without a second parser or compatibility path.
- At 10x scale the first pressure is serial `gh`/fetch latency and observation-ref cleanup, not task locks; keep on-demand commands and bounded isolated refs rather than adding a daemon/cache authority.

## Failure and rollback

- Any provider, fetch, canonical-row, merge-mode, receipt, pointer, claim, generation, or head mismatch returns a typed non-zero refusal and leaves the lease byte-identical.
- Integration evidence must be durably written before lease removal and retries must prove byte equality.
- Roll back WP0-C as one unit; existing WP0-A receipts and WP0-B reviewing leases remain readable and operator-actionable.

## Task Breakdown

- [x] Add strict recovery/reconcile contracts, observation identity, integration-state and typed refusal vocabulary.
- [x] Implement isolated provider-target fetch, fetched-OID canonical `[x]` proof, existing merge-mode reuse, and immutable integration evidence.
- [x] Implement task-locked exact-pointer/claim/generation/head reconcile and safe recovery inspect/reconcile/abort flows.
- [x] Wire publication CLI JSON commands and any required board actions without changing sprint reconcile semantics.
- [x] Add negative fencing, open-absorbed, closed-unmerged, stale observation, crash retry, idempotency, and concurrency tests.
- [ ] Run focused tests, root required checks, Change Assessment, independent review, and AcceptanceReceipt finalization.

## Verification

- Focused publication recovery/reconcile unit and CLI tests created by this package.
- Existing publication receipt/lifecycle, coordination lease, sprint concurrency, board, closeout journal, and helper mirror tests.
- `bun run check:type` and `bun test --timeout 60000`.
- Root required checks from `AGENTS.md`, followed by independent gatekeeper review and exact-subject AcceptanceReceipt.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add strict recovery/reconcile contracts, observation identity, integration-state and typed refusal vocabulary.
- [x] Implement isolated provider-target fetch, fetched-OID canonical `[x]` proof, existing merge-mode reuse, and immutable integration evidence.
- [x] Implement task-locked exact-pointer/claim/generation/head reconcile and safe recovery inspect/reconcile/abort flows.
- [x] Wire publication CLI JSON commands and any required board actions without changing sprint reconcile semantics.
- [x] Add negative fencing, open-absorbed, closed-unmerged, stale observation, crash retry, idempotency, and concurrency tests.
- [ ] Run focused tests, root required checks, Change Assessment, independent review, and AcceptanceReceipt finalization.
