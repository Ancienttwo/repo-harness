# BDD² Experiment A Metric Specification v1

This authority is frozen before held-out execution. Exactly one condition-blind,
locked final Audit score is required for each of 48 packets. Missing, duplicate,
excluded, or malformed coordinates and scores fail closed.

## Matching

- Each reported finding has a reviewer-stable reference and matches zero or one
  seeded truth issue for the same task.
- A seeded issue may be matched by at most one finding in a score. A duplicate match
  is invalid rather than a second true positive.
- An unmatched finding is a false positive. A seeded issue without a match is a
  false negative derived after reveal.
- `pass` requires zero findings. `findings` requires at least one finding.
  `inconclusive` is retained and never counts as a correct no-findings result.

## Metrics

- Precision = unique truth-matched findings / all reported findings.
- Seeded recall = unique seeded issues matched / all seeded issues.
- P0/P1 recall = matched P0/P1 issues / all P0/P1 issues.
- Clean false-positive rate = clean outputs containing any finding / all clean outputs.
- Correct no-findings = clean outputs with `verdict: pass` and zero findings / all
  clean outputs.
- Severity agreement = matched findings reported at the same or one adjacent level
  as truth / all matched findings, ordered P0, P1, P2, P3. Any truth P0 or P1 finding
  reported below its truth severity is independently a severe underestimation.
- Correction cost is reported by condition as median minutes; it is not a quality gate.

A zero denominator records `1` for precision when an entire condition reports no
findings and for severity agreement when it has no matched findings. Seeded-recall
denominators are guaranteed nonzero by the frozen held-out truth set. Any other
unexpected zero denominator fails validation.

## Decision

`Pass` requires treatment precision at least 70%, seeded recall at least 80%, P0/P1
recall exactly 100%, clean false-positive rate at most 20%, correct no-findings at
least 80%, severity agreement at least 85%, and zero P0/P1 underestimations.

Any failed gate produces `Kill`. Experiment A has no post-reveal `Reshape` state and
no gate may be softened or manually overridden.
