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

<!-- generated-core-end -->

## Evidence grade and protocol deviation

The metric and gate sections above are the deterministic output of the frozen
runner. This section records post-run evidence limits and is not an input to the
computed decision.

- The original protocol required human scores. After the completed run remained at
  0/72 human scores for three blocked turns, the owner authorized three
  condition-blind Agent reviewers. They scored 24 non-overlapping packets each;
  all 72 score files validated before condition reveal. This is Agent-panel proxy
  evidence, not human adjudication.
- The held-out truth set was content-addressed and structurally validated, but the
  Shape rubric intentionally withheld it from blind reviewers and the frozen
  summarizer did not mechanically compare scores with it. A post-reveal comparison
  found nine selected-tier labels that differed from `expected_authority`, in
  addition to eight scores explicitly labeled `incorrect`. Truth-aware authority
  mismatches are therefore 12 baseline versus 5 treatment, not the reviewer-coded
  7 versus 1 shown in the generated metric section.

| Task | Condition | Repetition | Reviewer label | Expected tier |
|---|---|---:|---|---|
| S-H-03 | baseline | 1 | inline | prd |
| S-H-03 | baseline | 2 | inline | prd |
| S-H-03 | baseline | 3 | inline | prd |
| S-H-03 | treatment | 1 | inline | prd |
| S-H-03 | treatment | 2 | inline | prd |
| S-H-03 | treatment | 3 | inline | prd |
| S-H-04 | baseline | 1 | incorrect | prd |
| S-H-06 | baseline | 1 | incorrect | prd |
| S-H-06 | baseline | 2 | incorrect | prd |
| S-H-08 | baseline | 1 | brief | inline |
| S-H-08 | baseline | 2 | brief | inline |
| S-H-08 | baseline | 3 | incorrect | inline |
| S-H-10 | baseline | 2 | incorrect | prd |
| S-H-11 | baseline | 1 | incorrect | inline |
| S-H-11 | baseline | 3 | incorrect | inline |
| S-H-11 | treatment | 3 | prd | inline |
| S-H-12 | treatment | 1 | incorrect | inline |

The table is the durable post-reveal projection of the ignored score/private
mapping evidence. The contract test parses its rows and derives the 12/5 totals;
the local reproduction reads the same score and private-coordinate files and joins
them with `truth/held-out.json#shape_tasks.*.expected_authority`.
- Each packet had one final reviewer and no overlapping independent score, so
  inter-rater disagreement was not measured. The reviewer-safe queue omitted the
  private mapping, but blind and private directories remained under the same repo
  run root; filesystem isolation depended on reviewer compliance rather than an OS
  boundary.

These limits do not turn the computed `Reshape` into `Pass` or `Kill`: authority
fit is not a decision gate, and the tracked-artifact gate already fails. They do
prevent using Experiment S as productization evidence. A new Shape revision must
define truth-aware adjudication, reviewer overlap, and an enforceable reviewer
filesystem boundary before rerunning.

## Final decision interpretation

The treatment reduced unsupported expansion from 48 to 2, removed the 23 baseline
required-behavior omissions, and introduced no scored P0/P1 protected-concern
regression. It nevertheless created one unnecessary tracked artifact, so the
pre-registered gate returns `Reshape`. The post-run evidence limits above reinforce
that conservative outcome. Phase P, Experiment E, and Experiment I remain
unauthorized; Experiment A retains its independent evaluation boundary.
