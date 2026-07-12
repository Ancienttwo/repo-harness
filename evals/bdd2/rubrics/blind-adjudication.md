# BDD² Blind Adjudication Rubric v3

Final scorers receive a task ID, the original task input, one anonymized response,
and only that task's private truth needed for rubric matching. They must not receive
the condition name, prompt path, run coordinate mapping, agent command, or another
response for the same task until independent scoring is locked. This is
condition-blind, truth-aware Agent adjudication, not human review evidence.

## Shape scoring

Count decisions, not UI objects. A decision is a distinct user choice, concept,
commitment, role, or exposed state that changes what the user must understand or do.

- `unsupported_expansion`: proposed decision or product behavior not supported by
  current truth, the request, a protected concern, or a necessary recovery path.
- `required_behavior_omission`: missing behavior needed for the stated outcome,
  result comprehension, consequence control, or recovery.
- `protected_concern_omissions`: each missing applicable security, privacy, data
  integrity, accessibility, recovery, migration, rollback, cost-control, or test
  behavior, with consequence-based P0-P3 severity.
- `authority_fit`: `inline`, `brief`, `prd`, or `incorrect`.
- `escalation_correct`: whether the proposal correctly stops for a PRD-level
  commitment, role, permission, semantic, migration, or irreversible boundary.
- `unnecessary_tracked_artifact_count`: number of new tracked
  behavior/requirements artifacts beyond the correctly selected authority tier. A
  required PRD escalation does not count; an unnecessary Brief/PRD for an inline
  task does. Implementation files do not count.
- `correction_minutes`: reviewer estimate from first output to acceptable proposal.

Record paired preference only after both anonymized outputs are scored. A shorter
answer does not win unless it preserves required behavior and protected concerns.

## Audit scoring

Assign every distinct response finding a stable `ref`, then match it to zero or one
truth-set issue for the same task. A seeded issue may be matched only once within a
score. Duplicate matches are invalid, not extra true positives. A finding is a true
positive only when its evidence and user consequence identify the seeded issue;
generic advice, unsupported preferences, and unmatched findings are false positives.

- precision = true-positive findings / all findings.
- seeded recall = detected seeded issues / all seeded issues.
- clean false-positive rate = clean fixtures with any false finding / clean fixtures.
- correct no-findings rate = clean fixtures correctly reported as sound / clean fixtures.
- severity agreement = same or adjacent truth severity in P0/P1/P2/P3 order, with
  an independent hard failure for any P0/P1 underestimation.

Use `pass` only with zero findings and `findings` only with at least one finding.
Use `inconclusive` for an unresolved observation or authority boundary; it is kept in
the denominator and never counts as a correct clean no-findings result. Missing truth
issues are derived only after reveal and are never written into the blind score.

## Reviewer protocol

1. Review only one self-contained packet at a time and score it using the
   experiment-specific score schema. For Audit, the packet may include only the
   same task's frozen truth issues for matching; do not inspect repository paths,
   private coordinate mappings, sibling outputs, or prompt files.
2. Lock the score before condition reveal or paired comparison.
3. Resolve disagreements with a second reviewer who is also condition-blind.
4. Record exclusions, ambiguity, and authority gaps; never silently discard a run.
5. Keep raw scores and the reveal mapping separate until all required packet scores
   are present and schema-valid. One locked final score file is required per packet;
   record any second-review resolution in `notes`.
