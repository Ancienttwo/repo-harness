# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: 2026-07-13 00:47
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| Interactive `codex` `/agent` check confirming the six `.codex/agents/*.toml` load on cli 0.144.1 | No automatable introspection surface on this codex-cli version (C2 smoke inconclusive, not failing) | Fleet TOMLs are schema-valid but end-to-end recognition unproven | First interactive Codex session in this repo |
| BDD² revival (new product thesis + new intervention) | The browser branch's revival condition is met: a new product thesis and new intervention are captured as the approved eval-only work-package `plans/plan-20260713-1336-bdd3-ea1-typed-browser-evidence-authority.md` (BDD3-EA1); see `docs/researches/20260713-bdd3-ea1-direction-adjudication.md`. The general ImageGen preference/trust thesis is terminated, not revived (net-negative EI3 closure plus an unevidenced user-value claim). I3 and Phase P remain gated behind BDD3-EA1's own outcome. | BDD3-EA1 is scoped eval-only with no productization; I3 and Phase P still require a separate owner decision on top of a Pass outcome, not an automatic unlock. The killed S3/EB3/EI3 treatments and the terminated ImageGen thesis stay closed regardless of EA1's result. | BDD3-EA1 reaches its Stage B gate report (EA1-05 in the plan's Task Breakdown); I3/Phase P revisit only on that new outcome, not on a rescoring of the killed treatments |
| BDD3-PS1 Protected Shape (deferred) | Sequenced behind BDD3-EA1 so BDD3 tests one bet at a time; see `docs/researches/20260713-bdd3-ea1-direction-adjudication.md` | A protected-concern ledger exempt from compression, paired with a coverage validator, stays unbuilt until EA1 resolves; delays a second potential governance-layer intervention | BDD3-EA1 reaches its gate report (`evals/bdd3/reports/phase-ea1-gate.md`) |
| BDD3-VH1 fixed-boundary visual-hierarchy micro-test (conditional) | Conditional, not scheduled — no observed pain to test against yet; see `docs/researches/20260713-bdd3-ea1-direction-adjudication.md` | ImageGen variants vs. a structured text wireframe, measured on downstream implementation-correction rate; opening it without observed pain risks testing a synthetic preference question, the same failure mode that killed EI3 | An actually observed visual-hierarchy rework pain occurs in real work, not a calendar date |
