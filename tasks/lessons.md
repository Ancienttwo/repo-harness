# Lessons

1. Verify the live checkout, declared revision and real entrypoint before relying on an issue, snapshot or agent report.
2. Trace the observable trigger to its final effect before fixing a bug; confirm the root cause with a real failing case.
3. Keep one authority per value and import its existing parser/resolver; never create a second semantic interpretation.
4. Match test doubles to the producer's actual wire format and terminal events; missing or truncated proof fails closed.
5. Validate externally serialized fields at every egress, including mutation acknowledgements, events and errors.
6. Keep ownership, identity, authorization and freshness distinct; shape validation and persistence do not establish authority.
7. Recover only the exact operation/claim originally owned; never release a replacement claim or skip an unprocessed cursor.
8. Preserve producer errors when draining pipelines; do not hide SIGPIPE or upstream failures with generic success fallbacks.
9. Bind assertions to explicit run IDs and revisions, not timestamps or whichever artifact happens to be latest.
10. Run changed-behavior coverage once; reviewers reuse recorded results, and historical passes remain bound to their original inputs.
11. Aggregate independent failures so a red first lane does not conceal later faults; schedule the full suite daily.
12. Isolate mutable process/repository/HOME state and use real synchronization signals instead of sleeps or longer timeouts.
13. Change distributed authoring sources and deterministic projections together; validate dry-run against the same operation model as apply.
14. Verify actual observer configuration and emitted evidence before claiming a mechanism runs or catches problems.
15. Preserve approved scope and private operations state; never turn an advisory, capacity bound or healthy startup into delivery acceptance.
