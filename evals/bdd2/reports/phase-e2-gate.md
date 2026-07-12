# BDD² Phase E2 Gate

> **Gate status**: Complete
> **Phase P**: Not approved
> **Current Behavior Audit**: Kill, unchanged and absent from E2

| Hypothesis | Execution | Decision |
|---|---:|---|
| S2 inline Shape | 72/72 | Reshape (inconclusive) |
| EB Browser Evidence Adapter | 24/24 + 12 evidence scores | Reshape (inconclusive; not killed) |
| EI ImageGen Prototype Adapter | 24/24 + 12 evidence scores | Reshape (inconclusive; not killed) |
| I2 implementation pilot | 0/4 | Defer — gated-not-run |

E2 closed the major Phase E gap: Browser and ImageGen were actually acquired,
frozen, and evaluated independently rather than remaining unrun behind the killed
Audit prerequisite. Their evidence assets are useful and valid as reference/synthetic
stimulus, but the efficacy gate is inconclusive because the scoring implementation
drifted from its semantics after seal:

1. owner disagreements were resolved with an unfrozen conservative-union algorithm;
2. evidence scoring treated explicit limitations as unsupported assertions;
3. proposal-only reviewers disagreed on a field that should have been derived from
   filesystem evidence (`unnecessary_tracked_artifact_count`).

No score was changed after condition reveal. The fail-closed rule converts those
nominal raw `Kill` projections to `Reshape`; it does not convert them to `Pass`.
Therefore the conditional implementation pilot remained closed and Phase P remains
unapproved.

This gate also answers the original deletion question: Browser capture and ImageGen
prototype capability should not be deleted. They should remain evaluation adapters,
not public product surfaces, until a smaller E3 scoring-only revision produces a valid
pass or kill decision. Behavior Brief catalog, sidecar, ten-state lifecycle, generic
counting linter, and seven-tool CLI/MCP surface remain outside approved scope.
