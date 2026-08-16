# Implementation Notes: archctx-resolver-target-root

> **Status**: Active
> **Plan**: plans/plan-20260816-1124-archctx-resolver-target-root.md
> **Contract**: tasks/contracts/20260816-1124-archctx-resolver-target-root.contract.md
> **Review**: tasks/reviews/20260816-1124-archctx-resolver-target-root.review.md
> **Last Updated**: 2026-08-16 11:24
> **Lifecycle**: notes

## Design Decisions

- Selection shape: kept `resolvePackageLocalArchctx(root, requiredVersion, origin)` as the single resolver and added one private `resolveArchctxForRepo(repoRoot, requiredVersion, consumerRootOverride?)` above `archctxCapabilities`. The public export keeps its two-argument call shape (existing tests and callers unchanged); the new third argument only labels which root the search started from.
- Search order (node-resolution shaped, not a semantic fallback chain): explicit `options.consumerRoot` wins → target `repoRoot` dependency tree (walk-up, first hit) → running CLI `findConsumerRoot()` when the repo tree vendors no archctx at all. The exact-version assertion is fail-closed on every path, so a repo that vendors a mismatching archctx throws instead of being masked by the CLI's copy.
- `findInstalledArchctxPackageRoot` was split into a nullable `findArchctxPackageRoot` (used for the "does the repo vendor archctx at all" probe) plus the throwing wrapper, so the probe does not need an exception to answer a boolean.
- Error messages now carry `(resolved from repo|consumer root <path>)` on the version mismatch and `... missing from the repo|consumer dependency tree rooted at <path>` on the missing case, making the two failure paths distinguishable in the Stop-gate reason string.
- Only one live call site needed the change: readiness (`inspectArchitectureProjectionReadiness`) and `runArchitectureProjection` both route through `archctxCapabilities`, so the plan's "two call sites" is one edit at `archctx-provider.ts:153`.

## Deviations From Plan Or Spec

- Contract `Root Cause Evidence` values for `regression_guard` and `pre_fix_failure_artifact` carried trailing Chinese annotations, which made the `contract-run preflight` gate fail with `incomplete_root_cause` (the gate compares the value verbatim against `exit_criteria.tests_pass` and the artifact contents). Reduced both to bare path values; the gate then reports `preflight_pass`.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| New public entrypoint keyed on repoRoot vs. private helper + unchanged export | Private helper | Smaller diff, no new public surface, existing `resolvePackageLocalArchctx` tests/callers keep their contract |
| Let a mismatching repo-vendored archctx fall through to the CLI copy | Rejected | That is the semantic fallback the plan's P3 forbids: it would silently mask repo-internal drift between `policy.requiredVersion` and the repo's own `node_modules/archctx` |
| Regression scenario (a) via a synthetic `9.9.9` fixture version | Chosen | Makes the CLI consumer root deterministically mismatching without depending on whatever version this checkout happens to vendor, so the pre-fix red is the real window failure (`expected archctx@9.9.9, got archctx@0.4.3`) |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix failure artifact: `tasks/notes/prefix-artifacts/archctx-resolver-target-root.prefix.log` (`PRE_FIX_EXIT=1`, 13 pass / 1 fail)

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
