# BDD² Experiment I2 Conditional Implementation Metric Specification

I2 runs only when S2 is `Pass` and at least one of EB/EI is `Pass`. Otherwise its
result is exactly `gated-not-run` with the prerequisite decisions. When open, I2 has
`1 fixture × 2 conditions × 2 repetitions = 4 outputs` and no exclusions.

Every coordinate starts from a fresh copy of `base/` with the same frozen tree hash.
Only that copy is writable. The hidden acceptance directory is outside the copied
workspace and its command is run by the evaluator. Workspace hash drift, access to
hidden tests, missing patch, or cross-coordinate reuse invalidates I2.

For each output record acceptance command status, required/protected failures,
unnecessary tracked artifacts, unsupported routes/settings/roles/dependencies/user
concepts/decisions, changed files and lines, human correction minutes, and files/lines
removed during the immediate bounded correction pass. Use `not_applicable` for
correction fields when no correction is required; never estimate future deletion.

I2-1 passes only when both treatment repetitions have:

1. all hidden functional acceptance checks passing;
2. no baseline-absent serious acceptance or P0/P1 protected failure;
3. zero unnecessary tracked behavior artifact;
4. no new dependency, route, setting, or role; and
5. lower total unsupported surface or lower median human correction minutes than
   I2-0, without worsening the other dimension.

If both adapters passed, I2-1 uses the frozen combined bundle and reports only
bundle-level feasibility. Four outputs never attribute causality between Browser and
ImageGen. Any non-passing executed result is `Fail`; I2 has no Reshape/Kill product
decision and cannot authorize Phase P.
