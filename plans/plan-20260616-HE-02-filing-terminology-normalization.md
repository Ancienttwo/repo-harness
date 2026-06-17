# Plan: HE-02 Filing and Terminology Normalization Gate

> **Status**: Approved
> **Created**: 2026-06-17
> **Slug**: HE-02-filing-terminology-normalization
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260616-harness-engineering-frameworks.md`
> **Task Contract**: `tasks/contracts/20260616-HE-02-filing-terminology-normalization.contract.md`
> **Task Review**: `tasks/reviews/20260616-HE-02-filing-terminology-normalization.review.md`
> **Implementation Notes**: `tasks/notes/20260616-HE-02-filing-terminology-normalization.notes.md`

## Agentic Routing

- Selected route: migration task contract
- Routing reason: HE-02 changes shared workflow terminology in templates, helpers, docs, and tests.
- Due diligence:
  - P1 map: authoritative surfaces are `.claude/templates/`, `assets/templates/`, `assets/templates/helpers/`, root helper scripts, `docs/reference-configs/sprint-contracts.md`, and `tests/helper-scripts.test.ts`.
  - P2 trace: `new-plan.sh` / `capture-plan.sh` / `ensure-task-workflow.sh` generate plan metadata; `plan-to-todo.sh` generates review scaffolding; `check-task-workflow.sh` validates active generation surfaces.
  - P3 decision rationale: use `Task Contract` / `Task Review` for new artifacts while preserving legacy filenames and parser fallback for old plans.

## Workflow Inventory

- Active plan: `plans/plan-20260616-HE-02-filing-terminology-normalization.md`
- Task contract: `tasks/contracts/20260616-HE-02-filing-terminology-normalization.contract.md`
- Task review: `tasks/reviews/20260616-HE-02-filing-terminology-normalization.review.md`
- Implementation notes: `tasks/notes/20260616-HE-02-filing-terminology-normalization.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260616-HE-02-filing-terminology-normalization.contract.md` `allowed_paths`
- Execution isolation: current sprint worktree `codex/harness-engineering-optimization`

## Approach

### Strategy

Normalize new generated artifact terminology and add a strict workflow gate that
fails when generation surfaces still emit legacy task artifact terminology or
legacy workflow paths.

### Trade-offs

| Option | Pros | Cons | Decision |
|---|---|---|---|
| Rename legacy scripts such as `verify-sprint.sh` | Perfect terminology | Breaks downstream compatibility | Rejected |
| Keep all old wording | Zero churn | Preserves reviewer confusion | Rejected |
| New artifact wording with legacy parser fallback | Clear forward path and compatibility | Checker must distinguish generation from migration text | Selected |

## Detailed Design

### File Changes

| File | Action | Description |
|---|---|---|
| `.claude/templates/*.template.md` | update | Use Task Contract / Task Review headings and metadata |
| `assets/templates/*.template.md` | update | Keep package templates in sync |
| `scripts/*plan*.sh`, `scripts/ensure-task-workflow.sh`, `scripts/plan-to-todo.sh` | update | Generate Task Contract / Task Review labels |
| `assets/templates/helpers/*` | update | Keep adopted-repo helper copies aligned |
| `scripts/check-task-workflow.sh` | update | Parse Task Contract first, Sprint Contract as legacy fallback; add generation-surface drift gate |
| `docs/reference-configs/sprint-contracts.md` | update | Document task-contract terminology and legacy filename compatibility |
| `tests/helper-scripts.test.ts` | update | Cover new labels and strict failure for legacy generation surfaces |

### Data Flow

Plan generator writes `> **Task Contract**:` and `> **Task Review**:`. The
workflow checker resolves `Task Contract` first and falls back to legacy
`Sprint Contract` so old plans remain readable. The strict generation-surface
gate scans templates and new-artifact generators only, avoiding false positives
from migration code that intentionally mentions legacy paths.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| Breaking old active plans | Medium | High | Parser keeps `Sprint Contract` fallback |
| Adopted repos keep old wording | Medium | Medium | Updated both root scripts/templates and package `assets/` copies |
| Migration scripts get false-positive blocked | Medium | Medium | Gate scans generation surfaces, not migration detectors |

## Evidence Contract

- **State/progress path**: HE-02 row in `plans/sprints/20260617-Sprint: Harness Engineering Optimization - State, Review, Eval, Delegation.md`
- **Verification evidence**: `bun test tests/helper-scripts.test.ts`; `bash scripts/check-task-workflow.sh --strict`; active generation-surface `rg` for `Sprint Contract|Sprint Review`
- **Evaluator rubric**: generated artifacts use Task Contract/Task Review, strict check catches legacy generation wording, and legacy filenames remain compatible.
- **Stop condition**: HE-02 review recommends pass and staged diff contains only HE-02 surfaces plus Sprint checkbox updates.
- **Rollback surface**: revert HE-02 file edits and restore Sprint HE-02 row/checklist to unchecked.

## Agent Progress Checklist

### Discovery
- [x] Inventory current path constants from `.ai/harness/policy.json`
- [x] Search repo for stale path strings and legacy task artifact terminology
- [x] Identify active generation surfaces versus migration/legacy detection code

### Implementation
- [x] Update templates to use `Task Contract` and `Task Review`
- [x] Keep legacy script filenames documented as compatibility names
- [x] Add strict workflow detection for stale generated terminology and paths
- [x] Add fix text for `tasks/todo.md` and `tasks/sprints/` drift
- [x] Update tests for generated labels and strict detection

### Verification
- [x] Run `bun test tests/helper-scripts.test.ts`
- [x] Run `bash scripts/check-task-workflow.sh --strict`
- [x] Confirm active generation surfaces no longer emit `Sprint Contract` / `Sprint Review`

### Closeout
- [x] Contract fulfilled
- [x] Review recommends pass
- [x] External acceptance not required for local migration slice
- [x] Sprint row completed
- [ ] Stage HE-02 artifact batch

## Task Breakdown

- [x] Normalize generated plan/review/contract wording.
- [x] Preserve legacy parser fallback.
- [x] Add strict generation-surface drift gate.
- [x] Update tests.
- [x] Stage HE-02 artifact batch.
