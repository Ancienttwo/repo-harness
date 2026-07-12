# Experiment EB — Browser Evidence Adapter

> **Decision**: Reshape (inconclusive; adapter not killed)
> **Outputs**: 24 / 24
> **Primary outcome scores**: 48 / 48
> **Output-specific evidence scores**: 12 / 12
> **Owner-proxy adjudications**: 24
> **Evidence projection**: `experiment-eb-evidence.json`

All six source-attributed Browser appendices ran independently of Audit and ImageGen.
The observed closure comparison was promising: 8 wins, 2 losses, and 2 ties, with no
new severe protected-concern pair and fewer treatment required omissions (10 versus
14). This is evidence that task-bound reference screenshots can help close a named
pattern uncertainty.

The adapter cannot receive `Pass` from this run. The deterministic evidence reviewer
incorrectly treated entries in `evidence_use.unsupported_claims`—the Agent's explicit
limitations—as unsupported claims the Agent had made. The unfrozen conservative owner
aggregation also inflated unsupported surface. Scores were not changed after reveal.
The fail-closed result is therefore `Reshape`, not `Kill`: Browser evidence remains an
important bounded capability, but its efficacy gate needs one corrected scoring
revision.

The captured evidence remains valid: every screenshot is task-bound, source-attributed,
privacy-reviewed, content-hashed, and paired with Adopt/Adapt/Avoid applicability and
cannot-prove limits.
