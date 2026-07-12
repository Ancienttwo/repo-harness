# Plan: BDD² E-06 — Record Phase E Gate Decision

> **Status**: Archived
> **Created**: 20260712-2213
> **Slug**: bdd2-e-06-record-phase-e-gate-decision
> **Planning Source**: sprint-gate
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md#BDD2-E-06
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Reconcile the frozen S/A results, resolve gated E/I rows without running them, record one decision per hypothesis, and prove no Phase P surface was authorized.
> **Rollback Surface**: Revert the E-06 decision PR; historical S/A evidence remains unchanged.
> **PRD**: `plans/prds/20260712-0409-bdd2-shape-audit.prd.md`
> **Sprint**: `plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md`
> **Task Contract**: `tasks/contracts/20260712-2213-bdd2-e-06-record-phase-e-gate-decision.contract.md`
> **Task Review**: `tasks/reviews/20260712-2213-bdd2-e-06-record-phase-e-gate-decision.review.md`
> **Implementation Notes**: `tasks/notes/20260712-2213-bdd2-e-06-record-phase-e-gate-decision.notes.md`

## Goal

Close the approved evaluation protocol without productizing failed or untested
hypotheses. Record `Reshape`, `Kill`, or `Defer` from the existing immutable evidence,
mark prerequisite-gated rows as deliberately not run, and leave Phase P unauthorized.

## P1 / P2 / P3

- P1 map: the PRD owns the pre-registered stop rules; Experiment S/A reports own
  outcomes; the Sprint owns applicable-row completion; the Phase E report owns the
  final decision projection.
- P2 trace: S=`Reshape` and A=`Kill` -> E/I prerequisite false -> no adapter/pilot
  execution -> per-hypothesis decisions -> Phase P authorization false.
- P3 decision: add one human-readable gate report and synchronize existing workflow
  artifacts. Do not add a schema, sidecar, generic decision engine, compatibility
  path, new experiment, or product surface.

## Scope

### In Scope

- Record Shape=`Reshape`, Audit=`Kill`, Browser=`Defer`, ImageGen=`Defer`, and
  implementation pilot=`Defer` with evidence and stop-rule reasons.
- Mark E-03 merged as PR #60 and E-04/E-05 resolved as gated-not-run.
- Close the Sprint decision row and definition-of-done evidence.
- Run strict workflow, contract, full CI, external review, and ship one E-06 PR.

### Out of Scope

- Rerunning or reinterpreting S/A.
- Running E/I despite failed prerequisites.
- Public BDD skill, Card/Brief catalog, Browser/ImageGen implementation, CLI/MCP,
  sidecar, lifecycle, hook, or `/check` integration.
- Changing thresholds or calling missing evidence a pass/fail experiment result.

## Task Breakdown

- [x] Reconcile merged S/A reports and their evidence limitations.
- [x] Apply frozen prerequisite rules to E-04 and E-05.
- [x] Record one evidence-backed decision per hypothesis.
- [x] Synchronize the Sprint completion projection.
- [x] Complete strict verification, external acceptance, hosted checks, and merge the E-06 PR.

## Closeout

- PR #61 merged at 2026-07-12 22:41 +0800 after both Test jobs and all six MCP
  path-matrix jobs passed. Phase E is complete and Phase P remains unauthorized.

## Promotion Gate

- **Merge/PR unit**: final gate report plus Sprint/workflow closeout.
- **Rollback surface**: revert the E-06 PR; S/A evidence and runtime remain unchanged.
- **Verification boundary**: static decision regression, strict contract/workflow,
  full CI, and hosted matrix checks.
- **Review/acceptance boundary**: exact-diff Claude acceptance plus owner-approved
  frozen decision rules with no threshold override.
- **High-risk surface**: falsely authorizing Phase P, mislabeling no evidence as
  negative evidence, or silently running a gated experiment.
- **Why not checklist row**: this is the approved human/product decision boundary that
  determines whether any Phase P implementation may exist.
- **Stop**: after recording the no-productization outcome; do not begin a new evaluation
  revision or implementation slice.

## Evidence Contract

- **State/progress path**: this plan, E-06 contract/review/notes, Sprint rows 3-6,
  `tasks/current.md`, and the Phase E gate report.
- **Verification evidence**: frozen S/A reports and tracked projections already
  merged on main; static contract tests, strict workflow checks, full CI, exact-diff
  external review, and hosted PR checks.
- **Evaluator rubric**: verify exact decision labels, prerequisite logic, no Phase P
  authorization, no public product surface, and no reinterpretation of S/A metrics.
- **Stop condition**: record and merge the final no-productization gate, then stop.
- **Rollback surface**: revert the E-06 PR without modifying historical run evidence.
- **Falsifier**: any statement that E/I ran, any threshold override, or any newly
  authorized product surface makes this closeout invalid.
