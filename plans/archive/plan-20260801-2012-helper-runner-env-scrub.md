# Plan: Scrub REPO_HARNESS_* env from bounded verifier child commands

> **Status**: Archived
> **Created**: 20260801-2012
> **Slug**: helper-runner-env-scrub
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260801-2012-helper-runner-env-scrub.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260801-2012-helper-runner-env-scrub.md`; after execution revert branch `codex/helper-runner-env-scrub` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260801-2012-helper-runner-env-scrub.contract.md`
> **Task Review**: `tasks/reviews/20260801-2012-helper-runner-env-scrub.review.md`
> **Implementation Notes**: `tasks/notes/20260801-2012-helper-runner-env-scrub.notes.md`

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

- Active plan: `plans/plan-20260801-2012-helper-runner-env-scrub.md`
- Sprint contract: `tasks/contracts/20260801-2012-helper-runner-env-scrub.contract.md`
- Sprint review: `tasks/reviews/20260801-2012-helper-runner-env-scrub.review.md`
- Implementation notes: `tasks/notes/20260801-2012-helper-runner-env-scrub.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260801-2012-helper-runner-env-scrub.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260801-2012-helper-runner-env-scrub.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260801-2012-helper-runner-env-scrub.md`.

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
- Contract file: `tasks/contracts/20260801-2012-helper-runner-env-scrub.contract.md`
- Review file: `tasks/reviews/20260801-2012-helper-runner-env-scrub.review.md`
- Implementation notes file: `tasks/notes/20260801-2012-helper-runner-env-scrub.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260801-2012-helper-runner-env-scrub.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260801-2012-helper-runner-env-scrub.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260801-2012-helper-runner-env-scrub.md`; after execution revert branch `codex/helper-runner-env-scrub` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260801-2012-helper-runner-env-scrub.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260801-2012-helper-runner-env-scrub.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260801-2012-helper-runner-env-scrub.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260801-2012-helper-runner-env-scrub.contract.md`, `tasks/reviews/20260801-2012-helper-runner-env-scrub.review.md`, and `tasks/notes/20260801-2012-helper-runner-env-scrub.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260801-2012-helper-runner-env-scrub.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260801-2012-helper-runner-env-scrub.md`; after execution revert branch `codex/helper-runner-env-scrub` or the explicitly reviewed diff.

## Captured Planning Output

## Problem

`src/cli/runtime/helper-runner.ts:375-391` injects `REPO_HARNESS_*` variables
(`HELPER_SOURCE_PATH`, `TARGET_REPO_ROOT`, `BASH_BIN`, `GIT_BIN`, `BUN_BIN`,
`WORKFLOW_STATE_LIB`, conditional `GH_BIN`) into every package-dispatched helper
child. Those variables inherit down `verify-sprint.sh` -> `verify-contract.sh` ->
nested `bun test`, so a project verification command runs in a mutated
environment. `REPO_HARNESS_TARGET_REPO_ROOT` alone makes
`tests/evidence-recovery-materializer.test.ts:220` fail by overriding the
fixture's temp-repo isolation, inverting the evidence the gate exists to produce.

## Decision

Keep the helper-runner injection (it is the legitimate contract of the
package-dispatched helper mechanism). Fix at the verification-command spawn
layer: `scripts/run-bounded-verifier-command.ts` strips every `REPO_HARNESS_*`
prefixed variable from the child environment before spawning, so a bounded
verifier command observes the project's real command behaviour in a clean
environment. The scrub is whole-prefix, not a curated list: the boundary is
"harness-internal wiring does not reach the command under verification".

The runner itself reads no `REPO_HARNESS_*` variable, so nothing is retained for
its own use.

## Task Breakdown

- [ ] Scrub `REPO_HARNESS_*` from the child env in
      `scripts/run-bounded-verifier-command.ts`
- [ ] Mirror into `assets/templates/helpers/run-bounded-verifier-command.ts`
      via `bun scripts/sync-helper-sources.ts --write`
- [ ] Add regression coverage in
      `tests/unit/verifier-evidence-lifecycle-cutover.test.ts`: child env has no
      `REPO_HARNESS_*` when the parent sets them, and unrelated env passthrough
      is unchanged
- [ ] Retire the deferred entry in `tasks/todos.md`

## Verification

- `bun test tests/unit/verifier-evidence-lifecycle-cutover.test.ts`
- `bun test tests/evidence-recovery-materializer.test.ts` under the six injected
  variables (before: 12 pass / 1 fail; after: 13 pass / 0 fail)
- `bun test`
- `bun scripts/sync-helper-sources.ts --check`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Scrub `REPO_HARNESS_*` from the child env in
- [ ] Mirror into `assets/templates/helpers/run-bounded-verifier-command.ts`
- [ ] Add regression coverage in
- [ ] Retire the deferred entry in `tasks/todos.md`
