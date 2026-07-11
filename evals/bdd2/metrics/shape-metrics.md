# BDD² Experiment S Metric Specification v1

This document is frozen before held-out execution. One locked final human score is
required for every blind packet. Scores are revealed and paired only after all 72
packets pass schema and identity validation.

## Pairing

- Pair key: held-out task ID plus repetition number.
- Every pair must contain exactly one baseline and one treatment score.
- There are 36 pairs: 12 tasks × 3 repetitions.
- Missing, duplicate, excluded, or malformed scores fail closed; no run is silently
  discarded.

## Metrics

- Unsupported expansion totals are summed within each condition. Relative
  reduction is `(baseline - treatment) / baseline`. A zero baseline with zero
  treatment records `0`; a zero baseline with non-zero treatment is undefined and
  cannot pass. A paired win has fewer treatment expansions, a loss has more, and a
  tie is equal.
- Required behavior omission totals are summed within each condition. A stable new
  treatment omission exists when treatment exceeds baseline for the same task in
  at least two of its three repetitions.
- A new severe protected omission exists for a pair when treatment contains more
  P0/P1 protected omissions than baseline.
- Correction cost uses the median minutes across the 36 scores in each condition.
  Relative increase is `(treatment - baseline) / baseline`, with the same zero
  denominator rule.
- Artifact burden is the sum of treatment proposals that require a tracked behavior
  artifact beyond the correctly selected authority tier. A required PRD escalation
  does not count; an unnecessary Brief/PRD for an inline task does. The target is
  zero.
- Incorrect authority tier and escalation decisions are reported by condition but
  do not replace the core expansion/omission gates.

## Decision gates

`Pass` requires all of:

1. unsupported-expansion relative reduction is at least 30%;
2. paired wins exceed paired losses;
3. treatment required-omission total does not exceed baseline;
4. no stable new treatment required omission;
5. no new treatment P0/P1 protected omission;
6. median correction-time increase is at most 20%;
7. treatment unnecessary-tracked-artifact total is zero.

`Kill` applies when the reduction is undefined or below 15%, losses exceed wins, a
stable new required omission or new P0/P1 protected omission exists, or correction
time is undefined or increases more than 30%. Other non-passing results are
`Reshape`. These rules are not overridden after reveal.
