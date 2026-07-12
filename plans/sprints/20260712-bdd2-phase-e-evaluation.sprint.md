# Sprint: BDD² Phase E Evaluation

> **Status**: Done
> **Source PRD**: `plans/prds/20260712-0409-bdd2-shape-audit.prd.md`
> **Decision**: Phase E complete; Phase P productization is not approved.

```yaml
sprint_id: 20260712-bdd2-phase-e-evaluation
status: Done
target_branch: main
risk: high
owners:
  product: kito
  engineering: Codex
  reviewer: owner-authorized-blind-agent-panel
```

## Sprint Goal

Determine whether BDD² shape, audit, Browser evidence, and ImageGen prototype
treatments produce net benefit before any public skill or workflow integration is
built. Every hypothesis has its own gate and evidence; a failure stops dependent
rows rather than being rationalized into product code.

## PRD

Execute only Phase E from the approved BDD² PRD. The Sprint must first establish a
reproducible evaluation authority, then test Shape and Audit independently, and only
then permit the Browser/ImageGen adapter experiments and implementation pilot. Phase
P productization remains forbidden until the final recorded gate decision.

## Backlog

| # | Status | Task | Mode | Acceptance | Plan |
|---:|---|---|---|---|---|
| 1 | [x] | BDD2-E-01 — Freeze evaluation authority and build reproducible runner foundation | contract | Manifest/hash drift fails closed; agent packets exclude truth and treatment identity; deterministic stub runs pass; no Phase P surface is added. | `plans/plan-20260712-0450-bdd2-eval-foundation.md` |
| 2 | [x] | BDD2-E-02 — Run Experiment S: shape hypothesis | contract | 12 held-out tasks × 2 conditions × 3 runs complete; blind adjudication reports unsupported expansion and required/protected omission; decision is `Reshape` in merged PR #59. | `plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md` |
| 3 | [x] | BDD2-E-03 — Run Experiment A: audit hypothesis | contract | 48/48 outputs and scores completed; decision `Kill` in merged PR #60. | `plans/plan-20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.md` |
| 4 | [x] | BDD2-E-04 — Run Experiment E: Browser and ImageGen adapter hypotheses | contract | Gated-not-run because S/A did not both pass; Browser=`Defer` and ImageGen=`Defer`, with no efficacy claim. | `evals/bdd2/reports/phase-e-gate.md` |
| 5 | [x] | BDD2-E-05 — Run Experiment I: implementation pilot | contract | Gated-not-run because S/A did not both pass; implementation pilot=`Defer`. | `evals/bdd2/reports/phase-e-gate.md` |
| 6 | [x] | BDD2-E-06 — Record Phase E gate decision | contract | Shape=`Reshape`, Audit=`Kill`, Browser/ImageGen/I=`Defer`; merged as PR #61 and Phase P remains unauthorized. | `plans/archive/plan-20260712-2213-bdd2-e-06-record-phase-e-gate-decision.md` |

## Ordering and Stop Rules

- E-01 is the shared authority boundary and ships as its own PR.
- E-02 and E-03 use the same frozen foundation but make separate product claims;
  each ships as an independently reviewable PR.
- E-04 does not run when either core hypothesis fails. Browser and ImageGen are
  retained as first-class adapter experiments, not bundled into core treatment.
- E-05 does not run until the separate shape and audit gates pass.
- Any prompt, fixture, rubric, model, or sampling change after freeze creates a new
  evaluation revision; it never silently updates an in-flight run.
- No row may add public `repo-harness-bdd`, CLI/MCP mutation tools, hooks,
  `/check` integration, Behavior Brief catalog/validator, sidecar, or lifecycle.

## Definition of Done

- [x] All applicable experiment rows have immutable run coordinates and raw
  evidence under ignored `.ai/harness/runs/bdd2/`.
- [x] Blind adjudication and aggregate reports contain every PRD metric, including
  negative and protected-concern measures.
- [x] Development and held-out material are separated and leakage checks pass.
- [x] Every dependent gate records why it proceeded or stopped.
- [x] The owner-approved frozen decision protocol has been applied without override
  and the E-06 closeout has merged;
  Phase P remains unapproved and no Phase P plan exists.

## Execution Log

| When | Task | Plan | Result |
|------|------|------|--------|
| 2026-07-12 06:05 | BDD2-E-01 — Freeze evaluation authority and build reproducible runner foundation | `plans/plan-20260712-0450-bdd2-eval-foundation.md` | done |
| 2026-07-12 17:56 | BDD2-E-02 — Run Experiment S | `plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md` | `Reshape`, PR #59 |
| 2026-07-12 22:12 | BDD2-E-03 — Run Experiment A | `plans/plan-20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.md` | `Kill`, PR #60 |
| 2026-07-12 22:13 | BDD2-E-04/E-05 prerequisite resolution | `evals/bdd2/reports/phase-e-gate.md` | gated-not-run; `Defer` |
| 2026-07-12 22:41 | BDD2-E-06 — Record Phase E gate decision | `plans/archive/plan-20260712-2213-bdd2-e-06-record-phase-e-gate-decision.md` | merged PR #61; Phase E complete |
