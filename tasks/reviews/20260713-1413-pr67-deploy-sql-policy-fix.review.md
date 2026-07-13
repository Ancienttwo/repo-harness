# Task Review: pr67-deploy-sql-policy-fix

> **Status**: Done
> **Plan**: plans/plan-20260713-1413-pr67-deploy-sql-policy-fix.md
> **Contract**: tasks/contracts/20260713-1413-pr67-deploy-sql-policy-fix.contract.md
> **Notes File**: tasks/notes/20260713-1413-pr67-deploy-sql-policy-fix.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-13 15:40
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:40d9477e92f20076528aed9a1b701ba42f76fb03374180bc311ad9008f07dce1
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: deploy-SQL checker and packaged mirror, policy/guidance projections, focused regression tests, architecture truth, and this work-package's workflow artifacts.
- Actual files changed: 32 contract-allowed paths; one target commit on `origin/main` `f248e76f`; neither unrelated commit `3bf58a8` nor stale PR head `0bfbb657` is an ancestor.
- Commands passed: focused six-file suite 224/224; deploy-SQL focused set 7/7; typecheck; source/helper and hook projection parity; deploy/architecture/task/workflow checks; inspection and adoption dry-run; package tarball install with configured-root runtime smoke; shell syntax and `git diff --check`.
- External acceptance: independent security/correctness and architecture/integration reviewers both pass the exact rubric-v2 fingerprint with no P1 blockers.
- Residual risks: the NUL-safe sorter buffers the deploy path list in memory and a force-killed process may leave safe `mktemp` files; neither affects repo-scale correctness.
- Reviewer action required: none before repository/remote gates.
- Rollback: revert the rebuilt commit or, before merge only, restore the recorded remote PR head using force-with-lease.

## Mode Evidence

- Selected route: Waza `/check` remediation in an isolated contract worktree with independent read-only security and architecture reviewers.
- P1/P2/P3 evidence: P1 maps policy, checker, package projection, hook/guidance, strict workflow, and PR branch boundaries; P2 traces policy parse through root validation, NUL-safe deploy enumeration, ownership/naming/order/invariant validation, CLI exit, packaged helper, and CI; P3 keeps one optional policy authority and the existing assertion-only CLI without dependencies, aliases, or compatibility fallbacks.
- Root cause or plan evidence: `plans/plan-20260713-1413-pr67-deploy-sql-policy-fix.md` and `tasks/notes/20260713-1413-pr67-deploy-sql-policy-fix.notes.md` record every reproduced hollow-green path and correction.

## Verification Evidence

- Waza `/check` run: represented by three adversarial security rounds, two architecture rounds, focused regression suites, contract gates, and installed-package smoke.
- Commands run: focused six-file Bun suite; focused deploy-SQL tests; `bun run check:type`; `bun run check:hooks`; `bun run check:helpers`; required root checks; strict workflow with an isolated unavailable Brain root matching CI; inspector; adoption dry-run; `npm pack` plus installed CLI smoke; `bash -n`; `git diff --check`.
- Manual checks: exact newline directory-symlink bypass now exits 1; fake find, fake Bun sorter, unavailable `TMPDIR`, and malformed non-NUL snapshot all fail closed; source/package bytes match; PR #68 native-role hook content remains identical to base.
- Supporting artifacts: plan, contract, notes, review, current-status projection, architecture modules, `.ai/harness/checks/latest.json`, and ignored run snapshots.
- Implementation notes reviewed: yes.
- Run snapshot: pending final `verify-contract` / `verify-sprint` refresh.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Codex security/correctness + architecture/integration
> **External Source**: native-subagents/pr67_security+pr67_architecture
> **External Started**: 2026-07-13T15:07:00+0800
> **External Completed**: 2026-07-13T15:40:00+0800
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:40d9477e92f20076528aed9a1b701ba42f76fb03374180bc311ad9008f07dce1
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none. Earlier rounds found regex-metacharacter invariant forgery, directory-symlink omission, masked `find` failure, overwritten invalid `--root`, stale-base integration, and newline-delimited path splitting; all were fixed and re-reviewed against this fingerprint.
- P2 advisories: security reviewer noted that `mktemp`, Bun-sorter failure, and malformed-NUL failure probes are manual rather than dedicated automated fixtures. All probes fail closed; existing fake-find and exact newline-symlink regressions cover the observed bypass, so this does not block acceptance.
- Acceptance checklist: pass — NUL-safe enumeration and literal invariant matching close the reproduced bypasses; configured single-root and multi-root coverage semantics match tests; `operations.deploy_sql` is the only alternate-layout authority; source/package and hook projections are current; PR #68 base behavior is preserved; scope contains one target commit and only contract-allowed paths.
- Freshness delta: both reviewers re-read the final `40d9...` projection after plan/contract/notes evidence updates and a canonical handoff/current-status refresh. They confirmed implementation/test bytes unchanged, Current Focus and Handoff now agree on the guarded push, and returned no P1/P2. The GitHub remote gate remains pending by design until push.

## Behavior Diff Notes

- Without `operations.deploy_sql`, direct `deploy/sql` children retain `ordered4` naming and optional default invariant coverage.
- With a valid policy, configured roots and naming modes are authoritative; configured invariant paths are required, `null` disables the invariant, and malformed policy fails closed.
- Every deploy SQL path is enumerated once with NUL-safe records; file and directory symlinks, unowned/nested SQL, invalid names, duplicate ordered prefixes, and ambiguous multi-root invariant references fail.
- `--root deploy/sql` remains an assertion only; any other occurrence fails immediately, including before a later valid flag or help flag.

## Residual Risks / Follow-ups

- Very large deploy trees incur an in-memory byte sort; at repository migration scale this is bounded and simpler than adding another parser/runtime authority.
- A process killed between `mktemp` creation and explicit cleanup may leave non-secret temporary path snapshots. Normal and handled failure paths clean both files.
- Native local strict workflow can observe unrelated external Brain-vault drift; CI-equivalent verification uses an isolated unavailable Brain root and does not convert that machine-global state into repository truth.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9.5/10 | All reproduced bypasses and installed runtime behavior pass independent review. |
| Product depth | 9/10 | Supports established multi-layout repositories while preserving a strict default. |
| Design quality | 9/10 | One policy authority, deterministic projections, and fail-closed NUL-safe enumeration. |
| Code quality | 9/10 | Focused adversarial coverage and byte-identical package mirror; manual failure probes remain an advisory. |

## Failing Items

- None.

## Retest Steps

- Re-run: `repo-harness run verify-contract --contract tasks/contracts/20260713-1413-pr67-deploy-sql-policy-fix.contract.md --strict` with the CI-equivalent isolated Brain root, followed by `repo-harness run verify-sprint`.
- Re-check: guarded PR branch update, remote GitHub checks, mergeability, and exact remote head.

## Summary

- PASS for fingerprint `sha256:40d9477e92f20076528aed9a1b701ba42f76fb03374180bc311ad9008f07dce1`; local contract criteria are green and the remaining gate is the guarded PR update plus remote GitHub checks/mergeability.
