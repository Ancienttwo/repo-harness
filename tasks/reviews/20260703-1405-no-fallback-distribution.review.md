# Task Review: no-fallback-distribution

> **Status**: Done
> **Plan**: plans/plan-20260703-1405-no-fallback-distribution.md
> **Contract**: tasks/contracts/20260703-1405-no-fallback-distribution.contract.md
> **Notes File**: tasks/notes/20260703-1405-no-fallback-distribution.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-03T16:53:20+0800
> **Recommendation**: pass
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:cc253936402bdb341a85200b4c204fcd8670057f29fc1e7d202d619a5a69debe
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: global working rules source/mirror; managed-block init sync; minimal-change session context; project root context heredoc; project-state drift inspection; sprint-backlog helper root handling; scaffold/context tests; workflow/architecture review artifacts.
- Actual files changed: 34 implementation paths in the reviewed fingerprint, plus this operational review file excluded from implementation freshness.
- Commands passed: `git diff --check`; `cmp assets/reference-configs/global-working-rules.md docs/reference-configs/global-working-rules.md`; `cmp assets/templates/helpers/sprint-backlog.sh scripts/sprint-backlog.sh`; focused Bun suites; full `bun test`; deploy SQL/order/architecture/migration/package checks listed below.
- External acceptance: pass
- Residual risks: two known P2-level advisories remain outside this slice: `renderGlobalRules` report-language regex is a no-op against the current template, and `root-agent-context-divergent` is byte-wise so intentional human divergence may need manual interpretation.
- Reviewer action required: none before commit.
- Rollback: revert the reviewed commit; global managed-block refresh can be restored from the backups recorded in the implementation notes.

## Mode Evidence

- Selected route: Waza `/check` style local acceptance with Claude read-only peer review.
- P1 map: The reviewed system spans the authoritative global working rules source under `assets/reference-configs/`, the tracked mirror under `docs/reference-configs/`, `src/cli/commands/init.ts` managed-block distribution, `src/cli/hook/minimal-change-context.ts` session context, `scripts/lib/project-init-lib.sh` scaffold heredoc, `scripts/inspect-project-state.ts` advisory drift reporting, packaged helper routing via `src/cli/runtime/helper-runner.ts`, and the distributed/self-host `sprint-backlog.sh` helper pair.
- P2 trace: `repo-harness run sprint-backlog` resolves a helper and runs it with `cwd` set to the resolved repo root plus `REPO_HARNESS_TARGET_REPO_ROOT`; the helper now treats that env value as an assertion against `pwd -P`, not as redirect authority. Mismatch exits 2 before mutation; match continues into normal sprint operations.
- P3 decision: Keep the change fail-closed and local. No compatibility fallback, semantic re-derivation, new dependency, or new abstraction was introduced. The helper change preserves the package/runtime invariant while rejecting ambient env contamination.

## Verification Evidence

- Waza `/check` run: local acceptance run in Codex using the checked-in `check` skill and Claude read-only peer review.
- Commands run:
  - `git diff --check`
  - `cmp assets/reference-configs/global-working-rules.md docs/reference-configs/global-working-rules.md`
  - `cmp assets/templates/helpers/sprint-backlog.sh scripts/sprint-backlog.sh`
  - `bun test tests/global-working-rules-distribution.test.ts tests/minimal-change-context.test.ts tests/cli/init.test.ts tests/scaffold-parity.test.ts tests/create-project-dirs.runtime.test.ts tests/workflow-contract.test.ts`
  - `bun test tests/sprint-backlog.test.ts tests/cli/run.test.ts tests/helper-scripts.test.ts`
  - `bun test`
  - `bun scripts/inspect-project-state.ts --repo . --format text`
  - `bash scripts/check-deploy-sql-order.sh`
  - `bash scripts/check-architecture-sync.sh`
  - `bash assets/templates/helpers/verify-contract.sh --contract tasks/contracts/20260703-1405-no-fallback-distribution.contract.md --strict`
  - `bash scripts/check-task-sync.sh`
  - `bash scripts/prepare-codex-handoff.sh`
  - `repo-harness run check-task-workflow --strict`
  - `bash scripts/migrate-project-template.sh --repo . --dry-run`
  - `npm pack --dry-run --json`
- Manual checks:
  - `repo-harness run verify-contract --contract ... --strict` hit the runner's 120s helper timeout while executing the contract's full `bun test`; the same packaged helper was run directly so the declared gate completed with `total=8 failed=0 status=Fulfilled`.
  - Guard search found no references to removed `assets/templates/AGENTS.md` or `assets/templates/CLAUDE.md`.
  - Claude broad review found one P1 in the helper env-root trust boundary; it was fixed before acceptance.
  - Claude remediation review confirmed the P1 fix and raised a P2 happy-path test gap; the test was added before this review closed.
- Supporting artifacts: `tasks/notes/20260703-1405-no-fallback-distribution.notes.md`, `tasks/lessons.md`, `tasks/workstreams/workflow-engine/inspection-migration/20260703-inspection-migration.md`.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/checks/latest.json`.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-03T16:19:00+0800
> **External Completed**: 2026-07-03T16:37:00+0800
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: sha256:cc253936402bdb341a85200b4c204fcd8670057f29fc1e7d202d619a5a69debe
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none after remediation. The original P1 (`REPO_HARNESS_TARGET_REPO_ROOT` ambient redirect) is fixed by requiring an absolute path that resolves to the current helper cwd.
- P2 advisories: remediation review requested a matching-env happy-path regression test; closed in `tests/sprint-backlog.test.ts`.
- Acceptance checklist: pass.

## Behavior Diff Notes

- Global No-Fallback rules now distribute through the authoritative template mirror, hook session context, and new-project root context.
- Managed global context sync now exposes unbalanced marker and legacy skip states instead of silently overwriting or hiding them.
- Root `CLAUDE.md`/`AGENTS.md` divergence is advisory-only in project inspection; it does not become a strict workflow gate.
- Sprint backlog helpers no longer let ambient `REPO_HARNESS_TARGET_REPO_ROOT` redirect the mutation root.

## Residual Risks / Follow-ups

- `renderGlobalRules` still has a report-language customization regex that does not match the current template; this is recorded as out of scope.
- The root-agent context drift signal is byte-wise, so whitespace-only or intentional host-specific divergence may require human interpretation.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | All required distribution paths and helper-root safety behavior are covered by tests and full suite. |
| Product depth | 8/10 | Keeps strict no-fallback semantics visible across existing repos, new repos, and global managed blocks. |
| Design quality | 8/10 | Preserves existing ownership boundaries and uses fail-closed marker/root validation. |
| Code quality | 8/10 | Direct changes, no new abstraction, no dependency churn; residual P2s are bounded and documented. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test`
- Re-check: `bash assets/templates/helpers/verify-contract.sh --contract tasks/contracts/20260703-1405-no-fallback-distribution.contract.md --strict`

## Summary

- Recommendation: pass. The reviewed diff implements the no-fallback distribution hardening, closes the helper env-root P1 found during review, adds regression coverage for both reject and accept env-root paths, and preserves the existing repo-harness workflow boundaries.
