# BDD² Phase E2 Gate Projection

The gate accepts exactly one immutable decision for S2, EB, EI, and I2. S2 is one of
`Pass / Reshape / Kill`. EB and EI are independently one of
`Pass / Reshape / Kill / gated-not-run`. I2 is `Pass / Fail / gated-not-run` and may
run only when S2 is Pass and EB or EI is Pass.

The report must include frozen authority ID and hash, run/report IDs, coordinate and
score counts, all primary disagreement counts, owner-adjudication counts, evidence
hash validation, decision functions, and residual treatment inferability. It must
state that Behavior Audit remains killed and that Phase P is not authorized.

The only gate that can open I2 is:

`S2 == Pass AND (EB == Pass OR EI == Pass)`.

No combination automatically opens Phase P. An I2 Pass permits only a separate owner
review of the smallest passed combination. Any missing report, invalid count, hash
drift, unresolved disagreement, historical Phase E mutation, or product-surface diff
makes the Phase E2 gate invalid and fail closed.
