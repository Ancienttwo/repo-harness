# BDD² Experiment A Report

> **Decision**: Kill
> **Source commit**: `9918283b38ef6bf92adab64cfc2a3c11e9987c70`
> **Raw evidence**: `.ai/harness/runs/bdd2/bdd2-e03-audit-a-v1` (ignored; local evaluation evidence)
> **Packets / locked scores**: 48 / 48
> **Evidence grade**: condition-blind Agent-panel proxy; this is not a human-panel claim.

## Metrics

| Condition | Precision | Seeded recall | P0/P1 recall | Clean FP | Correct no-findings | Severity agreement | P0/P1 underestimation | Median correction minutes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 21.1% | 100.0% | 100.0% | 50.0% | 16.7% | 83.3% | 0 | 6 |
| treatment | 35.3% | 100.0% | 100.0% | 25.0% | 75.0% | 100.0% | 2 | 2 |

## Treatment gates

| Gate | Result |
|---|---|
| precision | FAIL |
| seeded_recall | PASS |
| severe_seeded_recall | PASS |
| clean_false_positive_rate | FAIL |
| correct_no_findings_rate | FAIL |
| severity_agreement_rate | PASS |
| no_severe_underestimation | FAIL |

## Decision rationale

The decision is computed from the frozen rules in `evals/bdd2/metrics/audit-metrics.md`; it is not manually overridden. Agent adjudication is proxy evidence and may share model-family biases with the evaluated outputs.

<!-- generated-core-end -->

## Evidence grade and adjudication protocol

The metric and gate sections above are the deterministic output of the frozen
runner. This section records evidence limits and is not an input to the decision.

- All 48 outputs were produced from clean source commit `9918283` with the frozen
  `codex-cli 0.144.1`, `gpt-5.6-sol`, xhigh, ephemeral, read-only profile. Every
  packet completed successfully; the validator reconstructed every hashed authority
  path from the recorded source commit before accepting scores.
- Final scoring used four non-overlapping condition-blind batches. Each batch held
  one response per task, so a scorer never saw sibling responses for the same task.
  It received only the blind response, original task input, and that task's frozen
  truth issues for matching; condition, prompt, private coordinate, and agent command
  were absent. All 48 locked score files passed schema, identity, exact-coordinate,
  duplicate-match, and source-authority validation before reveal.
- Scoring used isolated temporary workspace and HOME directories with a minimal
  environment. The evaluated outputs and adjudicators used the same model family,
  each packet had one final scorer, and no human or overlapping independent rating
  was obtained. The result is therefore Agent-panel proxy evidence; it does not
  measure inter-rater disagreement or establish human-review performance.
- The held-out implementations and exhaustive truth are synthetic evaluation
  fixtures. They support this bounded comparison but do not prove production defect
  prevalence or user value.

`evals/bdd2/reports/experiment-a-evidence.json` is the generated durable 48-row v2
projection. It retains each reported severity, matched truth severity, severity
distance/agreement, and P0/P1-underestimation result, and binds every packet to the
source-run manifest plus blind, private, and score hashes. Ignored raw packets and
adjudication inputs remain local provenance cache.

## Final decision interpretation

Treatment improved precision from 21.1% to 35.3%, reduced clean-fixture false
positives from 50.0% to 25.0%, and raised correct no-findings from 16.7% to 75.0%.
It detected all seeded and P0/P1 issues, but still missed the absolute precision,
clean-FP, and no-findings gates and underestimated the seeded P0 bulk-purge issue as
P1 in both treatment repetitions. The pre-registered decision is therefore `Kill`.

Audit productization is not authorized. Experiment E, Experiment I, a public BDD
skill/CLI/MCP/hook, catalog, sidecar, lifecycle, and `/check` integration remain
forbidden under the Phase E gate. Current authority is the non-runnable
`bdd2-experiment-a-kill-foundation-v2`; the sealed v1 source commit remains the
historical result authority and is validated only through explicit historical
evidence commands.
