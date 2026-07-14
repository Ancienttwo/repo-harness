# Plan: UX Feature Guardrail

> **Status**: Archived
> **Created**: 20260714-1710
> **Slug**: ux-feature-guardrail
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Packaged convention, design-brief projection, hook advice, and downstream adoption output must verify together.
> **Rollback Surface**: Revert the codex/ux-feature-guardrail work-package.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260714-1710-ux-feature-guardrail.contract.md`
> **Task Review**: `tasks/reviews/20260714-1710-ux-feature-guardrail.review.md`
> **Implementation Notes**: `tasks/notes/20260714-1710-ux-feature-guardrail.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260714-1710-ux-feature-guardrail.md`
- Sprint contract: `tasks/contracts/20260714-1710-ux-feature-guardrail.contract.md`
- Sprint review: `tasks/reviews/20260714-1710-ux-feature-guardrail.review.md`
- Implementation notes: `tasks/notes/20260714-1710-ux-feature-guardrail.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260714-1710-ux-feature-guardrail.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260714-1710-ux-feature-guardrail.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260714-1710-ux-feature-guardrail.md`.

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
- Contract file: `tasks/contracts/20260714-1710-ux-feature-guardrail.contract.md`
- Review file: `tasks/reviews/20260714-1710-ux-feature-guardrail.review.md`
- Implementation notes file: `tasks/notes/20260714-1710-ux-feature-guardrail.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260714-1710-ux-feature-guardrail.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260714-1710-ux-feature-guardrail.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the codex/ux-feature-guardrail work-package.
- **Verification boundary**: Packaged convention, design-brief projection, hook advice, and downstream adoption output must verify together.
- **Review/acceptance boundary**: `tasks/reviews/20260714-1710-ux-feature-guardrail.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260714-1710-ux-feature-guardrail.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260714-1710-ux-feature-guardrail.contract.md`, `tasks/reviews/20260714-1710-ux-feature-guardrail.review.md`, and `tasks/notes/20260714-1710-ux-feature-guardrail.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260714-1710-ux-feature-guardrail.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the codex/ux-feature-guardrail work-package.

## Captured Planning Output

## Goal

Create one UX feature pre-implementation guard that freezes user-visible behavior, separates instruction from payload, requires reuse of existing UI/domain authority, forbids silent compatibility fallbacks, and turns those decisions into Given/When/Then acceptance scenarios before frontend execution.

## P1: Architecture Map

- `assets/reference-configs/` is the packaged authority for runtime conventions; `docs/reference-configs/` is the self-host mirror and `repo-harness docs show` projection.
- `assets/templates/design-brief.template.md`, `.claude/templates/design-brief.template.md`, and the two `ensure-task-workflow.sh` copies are the existing frontend pre-execution brief surface.
- `repo-harness-prd` creates the design brief before frontend Sprint/contract execution.
- `prompt-guard.sh` emits the existing BDD feature advisory; it is advisory and must not become a new validator, ledger, sidecar, or semantic classifier.
- `design-options` remains the earlier human-choice step only when multiple genuine visual/UX directions exist.

## P2: Concrete Trace

User requests a UX feature -> prompt guard emits feature advice -> product/UX direction is fixed (through `design-options` only when needed) -> PRD creates a design brief -> the brief records frozen behavior, authority/reuse targets, failure/copy rules, and positive/negative/error Given/When/Then scenarios -> human confirms the brief -> frontend contract cites the brief -> implementation and review use those scenarios as acceptance authority.

## P3: Design Decision

Extend the existing design-brief and BDD chain and add one canonical prose convention. Do not vendor the third-party skill, create a parallel UX artifact, or add a deterministic enforcement subsystem: the recent BDD2/BDD3 evidence rejected validator/ledger machinery, while the existing human-confirmed design brief is already the correct pre-execution boundary. At 10x scale the first failure would be duplicated prose drifting across prompts/templates, so keep the detailed rules in one runtime doc and make other surfaces short links/projections.

## Scope

- Add the packaged/self-host `ux-feature-guard` convention and route it in the agentic development flow.
- Extend the design brief with a compact UX behavior/reuse/failure/BDD guard card and confirmation items.
- Update the PRD frontend hand-off and BDD prompt advice to invoke the guard.
- Add focused distribution, routing, template, and hook tests; preserve generated/template parity.
- Refresh workflow status/review artifacts required by this work-package.

## Non-goals

- No public BDD skill, CLI/MCP tool, lifecycle, sidecar, ledger, score, or validator.
- No automatic semantic inference of gameplay/product rules or memory payloads.
- No compatibility path, dual authority, silent fallback, or best-effort product behavior.
- No changes to unrelated agent-fleet work already dirty on `main`.

## Evidence Contract

- State/progress: this plan and its linked contract/review artifacts.
- Verification: focused Bun tests for docs/adoption/hook/template surfaces, required repo checks, and adoption dry-run.
- Evaluator rubric: one canonical rule home, existing frontend/BDD chain reused, explicit handling of all four reported failure classes, no revived BDD machinery, asset/self-host parity.
- Stop condition: any implementation requires a new semantic classifier or validator subsystem, or conflicts with sealed BDD2/BDD3 conclusions.
- Rollback surface: revert the single `codex/ux-feature-guardrail` branch/work-package.

## Captured Checklist (Provenance Only)

- [x] Add the canonical UX feature guard and routing.
- [x] Integrate the guard card into design brief, PRD hand-off, and BDD advice.
- [x] Add focused tests and preserve all distributed copies.
- [x] Run checks and record review/closeout evidence.

## Promotion Gate

- Merge/PR unit: one convention plus its existing frontend/BDD projections.
- Rollback surface: one branch revert.
- Independent verification boundary: docs/adoption/hook/template parity tests and repository gates.
- Review boundary: explicit confirmation that no BDD validator/lifecycle was revived.
- Worktree boundary: isolated because the user's main checkout contains unrelated WIP.
- This cannot remain a checklist row because it changes packaged workflow behavior and downstream adoption output together.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add the canonical UX feature guard and routing.
- [x] Integrate the guard card into design brief, PRD hand-off, and BDD advice.
- [x] Add focused tests and preserve all distributed copies.
- [x] Run checks and record review/closeout evidence.
