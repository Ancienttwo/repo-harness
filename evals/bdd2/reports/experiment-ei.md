# Experiment EI — ImageGen Prototype Adapter

> **Decision**: Reshape (inconclusive; adapter not killed)
> **Outputs**: 24 / 24
> **Primary outcome scores**: 48 / 48
> **Output-specific evidence scores**: 12 / 12
> **Owner-proxy adjudications**: 23
> **Evidence projection**: `experiment-ei-evidence.json`

All six synthetic prototype appendices ran independently. The two deliberately
non-closable preference/trust tasks remained unclosed in treatment, so the Agent did
not launder synthetic material into user evidence. The tracked contact sheets are
explicitly synthetic, task-bound, content-hashed, and carry falsifiers and
cannot-prove limits.

The raw closure projection was 0 wins, 3 losses, and 9 ties. It cannot be treated as a
valid `Kill`: as in EB, the evidence scorer counted declared unsupported claims as
violations, and the owner aggregation rule was not frozen. Scores remained immutable
after reveal. The recorded result is `Reshape`, preserving ImageGen as an important
interaction/IA exploration capability while rejecting the current scoring revision.

The next evaluation must distinguish “the Agent explicitly says this is unsupported”
from “the Agent asserts an unsupported conclusion,” and score prototype closure only
for the four visually closable uncertainties.
