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
  claude --profile all --scenario all --require-authoritative` (Codex is also
  supported; one report always uses one provider).
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
runner isolated each harness install under a disposable `HOME`/settings and
`BUN_INSTALL`; No Harness additionally proved zero hooks and an empty structured
Claude init inventory for Skills, plugins, MCP servers, and slash commands. All
27 records share run ID `36252e77-376f-48d8-bbbf-fe0faac53c2d`, source commit
`82374549`, provider version `2.1.207`, and the runner/manifest/fixture hashes
recorded in the JSON and Markdown reports. The initial Codex attempt exhausted
its account quota, so it is not mixed into this report.

| Profile | Success | Input | Cached input | Output | Model calls | Duration | Hook calls | Hook time | Hook bytes | Guard blocks | Artifacts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| No Harness | 9/9 | 35,123 | 1,259,651 | 11,396 | 56 | 220 s | 0 | 0 s | 0 | 0 | 0 |
| Adaptive Lite | 9/9 | 78,110 | 1,334,196 | 19,351 | 69 | 496 s | 181 | 68 s | 34,131 | 4 | 10 |
| Strict Harness | 9/9 | 81,586 | 900,414 | 14,706 | 55 | 391 s | 147 | 60 s | 29,868 | 0 | 0 |

Cross-session recovery passed in all three profiles. Adaptive Lite produced no
workflow artifacts for the small bug, ordinary feature, Chinese prompt,
negation, quoted report, workflow discussion, or recovery cases. It promoted
the cross-capability feature to Standard (five artifacts) and the migration to
Strict (five artifacts), which accounts for all ten Adaptive artifacts.

This matrix proves behavior and measures cost; it does **not** prove a cost win.
On this provider/sample, No Harness was fastest and smallest. Adaptive Lite used
fewer input+output tokens than Strict but more model calls, duration, hooks, and
hook time; it is not a general performance win. The result must remain visible
rather than being normalized away: the next optimization target is hook cold
path and Standard/Strict artifact construction cost, not weaker safety gates.

Two runner defects were found by the live matrix and fixed before the durable
report: inherited `BUN_INSTALL` could overwrite the real global package, and
the adapter fallback could consume stdin twice and turn a blocking hook into an
allow. The runtime now replays one captured host payload to every script, the
adapter `exec`s the hook-only binary so its exit code is final, and the benchmark
rebases its synthetic `main` after harness projection so adoption files do not
inflate risk classification. Tracked-file grader paths are parsed from raw Git
porcelain without trimming its leading status column. `--require-authoritative`
now requires provider usage, grader success, task success, and No Harness
isolation. Regrade refuses changed runner, manifest, fixture, or workspace
evidence instead of rebinding mutable evidence to current code.
