# BDD² Experiment EB Browser Adapter Metric Specification

EB freezes `6 tasks × 2 conditions × 2 repetitions = 24 outputs`, 48 independent
outcome scores, and exactly 12 output-specific evidence-use scores for EB-1. Each of
12 pair keys contains exactly EB-0 and EB-1. Missing, duplicate, extra, malformed, or
excluded records fail closed.

## Pairing

Effective outcome scores follow `e2-adjudication.md`. A closure win is baseline
`uncertainty_closed: false` and treatment `true`; a loss is baseline `true` and
treatment `false`; all other combinations are ties. Exactly 12 pair results must
satisfy `wins + losses + ties = 12`.

Unsupported surface is measured separately as total `unsupported_user_concepts` and
total `unsupported_expansion` decisions/behaviors by condition. Required omissions
and P0/P1 protected omissions are also summed by condition. Treatment may not exceed
baseline on any of these dimensions.

## Pre-adjudication disagreement

For each condition, uncertainty-closure disagreement rate is outputs where the two
primary reviewers differ on `uncertainty_closed`, divided by 12. Owner adjudication
does not change this metric. Treatment rate must be lower when baseline rate is
nonzero. If both numerators are zero, the comparison passes. If baseline is zero and
treatment is nonzero, it fails. Any denominator other than 12 fails validation.

## Evidence compliance

All 12 EB-1 evidence-use scores must have true values for provenance, question
binding, privacy review, supported-claim respect, forbidden-inference avoidance,
applicability constraints, and disposition support. Every
`feature_need_claim_from_screenshot` must be false. The evaluator recomputes hashes;
an absent or mismatched appendix/asset is invalid, not a failed observation.

## Decision

`Pass` requires all of:

1. closure wins at least 6 of 12 and losses at most 2;
2. the disagreement comparison passes;
3. treatment unsupported concepts and decisions do not exceed baseline;
4. treatment required omissions do not exceed baseline;
5. zero baseline-absent treatment P0/P1 protected omission;
6. 100% evidence compliance and zero screenshot-derived feature-need claims.

`Kill` applies to any P0/P1 regression, screenshot-derived feature-need claim,
privacy/provenance/question-binding failure, more than 4 losses, or increases in both
unsupported concepts and decisions. Other non-passing results are `Reshape`.

Provider unavailability or privacy rejection before seal yields `gated-not-run`; it
is not Pass, Reshape, or Kill and cannot be replaced with another provider after seal.
No metric has a data-dependent denominator except disagreement, whose zero-baseline
rule is specified above.
