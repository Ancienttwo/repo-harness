> **Archived**: 2026-07-13 18:49
> **Related Plan**: plans/archive/plan-20260713-1413-pr67-deploy-sql-policy-fix.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260713-1849

# Task Review: pr67-deploy-sql-policy-fix

> **Status**: Done
> **Plan**: plans/plan-20260713-1413-pr67-deploy-sql-policy-fix.md
> **Contract**: tasks/contracts/20260713-1413-pr67-deploy-sql-policy-fix.contract.md
> **Notes File**: tasks/notes/20260713-1413-pr67-deploy-sql-policy-fix.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-13 18:03
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:7365d39031c25370629d9611d2ef1b9da6dfe1faecf53146c672a2db9aa6c67c
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: deploy-SQL checker and packaged mirror, policy/guidance projections, focused regression tests, architecture truth, and this work-package's workflow artifacts.
- Actual files changed: 32 contract-allowed implementation paths plus this workflow closeout; PR #67 merged to remote `main` as `4e3e76a2`; neither unrelated commit `3bf58a8` nor stale PR head `0bfbb657` entered its ancestry.
- Commands passed: focused six-file suite 224/224; deploy-SQL focused set 7/7; typecheck; source/helper and hook projection parity; deploy/architecture/task/workflow checks; inspection and adoption dry-run; package tarball install with configured-root runtime smoke; shell syntax and `git diff --check`.
- External acceptance: native security/correctness and architecture/integration reviewers found no implementation blocker; gate-compatible Claude acceptance passed against the exact closeout fingerprint with no P1/P2 findings.
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
- Run snapshot: contract verification passed 26/26 and marked the contract Fulfilled; the latest `verify-sprint` correctly remains red until gate-compatible Claude acceptance is recorded for this fingerprint.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-13T17:38:00+0800
> **External Completed**: 2026-07-13T18:03:00+0800
> **Review Rubric Version**: 2
> **Reviewed Diff Fingerprint**: sha256:7365d39031c25370629d9611d2ef1b9da6dfe1faecf53146c672a2db9aa6c67c
> **Reviewed Scope**: branch+staged+unstaged+untracked

- P1 blockers: none
- P2 advisories: none. Claude's exact final output was `No P1/P2 findings.` followed by `PASS`.
- Acceptance checklist: pass — Claude re-reviewed the combined closeout diff after the reviewer identity, fingerprint authority, and stale remote-gate narrative were corrected.
- Freshness delta: the staged closeout-only plan/contract/notes edits produce `sha256:7365d3...` against the gate target `main=4e3e76a2`; the review file is excluded from that implementation fingerprint by design.
- Remote acceptance: PR #67 reached `MERGED` at merge commit `4e3e76a2`; post-merge main CI run `29238650018` completed with all four jobs successful.

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
- Re-check: final workflow fingerprint, `verify-sprint`, archive transaction, and post-archive strict workflow projection.

## Summary

- PASS for the implementation; PR #67 is merged and post-merge main CI is green. Complete current-fingerprint Claude acceptance, rerun `verify-sprint`, then archive only if the machine gate is green.
