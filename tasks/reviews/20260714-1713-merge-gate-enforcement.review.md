# Task Review: merge-gate-enforcement

> **Status**: Completed
> **Plan**: plans/plan-20260714-1713-merge-gate-enforcement.md
> **Contract**: tasks/contracts/20260714-1713-merge-gate-enforcement.contract.md
> **Notes File**: tasks/notes/20260714-1713-merge-gate-enforcement.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-15 00:11
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:92924cc40fe6dbaeb77a064e1ddf486561a3e686db825e094ce69a3bd39e707c
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: ee571b8537b178e36d8ede8c50d32d0c3f0deee3

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: local merge-gate protocol, protected runner/receipt verifier, contract-worktree and PR ship enforcement, host runtime installation, generated projections, tests, and workflow/architecture artifacts.
- Actual files changed: contract-allowed paths only; the cross-host general `gatekeeper` role and unrelated dirty `main` files are unchanged by this branch.
- Commands passed: full suite `1461 pass / 1 skip / 0 fail`; focused gate and ship lifecycle suites; typecheck; helper/doc parity; skill/capability validation; isolated package install and protected-helper smoke.
- External acceptance: skipped by explicit repository-owner direction after `claude-review` returned `You've hit your session limit · resets 12:30am (Asia/Taipei)` with exit 1; this is not represented as an external PASS.
- Residual risks: same-OS-user processes can bypass or replace local host state; GitHub branch protection/CI remains the remote merge-time authority.
- Reviewer action required: none for this PR; merge remains conditional on GitHub CI passing.
- Rollback: revert the single work-package commit, reinstall the prior global tarball, and remove the host `merge_gate` config/installed skill/agent together.

## Mode Evidence

- Selected route: isolated contract worktree with read-only specialist review and live installed-runtime canary.
- P1/P2/P3 evidence: architecture module and implementation notes map the ship choke points, trace candidate commit to receipt to exact-SHA push/merge, and preserve base-policy/host-runtime/orchestrator authority separation.
- Root cause or plan evidence: `plans/plan-20260714-1713-merge-gate-enforcement.md` and `tasks/notes/20260714-1713-merge-gate-enforcement.notes.md`.

## Verification Evidence

- Waza `/check` run: remediation code and focused/full test phases pass; the repository owner explicitly waived the unavailable Claude acceptance for this PR.
- Commands run: `bun test`; `bun run check:type`; required shell checks; helper and reference parity; capability/skill validators; inspector/adopt dry-run; installed `repo-harness run merge-gate run` live canary.
- Manual checks: host config names `merge-gatekeeper` + `merge-gate`; installed skill/agent/helper are byte-identical; general fleet `gatekeeper` is outside the diff; dirty target preflight is read-only.
- Supporting artifacts: host receipt under `~/.repo-harness/gates/`, `.ai/harness/checks/latest.json`, architecture module, workstream, and notes.
- Implementation notes reviewed: yes.
- Run snapshot: final local checks and live canary recorded in this review and notes.

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-14T23:50:00+0800
> **External Completed**: 2026-07-15T00:11:00+0800
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:92924cc40fe6dbaeb77a064e1ddf486561a3e686db825e094ce69a3bd39e707c
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: ee571b8537b178e36d8ede8c50d32d0c3f0deee3
> **Benchmark Evidence SHA256**: not-applicable

- P1 blockers: none identified by local architecture/security review; Claude did not run to completion.
- P2 advisories: none
- Acceptance checklist: owner-directed skip — Claude was unavailable because the provider session limit was exhausted; the repository owner explicitly directed the flow to continue through GitHub CI. This line records authority and does not claim canonical external acceptance passed.

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

- None in code or local verification. Canonical external acceptance remains unavailable and was explicitly skipped by the repository owner for this PR; GitHub CI is still required before merge.

## Retest Steps

- Re-run: GitHub CI against the final pushed commit; canonical `verify-sprint` is expected to keep reporting unavailable external acceptance because the skip is recorded truthfully rather than forged as PASS.
- Re-check: local agent/skill/helper parity, host config identity, clean target worktree, and current receipt verification.

## Summary

- PASS for the implemented PR remediation and local verification. Claude acceptance was unavailable and explicitly skipped by the repository owner; merge only after the final GitHub CI run passes.
