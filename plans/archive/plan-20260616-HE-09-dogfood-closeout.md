# Plan: HE-09 Dogfood Closeout

> **Status**: Archived
> **Created**: 2026-06-17
> **Slug**: HE-09-dogfood-closeout
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260616-harness-engineering-frameworks.md`
> **Task Contract**: `tasks/contracts/20260616-HE-09-dogfood-closeout.contract.md`
> **Task Review**: `tasks/reviews/20260616-HE-09-dogfood-closeout.review.md`
> **Implementation Notes**: `tasks/notes/20260616-HE-09-dogfood-closeout.notes.md`

## Agentic Routing

- Selected route: migration task contract
- Routing reason: HE-09 closes and validates the full sprint diff, including workflow scripts, templates, assets, docs, tests, and filing.
- Due diligence:
  - P1 map: the sprint file owns backlog status; HE task plans/contracts/reviews/notes own per-slice evidence; `docs/CHANGELOG.md` owns release history; full checks own closeout proof.
  - P2 trace: active HE-09 plan -> task contract -> full required checks -> `verify-sprint` trace -> final review card -> staged closeout batch.
  - P3 decision rationale: use local closeout instead of default push/PR ship because this user request explicitly asks for staged phases, not commit/push/PR.

## Evidence Contract

- **State/progress path**: HE-09 row in `plans/sprints/20260617-Sprint: Harness Engineering Optimization - State, Review, Eval, Delegation.md`
- **Verification evidence**: `git status --short --branch`; root required checks; `bash scripts/verify-sprint.sh`; `bash scripts/harness-trace-grade.sh --run .ai/harness/checks/latest.json --strict`
- **Evaluator rubric**: all sprint rows are complete or explicitly closeout-ready, final review recommends pass, latest trace passes, no unrelated dirty files are included in the staged batch.
- **Stop condition**: HE-09 review is pass, full checks pass, sprint checklist is updated, changelog is updated, and all HE-09 closeout files are staged.
- **Rollback surface**: revert HE-09 plan/contract/review/notes, sprint checkbox changes, changelog entry, and any generated status refresh.

## Agent Progress Checklist

### Discovery
- [x] Read sprint HE-09 row and final definition of done.
- [x] Read repo-harness-ship protocol and confirm default PR mode is outside the staged-only user request.
- [x] Identify allowed_paths for full sprint migration closeout.

### Implementation
- [x] Create HE-09 plan, contract, notes, and final sprint review.
- [x] Add changelog entry.
- [x] Update HE-08 and HE-09 checklist state.
- [x] Record archive decision as ready for PR/local finish rather than moving files during staged-only closeout.

### Verification
- [x] Run full required checks.
- [x] Generate latest checks trace.
- [x] Grade latest trace.
- [x] Fill final review with pass evidence.

### Closeout
- [x] Contract fulfilled.
- [x] Review recommends pass.
- [x] Sprint row completed.
- [x] No unrelated dirty files are included.
- [x] Stage HE-09 artifact batch.
