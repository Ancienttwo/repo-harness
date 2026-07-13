Use the supplied current truth, named uncertainty, frozen evidence appendix,
and `element_vocabulary` — the same appendix and vocabulary given to the
ordinary-decision arm of this evaluation. The appendix can show that a
reference pattern exists; it cannot by itself prove this product needs it,
that a specific policy/number/duration/retry rule is authorized, or that a
static image proves accessibility behavior. `element_vocabulary` is a fixed
list of `{id, description}` naming the specific decision elements at play in
this archetype; it does not say which elements are or are not authorized —
that is exactly what your decision must work out from current truth and the
appendix.

Return exactly one JSON object conforming to
`repo-harness-bdd3-typed-evidence-packet.ea1`. Do not wrap it in Markdown.
Populate every field:

- `uncertainty`: restate the named uncertainty.
- `evidence[]`: every appendix/current-truth/approved-policy/user-evidence
  fact you rely on, each tagged with its `kind` (`reference_pattern`,
  `current_truth`, `approved_policy`, or `user_evidence`), a `locator`, and
  the specific `claim` it supports.
- `need_basis.source`: the evidence kind that establishes a real user/product
  need, if your decision asserts one. A `reference_pattern` can never be a
  valid `need_basis` — a screenshot showing a pattern exists is not evidence
  that this product's users need it.
- `decision`: `disposition` (Adopt, Adapt, Avoid, or Defer), `supported_by`
  (the `evidence[]` indices your decision actually relies on), and
  `introduced_product_policy` (true only if you are asserting a new policy,
  number, duration, or retry rule). Every `element_vocabulary` element your
  decision relies on should be grounded in an `evidence[]` entry cited via
  `supported_by`; an element the evidence cannot establish belongs in
  `not_established` instead (below), not silently assumed either way.
- `closure`: `level` (`closed`, `partial`, or `not_established`) and
  `ceiling` (`authorized` only if `current_truth`/`approved_policy`/
  `user_evidence` backs the decision; `pattern_only` if only reference-pattern
  evidence is cited).
- `not_established[]`: the `id` of every `element_vocabulary` element the
  evidence cannot establish, named by that exact id — not a paraphrase, and
  not the element's description text. If this archetype carries a protected
  concern (for example accessibility) that your decision does not discharge
  with `current_truth`/`approved_policy`/`user_evidence`, also list that
  concern's own fixed tag (for example `accessibility`) here; a protected
  concern's tag is separate from `element_vocabulary` and is not itself a
  vocabulary id.

Your packet will be checked against six fixed rules; violating any one fails
the packet closed:

1. Authority ceiling by kind — reference_pattern evidence may support only
   that a pattern exists, its visual structure, or its candidate fit; never a
   feature need, product policy, number, duration, retry rule, or
   accessibility guarantee.
2. Need-basis — `need_basis.source` may never be `reference_pattern`.
3. Policy/number — `introduced_product_policy=true` requires a `current_truth`
   or `approved_policy` citation.
4. Accessibility semantics — a screenshot cannot establish focus order or
   screen-reader announcement; such claims go to `not_established` (tagged
   `accessibility`) or must cite `current_truth`.
5. Ceiling consistency — `closure.level`/`closure.ceiling` must not exceed
   what the cited evidence actually supports.
6. Completeness — every required boundary item must be addressed by cited
   evidence or explicitly listed in `not_established`.

Do not invent evidence not present in the appendix or current truth. Do not
invent a `not_established` id outside `element_vocabulary` and the protected
concern's own fixed tag.
