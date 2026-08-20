> **Archived**: 2026-08-20 14:33
> **Related Plan**: plans/archive/plan-20260820-1255-fail-closed-codegraph-init.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1433

# Implementation Notes: fail-closed-codegraph-init

> **Status**: Active
> **Plan**: plans/plan-20260820-1255-fail-closed-codegraph-init.md
> **Contract**: tasks/contracts/20260820-1255-fail-closed-codegraph-init.contract.md
> **Review**: tasks/reviews/20260820-1255-fail-closed-codegraph-init.review.md
> **Last Updated**: 2026-08-20 13:13
> **Lifecycle**: notes

## Design Decisions

- `src/cli/tools/codegraph.ts` remains the only adapter from the tooling report's `project_index.status` into a typed value. `init.ts` consumes that field and does not parse raw command output.
- The success predicate is conjunctive: no failed ensure action AND project index exactly `up-to-date`. MCP configuration remains a separate step and does not weaken index readiness.
- CodeGraph disabled or dry-run is outside the predicate and retains the existing skipped result.
- Remediation commands are projected as typed fields by the same CodeGraph adapter. `init.ts` does not invent install/init/sync commands: `unavailable` uses the checker's install path, `unknown` names the status probe, and stale/not-initialized use the checker-owned sync/init commands.

## Deviations From Plan Or Spec

- After the first candidate commit, the owner explicitly requested one batch acceptance after all currently executable Todo work. The work-package therefore absorbed the Action/help-budget row whose revisit trigger fired when this slice edited the CLI command surface. Conditional or evidence-triggered deferred goals remain unopened.
- The combined `bun test tests/cli/init.test.ts tests/install-profiles.test.ts` invocation exposed existing cross-file environment/timing interference. Each contract-listed path passed independently (30/30 and 31/31), which is also how `verify-contract` executes path criteria.
- The final repository-wide `bun test` completed 2708 pass / 1 skip / 2 fail across 2711 tests. Both failures were in `tests/trace-observer.test.ts`, where the Codex Desktop process-level `CODEX_SESSION_ID` overrode test-local implicit identity. `env -u CODEX_SESSION_ID bun test tests/trace-observer.test.ts` passed 9/9, proving the failures are host-environment contamination and unrelated to the changed init/CodeGraph or run-help paths.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Gate on overall `cg.status === "present"` | Rejected | Overall status also mixes MCP configuration and dependency placement; the requested invariant is repository-index readiness. |
| Read `cg.raw.project_index.status` directly in `init.ts` | Rejected | It would spread the external report shape across a second module and preserve an untyped authority boundary. |
| Project one typed `projectIndexStatus` from `normalize()` | Selected | Keeps one adapter, one closed vocabulary, and one fail-closed comparison. |
| Fall back to an ungrouped helper list when the curated group contract drifts | Rejected | The runtime helper contract and the curated projection would disagree. Product-code fallback would hide that authority breach; the existing explicit error is intentionally fail-closed. |
| Budget only the `Helpers:` subsection | Rejected | The fulfilled Todo explicitly budgets `repo-harness run --help`, not a displayed subset. The whole command surface is the selection-cost boundary. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Red proof: `bun test tests/cli/init.test.ts --test-name-pattern 'enabled applied init fails closed'` failed 2/2 before production edits: both missing-CLI and stale-index cases returned exit 0 instead of 1.
- Green proof: the same focused command passed 2/2 after the implementation.
- Contract tests: `bun test tests/cli/init.test.ts` passed 30/30; `bun test tests/install-profiles.test.ts` passed 31/31.
- Action/help-budget red proof: `bun test tests/cli/run.test.ts --test-name-pattern 'groups every real helper'` failed before implementation because no curated group or budget authority existed.
- Action/help-budget green proof: `bun test tests/cli/run.test.ts` passed 15/15; all 55 real helpers appear exactly once across seven groups, the real-count ceiling is 60, and rendered help is exactly 80 lines against an 80-line ceiling.
- Claude cross-review of `fa2a4b8d..985b8182` returned a contradictory transcript (one P1 and four P2 findings followed by `Recommendation: PASS because no findings were reported`). The valid remediation/test findings were applied: missing CLI now uses the checker-owned install command, unknown status names the diagnostic command, and the stale regression proves sync ran but readiness stayed stale. The proposed ungrouped compatibility fallback and subset-only help budget were rejected because they contradict the repo's explicit fail-closed and whole-help-budget contracts. The dead branch noted by Claude was removed.
- Post-review focused verification: `bun test tests/cli/init.test.ts` passed 31/31, `bun test tests/cli/run.test.ts` passed 15/15, `bun test tests/cli/codegraph.test.ts` passed 2/2, and `bun run check:type` passed.
- Claude's authorized final review of `fa2a4b8d..cb8e79c3` repeated the same contradictory P1/PASS helper-fallback finding and added five P2 observations. Two contract-relevant corrections were applied: `unavailable` now distinguishes a missing CLI (install) from an installed CLI with unreadable status (diagnose), and the unknown-status regression now negates the real init command. The unused adapter argument was removed. Programmatic sync defaults and `tools ensure` semantics remain out of this init-scoped contract; the flat-list fallback remains forbidden by the fail-closed contract.
- Second post-review focused verification: `bun test tests/cli/init.test.ts` passed 32/32 and `bun run check:type` passed.
- Static/runtime gates: `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run`, `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, `bash scripts/check-architecture-sync.sh`, `bash scripts/check-deploy-sql-order.sh`, and `bun scripts/inspect-project-state.ts --repo . --format text` all passed.
- Full-suite evidence: `bun test` ran 2711 tests across 199 files (2708 pass, 1 platform skip, 2 host-environment failures); isolated `env -u CODEX_SESSION_ID bun test tests/trace-observer.test.ts` then passed 9/9.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
