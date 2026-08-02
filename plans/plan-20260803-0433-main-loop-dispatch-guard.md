# Plan: Main-loop dispatch guard (Claude host)

> **Status**: Executing
> **Created**: 20260803-0433
> **Slug**: main-loop-dispatch-guard
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260803-0433-main-loop-dispatch-guard.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260803-0433-main-loop-dispatch-guard.md`; after execution revert branch `codex/main-loop-dispatch-guard` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260803-0433-main-loop-dispatch-guard.contract.md`
> **Task Review**: `tasks/reviews/20260803-0433-main-loop-dispatch-guard.review.md`
> **Implementation Notes**: `tasks/notes/20260803-0433-main-loop-dispatch-guard.notes.md`

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

- Active plan: `plans/plan-20260803-0433-main-loop-dispatch-guard.md`
- Sprint contract: `tasks/contracts/20260803-0433-main-loop-dispatch-guard.contract.md`
- Sprint review: `tasks/reviews/20260803-0433-main-loop-dispatch-guard.review.md`
- Implementation notes: `tasks/notes/20260803-0433-main-loop-dispatch-guard.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260803-0433-main-loop-dispatch-guard.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260803-0433-main-loop-dispatch-guard.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260803-0433-main-loop-dispatch-guard.md`.

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
- Contract file: `tasks/contracts/20260803-0433-main-loop-dispatch-guard.contract.md`
- Review file: `tasks/reviews/20260803-0433-main-loop-dispatch-guard.review.md`
- Implementation notes file: `tasks/notes/20260803-0433-main-loop-dispatch-guard.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260803-0433-main-loop-dispatch-guard.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260803-0433-main-loop-dispatch-guard.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260803-0433-main-loop-dispatch-guard.md`; after execution revert branch `codex/main-loop-dispatch-guard` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260803-0433-main-loop-dispatch-guard.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260803-0433-main-loop-dispatch-guard.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260803-0433-main-loop-dispatch-guard.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260803-0433-main-loop-dispatch-guard.contract.md`, `tasks/reviews/20260803-0433-main-loop-dispatch-guard.review.md`, and `tasks/notes/20260803-0433-main-loop-dispatch-guard.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260803-0433-main-loop-dispatch-guard.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260803-0433-main-loop-dispatch-guard.md`; after execution revert branch `codex/main-loop-dispatch-guard` or the explicitly reviewed diff.

## Captured Planning Output

# Main-loop dispatch guard (Claude host)

## Goal

Enforce the operator's model-routing hierarchy at the hook layer: when armed, a main-loop Edit/Write on a code-extension file under `HOOK_HOST=claude` is denied with a dispatch instruction, while subagent edits (payload carries `agent_id`/`agent_type`) pass through unchanged. Root cause being fixed: prompt-layer routing rules are soft, so debug sessions ran with zero subagent dispatch while the orchestrator hand-edited code.

## Design decisions (frozen)

- Discriminator: official Claude Code hook payload carries top-level `agent_id` only when the tool call fires inside a subagent; absent on the main thread. No heuristics.
- Opt-in only: armed via env `REPO_HARNESS_MAIN_LOOP_EDIT_GUARD` = `1`/`true` AND `HOOK_HOST=claude`; product default stays off. Operator arms it machine-wide through the `env` block of `~/.claude/settings.json` (already done, inert until the new code is live).
- Deny surface: per-path inside `runPerPathGuards`, before plan/contract guards, independent of plan state and profile resolution; code-extension list only — markdown/config/workflow writes stay allowed so orchestrator plan/doc writes are unaffected.
- Blocking shape: `structuredError('MainLoopDispatchGuard', ..., 'state_violation')` + exit 2; member of `STRONG_BOUNDARY_GUARDS`; repeated denials must never trip open.
- No route-registry, matcher, adapter, installer, or `.ai/harness/policy.json` changes.

## Task Breakdown

- [x] `MainLoopDispatchGuard` implementation in `src/cli/hook/mutation-guard.ts` (extension set, `agent_id`/`agent_type` pass-through, per-path call site, strong-boundary membership)
- [x] Six regression cases in `tests/mutation-guard.test.ts`: armed+main-loop+`.ts` blocked; armed+`agent_id` passes; env unset inert; armed+`.md` passes; armed+`HOOK_HOST=codex` inert; armed+apply-patch expansion blocked on the code path
- [x] Verification: `bun test tests/mutation-guard.test.ts` (21 pass), hermeticity-affected characterization files armed-run green (9 pass), `bun src/cli/index.ts init --repo . --dry-run` (exit 0); full `bun test` deviation recorded in notes (pre-existing env red, failing-set identical to base)
- [ ] Boundary acceptance: Waza /check + typed AcceptanceReceipt (single review at the contract-finish boundary per review-trigger discipline)

## Evidence Contract

- State/progress path: this plan's Task Breakdown checkboxes; runtime evidence under `.ai/harness/checks/` and test output in the execution report.
- Verification evidence: `bun test tests/mutation-guard.test.ts`; `bun test`; `bun src/cli/index.ts init --repo . --dry-run` — all green.
- Evaluator rubric: gatekeeper reviews the diff against this plan's Goal and frozen design decisions; PASS requires the six cases green, full suite green, and zero changes outside `src/cli/hook/mutation-guard.ts`, `tests/mutation-guard.test.ts`, and hook-generated architecture-sync artifacts.
- Stop condition: all Task Breakdown items checked and gatekeeper returns PASS; distribution (release/global update) is explicitly a separate user decision, not part of this plan.
- Rollback surface: revert the `src/cli/hook/mutation-guard.ts` and `tests/mutation-guard.test.ts` hunks; runtime kill-switch is unsetting `REPO_HARNESS_MAIN_LOOP_EDIT_GUARD` (guard becomes fully inert).

## Out of scope / future work

- npm release / global package update (activation path — separate user decision)
- `.ai/harness/policy.json` per-repo arming surface
- hunt SKILL.md dispatch wording (redundant once the guard is live)

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `MainLoopDispatchGuard` implementation in `src/cli/hook/mutation-guard.ts` (extension set, `agent_id`/`agent_type` pass-through, per-path call site, strong-boundary membership)
- [x] Six regression cases in `tests/mutation-guard.test.ts`: armed+main-loop+`.ts` blocked; armed+`agent_id` passes; env unset inert; armed+`.md` passes; armed+`HOOK_HOST=codex` inert; armed+apply-patch expansion blocked on the code path
- [x] Verification: `bun test tests/mutation-guard.test.ts` (21 pass), hermeticity-affected characterization files armed-run green (9 pass), `bun src/cli/index.ts init --repo . --dry-run` (exit 0); full `bun test` deviation recorded in notes (pre-existing env red, failing-set identical to base)
- [ ] Boundary acceptance: Waza /check + typed AcceptanceReceipt (single review at the contract-finish boundary per review-trigger discipline)
