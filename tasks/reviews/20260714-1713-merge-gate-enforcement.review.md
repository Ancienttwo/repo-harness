# Task Review: merge-gate-enforcement

> **Status**: In Progress
> **Plan**: plans/plan-20260714-1713-merge-gate-enforcement.md
> **Contract**: tasks/contracts/20260714-1713-merge-gate-enforcement.contract.md
> **Notes File**: tasks/notes/20260714-1713-merge-gate-enforcement.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-14 23:41
> **Recommendation**: blocked
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:6ef552a68225c65e692ab9afbd75391ab1e4c5f74c17a25d40b8aa00fbdef81e
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: ee571b8537b178e36d8ede8c50d32d0c3f0deee3

## Human Review Card

- Verdict: blocked
- Change type: code-change
- Intended files changed: local merge-gate protocol, protected runner/receipt verifier, contract-worktree and PR ship enforcement, host runtime installation, generated projections, tests, and workflow/architecture artifacts.
- Actual files changed: contract-allowed paths only; the cross-host general `gatekeeper` role and unrelated dirty `main` files are unchanged by this branch.
- Commands passed: full suite `1461 pass / 1 skip / 0 fail`; focused gate and ship lifecycle suites; typecheck; helper/doc parity; skill/capability validation; isolated package install and protected-helper smoke.
- External acceptance: pending; `claude-review` returned `You've hit your session limit · resets 12:30am (Asia/Taipei)` with exit 1.
- Residual risks: same-OS-user processes can bypass or replace local host state; GitHub branch protection/CI remains the remote merge-time authority.
- Reviewer action required: rerun `claude-review` after the provider session resets, record a fresh result, then rerun sprint verification.
- Rollback: revert the single work-package commit, reinstall the prior global tarball, and remove the host `merge_gate` config/installed skill/agent together.

## Mode Evidence

- Selected route: isolated contract worktree with read-only specialist review and live installed-runtime canary.
- P1/P2/P3 evidence: architecture module and implementation notes map the ship choke points, trace candidate commit to receipt to exact-SHA push/merge, and preserve base-policy/host-runtime/orchestrator authority separation.
- Root cause or plan evidence: `plans/plan-20260714-1713-merge-gate-enforcement.md` and `tasks/notes/20260714-1713-merge-gate-enforcement.notes.md`.

## Verification Evidence

- Waza `/check` run: remediation code and focused/full checks pass; refreshed independent Claude acceptance is still pending.
- Commands run: `bun test`; `bun run check:type`; required shell checks; helper and reference parity; capability/skill validators; inspector/adopt dry-run; installed `repo-harness run merge-gate run` live canary.
- Manual checks: host config names `merge-gatekeeper` + `merge-gate`; installed skill/agent/helper are byte-identical; general fleet `gatekeeper` is outside the diff; dirty target preflight is read-only.
- Supporting artifacts: host receipt under `~/.repo-harness/gates/`, `.ai/harness/checks/latest.json`, architecture module, workstream, and notes.
- Implementation notes reviewed: yes.
- Run snapshot: final local checks and live canary recorded in this review and notes.

## External Acceptance Advice

> **External Acceptance**: pending
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-14T23:50:00+0800
> **External Completed**: (pending provider reset)
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:6ef552a68225c65e692ab9afbd75391ab1e4c5f74c17a25d40b8aa00fbdef81e
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: ee571b8537b178e36d8ede8c50d32d0c3f0deee3
> **Benchmark Evidence SHA256**: not-applicable

- P1 blockers: pending external review
- P2 advisories: none
- Acceptance checklist: blocked — the fresh Claude review could not run because the provider session limit is exhausted until 12:30am Asia/Taipei.

## Behavior Diff Notes

- A gated target base now requires one current PASS receipt for the exact candidate SHA/diff/evidence/runtime before local merge or PR push.
- `$merge-gate` owns semantic review; `merge-gatekeeper` owns only the Claude runtime identity; the orchestrator alone writes receipts and performs ship effects.
- `finish --no-merge` remains a non-ship closeout unless `ship-worktrees` supplies the explicit remote `--gate-base`.

## Residual Risks / Follow-ups

- Local enforcement is workflow governance for the current OS account, not a hostile-process security boundary.
- Remote base movement after local review is still governed by exact-SHA push semantics plus GitHub branch protection/CI.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Receipt lifecycle, ship, rollback, stale evidence, bypass, and live installed-runtime paths pass. |
| Product depth | 9/10 | Covers local merge and PR push without introducing a hosted gate or provider fallback. |
| Design quality | 9/10 | Separates semantic protocol, runtime identity, host state, and mutation authority. |
| Code quality | 9/10 | Protected helper allowlist, strict schema, deterministic fingerprints, parity projections, and focused tests. |

## Failing Items

- Fresh external acceptance is unavailable until the Claude session limit resets. The four prior PR review findings are implemented and locally verified, but the workflow correctly remains fail-closed.

## Retest Steps

- Re-run: `bun test`, `repo-harness run verify-sprint`, and the installed merge-gate canary.
- Re-check: local agent/skill/helper parity, host config identity, clean target worktree, and current receipt verification.

## Summary

- BLOCKED only on fresh external acceptance. Local remediation, full tests, and isolated packaged-runtime proof pass; do not merge until `claude-review` succeeds and `verify-sprint` is refreshed.
