# Plan: PR 67 Deploy SQL Policy Fix

> **Status**: Executing
> **Created**: 20260713-1413
> **Slug**: pr67-deploy-sql-policy-fix
> **Planning Source**: waza-think
> **Orchestration Kind**: contract-worktree
> **Source Ref**: Ancienttwo/repo-harness#67 review remediation approved by user
> **Artifact Level**: work-package
> **Promotion Reason**: security_boundary
> **Verification Boundary**: Focused adversarial fixtures, full check-ci, strict workflow, architecture, adoption dry-run, installed tarball smoke, and remote PR CI.
> **Rollback Surface**: Revert the single PR branch commit or restore PR head 0bfbb657 with force-with-lease before merge. The rebuilt branch is based on `origin/main` at `f248e76f`.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260713-1413-pr67-deploy-sql-policy-fix.contract.md`
> **Task Review**: `tasks/reviews/20260713-1413-pr67-deploy-sql-policy-fix.review.md`
> **Implementation Notes**: `tasks/notes/20260713-1413-pr67-deploy-sql-policy-fix.notes.md`

## Agentic Routing
- Selected route: waza-check-remediation
- Routing reason: Captured from waza-think planning output.
- Source ref: Ancienttwo/repo-harness#67 review remediation approved by user
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260713-1413-pr67-deploy-sql-policy-fix.md`
- Sprint contract: `tasks/contracts/20260713-1413-pr67-deploy-sql-policy-fix.contract.md`
- Sprint review: `tasks/reviews/20260713-1413-pr67-deploy-sql-policy-fix.review.md`
- Implementation notes: `tasks/notes/20260713-1413-pr67-deploy-sql-policy-fix.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260713-1413-pr67-deploy-sql-policy-fix.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260713-1413-pr67-deploy-sql-policy-fix.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260713-1413-pr67-deploy-sql-policy-fix.md`.

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
- Contract file: `tasks/contracts/20260713-1413-pr67-deploy-sql-policy-fix.contract.md`
- Review file: `tasks/reviews/20260713-1413-pr67-deploy-sql-policy-fix.review.md`
- Implementation notes file: `tasks/notes/20260713-1413-pr67-deploy-sql-policy-fix.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260713-1413-pr67-deploy-sql-policy-fix.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260713-1413-pr67-deploy-sql-policy-fix.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR branch commit or restore PR head 0bfbb657 with force-with-lease before merge.
- **Verification boundary**: Focused adversarial fixtures, full check-ci, strict workflow, architecture, adoption dry-run, installed tarball smoke, and remote PR CI.
- **Review/acceptance boundary**: `tasks/reviews/20260713-1413-pr67-deploy-sql-policy-fix.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: security_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260713-1413-pr67-deploy-sql-policy-fix.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260713-1413-pr67-deploy-sql-policy-fix.contract.md`, `tasks/reviews/20260713-1413-pr67-deploy-sql-policy-fix.review.md`, and `tasks/notes/20260713-1413-pr67-deploy-sql-policy-fix.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260713-1413-pr67-deploy-sql-policy-fix.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single PR branch commit or restore PR head 0bfbb657 with force-with-lease before merge.

## Captured Planning Output

## Architecture Map

- Source of truth: `.ai/harness/policy.json#operations.deploy_sql`.
- Runtime path: `repo-harness run check-deploy-sql-order` resolves the packaged helper, parses policy, validates roots and SQL files, then participates in strict workflow and CI gates.
- Distribution surfaces: self-host `scripts/`, packaged `assets/templates/helpers/`, generated policy seeds, hooks, the deploy skill, and public deploy guidance.
- Out of scope: SQL execution, migrations, compatibility fallbacks, new dependencies, unrelated workflow cleanup, and changes to other active worktrees.

## Concrete Trace

1. Read the optional `operations.deploy_sql` object from the target repo policy.
2. Validate a canonical set of roots and naming modes without a forgeable control-character protocol.
3. Enumerate every regular or symlinked `deploy/**/*.sql` path; reject symlinks, unowned files, nested files, bad names, and duplicate ordered prefixes.
4. If an invariant path is explicitly configured, require that file to exist. In multi-root configured mode, require full repo-relative path references so duplicate basenames cannot create a hollow green.
5. Preserve the existing `--root deploy/sql` command contract as a same-authority assertion; reject any other value and do not create an alternate path authority.
6. Keep source, packaged helper, generated policy language, hooks, deploy skill, and docs semantically aligned.

## Design Decision

- Keep the existing Bash helper and inline Bun policy parser; close the unsafe protocol with strict control-character and canonical-path validation rather than introducing a parser abstraction or dependency.
- Preserve the existing `--root deploy/sql` option because it is an existing command contract, not a compatibility fallback; it remains an assertion only and never overrides policy.
- Default behavior remains `deploy/sql` plus `ordered4`; explicit per-repo policy is the only override authority.
- At 10x root/file count, repeated `find` and invariant `grep` work fails first, but repo-scale migration sets remain small and no performance abstraction is justified in this slice.

## In Scope

- Rebuild PR #67 from current `main` (`f248e76f`), excluding commit `3bf58a8` and all unrelated workflow artifacts.
- Apply the intended configurable deploy-SQL feature.
- Fix control-character record injection, missing explicit invariant files, cross-root basename collisions, SQL symlink omission, and silent `--root` removal.
- Synchronize existing policy, hook, skill, partial, and deploy guidance surfaces that otherwise contradict the new authority.
- Add regression tests for every reproduced blocker and installed-runtime/CLI behavior.
- Update only this work-package plan, contract, notes, review, current-status projection, and any architecture/workstream artifacts required by repository gates.

## Out of Scope

- Executing or moving SQL migrations.
- Modifying Ancienttwo/aiphabee.
- Adding dependencies, schema packages, compatibility aliases, migration layers, telemetry, or broad refactors.
- Editing root checkout untracked files or unrelated active plans/worktrees.
- Merging PR #67 before remote CI is green.

## Verification

- `bun test --timeout 60000 --max-concurrency 4 tests/helper-scripts.test.ts tests/hook-runtime.test.ts tests/action-command-skills.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts tests/workflow-contract.test.ts`
- `bash scripts/check-ci.sh`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bun src/cli/index.ts adopt --repo . --dry-run`
- isolated `npm pack` install and `repo-harness run check-deploy-sql-order` smoke with configured roots
- GitHub PR #67 reports mergeable and all remote checks green after the guarded branch update

## Task Breakdown

- [x] Rebuild the PR feature on current main and freeze the allowed-path contract.
- [x] Harden deploy-SQL policy parsing, file enumeration, invariant checks, and CLI behavior with regression tests.
- [x] Synchronize policy-owned hook, skill, template, and deploy guidance surfaces without adding a new authority.
- [x] Run focused, full, workflow, architecture, adoption, and installed-package verification after rebasing onto the current remote main.
- [ ] Complete review artifacts, update PR #67 with force-with-lease, and confirm remote CI/mergeability.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
