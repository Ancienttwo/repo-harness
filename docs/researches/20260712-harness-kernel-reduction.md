# Harness Kernel Reduction

## Conclusion

The steady-state product is now a deterministic kernel: explicit routing,
risk floor, effective state, scope/worktree/security guards, exact evidence
freshness, bounded recovery context, and profile-owned installation. Broad
prompt interpretation and broad default Skill discovery are no longer runtime
authorities.

## Deleted authorities

- All-prompt workflow classification: ordinary, advisory, quoted, and workflow
  discussion prompts exit before the historical classifier.
- `.claude/.active-plan`: removed from steady-state readers, writers, mirrors,
  policy, templates, and helper projections. Explicit one-shot migration only.
- Default installation of all external skills and CodeGraph.
- Default exposure of every command facade as a top-level Skill.
- Unconditional cross-model review advice.

## Preserved deterministic boundaries

- `_ops`, `_ref`, secret/security, allowed paths, worktree ownership, and
  destructive/high-risk surfaces fail closed.
- Strict auth/payment/security/schema/migration/deploy/public API/release work
  still requires Contract and isolated worktree enforcement.
- Review/check freshness uses full implementation fingerprints.
- Provider-owned usage fields remain null when the structured provider schema
  does not supply them.

## Reproducible evidence

- Scenario authority: `evals/harness/scenarios.json`.
- Runner: `bun scripts/run-harness-profile-benchmark.ts --execute --provider
  codex` (or `--provider claude`; one report always uses one provider).
- Reports: `evals/harness/reports/profile-comparison.json` and `.md`.
- Focused contracts: `tests/harness-runtime-profiles.test.ts`,
  `tests/runtime-profile-enforcement.test.ts`,
  `tests/prompt-routing-explicit-first.test.ts`,
  `tests/harness-context-budget.test.ts`, `tests/effective-state.test.ts`,
  `tests/harness-circuit-breakers.test.ts`, and `tests/install-profiles.test.ts`.

## Authoritative 3x9 result

The durable report was executed with one live Claude provider over the same nine
scenario authorities for all three profiles. Every provider stream supplied
structured usage and every deterministic grader passed (27/27). The benchmark
runner isolated each harness install under a disposable `HOME` and
`BUN_INSTALL`; No Harness additionally disabled host hooks and slash-command
discovery. The initial Codex attempt exhausted its account quota, so it is not
mixed into this report.

| Profile | Success | Input | Cached input | Output | Model calls | Duration | Hook calls | Hook time | Hook bytes | Guard blocks | Artifacts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| No Harness | 9/9 | 37,411 | 1,010,366 | 10,301 | 48 | 185 s | 0 | 0 s | 0 | 0 | 0 |
| Adaptive Lite | 9/9 | 71,270 | 1,240,266 | 19,613 | 74 | 540 s | 189 | 74 s | 31,721 | 3 | 10 |
| Strict Harness | 9/9 | 65,803 | 810,923 | 12,871 | 52 | 416 s | 144 | 72 s | 26,949 | 0 | 0 |

Cross-session recovery passed in all three profiles. Adaptive Lite produced no
workflow artifacts for the small bug, ordinary feature, Chinese prompt,
negation, quoted report, workflow discussion, or recovery cases. It promoted
the cross-capability feature to Standard (five artifacts) and the migration to
Strict (five artifacts), which accounts for all ten Adaptive artifacts.

This matrix proves behavior and measures cost; it does **not** prove a cost win.
On this provider/sample, No Harness was fastest and smallest, and Adaptive Lite
was more expensive than pre-projected Strict. The result must remain visible
rather than being normalized away: the next optimization target is hook cold
path and Standard/Strict artifact construction cost, not weaker safety gates.

Two runner defects were found by the live matrix and fixed before the durable
report: inherited `BUN_INSTALL` could overwrite the real global package, and
the adapter fallback could consume stdin twice and turn a blocking hook into an
allow. The runtime now replays one captured host payload to every script, the
adapter `exec`s the hook-only binary so its exit code is final, and the benchmark
rebases its synthetic `main` after harness projection so adoption files do not
inflate risk classification. Tracked-file grader paths are parsed from raw Git
porcelain without trimming its leading status column; `--regrade-existing`
recomputes only deterministic graders and never fabricates provider usage.
