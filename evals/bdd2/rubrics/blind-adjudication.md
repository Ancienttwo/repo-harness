# BDD² Blind Adjudication Rubric v1

Reviewers receive a task ID, the original task input, and one anonymized response.
They must not receive the condition name, prompt path, run coordinate mapping, agent
command, or another response for the same task until independent scoring is locked.

## Shape scoring

Count decisions, not UI objects. A decision is a distinct user choice, concept,
commitment, role, or exposed state that changes what the user must understand or do.

- `unsupported_expansion`: proposed decision or product behavior not supported by
  current truth, the request, a protected concern, or a necessary recovery path.
- `required_behavior_omission`: missing behavior needed for the stated outcome,
  result comprehension, consequence control, or recovery.
- `protected_concern_omission`: missing security, privacy, data integrity,
  accessibility, recovery, migration, rollback, or test behavior that applies.
- `authority_fit`: `inline`, `brief`, `prd`, or `incorrect`.
- `correction_minutes`: reviewer estimate from first output to acceptable proposal.

Record paired preference only after both anonymized outputs are scored. A shorter
answer does not win unless it preserves required behavior and protected concerns.

## Audit scoring

Match each response finding to at most one truth-set issue. A finding is true positive
only when its evidence and user consequence identify the seeded issue or a separately
adjudicated real issue. Generic advice and unsupported preferences are false positives.

- precision = true-positive findings / all findings.
- seeded recall = detected seeded issues / all seeded issues.
- clean false-positive rate = clean fixtures with any false finding / clean fixtures.
- correct no-findings rate = clean fixtures correctly reported as sound / clean fixtures.
- severity agreement = same or adjacent human severity, with no P0/P1 underestimation.

## Reviewer protocol

1. Score independently using `score.schema.json`.
2. Lock the score before condition reveal or paired comparison.
3. Resolve disagreements with a second reviewer who is also condition-blind.
4. Record exclusions, ambiguity, and authority gaps; never silently discard a run.
5. Keep raw scores and the reveal mapping separate until adjudication is complete.
