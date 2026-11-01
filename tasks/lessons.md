# Lessons

reviewed-through: 4305f61cd699547276e2434cbf1f1a4675e4036d

- Date: 2026-10-03
- Mistake pattern: verify-live-state-before-relying
- Prevention rule: Verify the live checkout, declared revision and real entrypoint before relying on an issue, snapshot or agent report.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: c27a36e8, 02da1f63, eb48d698, 1d1b702a, a24990b5, 395f61aa, e13bb3fd, 8134a2af, #231-#240, 6c19234e, 12ef448b, #483
- Seen: 11×

- Date: 2026-10-03
- Mistake pattern: trace-trigger-to-effect
- Prevention rule: Trace the observable trigger to its final effect before fixing a bug; confirm the root cause with a real failing case.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: 395f61aa, #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: one-authority-per-value
- Prevention rule: Keep one authority per value and import its existing parser/resolver; never create a second semantic interpretation.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: d810d9e3, #132, #209, c2e4997d, 9a19af4c, 4527bfa5, d52f9a9b, #483
- Seen: 7×

- Date: 2026-10-03
- Mistake pattern: test-doubles-match-wire-format
- Prevention rule: Match test doubles to the producer's actual wire format and terminal events; missing or truncated proof fails closed.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: 9a19af4c, #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: validate-every-egress
- Prevention rule: Validate externally serialized fields at every egress, including mutation acknowledgements, events and errors.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: 9a19af4c, #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: keep-authority-concepts-distinct
- Prevention rule: Keep ownership, identity, authorization and freshness distinct; shape validation and persistence do not establish authority.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: eaae1177, #176, 24ed0178, #483
- Seen: 3×

- Date: 2026-10-03
- Mistake pattern: recover-only-owned-operation
- Prevention rule: Recover only the exact operation/claim originally owned; never release a replacement claim or skip an unprocessed cursor.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: fe35f0a9, #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: preserve-producer-errors
- Prevention rule: Preserve producer errors when draining pipelines; do not hide SIGPIPE or upstream failures with generic success fallbacks.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: ed6e7b9a, #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: bind-assertions-to-run-ids
- Prevention rule: Bind assertions to explicit run IDs and revisions, not timestamps or whichever artifact happens to be latest.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: f5c30cf0, e467217c, 7102269c, #483
- Seen: 3×

- Date: 2026-10-03
- Mistake pattern: run-coverage-once
- Prevention rule: Run changed-behavior coverage once; reviewers reuse recorded results, and historical passes remain bound to their original inputs.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: eb48d698, 9fcf2975, 9478b705, 6c19234e, 47e1ae08, #483
- Seen: 5×

- Date: 2026-10-03
- Mistake pattern: aggregate-independent-failures
- Prevention rule: Aggregate independent failures so a red first lane does not conceal later faults; schedule the full suite daily.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: #319, #321, e467217c, b674ebe4, #483
- Seen: 3×

- Date: 2026-10-03
- Mistake pattern: isolate-mutable-state
- Prevention rule: Isolate mutable process/repository/HOME state and use real synchronization signals instead of sleeps or longer timeouts.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: 6c7aec98, 16aed8af, 7ce86fdd, 01920840, b6dee923, #483
- Seen: 5×

- Date: 2026-10-03
- Mistake pattern: change-sources-and-projections-together
- Prevention rule: Change distributed authoring sources and deterministic projections together; validate dry-run against the same operation model as apply.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: dc4c7656, #173, f081c6a0, cd05083e, 8134a2af, #483
- Seen: 5×

- Date: 2026-10-03
- Mistake pattern: verify-observer-evidence
- Prevention rule: Verify actual observer configuration and emitted evidence before claiming a mechanism runs or catches problems.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: 868d5b4e, 25944738, 0ab66370, #483
- Seen: 3×

- Date: 2026-10-03
- Mistake pattern: preserve-approved-scope
- Prevention rule: Preserve approved scope and private operations state; never turn an advisory, capacity bound or healthy startup into delivery acceptance.
- Why: #483 consolidated this rule from earlier lessons; the pre-consolidation references and count are kept here.
- Triggered by correction: a6f0921e, a47cde10, 35597741, #483
- Seen: 3×
