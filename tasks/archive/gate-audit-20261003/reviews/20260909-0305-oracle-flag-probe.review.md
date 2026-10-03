# Task Review: oracle-flag-probe

> **Status**: Pending
> **Plan**: plans/plan-20260909-0305-oracle-flag-probe.md
> **Contract**: tasks/contracts/20260909-0305-oracle-flag-probe.contract.md
> **Notes File**: tasks/notes/20260909-0305-oracle-flag-probe.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-09 03:05
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: see `Substantive Change SHA256` in plans/plan-20260909-0305-oracle-flag-probe.md
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: codex/oracle-flag-probe

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `src/cli/chatgpt-browser/oracle-provider.ts`, `src/cli/chatgpt-browser/engine.ts`, `tests/cli/chatgpt-browser.test.ts`, plan/contract/review/notes artifacts, Oracle setup docs.
- Actual files changed: `src/cli/chatgpt-browser/engine.ts`, `src/cli/chatgpt-browser/oracle-provider.ts`, `tests/cli/chatgpt-browser.test.ts`, `docs/repo-harness-chatgpt-browser-engine.md`, `assets/skills/repo-harness-chatgpt/references/setup.md`, `plans/plan-20260909-0305-oracle-flag-probe.md`, `tasks/contracts/20260909-0305-oracle-flag-probe.contract.md`, `tasks/reviews/20260909-0305-oracle-flag-probe.review.md`, `tasks/notes/20260909-0305-oracle-flag-probe.notes.md`, `tasks/todos.md`.
- Commands passed: `bun test --timeout 60000 tests/cli/chatgpt-browser.test.ts` (56 pass / 0 fail), `bunx tsc --noEmit`, `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-architecture-sync.sh`, `REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, `bun src/cli/index.ts init --repo . --dry-run`.
- Residual risks: the runtime-flag probe spawns the resolved binary with `--dry-run json`; a binary that exits non-zero for unrelated reasons is reported as a capability gap. The fork-build action still requires a human/agent-supplied path, so the doctor cannot self-heal.
- Reviewer action required: inspect diff and card
- Rollback: revert branch `codex/oracle-flag-probe`; no data or schema migration is involved.

## Mode Evidence

- Selected route: planning (plan captured through `repo-harness-plan`, executed under the task contract).
- P1/P2/P3 evidence: P1 the Oracle lane is `resolveOracleBin` -> `probeOracle` -> `browserDoctor` / `runOracleProvider`; P2 an upstream 0.20.0 binary passes every `--help` capability but rejects the fork-only runtime flags, so doctor reported `ready` and the failure surfaced mid-consult as `ORACLE_EXIT_NONZERO`; P3 the probe reuses `buildOracleCommand`'s own argv so the probed surface cannot drift from the surface the real consult sends.
- Root cause or plan evidence: `src/cli/chatgpt-browser/oracle-provider.ts` `probeRuntimeFlagAcceptance` plus the sync guard in `buildRuntimeAcceptanceProbeArgs`.

## Verification Evidence

- Waza `/check` run: not run; gatekeeper review plus the repository-integrity checks above were used.
- Commands run: see `Commands passed`.
- Manual checks: real `browser-doctor --provider oracle --json` from this worktree, twice. PATH oracle (`~/.bun/bin/oracle`, upstream 0.20.0) reports `action_required` / `ORACLE_INCOMPATIBLE` with a single `chatgpt-oracle-select-fork-build` action and no `bun add -g` command; `REPO_HARNESS_ORACLE_BIN=/Users/ancienttwo/Projects/oracle/dist/bin/oracle-cli.js` reports `ready` with empty `agent_actions`.
- Supporting artifacts: doctor JSON captured in the execution transcript.
- Implementation notes reviewed: yes, `tasks/notes/20260909-0305-oracle-flag-probe.notes.md`.
- Run snapshot: `.ai/harness/runs/`

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: unavailable
> **Source**: unavailable
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded.
- Findings: none

## Behavior Diff Notes

- `browser-doctor --provider oracle` now reports `action_required` / `ORACLE_INCOMPATIBLE` instead of `ready` when the resolved binary rejects `--write-session`, `--write-network-evidence`, `--write-conversation-evidence`, or `--browser-thinking-time`.
- When the only missing capabilities are those fork flags, `agent_actions` carries `chatgpt-oracle-select-fork-build` (pointing at `REPO_HARNESS_ORACLE_BIN` / `--oracle-bin`) instead of `chatgpt-oracle-upgrade-pinned`; the pinned install command can never add fork-only flags, so the previous action looped.
- The matching `next` line names the fork build instead of "upgrade oracle or check `oracle --help`".
- `runOracleProvider` refuses before spawning with `ORACLE_RUNTIME_FLAGS_UNSUPPORTED` instead of surfacing `ORACLE_EXIT_NONZERO` after a wasted GPT Pro run.

## Residual Risks / Follow-ups

- The probe adds one extra `--dry-run json` spawn per doctor/consult resolution; measured cost is well inside the existing 30s probe timeout but it is not free.
- A binary that is genuinely missing upstream `--help` capabilities *and* the fork flags still routes to the version/source actions by design; the fork action is intentionally restricted to a fork-only gap.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Doctor and consult both fail closed; verified against real upstream and fork binaries. |
| Product depth | 8/10 | Recovery text names the exact flags and the exact selection mechanism; it still needs a human-supplied path. |
| Design quality | 8/10 | The probe argv is derived from `buildOracleCommand` with a drift guard, so there is one source of truth for the flag surface. |
| Code quality | 8/10 | Small, localized diff; the fork signal is computed once and consumed by the action, the `next` line, and the error recovery. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test --timeout 60000 tests/cli/chatgpt-browser.test.ts`
- Re-check: `bun src/cli/index.ts chatgpt browser-doctor --repo . --provider oracle --json` with the PATH oracle (expect `chatgpt-oracle-select-fork-build`) and with `REPO_HARNESS_ORACLE_BIN` pointed at the fork build (expect `ready`).

## Summary

- The Oracle readiness probe now proves runtime-flag acceptance instead of trusting `--help`, and a fork-flag gap routes the agent at the fork build rather than at a published release that can never satisfy it.
