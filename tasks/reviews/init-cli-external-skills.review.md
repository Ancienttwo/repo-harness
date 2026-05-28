# Sprint Review: init-cli-external-skills

> **Status**: Complete
> **Plan**: plans/plan-20260528-1906-init-cli-external-skills.md
> **Contract**: tasks/contracts/init-cli-external-skills.contract.md
> **Notes File**: tasks/notes/init-cli-external-skills.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-05-28 21:52
> **Recommendation**: pass

## Mode Evidence

- Selected route: direct implementation and local verification.
- P1/P2/P3 evidence: recorded in the source plan, implementation notes, and 2026-05-28 workflow-semantics correction in `tasks/research.md`.
- Root cause or plan evidence: workflow state still encoded a single active-plan/todo projection lock; user correction required per-worktree active markers, deferred-only todo, and review completion after check evidence.

## Verification Evidence

- Commands run:
  - `bun test tests/helper-scripts.test.ts tests/hook-runtime.test.ts tests/workflow-contract.test.ts tests/migration-script.test.ts tests/bootstrap-files.test.ts tests/create-project-dirs.runtime.test.ts tests/agents-assembly.test.ts tests/scaffold-parity.test.ts tests/output-parity.test.ts tests/readme-dx.test.ts tests/cli/init.test.ts`
  - `bun test tests/cli/init.test.ts tests/installed-copy-sync.test.ts tests/workflow-contract.test.ts tests/migration-script.test.ts tests/skill-version.test.ts tests/run-skill-evals.test.ts`
  - `bun test tests/cli/init.test.ts tests/readme-dx.test.ts`
  - `bun test` (422 pass, 6 skip, 0 fail)
  - `bash scripts/check-deploy-sql-order.sh`
  - `bash scripts/check-task-sync.sh`
  - `bash scripts/check-task-workflow.sh --strict`
  - `bun scripts/inspect-project-state.ts --repo . --format text`
  - `bash scripts/migrate-project-template.sh --repo . --dry-run`
  - `bun src/cli/index.ts init --target codex`
  - `bash scripts/verify-sprint.sh` (first rerun exposed stale contract YAML/manual-check evidence; after the contract fix and post-bash evidence-preservation fix, rerun passed and wrote `.ai/harness/runs/run-20260528T214702-70935-init-cli-external-skills.json`)
- Manual checks:
  - README DX contract now targets `agentic-dev init --dry-run`.
  - Active plan/todo markers were aligned with this init CLI slice.
  - Active plan is now selected by `.ai/harness/active-plan` for this worktree, with `.ai/harness/active-worktree` recording `/Users/ancienttwo/Projects/agentic-dev`.
  - `tasks/todo.md` is a deferred-goal ledger; active execution remains in the plan `## Task Breakdown`.
  - `tasks/reviews/<slug>.review.md` is now documented as filled from Waza `/check` after verification evidence.
  - `~/.codex/skills/project-initializer` and `~/.claude/skills/project-initializer` are absent after installed-copy sync.
  - `~/.codex/skills/check`, `~/.codex/skills/health`, and `~/.codex/skills/diagram-design` are present.
- Supporting artifacts:
  - `tasks/notes/init-cli-external-skills.notes.md`
  - `tasks/todo.md`
  - `.ai/harness/checks/latest.json`
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/runs/run-20260528T214702-70935-init-cli-external-skills.json`

## Behavior Diff Notes

- `agentic-dev init` becomes the first-run existing-repo command.
- Multiple active plans are allowed across worktrees; the marker is per worktree and no longer falls back to "latest plan" as an implicit global active lock.
- `plan-to-todo.sh` creates contract/review/notes and marks the plan executing, but leaves `tasks/todo.md` as a deferred-goal ledger instead of copying task breakdowns.
- `contract-worktree finish` uses active markers for verification, then removes local runtime markers before commit/merge so they do not enter the contract commit.
- `project-initializer` installed aliases are cleanup targets rather than maintained compatibility roots.
- Self-init also refreshed generated runtime adapter/context surfaces under `.ai/` and `.codex/`.

## Residual Risks / Follow-ups

- The first local init attempt failed only at Waza install because npm had a stale `_npx` cache rename conflict (`ENOTEMPTY`). Rerunning with an isolated npm cache succeeded; no repo code change was needed.
- `bash scripts/verify-sprint.sh` initially failed because this contract had stale completion evidence inside the YAML code fence and an unsupported manual check. The contract was corrected before final structured verification.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Init covers cwd default, host adapters, Waza, diagram-design, harness apply, and verification |
| Product depth | 8/10 | First-run docs and skill routing now match operator behavior |
| Design quality | 8/10 | Init orchestrates existing primitives and dry-run avoids host mutations |
| Code quality | 9/10 | CLI and migration behavior are covered by targeted and full test gates |

## Failing Items

- None.

## Retest Steps

- Re-run root required checks from `AGENTS.md` before release tagging.

## Summary

- `agentic-dev init` is implemented and verified, retired installed aliases are removed locally, and Codex runtime initialization succeeded.
