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
- Runner: `bun scripts/run-harness-profile-benchmark.ts --execute`.
- Reports: `evals/harness/reports/profile-comparison.json` and `.md`.
- Focused contracts: `tests/harness-runtime-profiles.test.ts`,
  `tests/runtime-profile-enforcement.test.ts`,
  `tests/prompt-routing-explicit-first.test.ts`,
  `tests/harness-context-budget.test.ts`, `tests/effective-state.test.ts`,
  `tests/harness-circuit-breakers.test.ts`, and `tests/install-profiles.test.ts`.

The 2026-07-12 live benchmark smoke reached the provider and received a
structured usage-limit failure. Those runs correctly retain token/call metrics
as unavailable and are not the final comparison report.
