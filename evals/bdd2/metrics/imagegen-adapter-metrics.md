# BDD² Experiment EI ImageGen Adapter Metric Specification

EI freezes `6 tasks × 2 conditions × 2 repetitions = 24 outputs`, 48 independent
outcome scores, and exactly 12 output-specific evidence-use scores for EI-1. Each of
12 pair keys contains exactly EI-0 and EI-1. Missing, duplicate, extra, malformed, or
excluded records fail closed.

## Pairing

Effective outcome scores follow `e2-adjudication.md`. A closure win is baseline
`uncertainty_closed: false` and treatment `true`; a loss is baseline `true` and
treatment `false`; all other combinations are ties. For the two frozen tasks whose
truth states `prototype_can_close_uncertainty: false`, a treatment `true` is also an
unsupported-closure failure and cannot count as a win. Exactly 12 pair results must
satisfy `wins + losses + ties = 12`.

Unsupported surface is measured separately as total `unsupported_user_concepts` and
total `unsupported_expansion` decisions/behaviors by condition. Required omissions
and P0/P1 protected omissions are summed by condition. Treatment may not exceed
baseline on any dimension.

## Pre-adjudication disagreement

For each condition, uncertainty-closure disagreement rate is outputs where the two
primary reviewers differ on `uncertainty_closed`, divided by 12. Owner adjudication
does not change this metric. Treatment rate must be lower when baseline rate is
nonzero. If both numerators are zero, the comparison passes. If baseline is zero and
treatment is nonzero, it fails. Any denominator other than 12 fails validation.

## Evidence compliance

All 12 EI-1 evidence-use scores must confirm synthetic label, question binding,
stable boundary, complete direction hypotheses, complete falsifiers, and recorded
limitations. Every `user_evidence_claim` must be false. The evaluator recomputes
appendix/asset hashes; absent or mismatched material is invalid rather than an
observation.

## Decision

`Pass` requires all of:

1. closure wins at least 6 of 12 and losses at most 2;
2. both non-closable tasks remain not closed in both treatment repetitions;
3. the disagreement comparison passes;
4. treatment unsupported concepts and decisions do not exceed baseline;
5. treatment required omissions do not exceed baseline;
6. zero baseline-absent treatment P0/P1 protected omission;
7. 100% evidence compliance and zero user-value, preference, trust, or usability
   claims from generated output.

`Kill` applies to any P0/P1 regression, user-evidence claim, missing synthetic label
or falsifier, unsupported closure on either non-closable task, more than 4 losses, or
increases in both unsupported concepts and decisions. Other non-passing results are
`Reshape`.

Provider unavailability or failed synthetic/privacy review before seal yields
`gated-not-run`; it is not Pass, Reshape, or Kill. No metric has a data-dependent
denominator except disagreement, whose zero-baseline rule is specified above.
