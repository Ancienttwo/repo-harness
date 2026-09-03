# Plan: Refactor provider contract and exact 0.5.2 handshake

> **Status**: Executing
> **Created**: 20260904-0525
> **Slug**: refactor-provider-contract
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: plans/prds/20260903-0435-archctx-backed-refactor-mode.prd.md#module-3
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: exact packaged provider handshake plus focused and full repository gates
> **Rollback Surface**: archctx package pins, refactor provider contract, and adapter boundary
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260904-0525-refactor-provider-contract.contract.md`
> **Task Review**: `tasks/reviews/20260904-0525-refactor-provider-contract.review.md`
> **Implementation Notes**: `tasks/notes/20260904-0525-refactor-provider-contract.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: plans/prds/20260903-0435-archctx-backed-refactor-mode.prd.md#module-3
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260904-0525-refactor-provider-contract.md`
- Sprint contract: `tasks/contracts/20260904-0525-refactor-provider-contract.contract.md`
- Sprint review: `tasks/reviews/20260904-0525-refactor-provider-contract.review.md`
- Implementation notes: `tasks/notes/20260904-0525-refactor-provider-contract.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260904-0525-refactor-provider-contract.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260904-0525-refactor-provider-contract.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260904-0525-refactor-provider-contract.md`.

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
- Contract file: `tasks/contracts/20260904-0525-refactor-provider-contract.contract.md`
- Review file: `tasks/reviews/20260904-0525-refactor-provider-contract.review.md`
- Implementation notes file: `tasks/notes/20260904-0525-refactor-provider-contract.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260904-0525-refactor-provider-contract.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260904-0525-refactor-provider-contract.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: archctx package pins, refactor provider contract, and adapter boundary
- **Verification boundary**: exact packaged provider handshake plus focused and full repository gates
- **Review/acceptance boundary**: `tasks/reviews/20260904-0525-refactor-provider-contract.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260904-0525-refactor-provider-contract.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260904-0525-refactor-provider-contract.contract.md`, `tasks/reviews/20260904-0525-refactor-provider-contract.review.md`, and `tasks/notes/20260904-0525-refactor-provider-contract.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260904-0525-refactor-provider-contract.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: archctx package pins, refactor provider contract, and adapter boundary

## Captured Planning Output

## Objective

Consume the released `archctx@0.5.2` / `archctx-contracts@0.5.2` refactor protocol as the sole provider authority for Refactor Mode Module 3. Replace the stale 0.4.7 pin, add a refactor-specific contract/adapter boundary, and prove exact version, feature, runtime, request, result, and worktree identity checks fail closed.

## P1 · Architecture Map

- Authority: `archctx-contracts@0.5.2` owns refactor request/result schemas and invariant validators; the package-local `archctx@0.5.2` CLI owns measurement and classification.
- Existing reusable boundary: `src/effects/architecture/archctx-provider.ts` owns package-local resolution, compatible Node selection, bounded process execution, and capabilities readback.
- New boundary: `src/core/refactor/provider-contract.ts` owns repo-harness ingress/result assertions only; `src/effects/refactor/archctx-provider.ts` owns scan/record/verify CLI calls.
- Configuration: `policy.refactor` supplies stage-specific exact versions/features and remains `mode=off`; architecture projection keeps using the same exact package release.
- Out of scope: proposal authoring, program state machine, routing, materialization, architecture intervention, board, and automatic mutation.

## P2 · Concrete Trace

`runRefactorScan(request, repoRoot)` validates `RefactorRequestV1`, reads fail-closed refactor policy, resolves package-local `archctx@0.5.2`, runs `capabilities --json` under a compatible Node with the existing timeout budget, asserts the scan feature subset and exact version, invokes `refactor scan --request-json <canonical request> --json`, validates the returned envelope plus snapshot/assessment/proposal invariants, and rejects stale repository/worktree identity before returning data. Record and verify use the same handshake and process boundary, with verify requiring the resolution feature.

## P3 · Decision

Port the proven architecture provider mechanics through exported shared helpers instead of copying them. Keep refactor request semantics and result validation in a distinct module because projection and refactor have different protocols. Pin both stages to 0.5.2: public 0.5.1 is broken and upstream explicitly says not to install it; stage separation remains feature-based so scan and verify policy can evolve independently without a flat compatibility list.

## Task Breakdown

- [x] Update the exact ArchContext packages and policy/template/readback surfaces to 0.5.2.
- [x] Add refactor contract constants, stage policy validation, request/result assertions, and closed local provider error classes.
- [x] Add scan/record/verify adapters that reuse package resolution, Node runtime, timeout, capabilities, and JSON process mechanics.
- [x] Add focused tests for success, 0.4.x/wrong-feature/wrong-version rejection, malformed envelopes, stale head/worktree, and verify-stage gating.
- [x] Reconcile PRD/research assumptions with the authoritative 0.5.2 release readback.
- [x] Run focused tests, typecheck, init dry-run, and the repository required checks.

## Verification

```bash
bun test tests/unit/refactor-provider-contract.test.ts tests/refactor-archctx-provider.test.ts tests/architecture-projection-provider.test.ts --timeout 60000
bun run check:type
bun test --timeout 60000
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

## Risks and Rollback

- The exact 0.5.2 bump also advances the existing architecture projection provider; its provider suite and init dry-run are mandatory regression gates.
- The first 10x pressure point is provider process startup per call. This slice preserves bounded synchronous calls and adds no cache; later program orchestration owns call-count budgets.
- Rollback is one branch/PR reverting the package pin and the additive `src/{core,effects}/refactor` boundary.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Update the exact ArchContext packages and policy/template/readback surfaces to 0.5.2.
- [x] Add refactor contract constants, stage policy validation, request/result assertions, and closed local provider error classes.
- [x] Add scan/record/verify adapters that reuse package resolution, Node runtime, timeout, capabilities, and JSON process mechanics.
- [x] Add focused tests for success, 0.4.x/wrong-feature/wrong-version rejection, malformed envelopes, stale head/worktree, and verify-stage gating.
- [x] Reconcile PRD/research assumptions with the authoritative 0.5.2 release readback.
- [x] Run focused tests, typecheck, init dry-run, and the repository required checks.
