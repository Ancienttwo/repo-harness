# Experiment S2 — Inline Shape

> **Decision**: Reshape (inconclusive)
> **Outputs**: 72 / 72
> **Primary outcome scores**: 144 / 144
> **Owner-proxy adjudications**: 54
> **Evidence projection**: `experiment-s2-evidence.json`

S2 executed its complete frozen coordinate set. The raw effective-score projection
would produce `Kill`: unsupported expansion was 1 control versus 5 treatment, paired
wins/losses/ties were 1/5/30, treatment required omissions were 19 versus 16, seven
pairs gained a P0/P1 omission, and only 9/12 tasks met authority success.

That nominal gate is not accepted as an efficacy decision. The owner proxy used a
conservative-union algorithm that was not frozen in the E2 authority, and reviewers
did not apply a stable operational meaning to `unnecessary_tracked_artifact_count`:
an inline response cannot itself create a tracked artifact, yet the effective
treatment total was 19. Because scores were already revealed after the proxy lock,
they were not edited or re-adjudicated. Per the fail-closed rule, the recorded result
is `Reshape`, not `Kill`.

The experiment still demonstrates the intended lightweight use case is testable, but
the next revision must remove the tracked-artifact field from proposal-only scoring
or derive it from an actual filesystem capture, and must freeze the owner aggregation
function before any output.
