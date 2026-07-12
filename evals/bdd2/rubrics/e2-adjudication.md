# BDD² Phase E2 Outcome and Evidence Adjudication

## Isolation

Each output produces one full response and one deterministic normalized-outcome
projection. The projection is selected directly from the response's `normalization`
field after schema validation; it is never rewritten by an LLM. It contains task ID,
public task input, and normalized outcome only. It excludes condition, prompt,
provider, URL, asset, appendix, provenance, repository path, sibling output, and
private truth. Both the full response and normalized projection receive SHA-256 hashes.

Two distinct reviewers (`outcome-1`, `outcome-2`) independently score each normalized
packet with task-specific truth. Neither receives the other score or a condition/pair
mapping. EB-1 and EI-1 additionally receive one output-specific evidence-use score;
that reviewer does not decide outcome quality.

## Canonical disagreement

Before comparing reviewer scores, object keys are sorted; protected-concern omissions
are sorted by severity, concern, and summary; correction operations are sorted by
operation and count. Notes are non-primary and never create a disagreement.

The schema-defined primary fields for every experiment are:

`uncertainty_closed`, `boundary_category`, `unsupported_expansion`,
`unsupported_user_concepts`, `required_behavior_omission`,
`protected_concern_omissions`, `authority_fit`, `escalation_correct`,
`unnecessary_tracked_artifact_count`, and `correction_operations`.

Any difference in a primary field requires exactly one owner-adjudication record that
contains a complete resolved score. The runner derives and retains the canonical
field-difference list before requesting the record. The owner receives
no condition, pair, gate-distance, provider, or sibling-output information. The record
must lock before reveal. If primary scores are canonically identical, an owner record
is forbidden. Effective score is the locked owner score when required, otherwise the
identical primary score. Primary records remain immutable.

Missing/extra scores, same reviewer in both slots, a post-reveal lock, incomplete
disagreement fields, or an unresolved disagreement fails closed.

## Correction operations

Reviewers select each applicable correction-operation enum at most once. They never
estimate minutes or write cost points. The runner validates operations against
`correction-cost-table.e2.json` and sums the frozen points. Duplicate operations are
invalid. An empty array means zero correction. Human elapsed correction minutes are
recorded only for I2.

## Evidence-use boundary

EB evidence-use scoring checks provenance, named-question binding, privacy review,
supported/unsupported claim discipline, applicability, and disposition fit. EI checks
synthetic labeling, named-question binding, stable boundary, direction hypotheses,
falsifiers, limitations, and absence of user-evidence claims. Evidence-use scores can
fail an adapter gate but cannot improve or replace normalized outcome scores.
