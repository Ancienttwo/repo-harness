# Implementation Notes: harness-kernel-reduction

> **Status**: Active
> **Plan**: plans/plan-20260712-2327-harness-kernel-reduction.md
> **Contract**: tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md
> **Review**: tasks/reviews/20260712-2327-harness-kernel-reduction.review.md
> **Last Updated**: 2026-07-12 23:28
> **Lifecycle**: notes

## Design Decisions

- Keep Risk Profile separate from existing Task Profile.
- Upgrade the existing state-snapshot owner into the single effective-state
  resolver; do not introduce a third parser.
- Resolve safety floor at PreToolUse from real path/action/capability inputs;
  natural language is not a security authority.
- Enforce SessionStart budget at the runtime aggregation point across all producers.
- Treat the partial synthetic reporter as micro/SLO evidence only.
- Make InstallProfile host-level authority with one transaction/ownership model;
  repo policy may hold an explicit override, not competing installed state.
- Use package-owned hash proof before deleting legacy host paths; modified or
  unknown content fails closed.
- Live Codex benchmark evidence showed `apply_patch` sends the freeform patch as
  `tool_input.command`, not `tool_input.file_path`. The edit guard now expands
  every Add/Update/Delete/Move target and checks each path; `.ai/harness/state/`
  is excluded from implementation fingerprints so the resolver cannot raise its
  own next invocation's risk floor.
- The benchmark runner accepts an explicit `--provider codex|claude`; profile
  comparisons never mix providers inside one report. Codex exhausted its live
  account quota after repeated real matrix attempts, so Claude is the bounded
  same-matrix fallback rather than synthetic evidence.
- Live enforcement exposed two fail-open paths that unit-only execution had not
  covered. A multi-script route shared one consumable stdin stream, and the
  adapter retried the full CLI whenever the hook-only binary returned nonzero.
  The entrypoint now captures/replays one payload and the adapter fallback is
  based only on binary absence, so a guard's first nonzero status is final.
- Benchmark harness projection must become the synthetic `main` baseline before
  the task starts. Otherwise adoption files appear as task implementation diff,
  raise every Adaptive edit to Strict, and fabricate Plan/Contract cost. The
  corrected Adaptive run produced zero artifacts for low-risk/local scenarios,
  five for the Standard cross-capability scenario, and five for migration.
- Structured provider usage and grader success remain separate evidence fields,
  but a report is authoritative only when both pass. `--require-authoritative`
  additionally requires task status and No Harness isolation. Regrade can repair
  a deterministic grader implementation bug only while runner, manifest,
  fixture, and workspace hashes still match; it cannot alter provider usage.

## Deviations From Plan Or Spec

- The captured contract initially treated any Lite cost result above Strict as
  a falsifier. That comparison threshold does not exist in the attached source's
  Quantitative gates and made completion depend on one noisy provider sample.
  The falsifier is corrected to the actual source gates: no safety regression,
  no full artifact chain for low-risk Lite, and no grader regression. Cost
  regressions remain mandatory reported findings and optimization targets.
- The final report uses Claude for all 27 records because Codex exhausted its
  live account quota until 2026-07-18. This follows the planned single-provider
  fallback and does not mix models inside one comparison.
- The superseded report combined records from two temporary roots while grader
  defects were repaired. It has been replaced, not amended: the final 27 records
  come from one fresh command, one run ID, one source commit, one Claude version,
  and one runner/manifest/fixture revision. No record was regraded into the final
  report.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add parallel effective-state engine | Reject | Would preserve duplicate parsers and violate one-authority invariant. |
| Rename without_skill to No Harness | Reject | It inherits host hooks/config and cannot prove isolation. |
| Truncate only session-start-context.sh | Reject | Other SessionStart producers would remain outside the budget. |
| Delete facades before transaction authority | Reject | Cannot safely prove ownership or rollback host state. |

## Open Questions

- None requiring user input. Detailed file ownership is narrowed per ordered
  work package under this parent contract.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Matrix: `evals/harness/reports/profile-comparison.json`
- Human summary: `evals/harness/reports/profile-comparison.md`

## Removed Authorities And Migration

- Removed steady-state `.claude/.active-plan` reads/writes; only explicit
  one-shot migration to `.ai/harness/active-plan` remains.
- Ordinary, advisory, quoted, negated, and workflow-discussion prompts bypass
  the historical classifier. It remains reachable only after explicit or active
  task routing and is not a second steady-state authority.
- Removed broad default Skill discovery and unconditional external-skill,
  CodeGraph, and cross-model behavior. Five root actions and InstallProfile own
  discovery.
- Profile switch/removal acts only on ownership-marked links/copies/routes.
  Modified or unknown host content fails closed and is preserved.
- Rollback reprojects the prior InstallProfile first and commits
  `~/.repo-harness/install-state.json` only after runtime setup succeeds. Code
  rollback is ordered commit revert; no shared main, push, merge, deploy, secret,
  or provider state was mutated. The accidental benchmark overwrite of the Bun
  global package was repaired immediately with `bun add -g repo-harness@0.9.2`
  and verified by `repo-harness --version` and `bun pm ls -g`.

## Dependency, File, And Abstraction Proof

- New dependencies: none. Node/Bun standard library, Git, Bash, and existing
  package dependencies cover locking, hashing, atomic rename, process capture,
  percentiles, installation transactions, and report generation.
- `state.ts` is a public command boundary; state derivation remains in the
  existing `state-snapshot.ts` owner. `workflow-profile.ts`, `prompt-router.ts`,
  `session-context-budget.ts`, and `circuit-breaker.ts` each isolate one
  cross-module invariant consumed by runtime hooks and focused tests; merging
  them into shell scripts would recreate shadow parsers.
- `install-profile.ts` owns the cross-target transaction/ownership invariant
  used by the install command and both Claude/Codex targets. Target-specific
  files remain projections.
- `run-harness-profile-benchmark.ts`, `scenarios.json`, the fixture tree, and
  reports form the independent benchmark authority: runner, inputs, disposable
  product, and durable output cannot be placed in runtime owners without mixing
  measurement with enforcement.
- Every added test file maps one required outcome to an independently runnable
  verification boundary. New documentation files are the operator contract and
  durable evidence requested by the Goal, not parallel runtime authorities.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
