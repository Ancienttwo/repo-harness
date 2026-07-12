# BDD² Experiment S2 Metric Specification

This specification freezes S2 before held-out execution. Required coordinates are
`12 tasks × 2 conditions × 3 repetitions = 72 outputs`. Every output has two
independent locked outcome scores, for exactly 144 primary scores. Missing, duplicate,
extra, malformed, or excluded coordinates/scores fail closed.

## Effective score and correction points

The two primary scores are compared using `e2-adjudication.md`. Every schema-defined
disagreement requires one locked pre-reveal owner adjudication; an agreement forbids
one. Effective score is the owner score when required, otherwise the identical primary
score. Gate metrics use effective scores only while disagreement rates use the two
unaltered primary scores.

Correction points equal the sum of selected operation points from
`correction-cost-table.e2.json`. An operation may appear at most once per score. The
median for 36 condition outputs is the arithmetic mean of sorted positions 18 and 19.

## Pairing and metrics

- Pair key is task ID plus repetition. Each of 36 pairs has exactly S2-0 and S2-1.
- Unsupported-expansion relative reduction is `(baseline_total - treatment_total) /
  baseline_total`. If both totals are zero, reduction is `0`; if baseline is zero and
  treatment is nonzero, it is undefined and cannot pass.
- A paired win has lower treatment unsupported-expansion count; a loss has higher;
  equality is a tie. `wins + losses + ties = 36` or validation fails.
- Required-omission totals are summed by condition. A stable new treatment omission is
  a task where treatment exceeds its paired baseline in at least two of three
  repetitions.
- A new severe protected omission exists when a pair has more P0/P1 omissions in
  treatment than baseline. Concern text does not cancel a count increase.
- Artifact burden is the treatment sum of
  `unnecessary_tracked_artifact_count`. A required PRD escalation is not an artifact.
- Correction comparison uses treatment median minus baseline median. Treatment must
  not exceed baseline; there is no ratio and therefore no correction-cost zero
  denominator.
- Authority success for one task requires at least two of three treatment effective
  scores to have `authority_fit: true`, `escalation_correct: true`, and
  `unnecessary_tracked_artifact_count: 0`.

## Decision

`Pass` requires all of:

1. unsupported-expansion reduction at least 30%;
2. paired wins strictly exceed losses;
3. treatment required-omission total does not exceed baseline;
4. no stable new treatment omission;
5. zero new treatment P0/P1 protected omission;
6. treatment unnecessary-tracked-artifact total equals zero;
7. treatment median correction points do not exceed baseline;
8. authority success on at least 10 of 12 tasks.

`Kill` applies if reduction is undefined or below 15%, losses exceed wins, any stable
new required omission or P0/P1 protected omission exists, any treatment-created
tracked behavior artifact exists, or fewer than 8 tasks meet authority success. All
other non-passing results are `Reshape`. A hard omission/artifact failure cannot be
overridden by aggregate expansion reduction.

## Disagreement reporting

For each schema-defined primary field, disagreement rate is differing outputs / 72.
An unexpected zero output denominator fails validation. Owner adjudication does not
erase or replace disagreement. Notes never enter disagreement metrics.
