> **Archived**: 2026-09-05 03:14
> **Related Plan**: plans/archive/plan-20260902-2101-issue-284-dependency-authority.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-0314
> **Archive Projection V1**: `plans/plan-20260902-2101-issue-284-dependency-authority.md` => `plans/archive/plan-20260902-2101-issue-284-dependency-authority.md`
> **Archive Projection V1**: `tasks/notes/20260902-2101-issue-284-dependency-authority.notes.md` => `tasks/archive/notes-20260905-0314-issue-284-dependency-authority.md`
> **Archive Projection V1**: `tasks/contracts/20260902-2101-issue-284-dependency-authority.contract.md` => `tasks/archive/contract-20260905-0314-issue-284-dependency-authority.md`
> **Archive Projection V1**: `tasks/reviews/20260902-2101-issue-284-dependency-authority.review.md` => `tasks/archive/review-20260905-0314-issue-284-dependency-authority.md`

# Plan: Resolve all declared dependency states from receipt authorities

> **Status**: Archived
> **Created**: 20260902-2101
> **Slug**: issue-284-dependency-authority
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: github:Ancienttwo/repo-harness#284
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0314-issue-284-dependency-authority.md --strict`.
> **Rollback Surface**: Before execution remove `plans/archive/plan-20260902-2101-issue-284-dependency-authority.md`; after execution revert branch `codex/issue-284-dependency-authority` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-0314-issue-284-dependency-authority.md`
> **Task Review**: `tasks/archive/review-20260905-0314-issue-284-dependency-authority.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-0314-issue-284-dependency-authority.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: github:Ancienttwo/repo-harness#284
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260902-2101-issue-284-dependency-authority.md`
- Sprint contract: `tasks/archive/contract-20260905-0314-issue-284-dependency-authority.md`
- Sprint review: `tasks/archive/review-20260905-0314-issue-284-dependency-authority.md`
- Implementation notes: `tasks/archive/notes-20260905-0314-issue-284-dependency-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-0314-issue-284-dependency-authority.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260902-2101-issue-284-dependency-authority.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260902-2101-issue-284-dependency-authority.md`.

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
- Contract file: `tasks/archive/contract-20260905-0314-issue-284-dependency-authority.md`
- Review file: `tasks/archive/review-20260905-0314-issue-284-dependency-authority.md`
- Implementation notes file: `tasks/archive/notes-20260905-0314-issue-284-dependency-authority.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0314-issue-284-dependency-authority.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260902-2101-issue-284-dependency-authority.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/archive/plan-20260902-2101-issue-284-dependency-authority.md`; after execution revert branch `codex/issue-284-dependency-authority` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0314-issue-284-dependency-authority.md --strict`.
- **Review/acceptance boundary**: `tasks/archive/review-20260905-0314-issue-284-dependency-authority.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260902-2101-issue-284-dependency-authority.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-0314-issue-284-dependency-authority.md`, `tasks/archive/review-20260905-0314-issue-284-dependency-authority.md`, and `tasks/archive/notes-20260905-0314-issue-284-dependency-authority.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-0314-issue-284-dependency-authority.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/archive/plan-20260902-2101-issue-284-dependency-authority.md`; after execution revert branch `codex/issue-284-dependency-authority` or the explicitly reviewed diff.

## Captured Planning Output

## Goal and success criteria
Resolve GitHub issue #284: implement one closed, read-only dependency-authority resolver that resolves every `WorkPackageDependencyState` (`canonical_done`, `module_accepted`, `publication_integrated`, `product_accepted`) from its existing receipt authority instead of returning `authority_unavailable` for everything except `canonical_done`. Success: positive, negative, unavailable and stale-evidence fixtures for all four states, exhaustive enum handling enforced by typecheck/tests, correct `dependency_not_ready` vs `dependency_authority_unavailable` board exclusions, offer revalidation after dependency changes, and full required checks passing.

## Scope
- New boundary `src/effects/engineers/dependency-authority.ts` exposing one exhaustive function returning `{ status: 'satisfied' | 'unsatisfied' | 'authority_unavailable'; authority_revision: string | null; evidence_refs: readonly TypedEvidenceRef[] }`; wire it as the default dependency authority in `src/effects/engineers/scheduling.ts` replacing `defaultDependencyAuthority`'s partial implementation.
- `canonical_done`: keep the current canonical Sprint-row status proof.
- `module_accepted`: resolve the target Work Package's declared module acceptance policy; read the exact current AcceptanceReceipt from its owning authority; verify repository, Work Package/Task, contract/goal, normalized subject, reviewed paths, target revision and allowed disposition; reject stale/superseded receipt/subject combinations.
- `publication_integrated`: read the target task's current reviewing Lease/publication pointer and immutable PublicationReceipt/state via existing publication APIs; verify identity, head/base, verification evidence and integration state; no inference from merge commits, branch ancestry alone or PR titles.
- `product_accepted`: read the ME-4C exact product-acceptance authority for the combined candidate and approved requirement; verify the target Work Package/publication is an exact selected input and the receipt is current; never reuse a module AcceptanceReceipt as product acceptance.
- `authority_revision` computed from the canonical validated evidence projection; readable negative → `unsatisfied`; missing/unreadable/unauthorized/unsupported → `authority_unavailable`.
- Cross-repository: resolve only through the current adopted read-write/read-authorized registry snapshot; bind repository identity and canonical target revision; registry/target/evidence movement changes `authority_revision` and stales the offer; never open arbitrary repository paths from Work Graph text.
- Schema: if `required_acceptance` entries cannot select one exact module/product authority, extend the dependency edge with a closed, revision-bound policy reference validated at the same canonical commit as the Work Graph. Record the decision in notes.
- Update engineer board exclusion reasons and architecture/spec docs.

## Non-scope
- No second acceptance/publication/product-verdict authority; no prose/filename/branch/GitHub-state inference; no "unknown means ready" fallback; resolver cannot complete tasks, publish or accept. Do not touch task identity (#283) or dispatch fencing (#278), which run in parallel worktrees; join by the current `task_ref` contract and keep the join site isolated so #283 can swap it.

## P1 Architecture map
Scheduling: `src/core/engineers/*` (Work Graph schema, `WorkPackageDependencyState`, offer computation) and `src/effects/engineers/scheduling.ts` (`defaultDependencyAuthority`, `acquireScheduledEngineerTask`). Authorities to read: canonical Sprint reader; AcceptanceReceipt store (`src/effects/review/` / `acceptance-receipt`); Publication receipt/state (`src/effects/publication*` or coordination lease publication pointer); ME-4C product acceptance authority (`src/effects/**/product-acceptance*`); repo registry (`src/effects/**/repo-registry.ts`). Board exclusions surface in Fleet/Engineer board projections.

## P2 Concrete trace
Engineer offer computation → for each dependency edge → `dependencyAuthority(state, target)` → today returns `authority_unavailable` for three states → offer excluded with `dependency_authority_unavailable`. After: resolver dispatches exhaustively → reads the exact authority → validates subject/target/revision → `satisfied | unsatisfied | authority_unavailable` + `authority_revision` → offer includes the revision in its assertion so movement stales the offer → `acquireScheduledEngineerTask` revalidates. Pressure point: stale-evidence detection must be by exact subject/target revision, not by presence of a receipt.

## P3 Decision rationale
The four states already exist; the gap is adapters that read the existing single authorities. One exhaustive resolver keeps every verdict authority singular and makes adding a state without an adapter a compile/test failure. Closed policy reference (only if needed) avoids guessing which acceptance authority applies. At 10x graph size the first pressure is authority reads per offer computation; keep reads cheap and revision-bound, no caching layer in this slice.

## Task Breakdown
- [x] #1 Add failing unit tests for all four states × {positive, negative, unavailable, stale-evidence} and an exhaustiveness guard that fails when a `WorkPackageDependencyState` member lacks an adapter.
- [x] #2 Implement `src/effects/engineers/dependency-authority.ts` with the `canonical_done` and `module_accepted` adapters reading the canonical Sprint and exact-subject AcceptanceReceipt authority.
- [x] #3 Implement `publication_integrated` and `product_accepted` adapters over the existing Publication and ME-4C product-acceptance authorities; decide and implement the closed policy reference on the dependency edge only if `required_acceptance` cannot select one authority.
- [x] #4 Wire the resolver as the default in `scheduling.ts`; add cross-repository tests proving registry-snapshot isolation, exact repository identity, target movement and authorization revocation staling the offer; add offer/acquire revalidation tests and board `dependency_not_ready` vs `dependency_authority_unavailable` tests.
- [x] #5 Update spec/architecture docs and ArchContext selectors; run focused tests, `bun run check:type`, `bun run check:state-boundaries`, root required checks, and record acceptance evidence.

## Verification
bun test --timeout 60000; bun run check:type; bun run check:state-boundaries; bash scripts/check-deploy-sql-order.sh; bash scripts/check-architecture-sync.sh; bash scripts/check-task-sync.sh; repo-harness run check-task-workflow --strict; bun scripts/inspect-project-state.ts --repo . --format text; bun src/cli/index.ts init --repo . --dry-run.

## Annotations

## Annotations

## Task Breakdown
- [x] #1 Add failing unit tests for all four states × {positive, negative, unavailable, stale-evidence} and an exhaustiveness guard that fails when a `WorkPackageDependencyState` member lacks an adapter.
- [x] #2 Implement `src/effects/engineers/dependency-authority.ts` with the `canonical_done` and `module_accepted` adapters reading the canonical Sprint and exact-subject AcceptanceReceipt authority.
- [x] #3 Implement `publication_integrated` and `product_accepted` adapters over the existing Publication and ME-4C product-acceptance authorities; decide and implement the closed policy reference on the dependency edge only if `required_acceptance` cannot select one authority.
- [x] #4 Wire the resolver as the default in `scheduling.ts`; add cross-repository tests proving registry-snapshot isolation, exact repository identity, target movement and authorization revocation staling the offer; add offer/acquire revalidation tests and board `dependency_not_ready` vs `dependency_authority_unavailable` tests.
- [x] #5 Update spec/architecture docs and ArchContext selectors; run focused tests, `bun run check:type`, `bun run check:state-boundaries`, root required checks, and record acceptance evidence.
