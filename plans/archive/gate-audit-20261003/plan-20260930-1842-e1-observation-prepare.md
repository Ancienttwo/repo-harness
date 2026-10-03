# Plan: E1 S1 trusted observation prepare

> **Status**: Executing
> **Created**: 20260930-1842
> **Slug**: e1-observation-prepare
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Immutable observation integrity, trusted 30s clock and unchanged admission regression
> **Rollback Surface**: Before execution remove `plans/plan-20260930-1842-e1-observation-prepare.md`; after execution revert branch `codex/e1-observation-prepare` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260930-1842-e1-observation-prepare.contract.md`
> **Task Review**: `tasks/reviews/20260930-1842-e1-observation-prepare.review.md`
> **Implementation Notes**: `tasks/notes/20260930-1842-e1-observation-prepare.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260930-1842-e1-observation-prepare.md`
- Sprint contract: `tasks/contracts/20260930-1842-e1-observation-prepare.contract.md`
- Sprint review: `tasks/reviews/20260930-1842-e1-observation-prepare.review.md`
- Implementation notes: `tasks/notes/20260930-1842-e1-observation-prepare.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260930-1842-e1-observation-prepare.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260930-1842-e1-observation-prepare.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260930-1842-e1-observation-prepare.md`.

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
- Contract file: `tasks/contracts/20260930-1842-e1-observation-prepare.contract.md`
- Review file: `tasks/reviews/20260930-1842-e1-observation-prepare.review.md`
- Implementation notes file: `tasks/notes/20260930-1842-e1-observation-prepare.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260930-1842-e1-observation-prepare.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260930-1842-e1-observation-prepare.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260930-1842-e1-observation-prepare.md`; after execution revert branch `codex/e1-observation-prepare` or the explicitly reviewed diff.
- **Verification boundary**: Immutable observation integrity, trusted 30s clock and unchanged admission regression
- **Review/acceptance boundary**: `tasks/reviews/20260930-1842-e1-observation-prepare.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260930-1842-e1-observation-prepare.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260930-1842-e1-observation-prepare.contract.md`, `tasks/reviews/20260930-1842-e1-observation-prepare.review.md`, and `tasks/notes/20260930-1842-e1-observation-prepare.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260930-1842-e1-observation-prepare.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260930-1842-e1-observation-prepare.md`; after execution revert branch `codex/e1-observation-prepare` or the explicitly reviewed diff.

## Captured Planning Output

## Why
First null-attempt offers hash eligible_since=observed_at. A separate host read must preserve a server-trusted observation instant without changing admission or allowing arbitrary client time.

## Goal
Add explicit engineer prepare and engineer_prepare MCP surfaces returning immutable content-addressed observation evidence, with an exact reader rejecting foreign, tampered, future, expired and unsafe-path records.

> **Task Profile**: code-change

## P1 Architecture Map
Existing collector owns current offers; principal resolver owns authenticated Binding; Git common directory owns repository-local evidence; durable evidence primitives own fsync; unchanged scheduled admission owns assertions/claims. No admission wiring or receipt-ledger upgrade in S1.

## P2 Concrete Trace
CLI/MCP verified authorization -> resolveEngineerPrincipal -> prepareEngineerObservation -> one server Date.now -> collectEngineerOffers(now_ms) -> canonical snapshot and policy bytes -> immutable record -> opaque content ref -> readEngineerObservation(current principal, trusted current clock) -> exact integrity/scope/freshness validation. No claim mutation.

## P3 Decision
Reuse canonicalEngineerJson/engineerSha256, Git common directory, existing exclusive directory lock and durable create/fsync primitives. Add narrow producer/reader to scheduling-acquire-next.ts. Receipt validity is admission-start only (30,000ms, exact expiry rejected), not mutation-time TTL. No GC, fallback reader, dependency or token service. Existing pure offers and acquire/acquire_next function bodies remain byte-identical.

## Scope
Only scheduling-acquire-next.ts additions, engineer CLI/MCP prepare registration, existing issue-280/me1a/issue-287 and CLI test extensions plus this package plan/contract/review/notes. Design authority: PR #466, E1 缺口闭合设计 S1; S0 PR #467 remains separate and unchanged.

## Stop Conditions
Stop on workflow refusal, required production admission changes, unknown authority requiring invented fallback, or any requirement to edit primary/S0 checkout. No S2, merge, finish, request review or cleanup.

## Task Breakdown
- [x] Add immutable observation producer/reader and explicit prepare surfaces without changing old function bodies.
- [x] Extend existing fixtures with null-attempt trusted-time proof, foreign/tamper/future/expiry/clock rollback and transport negatives; execute unchanged S0 characterization from isolated temporary overlay.
- [ ] Execute contract Verification Plan and repository-integrity gates, commit exact allowed paths, push and open Draft PR to main.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add immutable observation producer/reader and explicit prepare surfaces without changing old function bodies.
- [x] Extend existing fixtures with null-attempt trusted-time proof, foreign/tamper/future/expiry/clock rollback and transport negatives; execute unchanged S0 characterization from isolated temporary overlay.
- [ ] Execute contract Verification Plan and repository-integrity gates, commit exact allowed paths, push and open Draft PR to main.
