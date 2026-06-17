# Plan: HE-01 Harness Research Baseline

> **Status**: Approved
> **Created**: 2026-06-17
> **Slug**: HE-01-harness-research-baseline
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260616-harness-engineering-frameworks.md`
> **Task Contract**: `tasks/contracts/20260616-HE-01-harness-research-baseline.contract.md`
> **Task Review**: `tasks/reviews/20260616-HE-01-harness-research-baseline.review.md`
> **Implementation Notes**: `tasks/notes/20260616-HE-01-harness-research-baseline.notes.md`

## Agentic Routing

- Selected route: docs-only task contract inside `codex/harness-engineering-optimization`
- Routing reason: HE-01 is a research baseline and principle card; it does not require runtime code edits.
- Due diligence:
  - P1 map: source PRD and Sprint define the gap; `docs/researches/`, `docs/reference-configs/`, `plans/`, and `tasks/` are the authoritative filing surfaces.
  - P2 trace: Sprint row HE-01 -> plan -> task contract -> research document -> review -> sprint checkbox.
  - P3 decision rationale: a docs-only contract preserves the sprint evidence without widening runtime allowed paths.

## Workflow Inventory

- Active plan: `plans/plan-20260616-HE-01-harness-research-baseline.md`
- Task contract: `tasks/contracts/20260616-HE-01-harness-research-baseline.contract.md`
- Task review: `tasks/reviews/20260616-HE-01-harness-research-baseline.review.md`
- Implementation notes: `tasks/notes/20260616-HE-01-harness-research-baseline.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260616-HE-01-harness-research-baseline.contract.md` `allowed_paths`
- Concurrency rule: this work is isolated in `/Users/ancienttwo/Projects/agentic-dev-wt-harness-engineering-optimization`.
- Execution isolation: this plan is already executing in the sprint worktree; no nested worktree is needed for a docs-only baseline.

## Approach

### Strategy

Create one repo-local research artifact that maps external harness patterns to
repo-harness surfaces, then record the task contract/review evidence and update
the Sprint row checkboxes.

### Trade-offs

| Option | Pros | Cons | Decision |
|---|---|---|---|
| Full runtime implementation first | Faster toward code changes | Later rows would lack a stable basis | Rejected |
| Research-only without contract/review | Lightweight | Weak sprint audit trail | Rejected |
| Docs-only contract and review | Small, auditable, scoped | Adds filing overhead | Selected |

## Detailed Design

### File Changes

| File | Action | Description |
|---|---|---|
| `docs/researches/20260616-harness-engineering-frameworks.md` | add | External patterns, repo mapping, gaps, 10 rules |
| `plans/plan-20260616-HE-01-harness-research-baseline.md` | add | Execution plan |
| `tasks/contracts/20260616-HE-01-harness-research-baseline.contract.md` | add | Docs-only done gate |
| `tasks/reviews/20260616-HE-01-harness-research-baseline.review.md` | add | Review outcome |
| `tasks/notes/20260616-HE-01-harness-research-baseline.notes.md` | add | Task-local decisions |
| `plans/sprints/20260617-Sprint: Harness Engineering Optimization - State, Review, Eval, Delegation.md` | update | HE-01 checkbox completion |

### Data Flow

Sprint row HE-01 names the research deliverable and plan path. The plan narrows
scope to docs-only evidence. The contract validates file existence, the 10-rule
section, and workflow checks. The review records pass/fail and residual risk.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| Research repeats PRD prose without repo mapping | Medium | Medium | Include explicit repo surface table |
| External links drift | Medium | Low | Cite stable source URLs and keep claims bounded |
| Docs-only task widens runtime scope | Low | Medium | Contract allowed paths exclude `src/` and root `tests/` |

## Task Contracts

- Contract file: `tasks/contracts/20260616-HE-01-harness-research-baseline.contract.md`
- Review file: `tasks/reviews/20260616-HE-01-harness-research-baseline.review.md`
- Implementation notes file: `tasks/notes/20260616-HE-01-harness-research-baseline.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260616-HE-01-harness-research-baseline.contract.md --strict --read-only`
- Active plan rule: this worktree branch owns this sprint slice; do not infer ownership from the primary dirty worktree.

## Evidence Contract

- **State/progress path**: HE-01 row in `plans/sprints/20260617-Sprint: Harness Engineering Optimization - State, Review, Eval, Delegation.md`
- **Verification evidence**: `grep -n "Harness Engineering 10 Rules" docs/researches/20260616-harness-engineering-frameworks.md`; `bash scripts/verify-contract.sh --contract tasks/contracts/20260616-HE-01-harness-research-baseline.contract.md --strict --read-only`; `bash scripts/check-task-workflow.sh --strict`
- **Evaluator rubric**: research doc exists, includes cited external patterns, maps repo surfaces, includes 10 rules, and no runtime source edits are included.
- **Stop condition**: HE-01 row is checked, review recommends pass, and staged diff contains only source artifacts plus HE-01 docs/plans/review files.
- **Rollback surface**: remove the HE-01 files and restore the Sprint HE-01 row to unchecked.

## Agent Progress Checklist

### Discovery
- [x] Read AGENTS.md / CLAUDE.md
- [x] Read active sprint row
- [x] Read relevant docs/reference-configs
- [x] Identify allowed_paths
- [x] Identify verification commands

### Implementation
- [x] Confirm active plan is Approved/Executing
- [x] Confirm active worktree marker matches current worktree
- [x] Edit only allowed paths
- [x] Update notes for non-obvious decisions
- [x] Keep deferred goals in tasks/todos.md only if truly deferred

### Verification
- [x] Run task-specific tests
- [x] Run workflow checks
- [ ] Generate latest checks trace
- [x] Fill review file
- [x] Fill Human Review Card
- [x] Record residual risks

### Closeout
- [x] Contract fulfilled
- [x] Review recommends pass
- [x] External acceptance pass/manual override/not-required is recorded
- [x] Sprint row completed
- [ ] Handoff refreshed
- [ ] Plan archived or ready for PR closeout

## Task Breakdown

- [x] Create research doc with external patterns, repo mapping, gap analysis, and 10 rules.
- [x] Create docs-only task contract.
- [x] Create review and notes artifacts.
- [x] Update Sprint HE-01 row and checklist.
- [x] Stage HE-01 artifact batch.
