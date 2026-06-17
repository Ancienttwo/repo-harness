# Task Review: HE-02 Filing and Terminology Normalization

> **Status**: Complete
> **Plan**: `plans/plan-20260616-HE-02-filing-terminology-normalization.md`
> **Contract**: `tasks/contracts/20260616-HE-02-filing-terminology-normalization.contract.md`
> **Notes File**: `tasks/notes/20260616-HE-02-filing-terminology-normalization.notes.md`
> **Checks File**: `.ai/harness/checks/latest.json`
> **Last Updated**: 2026-06-17
> **Recommendation**: pass

## Human Review Card

- Verdict: pass
- Change type: migration
- Intended files changed: templates, helper scripts, reference docs, helper tests, HE-02 plan/contract/review/notes, Sprint checkbox
- Actual files changed: templates/scripts/assets/docs/tests/plans/tasks artifacts inside the HE-02 allowed paths
- Commands passed: `bun test tests/helper-scripts.test.ts`; `bash scripts/check-task-workflow.sh --strict`
- External acceptance: not_required; local workflow terminology migration with no release or runtime behavior cutover
- Residual risks: full `bun test` still remains for whole-sprint closeout; migration scripts intentionally still mention legacy paths for detection
- Reviewer action required: confirm legacy filenames stay acceptable and new artifact wording is clearer
- Rollback: revert HE-02 template/helper/checker/test/doc edits and uncheck HE-02 in the Sprint file

## Mode Evidence

- Selected route: migration task contract
- P1 map: changed generation surfaces, package assets, workflow checker, reference docs, and helper tests.
- P2 trace: `new-plan.sh`/`capture-plan.sh` writes plan metadata -> `check-task-workflow.sh` reads `Task Contract` first -> `plan-to-todo.sh` writes Task Review scaffold.
- P3 decision: keep legacy parser fallback because old plans may still exist; do not rename legacy script filenames in this slice.

## Verification Evidence

- Waza `/check` run: not invoked for this stage; local tests and strict workflow checks passed.
- Commands run:
  - `bun test tests/helper-scripts.test.ts`
  - `bash scripts/check-task-workflow.sh --strict`
  - `rg -n "Sprint Contract|Sprint Review" ...` on active generation surfaces; remaining matches are checker fallback/test fixtures only
- Manual checks:
  - `assets/templates/` and `assets/templates/helpers/` were updated with root surfaces.
  - Strict check has actionable fix text for legacy terminology and stale path drift.
- Supporting artifacts:
  - `scripts/check-task-workflow.sh`
  - `.claude/templates/plan.template.md`
  - `assets/templates/plan.template.md`
  - `docs/reference-configs/sprint-contracts.md`
- Implementation notes reviewed: `tasks/notes/20260616-HE-02-filing-terminology-normalization.notes.md`
- Run snapshot: command output in current session

## External Acceptance Advice

> **External Acceptance**: not_required
> **External Reviewer**: none
> **External Source**: local migration slice
> **External Started**: 2026-06-17
> **External Completed**: 2026-06-17

- P1 blockers: none
- P2 advisories: run full suite during HE-09 closeout.
- Acceptance checklist:
  - [x] New generated artifact labels normalized
  - [x] Strict checker detects legacy generation terminology
  - [x] Package assets synchronized
  - [x] Targeted helper tests pass

## Behavior Diff Notes

- New plans now prefer `Task Contract` and `Task Review` metadata.
- Existing plans with `Sprint Contract` metadata still resolve through fallback.
- New review scaffolds use `# Task Review`.

## Residual Risks / Follow-ups

- HE-03 will replace the review scaffold shape with a first-class Human Review Card.
- HE-09 must run the full required checks before sprint closeout.

## Scorecard

| Dimension | Score | Notes |
|---|---:|---|
| Functionality | 9/10 | Targeted tests and strict workflow checks pass |
| Product depth | 8/10 | Clarifies PRD/Sprint/Task Contract vocabulary |
| Design quality | 8/10 | Preserves compatibility while moving new artifacts forward |
| Code quality | 8/10 | Small shell changes with fixture coverage |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/helper-scripts.test.ts`
- Re-run: `bash scripts/check-task-workflow.sh --strict`

## Summary

HE-02 normalizes new artifact terminology without removing legacy compatibility.
