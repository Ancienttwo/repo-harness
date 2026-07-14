# Plan: Codex Delegation Auto Boundary

> **Status**: Executing
> **Created**: 20260714-2026
> **Slug**: codex-delegation-auto-boundary
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Codex auto-mode prompt routing and hook projection regressions pass without changing Claude routes
> **Rollback Surface**: Revert the advisor routing commit and restore the prior global delegation mode if needed
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260714-2026-codex-delegation-auto-boundary.contract.md`
> **Task Review**: `tasks/reviews/20260714-2026-codex-delegation-auto-boundary.review.md`
> **Implementation Notes**: `tasks/notes/20260714-2026-codex-delegation-auto-boundary.notes.md`

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

- Active plan: `plans/plan-20260714-2026-codex-delegation-auto-boundary.md`
- Sprint contract: `tasks/contracts/20260714-2026-codex-delegation-auto-boundary.contract.md`
- Sprint review: `tasks/reviews/20260714-2026-codex-delegation-auto-boundary.review.md`
- Implementation notes: `tasks/notes/20260714-2026-codex-delegation-auto-boundary.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260714-2026-codex-delegation-auto-boundary.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260714-2026-codex-delegation-auto-boundary.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260714-2026-codex-delegation-auto-boundary.md`.

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
- Contract file: `tasks/contracts/20260714-2026-codex-delegation-auto-boundary.contract.md`
- Review file: `tasks/reviews/20260714-2026-codex-delegation-auto-boundary.review.md`
- Implementation notes file: `tasks/notes/20260714-2026-codex-delegation-auto-boundary.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260714-2026-codex-delegation-auto-boundary.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260714-2026-codex-delegation-auto-boundary.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the advisor routing commit and restore the prior global delegation mode if needed
- **Verification boundary**: Codex auto-mode prompt routing and hook projection regressions pass without changing Claude routes
- **Review/acceptance boundary**: `tasks/reviews/20260714-2026-codex-delegation-auto-boundary.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260714-2026-codex-delegation-auto-boundary.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260714-2026-codex-delegation-auto-boundary.contract.md`, `tasks/reviews/20260714-2026-codex-delegation-auto-boundary.review.md`, and `tasks/notes/20260714-2026-codex-delegation-auto-boundary.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260714-2026-codex-delegation-auto-boundary.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the advisor routing commit and restore the prior global delegation mode if needed

## Captured Planning Output

## Goal

Make Codex delegation `auto` a bounded permission signal instead of an unconditional instruction to continue an active contract. Prevent questions, diagnosis/status prompts, and repositories without a valid active contract from receiving the full execution packet, while preserving explicit delegation and active-task execute/verify routing.

## P1: Architecture Map

The shared hook route registry owns host coverage; `assets/hooks/codex-delegation-advisor.sh` is the product source and `.ai/hooks/codex-delegation-advisor.sh` is the self-host projection. `src/cli/hook/prompt-router.ts` is the deterministic user-intent authority. Global `~/.repo-harness/config.json` selects auto versus explicit but is operator state, not a tracked product authority. Claude routes remain unchanged and out of scope.

## P2: Concrete Trace

Today every Codex `UserPromptSubmit` in global auto mode reaches the delegation advisor, which emits the full contract packet even when `.ai/harness/active-plan` is missing or the prompt is a question. Codex therefore receives `Treat the active task contract ... as authoritative` on prompts that have no contract execution intent. The corrected path first resolves whether a valid active plan and matching contract exist, then uses the deterministic prompt route: only active-task execute/verify or explicit workflow execution emits contract-bound context; other auto-mode prompts emit no execution context. Explicit delegation remains authorization, but cannot claim a nonexistent active contract.

## P3: Design Decision

Preserve the existing hook route, delegation modes, contract authority, and explicit triggers. Change only the emission boundary. Reuse the existing prompt router rather than adding a second semantic classifier. Fail closed when active-plan/contract state is absent or invalid. Do not add compatibility behavior, heuristic question regexes, new configuration, telemetry, benchmark changes, or Claude behavior.

## In Scope

- Change the Codex delegation advisor to distinguish permission from contract execution.
- Require a valid active plan and matching contract before auto mode emits contract-bound context.
- Reuse deterministic prompt routing so status/diagnosis/general questions bypass contract continuation.
- Preserve explicit delegation without falsely claiming an active contract.
- Synchronize the product hook and self-host projection.
- Add focused hook tests and update the existing hook operations and architecture invariants.
- Apply the reversible operator mitigation `delegation.mode=explicit` in the local global repo-harness config and record it in implementation notes.

## Out of Scope

- Benchmark producer, verifier-evidence, CI, merge queue, or worktree semantics.
- Claude hook routes, Claude model routing, Codex model selection, or subagent model pinning.
- New intent classifiers, fallback parsers, aliases, telemetry, or broad global instruction rewrites.
- Unrelated dirty main-worktree changes.

## Allowed Paths

- `assets/hooks/codex-delegation-advisor.sh`
- `.ai/hooks/codex-delegation-advisor.sh`
- `.ai/hooks/.projection.json`
- `src/cli/hook/prompt-router.ts`
- `tests/cli/hook.test.ts`
- `tests/hook-contracts.test.ts`
- `docs/reference-configs/hook-operations.md`
- `docs/architecture/modules/runtime-harness/hook-adapters.md`
- `plans/plan-*.md`
- `tasks/contracts/*.contract.md`
- `tasks/reviews/*.review.md`
- `tasks/notes/*.notes.md`
- `tasks/current.md`
- `tasks/todos.md`

## Acceptance Criteria

- Auto mode plus no valid active contract emits no full contract execution packet.
- Auto mode plus an active contract and a status, diagnosis, or general-question prompt emits no full contract execution packet.
- Auto mode plus an active contract and `继续` or `/check` emits the bounded contract packet.
- Explicit delegation remains recognized; without an active contract it emits permission-only context and never claims a nonexistent contract.
- Explicit delegation with an active contract can emit the bounded contract packet.
- Claude route registry remains unchanged.
- Product hook and self-host projection are byte-identical and projection metadata is current.
- Focused hook tests, typecheck, task sync, strict task-workflow check, and diff check pass.

## Verification

- `bun test tests/cli/hook.test.ts tests/hook-contracts.test.ts`
- `bun run check:type`
- `bun run check:hooks`
- `bash scripts/check-task-sync.sh`
- `bun src/cli/index.ts run check-task-workflow --strict`
- `git diff --check`

## Task Breakdown

- [x] Record the current auto-mode misrouting with focused failing tests.
- [x] Implement the contract-aware deterministic emission boundary and synchronize hook projections.
- [x] Update the narrow runtime documentation and architecture invariant.
- [x] Apply the local explicit-mode mitigation and record operator state without committing global config.
- [x] Run focused verification, complete review evidence, and prepare the branch for closeout.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
