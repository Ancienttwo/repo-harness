# Plan: check-npm-release --prepublish fast mode

> **Status**: Executing
> **Created**: 20260804-0130
> **Slug**: prepublish-fast-gate
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260804-0130-prepublish-fast-gate.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260804-0130-prepublish-fast-gate.md`; after execution revert branch `codex/prepublish-fast-gate` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260804-0130-prepublish-fast-gate.contract.md`
> **Task Review**: `tasks/reviews/20260804-0130-prepublish-fast-gate.review.md`
> **Implementation Notes**: `tasks/notes/20260804-0130-prepublish-fast-gate.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260804-0130-prepublish-fast-gate.md`
- Sprint contract: `tasks/contracts/20260804-0130-prepublish-fast-gate.contract.md`
- Sprint review: `tasks/reviews/20260804-0130-prepublish-fast-gate.review.md`
- Implementation notes: `tasks/notes/20260804-0130-prepublish-fast-gate.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260804-0130-prepublish-fast-gate.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260804-0130-prepublish-fast-gate.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260804-0130-prepublish-fast-gate.md`.

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
- Contract file: `tasks/contracts/20260804-0130-prepublish-fast-gate.contract.md`
- Review file: `tasks/reviews/20260804-0130-prepublish-fast-gate.review.md`
- Implementation notes file: `tasks/notes/20260804-0130-prepublish-fast-gate.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260804-0130-prepublish-fast-gate.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260804-0130-prepublish-fast-gate.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260804-0130-prepublish-fast-gate.md`; after execution revert branch `codex/prepublish-fast-gate` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260804-0130-prepublish-fast-gate.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260804-0130-prepublish-fast-gate.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260804-0130-prepublish-fast-gate.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260804-0130-prepublish-fast-gate.contract.md`, `tasks/reviews/20260804-0130-prepublish-fast-gate.review.md`, and `tasks/notes/20260804-0130-prepublish-fast-gate.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260804-0130-prepublish-fast-gate.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260804-0130-prepublish-fast-gate.md`; after execution revert branch `codex/prepublish-fast-gate` or the explicitly reviewed diff.

## Captured Planning Output

# Prepublish Fast Gate

## Goal

Converge the publish-time gate: `package.json` `prepublishOnly` runs `bash scripts/check-npm-release.sh --prepublish` (already edited), and the script gains that mode — fast checks only (check:hooks, check:helpers, npm availability proof), skipping `scripts/check-ci.sh`. Default no-arg invocation stays byte-equivalent (full gate incl. check-ci) and remains the mandatory explicit release-checklist step plus CI.

## Why

The 0.13.0 release measured the same full test suite executing four times (CI, check:release, and once per publish attempt via prepublishOnly), ~11 minutes per pass — publish latency was dominated by a redundant re-run of already-green verification. The publish-time invariant that must stay fail-closed in seconds is version/package sanity (stamps consistent, version unpublished, hooks/helpers projections intact); the heavy suite already has two mandatory owners (CI + check:release on the exact release commit).

## Task Breakdown

- [ ] Add the `--prepublish` mode block to `scripts/check-npm-release.sh` (MODE default full; `"${1:-}"` guard for set -u; early-exit before `bash scripts/check-ci.sh` with an explicit OK line naming where the full suite lives).
- [ ] Verify: `bash -n`; `--prepublish` run reaches the availability proof in seconds and fails closed on the already-published 0.13.0; default path still contains check-ci.

## Rollback

Revert the two-file diff (`package.json`, `scripts/check-npm-release.sh`); no state or release artifacts touched.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Add the `--prepublish` mode block to `scripts/check-npm-release.sh` (MODE default full; `"${1:-}"` guard for set -u; early-exit before `bash scripts/check-ci.sh` with an explicit OK line naming where the full suite lives).
- [ ] Verify: `bash -n`; `--prepublish` run reaches the availability proof in seconds and fails closed on the already-published 0.13.0; default path still contains check-ci.
