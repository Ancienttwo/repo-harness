# Plan: Agent Fleet Worker Role Fallback & Routing Telemetry

> **Status**: Archived
> **Created**: 20260712-2103
> **Slug**: agent-fleet-worker-routing-telemetry
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: fable-orchestrated
> **Source Ref**: deep-reasoner design + user AskUserQuestion confirmation (this session)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260712-2103-agent-fleet-worker-routing-telemetry.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md`; after execution revert branch `codex/agent-fleet-worker-routing-telemetry` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260712-2103-agent-fleet-worker-routing-telemetry.contract.md`
> **Task Review**: `tasks/reviews/20260712-2103-agent-fleet-worker-routing-telemetry.review.md`
> **Implementation Notes**: `tasks/notes/20260712-2103-agent-fleet-worker-routing-telemetry.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: deep-reasoner design + user AskUserQuestion confirmation (this session)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md`
- Sprint contract: `tasks/contracts/20260712-2103-agent-fleet-worker-routing-telemetry.contract.md`
- Sprint review: `tasks/reviews/20260712-2103-agent-fleet-worker-routing-telemetry.review.md`
- Implementation notes: `tasks/notes/20260712-2103-agent-fleet-worker-routing-telemetry.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260712-2103-agent-fleet-worker-routing-telemetry.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md`.

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
- Contract file: `tasks/contracts/20260712-2103-agent-fleet-worker-routing-telemetry.contract.md`
- Review file: `tasks/reviews/20260712-2103-agent-fleet-worker-routing-telemetry.review.md`
- Implementation notes file: `tasks/notes/20260712-2103-agent-fleet-worker-routing-telemetry.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260712-2103-agent-fleet-worker-routing-telemetry.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md`; after execution revert branch `codex/agent-fleet-worker-routing-telemetry` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260712-2103-agent-fleet-worker-routing-telemetry.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260712-2103-agent-fleet-worker-routing-telemetry.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260712-2103-agent-fleet-worker-routing-telemetry.contract.md`, `tasks/reviews/20260712-2103-agent-fleet-worker-routing-telemetry.review.md`, and `tasks/notes/20260712-2103-agent-fleet-worker-routing-telemetry.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260712-2103-agent-fleet-worker-routing-telemetry.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md`; after execution revert branch `codex/agent-fleet-worker-routing-telemetry` or the explicitly reviewed diff.

## Captured Planning Output

## Summary

Continuation of the Agent Fleet routing refactor (four named, model-pinned subagent profiles: explorer, fast-worker, deep-reasoner, gatekeeper — already implemented and tested earlier this session). This plan captures the four remaining items that were approved in an earlier, uncaptured planning conversation and were re-specified in this session after an explorer sweep confirmed no file-backed plan artifact existed for them (the only match in `plans/` was an unrelated, already-archived, narrower slice: `plan-20260711-1402-agent-fleet-role-tier-alignment.md`, which explicitly disclaims this scope).

## Confirmed Role Mapping

Contract role (scripts/contract-run.ts `roles` block) -> fleet profile:
- `parent` -> the orchestrator itself; never assigned a model; not one of the 4 profiles.
- `explorer` -> `explorer` profile (fixed).
- `worker` -> `fast-worker` profile (preferred) or a `sol-high` single-shot escalation (fallback), DERIVED from the resolved runner dispatch value — not by renaming `RunnerContract.preferred`/`fallback`'s existing dispatch-mechanism vocabulary (`subagent`/`codex-subagent`/`codex-exec`/`main-thread`, confirmed via tests/contract-run.test.ts:100-106, 763-764):
  - dispatch `main-thread` -> worker profile `sol-high` (Opus + High effort, occasionally manually bumped higher by the user).
  - dispatch `codex-subagent`/`codex-exec` -> pass the raw dispatch label through unchanged (Codex is an independent peer provider, not one of the 4 profiles).
  - any other dispatch (e.g. `subagent`) -> worker profile `fast-worker`.
- `verifier` -> `gatekeeper` profile (fixed).
- `deep-reasoner` sits outside this role table entirely as an independent escalation path, not bound to any single contract role.

## Design (deep-reasoner proposal, confirmed by user across two clarification rounds)

- The fallback mechanism is record-only: scripts/contract-run.ts never itself selects/spawns/degrades a runner (existing philosophy at ~88-90); it only classifies and records which path was used. Escalation from fast-worker to Sol-High is orchestrator-driven (the caller passes `--runner main-thread`), not auto-degraded by the script on failure.
- New `--effort <tier>` CLI flag (mirrors `--runner`), validated against the closed vocabulary low/medium/high/xhigh/max (same tiers established earlier this session in scripts/install-agent-fleet.sh's `buildFamilyEffortMap()`), record-only. Defaults to `"high"` when the worker fallback path is used and no explicit `--effort` is passed.
- New manifest telemetry fields (additive only, no existing field renamed or repurposed):
  - `runner_usage.path`: `"worker_preferred"` | `"worker_fallback"`.
  - `runner_usage.effort`: resolved effort tier string or `null`.
  - `delegation_plan.role_profiles`: `{ parent: "orchestrator", explorer: "explorer", worker: <derived per mapping above>, verifier: "gatekeeper" }`.
- `RunnerContract` type and `parseRunner`/`parseDelegation` are reused as-is (no field renaming). `runChild` and the run-mode control flow are untouched (no auto-degrade, no second worker execution, no verifier-skip).

## Task Breakdown
- [x] Map contract-run.ts generic roles (`parent`/`explorer`/`worker`/`verifier`) to the four fleet profiles via a new `delegation_plan.role_profiles` manifest field.
- [x] Implement the Sol-High single-shot worker-fallback classification (`--effort` flag, `onWorkerFallback` derivation, `runner_usage.path`/`effort` fields) in scripts/contract-run.ts, plus regression tests in tests/contract-run.test.ts covering the preferred path, the `main-thread` fallback path, the `codex-exec` pass-through case, an `--effort` override, and invalid `--effort` rejection.
- [x] Extend the run manifest with the telemetry fields above and verify additive-safety against the existing partial-cast assertions in tests/contract-run.test.ts (~241-243/766/784/802).
- [x] Document the resulting routing architecture as a new module doc under docs/architecture/modules/, following the docs/architecture/modules/workflow-engine/inspection-migration.md template, and register the capability in .ai/context/capabilities.json plus a pending-request entry in docs/architecture/index.md. (Extended existing `workflow-engine-contract-assets` capability instead of minting a new one; `docs/architecture/index.md` intentionally left untouched since the drift hook does not cover contract-run.ts — see `docs/architecture/modules/workflow-engine/contract-assets.md` 2026-07-12 closeout section.)

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Map contract-run.ts generic roles (`parent`/`explorer`/`worker`/`verifier`) to the four fleet profiles via a new `delegation_plan.role_profiles` manifest field.
- [x] Implement the Sol-High single-shot worker-fallback classification (`--effort` flag, `onWorkerFallback` derivation, `runner_usage.path`/`effort` fields) in scripts/contract-run.ts, plus regression tests in tests/contract-run.test.ts covering the preferred path, the `main-thread` fallback path, the `codex-exec` pass-through case, an `--effort` override, and invalid `--effort` rejection.
- [x] Extend the run manifest with the telemetry fields above and verify additive-safety against the existing partial-cast assertions in tests/contract-run.test.ts (~241-243/766/784/802).
- [x] Document the resulting routing architecture as a new module doc under docs/architecture/modules/, following the docs/architecture/modules/workflow-engine/inspection-migration.md template, and register the capability in .ai/context/capabilities.json plus a pending-request entry in docs/architecture/index.md. (Extended existing `workflow-engine-contract-assets` capability instead of minting a new one; `docs/architecture/index.md` intentionally left untouched since the drift hook does not cover contract-run.ts — see `docs/architecture/modules/workflow-engine/contract-assets.md` 2026-07-12 closeout section.)
