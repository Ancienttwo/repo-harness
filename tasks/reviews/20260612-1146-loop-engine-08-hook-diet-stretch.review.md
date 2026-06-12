# Sprint Review: loop-engine-08-hook-diet-stretch

> **Status**: Passed
> **Plan**: plans/plan-20260612-1146-loop-engine-08-hook-diet-stretch.md
> **Contract**: tasks/contracts/20260612-1146-loop-engine-08-hook-diet-stretch.contract.md
> **Notes File**: tasks/notes/20260612-1146-loop-engine-08-hook-diet-stretch.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-12 12:05
> **Recommendation**: pass

## Mode Evidence

- Selected route: contract stretch task after row7 hook topology stabilized.
- P1/P2/P3 evidence: `src/cli/hook/route-registry.ts` had 7 routes and 9 route-dispatched scripts; the only redundant dispatch was SessionStart running both `session-start-context.sh` and `security-sentinel.sh`.
- Root cause or plan evidence: `security-sentinel.sh` is advisory context, so it can be an internal SessionStart phase while remaining available as a standalone manual/debug script.

## Verification Evidence

- Waza `/check` run: skipped in this Goal per owner instruction to skip Claude verification; not recorded as passed.
- Commands run:
  - `bun test tests/hook-runtime.test.ts` -> 103 pass, 0 fail.
  - `bun test tests/unit/loop-engine-08-hook-diet-stretch.test.ts tests/cli/route-registry.test.ts tests/cli/hook.test.ts tests/cli/install.test.ts tests/cli/status.test.ts tests/cli/doctor.test.ts tests/hook-contracts.test.ts` -> 82 pass, 0 fail.
  - `bun test` -> 667 pass, 0 fail.
  - `bun -e "import { ROUTES } from './src/cli/hook/route-registry.ts'; ..."` -> 7 routes, 8 route-dispatched scripts.
  - `/usr/bin/time -p bun test tests/hook-runtime.test.ts --test-name-pattern "prompt-guard: emits advisory Waza route hints without blocking"` -> pass, `real 0.75` versus row7 baseline `real 0.78`.
  - `/usr/bin/time -p bun test tests/cli/hook.test.ts --test-name-pattern "SessionStart route aggregates security sentinel context and stays quiet when unchanged"` -> pass, `real 0.45`.
- Manual checks: route-dispatched script list is `session-start-context.sh`, `worktree-guard.sh`, `pre-edit-guard.sh`, `post-edit-guard.sh`, `post-bash.sh`, `post-tool-observer.sh`, `prompt-guard.sh`, `stop-orchestrator.sh`.
- Supporting artifacts: test output in this session; `.ai/harness/checks/latest.json` will be refreshed by sprint verification.
- Implementation notes reviewed: `tasks/notes/20260612-1146-loop-engine-08-hook-diet-stretch.notes.md`
- Run snapshot: `.ai/harness/runs/run-20260612T120522-71018-20260612-1146-loop-engine-08-hook-diet-stretch.json`

## External Acceptance Advice

> **External Acceptance**: manual_override
> **External Reviewer**: owner
> **External Source**: user instruction: skip Claude validation in this Goal
> **External Started**: 2026-06-12 11:57
> **External Completed**: 2026-06-12 11:57

- P1 blockers: none.
- P2 advisories: independent Claude/Waza review remains skipped by owner override; local gates are the acceptance evidence for this sprint row.
- Manual Override: owner instructed this Goal to skip Claude validation and continue; row8 acceptance is based on local tests, route count, and timing evidence.
- Acceptance checklist:
  - Route-dispatched script count is 8.
  - SessionStart still surfaces security sentinel findings on routed/adapter execution.
  - Direct `session-start-context.sh` resume smoke remains clean unless the adapter enables the security phase.
  - `security-sentinel.sh` remains available as a standalone script.
  - Full hook-runtime and full repo tests pass.

## Behavior Diff Notes

- `SessionStart.default` now dispatches only `session-start-context.sh`.
- `session-start-context.sh` internally calls `security-sentinel.sh` only when `REPO_HARNESS_SESSION_START_SECURITY=1`.
- `repo-harness hook SessionStart --route default` and `run-hook.sh session-start-context.sh` set that env marker, preserving the real routed/adapter behavior.
- Generated Codex/Claude hook templates no longer register a second SessionStart command for `security-sentinel.sh`.

## Residual Risks / Follow-ups

- Standalone `bash .ai/hooks/session-start-context.sh` intentionally does not run the security phase unless the env marker is set; this preserves direct resume-context test behavior and avoids leaking user-level HOME findings into bare script smoke.
- Claude external validation remains skipped by owner override, not passed.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Dispatch budget is met, security context remains routed, and full hook runtime tests pass. |
| Product depth | 8/10 | Stretch scope is bounded to hook diet without changing guard policy or classifier behavior. |
| Design quality | 8/10 | Uses an explicit adapter env marker instead of inferring from inherited process state. |
| Code quality | 9/10 | Focused tests cover dispatch count, route behavior, templates, and self-host/generated parity. |

## Failing Items

- None for row8 acceptance. Claude external validation is skipped by owner override.

## Retest Steps

- `bun test tests/hook-runtime.test.ts`
- `bun test tests/unit/loop-engine-08-hook-diet-stretch.test.ts tests/cli/route-registry.test.ts tests/cli/hook.test.ts tests/cli/install.test.ts tests/cli/status.test.ts tests/cli/doctor.test.ts tests/hook-contracts.test.ts`
- `bun test`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/check-task-sync.sh`
- `bash scripts/verify-sprint.sh`

## Summary

- Row8 is ready to close: route-dispatched scripts are reduced from 9 to 8, guard behavior is covered by full hook-runtime/full repo tests, and phase-probe timing is recorded.
