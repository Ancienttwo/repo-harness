# Sprint: BDD² Phase E Evaluation

> **Status**: Approved
> **Source PRD**: `plans/prds/20260712-0409-bdd2-shape-audit.prd.md`
> **Decision**: Evaluation only; Phase P productization is not approved.

```yaml
sprint_id: 20260712-bdd2-phase-e-evaluation
status: Approved
target_branch: main
risk: high
owners:
  product: kito
  engineering: Codex
  reviewer: human-blind-panel
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
| 2 | [ ] | BDD2-E-02 — Run Experiment S: shape hypothesis | contract | 12 held-out tasks × 2 conditions × 3 runs complete; blind adjudication reports unsupported expansion and required/protected omission; pass/kill decision is recorded. | capture after E-01 merge |
| 3 | [ ] | BDD2-E-03 — Run Experiment A: audit hypothesis | contract | 12 seeded/clean held-out fixtures × 2 conditions × 2 runs complete; precision, recall, clean false-positive, severity agreement, and correct no-findings are reported with a pass/kill decision. | capture after E-01 merge |
| 4 | [ ] | BDD2-E-04 — Run Experiment E: Browser and ImageGen adapter hypotheses | contract | Starts only after S and A pass; Browser and ImageGen run as separate 6 × 2 × 2 comparisons; provenance, synthetic-evidence labeling, uncertainty closure, reviewer disagreement, and unsupported concepts are reported independently. | gated by E-02 and E-03 |
| 5 | [ ] | BDD2-E-05 — Run Experiment I: implementation pilot | contract | Starts only after S and A pass; 6 held-out tasks × 3 conditions × 2 runs complete; every new severe acceptance failure, protected-concern regression, surface delta, correction time, and later deletion is reported. | gated by E-02 and E-03 |
| 6 | [ ] | BDD2-E-06 — Record Phase E gate decision | contract | One evidence-backed Proceed / Reshape / Defer / Kill decision is recorded per hypothesis; Phase P scope is authorized only for hypotheses that passed their pre-registered threshold. | gated by all applicable rows |

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

- [ ] All applicable experiment rows have immutable run coordinates and raw
  evidence under ignored `.ai/harness/runs/bdd2/`.
- [ ] Blind adjudication and aggregate reports contain every PRD metric, including
  negative and protected-concern measures.
- [ ] Development and held-out material are separated and leakage checks pass.
- [ ] Every dependent gate records why it proceeded or stopped.
- [ ] A human-approved Phase E decision exists before any Phase P plan is created.

## Execution Log

| When | Task | Plan | Result |
|------|------|------|--------|
| 2026-07-12 06:05 | BDD2-E-01 — Freeze evaluation authority and build reproducible runner foundation | `plans/plan-20260712-0450-bdd2-eval-foundation.md` | done |
