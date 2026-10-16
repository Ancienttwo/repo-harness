# Lessons

reviewed-through: 4305f61cd699547276e2434cbf1f1a4675e4036d

- Date: 2026-10-03
- Mistake pattern: verify-live-state-before-relying
- Prevention rule: Verify the live checkout, declared revision and real entrypoint before relying on an issue, snapshot or agent report.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: trace-trigger-to-effect
- Prevention rule: Trace the observable trigger to its final effect before fixing a bug; confirm the root cause with a real failing case.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: one-authority-per-value
- Prevention rule: Keep one authority per value and import its existing parser/resolver; never create a second semantic interpretation.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: test-doubles-match-wire-format
- Prevention rule: Match test doubles to the producer's actual wire format and terminal events; missing or truncated proof fails closed.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: validate-every-egress
- Prevention rule: Validate externally serialized fields at every egress, including mutation acknowledgements, events and errors.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: keep-authority-concepts-distinct
- Prevention rule: Keep ownership, identity, authorization and freshness distinct; shape validation and persistence do not establish authority.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: recover-only-owned-operation
- Prevention rule: Recover only the exact operation/claim originally owned; never release a replacement claim or skip an unprocessed cursor.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: preserve-producer-errors
- Prevention rule: Preserve producer errors when draining pipelines; do not hide SIGPIPE or upstream failures with generic success fallbacks.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: bind-assertions-to-run-ids
- Prevention rule: Bind assertions to explicit run IDs and revisions, not timestamps or whichever artifact happens to be latest.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: run-coverage-once
- Prevention rule: Run changed-behavior coverage once; reviewers reuse recorded results, and historical passes remain bound to their original inputs.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: aggregate-independent-failures
- Prevention rule: Aggregate independent failures so a red first lane does not conceal later faults; schedule the full suite daily.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: isolate-mutable-state
- Prevention rule: Isolate mutable process/repository/HOME state and use real synchronization signals instead of sleeps or longer timeouts.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: change-sources-and-projections-together
- Prevention rule: Change distributed authoring sources and deterministic projections together; validate dry-run against the same operation model as apply.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: verify-observer-evidence
- Prevention rule: Verify actual observer configuration and emitted evidence before claiming a mechanism runs or catches problems.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×

- Date: 2026-10-03
- Mistake pattern: preserve-approved-scope
- Prevention rule: Preserve approved scope and private operations state; never turn an advisory, capacity bound or healthy startup into delivery acceptance.
- Why: #483 consolidated this rule from earlier lessons. The original failure record is not kept.
- Triggered by correction: #483
- Seen: 1×
