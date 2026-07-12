# Plan: Harness Kernel Reduction

> **Status**: Executing
> **Created**: 20260712-2327
> **Slug**: harness-kernel-reduction
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: codex-goal
> **Source Ref**: /Users/kito/.codex/attachments/9fbe03dc-987a-4e5a-a11c-ede65ea4121b/pasted-text-1.txt
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: P0/P1/P2 runtime cutover, 3x9 benchmark matrix, profile installation transaction, and preserved safety regressions must all pass before completion.
> **Rollback Surface**: Revert ordered work-package commits; install-profile migration has an explicit ownership manifest and rollback transaction; no live push, merge, deploy, or secret mutation.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md`
> **Task Review**: `tasks/reviews/20260712-2327-harness-kernel-reduction.review.md`
> **Implementation Notes**: `tasks/notes/20260712-2327-harness-kernel-reduction.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: /Users/kito/.codex/attachments/9fbe03dc-987a-4e5a-a11c-ede65ea4121b/pasted-text-1.txt
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260712-2327-harness-kernel-reduction.md`
- Sprint contract: `tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md`
- Sprint review: `tasks/reviews/20260712-2327-harness-kernel-reduction.review.md`
- Implementation notes: `tasks/notes/20260712-2327-harness-kernel-reduction.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260712-2327-harness-kernel-reduction.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260712-2327-harness-kernel-reduction.md`.

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
- Contract file: `tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md`
- Review file: `tasks/reviews/20260712-2327-harness-kernel-reduction.review.md`
- Implementation notes file: `tasks/notes/20260712-2327-harness-kernel-reduction.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260712-2327-harness-kernel-reduction.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert ordered work-package commits; install-profile migration has an explicit ownership manifest and rollback transaction; no live push, merge, deploy, or secret mutation.
- **Verification boundary**: P0/P1/P2 runtime cutover, 3x9 benchmark matrix, profile installation transaction, and preserved safety regressions must all pass before completion.
- **Review/acceptance boundary**: `tasks/reviews/20260712-2327-harness-kernel-reduction.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: rollback_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260712-2327-harness-kernel-reduction.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md`, `tasks/reviews/20260712-2327-harness-kernel-reduction.review.md`, and `tasks/notes/20260712-2327-harness-kernel-reduction.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260712-2327-harness-kernel-reduction.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert ordered work-package commits; install-profile migration has an explicit ownership manifest and rollback transaction; no live push, merge, deploy, or secret mutation.

## Captured Planning Output

## Summary

Complete the full P0/P1/P2 reduction described by the source Goal. The end state is a deterministic harness kernel: authoritative cost evidence, risk-based Lite/Standard/Strict workflow, explicit-first prompt routing, global SessionStart budget, one effective-state resolver, bounded loops, five-action Skill discovery, and transactional install profiles. The archived cost-baseline slice is reusable evidence only and cannot satisfy this plan by itself.

## Goal

Cut repo-harness from global Strict cognitive choreography to one risk-aware state kernel while preserving deterministic scope, worktree, check, review-freshness, security, architecture, recovery, and dirty-main boundaries.

## Completion Boundary

This plan is complete only when all nine implementation stages and the 3x9 benchmark matrix pass. A measurement-only result, one profile, one router change, one contract, or a partial benchmark is not completion. Remaining P1/P2 work may not be moved to Future Work.

## P1 Architecture Map

- Runtime routing authority: `src/cli/hook/route-registry.ts`, `src/cli/hook/runtime.ts`, prompt guard command/decision modules, and product hook sources under `assets/hooks/`.
- State authority seed: `src/cli/hook/state-snapshot.ts`; it must become the single effective-state resolver consumed by CLI and hooks, replacing duplicate shell derivation rather than adding a parallel engine.
- Policy/projection authority: `.ai/harness/policy.json`, `assets/workflow-contract.v1.json`, `.ai/harness/workflow-contract.json`, `src/core/adoption/standard-plan.ts`, and `scripts/lib/project-init-lib.sh`.
- Benchmark authority: `scripts/run-skill-evals.ts`, `evals/`, run-local host configuration, live hook trace evidence, and scenario graders.
- Skill/install authority: root `SKILL.md`, `assets/skill-commands/manifest.json`, global runtime/install/status commands, installer targets, installed-copy sync, and ownership-aware transactions.
- Product sources are `assets/hooks/` and packaged assets; `.ai/hooks/` and self-host manifests are deterministic projections with parity checks.

## P2 Concrete Traces

1. Prompt: host `UserPromptSubmit` -> explicit/active-task pre-router -> bypass or one workflow action; ordinary prompts never call the legacy classifier. Real edit risk is resolved at PreToolUse from path/action/capability authority.
2. SessionStart: section producers -> runtime final aggregator -> priority/dedupe/budget -> bounded context plus machine evidence; inert and unchanged sessions emit zero.
3. State: repo artifacts + source hashes -> effective-state resolver -> atomic ignored state/version -> CLI/hooks consume the same JSON -> transitions update counters without duplicate parsers.
4. Benchmark: common scenario seed -> isolated no_harness/lite/strict projection -> streaming provider/hook events -> nullable authoritative metrics -> scenario grader -> profile comparison report.
5. Install: requested profile -> one operation plan/ownership manifest -> dry-run/apply/switch/rollback -> persisted installed state -> status drift report.

## P3 Decisions

- Risk Profile is distinct from existing Task Profile. Explicit override may raise risk but cannot lower below deterministic floor.
- PreToolUse owns safety escalation; natural-language routing is not a security authority.
- `state-snapshot.ts` is upgraded/replaced in place as the effective-state owner; no third parser or dual authority.
- Global context budget is enforced at runtime aggregation, not by local truncation in one producer.
- No Harness uses actual host isolation; `without_skill` is retired, not renamed.
- Missing provider/runtime authority remains null/unavailable. Synthetic reporter evidence remains a microbenchmark only.
- InstallProfile is host-level authority; repo policy may carry an explicit override but cannot become a competing installed-state authority.
- One-shot migration is authorized. Only package-owned legacy paths with proven hashes may be removed; modified/unknown host content fails closed.
- No new service/database or steady-state compatibility fallback.

## Ordered Work Packages

1. Effective state and deterministic risk profiles.
2. Explicit-first routing cutover and legacy classifier deletion.
3. Global SessionStart context budget, delta and dedupe evidence.
4. Guard/review/repair/subagent/cross-model circuit breakers.
5. Transactional install profiles and effective installed-state status.
6. Root Skill and default discovery cutover to five actions.
7. Live hook evidence plus streaming benchmark runner.
8. Nine common scenarios and isolated No Harness/Lite/Strict projections.
9. Full 3x9 execution, comparison report, architecture/migration/rollback documentation, external acceptance and workflow closeout.

## Required Outcomes

- P0-A: authoritative No Harness/Lite/Strict matrix over all nine Goal scenarios and all named metrics.
- P0-B: productized Lite/Standard/Strict profiles with deterministic risk floor.
- P0-C: ordinary prompts bypass workflow classification; explicit and active-task requests route correctly.
- P0-D: actionable SessionStart <=1500 estimated tokens, inert=0, unchanged repeat=0, required boundaries never truncated.
- P1-A: public `repo-harness state resolve --json` with task/profile/version/authority/hashes/freshness/next-action/blockers.
- P1-B: root router body <=2KB and no more than five default discovery actions.
- P1-C: guard repeat 2, review 1/1/2, subagent 2/3, repair 2, default cross-model 0 with strong boundaries fail closed.
- P2: minimal/standard/product-planning/strict install profiles with deterministic plan, apply, idempotent switch, rollback and status.

## Preserved Invariants

Allowed paths, worktree isolation, checks, stale review binding, secret/config security, compact recovery, Strict high-risk enforcement, architecture/capability boundary, provider fail-closed authority, and dirty-main safety remain enforced and regression-tested.

## File Owners

Implementation may touch the existing owners under `src/cli/`, `src/core/adoption/`, `scripts/`, `assets/hooks/`, `.ai/hooks/`, `assets/skill-commands/`, `evals/`, `tests/`, root `SKILL.md`, workflow/policy manifests, package scripts, architecture/reference docs, and this plan's workflow artifacts. Each child contract must narrow these paths to its work package before editing.

## Verification

- `bun test`
- `bun run check:type`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bun src/cli/index.ts adopt --repo . --dry-run`
- full No Harness/Lite/Strict 3x9 benchmark report with isolation and authority verdicts
- focused profile, routing, context, effective-state, breaker, installer, Skill size/inventory, security, review-freshness and recovery tests

