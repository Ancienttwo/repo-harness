> **Archived**: 2026-08-20 16:17
> **Related Plan**: plans/archive/plan-20260528-1652-codegraph-readiness.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-1617

# Sprint Review: codegraph-readiness

> **Status**: Complete
> **Plan**: plans/plan-20260528-1652-codegraph-readiness.md
> **Contract**: tasks/contracts/codegraph-readiness.contract.md
> **Notes File**: tasks/notes/codegraph-readiness.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-05-28 18:57 +0800
> **Recommendation**: pass

## Mode Evidence

- Selected route: `plan-eng-review` correction pass.
- P1 map: CodeGraph readiness crosses the merged CLI, the current external tooling probe, generated policy/template surfaces, and root agent docs.
- P2 trace: readiness now enters through both `agentic-dev tools ensure codegraph` and `agentic-dev doctor`; both reuse `src/cli/tools/codegraph.ts`, which delegates detection to `scripts/check-agent-tooling.sh` instead of duplicating the detector.
- P3 decision: keep the separate `tools ensure codegraph` registry so host-adapter install semantics do not absorb tool lifecycle semantics.

## Verification Evidence

- Review findings were written into the plan, contract, and notes.
- Dependency + detector slice implemented on 2026-05-28.
- CLI registration is implemented on the merged hook-global-runtime CLI surface: `src/cli/commands/tools.ts` registers `tools ensure codegraph`, `src/cli/commands/doctor.ts` reports `codegraph-readiness`, and `scripts/ensure-codegraph.sh` calls the official CLI path.
- Targeted tests passed: `bun test tests/cli/codegraph.test.ts tests/cli/codegraph-resolver.test.ts tests/tooling/codegraph-integration.test.ts tests/cli/doctor.test.ts tests/check-agent-tooling.test.ts`.
- Readiness commands passed: `bash scripts/ensure-codegraph.sh --check --json` and `bash scripts/check-agent-tooling.sh --host codex --strict-readiness --json`.

## Current Blocking Findings

- None.

## Retest Steps

- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bun test tests/cli/codegraph.test.ts tests/cli/codegraph-resolver.test.ts tests/tooling/codegraph-integration.test.ts tests/check-agent-tooling.test.ts`
- `bun test tests/cli/doctor.test.ts`
- `bash scripts/ensure-codegraph.sh --check --json`
- `bash scripts/check-agent-tooling.sh --host codex --strict-readiness --json`
- During implementation, run every command listed in `tasks/contracts/codegraph-readiness.contract.md`.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Plan clarity | 8/10 | Scope now names contract, generated policy, and existing detector reuse. |
| Boundary control | 9/10 | Host install remains host-only; CodeGraph lifecycle mutation is under `tools ensure codegraph`. |
| Test readiness | 9/10 | Detector, shell adapter parity, CLI tools command, and doctor non-mutation are covered. |
| Execution readiness | 9/10 | CLI registration is complete; remaining validation is the normal full repo gate. |

## Summary

The CodeGraph readiness contract is implemented as a coherent CLI closeout. The shell adapter and official CLI command share the same readiness model, doctor stays read-only while printing remediation, and `install --target` remains scoped to host adapters.
