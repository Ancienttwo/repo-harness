> **Archived**: 2026-06-12 12:08
> **Related Plan**: plans/archive/plan-20260612-1146-loop-engine-08-hook-diet-stretch.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260612-1208

# Implementation Notes: loop-engine-08-hook-diet-stretch

> **Status**: Active
> **Plan**: plans/plan-20260612-1146-loop-engine-08-hook-diet-stretch.md
> **Contract**: tasks/contracts/20260612-1146-loop-engine-08-hook-diet-stretch.contract.md
> **Review**: tasks/reviews/20260612-1146-loop-engine-08-hook-diet-stretch.review.md
> **Last Updated**: 2026-06-12 11:57
> **Lifecycle**: notes

## Design Decisions

- Merged the SessionStart security sentinel into `session-start-context.sh` instead of deleting it. This reduces route-dispatched scripts while preserving security findings in real SessionStart paths.
- Added `REPO_HARNESS_SESSION_START_SECURITY=1` as an explicit adapter/runtime marker. `repo-harness hook SessionStart --route default` sets it from `src/cli/hook/runtime.ts`; `run-hook.sh session-start-context.sh` sets it for host adapters.
- Kept direct `bash session-start-context.sh` execution resume-only unless the marker is present, because direct hook-runtime tests and manual resume smokes should not inherit user-level HOME security findings.

## Deviations From Plan Or Spec

- The contract scope was widened to include `.ai/hooks/run-hook.sh`, `assets/hooks/run-hook.sh`, and `src/cli/hook/runtime.ts` because preserving adapter behavior required an explicit env marker at the dispatcher boundary.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Remove `security-sentinel.sh` from SessionStart entirely | Rejected | Would meet dispatch count but lose security context from the normal routed path. |
| Gate on `HOOK_REPO_ROOT` | Rejected after test failure | Direct test processes can inherit `HOOK_REPO_ROOT`, causing bare script smokes to read real user-level config. |
| Gate on explicit `REPO_HARNESS_SESSION_START_SECURITY=1` | Accepted | Keeps routed/adapter behavior deliberate and direct script behavior clean. |

## Open Questions

- None for row8 closeout.

## Evidence Links

- Full tests: `bun test` -> 667 pass, 0 fail.
- Hook runtime: `bun test tests/hook-runtime.test.ts` -> 103 pass, 0 fail.
- Focused row8 regression suite: 82 pass, 0 fail.
- Route count: 7 routes, 8 route-dispatched scripts.
- Timing: prompt-guard smoke `real 0.75`; SessionStart route smoke `real 0.45`.
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote the explicit adapter marker pattern to `tasks/lessons.md` only if another hook-internal merge hits the same direct-script versus routed-execution boundary.
