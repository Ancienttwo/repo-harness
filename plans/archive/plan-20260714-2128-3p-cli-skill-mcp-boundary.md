# Plan: 3P CLI/Skill/MCP boundary optimization

> **Status**: Archived
> **Created**: 20260714-2128
> **Slug**: 3p-cli-skill-mcp-boundary
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260714-2128-3p-cli-skill-mcp-boundary.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260714-2128-3p-cli-skill-mcp-boundary.md`; after execution revert branch `codex/3p-cli-skill-mcp-boundary` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260714-2128-3p-cli-skill-mcp-boundary.contract.md`
> **Task Review**: `tasks/reviews/20260714-2128-3p-cli-skill-mcp-boundary.review.md`
> **Implementation Notes**: `tasks/notes/20260714-2128-3p-cli-skill-mcp-boundary.notes.md`

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

- Active plan: `plans/plan-20260714-2128-3p-cli-skill-mcp-boundary.md`
- Sprint contract: `tasks/contracts/20260714-2128-3p-cli-skill-mcp-boundary.contract.md`
- Sprint review: `tasks/reviews/20260714-2128-3p-cli-skill-mcp-boundary.review.md`
- Implementation notes: `tasks/notes/20260714-2128-3p-cli-skill-mcp-boundary.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260714-2128-3p-cli-skill-mcp-boundary.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260714-2128-3p-cli-skill-mcp-boundary.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260714-2128-3p-cli-skill-mcp-boundary.md`.

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
- Contract file: `tasks/contracts/20260714-2128-3p-cli-skill-mcp-boundary.contract.md`
- Review file: `tasks/reviews/20260714-2128-3p-cli-skill-mcp-boundary.review.md`
- Implementation notes file: `tasks/notes/20260714-2128-3p-cli-skill-mcp-boundary.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260714-2128-3p-cli-skill-mcp-boundary.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260714-2128-3p-cli-skill-mcp-boundary.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260714-2128-3p-cli-skill-mcp-boundary.md`; after execution revert branch `codex/3p-cli-skill-mcp-boundary` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260714-2128-3p-cli-skill-mcp-boundary.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260714-2128-3p-cli-skill-mcp-boundary.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260714-2128-3p-cli-skill-mcp-boundary.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260714-2128-3p-cli-skill-mcp-boundary.contract.md`, `tasks/reviews/20260714-2128-3p-cli-skill-mcp-boundary.review.md`, and `tasks/notes/20260714-2128-3p-cli-skill-mcp-boundary.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260714-2128-3p-cli-skill-mcp-boundary.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260714-2128-3p-cli-skill-mcp-boundary.md`; after execution revert branch `codex/3p-cli-skill-mcp-boundary` or the explicitly reviewed diff.

## Captured Planning Output

# 3P CLI/Skill/MCP Boundary Optimization

Captured retroactively at ship time: the package was approved and executed in-session from a CLI/Skill/MCP layering audit before this artifact was written; this plan records the decision-complete scope for the work-package gate.

## Goal

Close the three prioritized findings from the CLI/Skill/MCP boundary audit (2026-07-14): make the `run` helper facade self-describing from the workflow contract, remove the duplicated required-check list authority from the check skill, and pin the skill-granularity boundary so endpoint-rename skills cannot accumulate.

## Task Breakdown

- [x] P1: add `helpers.descriptions` (one entry per `helpers.scripts` item) to `assets/workflow-contract.v1.json`, fail-closed validation in `src/cli/runtime/helper-runner.ts` (`readContractHelperDescriptions`, `listHelpers`), lazy `Helpers:` enumeration in `repo-harness run --help` (`src/cli/commands/run.ts`), byte-identical `.ai/harness/workflow-contract.json` mirror, tests in `tests/workflow-contract.test.ts` + `tests/cli/run.test.ts`
- [x] P2: `assets/skill-commands/repo-harness-check/SKILL.md` defers to the target repo's root `## Required Checks` section as the single source of truth, fails closed when the section is missing/empty, plus one Boundaries bullet; doctor triplication investigated and closed as no-change (scopes already distinct)
- [x] P3: intent-level skill-granularity boundary added to `assets/skill-commands/CLAUDE.md` and `AGENTS.md` (no single-command renames, no per-engine-verb sibling skills; gptpro stays the single chatgpt browser facade)
- [x] Architecture closeout: dated section in `docs/architecture/modules/workflow-engine/contract-assets.md`, request archived, contract blocks cleared
- [x] Rebase onto origin/main (5 upstream commits) and add descriptions for the two upstream helpers (`run-bounded-verifier-command`, `validate-harness-profile-benchmark`) so the 1:1 fail-closed invariant holds at 48 entries

## Verification Boundary

Full `bun test`, `check-deploy-sql-order`, `check-architecture-sync`, `check-task-sync`, `check-task-workflow --strict`, `adopt --repo . --dry-run`, `cmp` of the two contract copies, and `run --help` enumeration output; gatekeeper PASS recorded pre-rebase on the same diff scope.

## Rollback Surface

Single commit on `main`; revert the commit to restore the previous contract, helper-runner, run-command, and skill-doc state. No data migration, no installed-repo write.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] P1: add `helpers.descriptions` (one entry per `helpers.scripts` item) to `assets/workflow-contract.v1.json`, fail-closed validation in `src/cli/runtime/helper-runner.ts` (`readContractHelperDescriptions`, `listHelpers`), lazy `Helpers:` enumeration in `repo-harness run --help` (`src/cli/commands/run.ts`), byte-identical `.ai/harness/workflow-contract.json` mirror, tests in `tests/workflow-contract.test.ts` + `tests/cli/run.test.ts`
- [x] P2: `assets/skill-commands/repo-harness-check/SKILL.md` defers to the target repo's root `## Required Checks` section as the single source of truth, fails closed when the section is missing/empty, plus one Boundaries bullet; doctor triplication investigated and closed as no-change (scopes already distinct)
- [x] P3: intent-level skill-granularity boundary added to `assets/skill-commands/CLAUDE.md` and `AGENTS.md` (no single-command renames, no per-engine-verb sibling skills; gptpro stays the single chatgpt browser facade)
- [x] Architecture closeout: dated section in `docs/architecture/modules/workflow-engine/contract-assets.md`, request archived, contract blocks cleared
- [x] Rebase onto origin/main (5 upstream commits) and add descriptions for the two upstream helpers (`run-bounded-verifier-command`, `validate-harness-profile-benchmark`) so the 1:1 fail-closed invariant holds at 48 entries
