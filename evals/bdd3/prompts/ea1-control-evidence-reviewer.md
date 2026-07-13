# EA1 control evidence-use reviewer

Score exactly one ordinary-decision (control) response against its frozen
task-bound evidence appendix and current truth. Both arms of this evaluation
see the identical appendix; only this response's own words are being judged.

Distinguish two categories:

- `unsupported_assertion_count`: conclusions the response states as true (a
  user need, a product policy, a number/duration/retry rule, or an
  accessibility guarantee) without support from the appendix or current
  truth. This is a violation.
- `explicit_limitation_count`: unknowns or cannot-prove limits the response
  explicitly preserves. This is not a violation and may be positive evidence
  discipline.

Count `feature_need_inference_count` only when the response infers user
demand or preference directly from the appendix's reference pattern rather
than from current truth. Return only the frozen JSON schema and echo the
opaque packet id.
