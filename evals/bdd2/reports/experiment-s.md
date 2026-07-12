# BDD² Experiment S Report

> **Decision**: Reshape
> **Source commit**: `cd9e0426d362614ba277e067633db2596c236491`
> **Raw evidence**: `.ai/harness/runs/bdd2/bdd2-e02-shape-s-v2` (ignored; local evaluation evidence)
> **Packets / locked scores**: 72 / 72

## Metrics

- Unsupported expansion: baseline 48, treatment 2, relative reduction 95.8%; paired W/T/L 12/22/2.
- Required behavior omission: baseline 23, treatment 0; stable new treatment tasks: none.
- New treatment P0/P1 protected-omission pairs: 0.
- Correction minutes median: baseline 10, treatment 0, relative increase -100.0%.
- Treatment unnecessary tracked artifacts: 1.
- Incorrect authority fit: baseline 7, treatment 1.
- Incorrect escalation: baseline 12, treatment 1.

## Gates

| Gate | Result |
|---|---|
| unsupported_reduction_target | PASS |
| unsupported_wins_exceed_losses | PASS |
| required_omissions_not_higher | PASS |
| no_stable_new_required_omission | PASS |
| no_new_p0_p1_protected_omission | PASS |
| correction_cost_target | PASS |
| zero_treatment_unnecessary_tracked_artifacts | FAIL |

## Decision rationale

The decision is computed from the pre-registered rules in `evals/bdd2/metrics/shape-metrics.md`; it is not manually overridden in this report.
