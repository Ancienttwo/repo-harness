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
27 records share run ID `04a5e4b3-ba68-475e-b84a-ad6262179c5d`, source commit
`09df8386`, provider version `2.1.207`, and the runner/manifest/fixture hashes
recorded in the JSON and Markdown reports. The initial Codex attempt exhausted
its account quota, so it is not mixed into this report.

| Profile | Success | Input | Cached input | Output | Model calls | Duration | Hook calls | Hook time | Hook bytes | Guard blocks | Artifacts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| No Harness | 9/9 | 34,064 | 1,231,835 | 10,819 | 53 | 215 s | 0 | 0 s | 0 | 0 | 0 |
| Adaptive Lite | 9/9 | 79,208 | 1,304,582 | 20,206 | 68 | 517 s | 180 | 57 s | 34,054 | 4 | 10 |
| Strict Harness | 9/9 | 70,883 | 751,894 | 12,513 | 49 | 354 s | 141 | 48 s | 29,658 | 0 | 0 |

Cross-session recovery passed in all three profiles. Adaptive Lite produced no
workflow artifacts for the small bug, ordinary feature, Chinese prompt,
negation, quoted report, workflow discussion, or recovery cases. It promoted
the cross-capability feature to Standard (five artifacts) and the migration to
Strict (five artifacts), which accounts for all ten Adaptive artifacts.

This matrix proves behavior and measures cost; it does **not** prove a cost win.
On this provider/sample, No Harness was fastest and smallest. Adaptive Lite used
16,018 more input+output tokens than Strict and also more model calls, duration,
hooks, and hook time; it is not a performance win. The result must remain visible
rather than being normalized away: the next optimization target is hook cold
path and Standard/Strict artifact construction cost, not weaker safety gates.

Three defects were found by live matrix execution and fixed before the durable
report: inherited `BUN_INSTALL` could overwrite the real global package,
the adapter fallback could consume stdin twice and turn a blocking hook into an
allow, and Strict plus `--no-external-skills` could omit its required bundled
cross-review capability. The runtime now replays one captured host payload to
every script, the
adapter `exec`s the hook-only binary so its exit code is final, and the benchmark
rebases its synthetic `main` after harness projection so adoption files do not
inflate risk classification. Tracked-file grader paths are parsed from raw Git
porcelain without trimming its leading status column. `--require-authoritative`
now requires provider usage, grader success, task success, and No Harness
isolation. Regrade refuses changed runner, manifest, fixture, or workspace
evidence instead of rebinding mutable evidence to current code. Strict now
projects the bundled cross-review Skill independently of marketplace Waza and
Mermaid selection, so its installed-state probe and declared component set stay
consistent.

The closeout verifier also exposed a workflow-level cycle: executing the matrix
rewrites its two tracked reports, which previously changed the implementation
fingerprint during the same verification. Those generated reports are now
classified with checks/runs as operational evidence for review freshness. Their
own commit and content hashes, structured provider authority, deterministic
graders, and external acceptance continue to fail closed; product source,
runner, manifest, fixtures, and documentation remain fingerprinted normally.
The final verifier separately hashes the actual report pair into structured
checks, and every checks consumer recomputes that hash before accepting the
snapshot, so evidence mutation after verification fails without reviving the
implementation-review cycle.

Repeated live runs also showed the cross-capability prompt was ambiguous about
authorization to create Standard workflow artifacts: the provider could either
proceed or correctly stop at the Plan gate. The scenario now explicitly marks
the implementation approved and requires the Standard artifacts, while keeping
the same three product paths and focused grader. This makes the matrix test the
profile behavior instead of provider willingness to infer approval.
