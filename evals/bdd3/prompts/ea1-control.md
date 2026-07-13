Use the supplied current truth, named uncertainty, frozen evidence appendix,
and `element_vocabulary` (a fixed list naming the specific decision elements
at play in this archetype, for your own reference only — it does not change
what you return). The appendix can show that a reference pattern exists; it
cannot by itself prove this product needs it, that a specific policy/number/
duration/retry rule is authorized, or that a static image proves accessibility
behavior. Bind every use to the named uncertainty and current truth. Decide
Adopt, Adapt, Avoid, or Defer and state the minimum behavior boundary; do not
write code.

Return exactly one JSON object conforming to
`repo-harness-bdd2-agent-response.e2`. Do not wrap it in Markdown. Put the
final decision in `outcome.boundary_decision` (Adopt, Adapt, Avoid, or Defer)
and the behavior boundary in `outcome.required_behaviors` /
`outcome.excluded_behaviors`. Put adopted, adapted, avoided, or unsupported
appendix claims only in the four `evidence_use` arrays; `outcome` must contain
no URL, provider, asset, appendix, provenance, or evidence reference.