## Stop Conditions

Stop only after verified full completion or a blocker that requires a new user decision/external credential after three concrete attempts. Work volume, slow tests, rebase, intermediate artifacts, external-review throttling, or completion of one package are not blockers.

## Task Breakdown

- [ ] WP1 Effective state and deterministic risk profiles.
- [ ] WP2 Explicit-first routing cutover.
- [ ] WP3 Global SessionStart budget and dedupe.
- [ ] WP4 Circuit breakers and profile-aware orchestration caps.
- [ ] WP5 Transactional install profiles and installed-state authority.
- [ ] WP6 Root Skill and five-action discovery cutover.
- [ ] WP7 Live hook evidence and streaming benchmark runner.
- [ ] WP8 Nine scenarios and isolated three-profile benchmark projections.
- [ ] WP9 Full matrix, durable reports, migrations, architecture, external acceptance and closeout.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] WP1 Effective state and deterministic risk profiles.
- [ ] WP2 Explicit-first routing cutover.
- [ ] WP3 Global SessionStart budget and dedupe.
- [ ] WP4 Circuit breakers and profile-aware orchestration caps.
- [ ] WP5 Transactional install profiles and installed-state authority.
- [ ] WP6 Root Skill and five-action discovery cutover.
- [ ] WP7 Live hook evidence and streaming benchmark runner.
- [ ] WP8 Nine scenarios and isolated three-profile benchmark projections.
- [ ] WP9 Full matrix, durable reports, migrations, architecture, external acceptance and closeout.
