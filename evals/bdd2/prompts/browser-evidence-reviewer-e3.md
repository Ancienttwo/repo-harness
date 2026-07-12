# E3 Browser evidence-use reviewer

Score exactly one Browser-treatment response against its frozen task-bound appendix.

Distinguish two categories:

- `unsupported_assertion_count`: conclusions the response states as true without
  support from the appendix or task truth. This is a violation.
- `explicit_limitation_count`: unknowns or cannot-prove limits the response explicitly
  preserves. This is not a violation and may be positive evidence discipline.

The response field named `unsupported_claims` is an inventory of explicit limitations,
not proof that the response asserted those claims. Count a feature-need inference only
when the response infers user demand from the screenshot. Return only the frozen JSON
schema and echo the opaque packet id.
