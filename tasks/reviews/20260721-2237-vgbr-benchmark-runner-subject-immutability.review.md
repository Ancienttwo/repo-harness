# Task Review: vgbr-benchmark-runner-subject-immutability

> **Status**: Reviewed
> **Plan**: plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md
> **Contract**: tasks/contracts/20260721-2237-vgbr-benchmark-runner-subject-immutability.contract.md
> **Notes File**: tasks/notes/20260721-2237-vgbr-benchmark-runner-subject-immutability.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-22 00:59
> **Recommendation**: pass for this package's own scope (runner fix, regression tests, full repository suite); blocked on one external pre-existing gate unrelated to this diff — see Closeout Blocker in the contract
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass on this package's own scope; AcceptanceReceipt still pending; one external blocker documented, not caused by this diff
- Change type: bugfix
- Intended files changed: benchmark producer, focused matrix test, and this package's workflow artifacts only
- Actual files changed: `scripts/run-harness-profile-benchmark.ts`, `tests/harness-benchmark-matrix.test.ts`, and this package's plan/contract/notes/review
- Commands passed: focused suite 31/31 (204 expect()); full suite 1676 pass / 0 fail / 1 skip (14012 expect()); typecheck (via full suite's type-checked build); deploy SQL order; architecture sync (advisory warn only); task sync; project-state inspection; adopt dry-run (0 planned); `contract-run preflight` (`preflight_pass`)
- Commands failing: `repo-harness run check-task-workflow --strict` — proven pre-existing on plain `origin/main` (reproduced in a temporary detached worktree with none of this branch's commits) and outside this package's `allowed_paths`; see contract Closeout Blocker
- Residual risks: the separate provider matrix (`vgbr-r`) remains intentionally unrun until this fix merges and its exact merge SHA is frozen; Sprint C's missing `## PRD` section blocks a clean `check-task-workflow --strict` repo-wide until a Program-governance edit lands
- Reviewer action required: (1) resolve or waive the Sprint C `## PRD` section gap at the Program level; (2) record one typed AcceptanceReceipt for the frozen final subject
- Rollback: revert the runner/test commits; no report, schema, or data migration exists

## Mode Evidence

- Selected route: strict bugfix work-package in an isolated linked worktree
- P1/P2/P3 evidence: captured in the plan's Architecture Map, Concrete Trace, and Decision sections
- Root cause or plan evidence: pre-fix artifact proves Git-clean `0755 -> 0777` mode drift caused by source-root global installation and late subject capture

## Verification Evidence

- Waza `/check` run: not invoked this session (no gatekeeper/Waza `/check` dispatch); the evidence below is this session's own direct re-run of the contract's exit criteria plus the root-required checks, from a clean state, after rebasing onto fresh `origin/main`
- Commands run: `bun test tests/harness-benchmark-matrix.test.ts` (31 pass/0 fail/204 expect, 33.42s); `bun test` full suite (1676 pass/1 skip/0 fail/14012 expect across 140 files, 526.31s); `bash scripts/check-deploy-sql-order.sh` (OK); `bash scripts/check-architecture-sync.sh` (exit 0, advisory warn only); `bash scripts/check-task-sync.sh` (OK); `bun scripts/inspect-project-state.ts --repo . --format text` (no drift signals); `bun src/cli/index.ts adopt --repo . --dry-run` (0 planned); `repo-harness run contract-run preflight --contract <this contract> --repo . --json` (`preflight_pass`); `repo-harness run check-task-workflow --strict` (fails — see Closeout Blocker)
- Manual checks: external packed artifact and installed CLI paths resolve outside `ROOT`; canonical report byte hashes unchanged; BDD2 path ownership had zero overlap; file-mode invariant independently confirmed with `stat`/`git status --porcelain` before and after the focused and full suites
- Supporting artifacts: `.ai/harness/runs/vgbr-benchmark-runner-subject-immutability-pre-fix.log`
- Implementation notes reviewed: yes
- Run snapshot: final full suite `1676 pass`, `1 skip`, `0 fail`, `14012 expect()`, 526.31s

## Manual Check Evidence

- [x] The packed runtime artifact and every global-install spec resolve outside the authoritative source root.
  - Evidence: re-run after the second rebase — `tests/harness-benchmark-matrix.test.ts` test "reuses one packed artifact across isolated installs without mutating source authority" packed one external tarball from real `ROOT`, installed it into two isolated `BUN_INSTALL` homes, invoked each absolute installed CLI, and retained equal artifact/source hashes (part of the 31/31 focused pass). Independently confirmed by hand: `stat -f "%N %Lp" src/cli/index.ts src/cli/hook-entry.ts` read `755 755` before the focused suite, after it, and again after the full suite; `git status --porcelain` showed no path outside the four lifecycle docs at every checkpoint.
- [x] The canonical profile-comparison report triplet is byte-identical to the task base.
  - Evidence: final SHA-256 values are JSON `efb9fc6d96114dba32918ae67df8af3631303ff2f2fd1030f1105cfbd10f3925`, Markdown `b6066e3cde27b863c73d3399d2fe2a7d50466c34a5a86326535d6c133bbb9d63`, and binding `4dc0944c44d337948ae98a59710ea982810af47c00813a99937ebd2300572658`, with no report path in the branch diff (`git diff --stat origin/main..HEAD` still shows only the six files listed under Actual files changed).
- [x] BDD2 owns no changed runner or focused benchmark-test path during this package.
  - Evidence: BDD2 PR #109 merged cleanly with neither `scripts/run-harness-profile-benchmark.ts` nor `tests/harness-benchmark-matrix.test.ts` in its changed-file set; this candidate rebased cleanly onto both `9e9dce6e` (BDD2's merge) and later `4bd4133d` (three further docs-only Program commits) without conflict either time.

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

- Before: profile setup globally installed from authoritative `ROOT`, allowing
  Git-clean source mutation, and the report sampled authority only after work.
- After: one pre-work authority capture and one external hash-checked package
  feed installed CLIs; source/artifact guards run after preparation and all
  arms, and reports bind only the initial capture.

## Residual Risks / Follow-ups

- The new 27-arm VGBR remains a separate eval-only package and must start from
  the exact post-merge runner-fix SHA with main frozen and no subject writer.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Original mode drift is rejected before provider execution and after all arms. |
| Product depth | 9/10 | Release-like packed runtime is exercised without expanding CLI semantics. |
| Design quality | 10/10 | One source authority, one runtime artifact, explicit phase guards. |
| Code quality | 9/10 | Focused exports/tests keep failure messages and ordering observable. |

## Failing Items

- None caused by this package's diff. `repo-harness run check-task-workflow
  --strict` fails today, but the identical failure reproduces on a plain
  `origin/main` checkout with none of this branch's commits, and this
  branch's diff touches no `plans/sprints/*` file — see the contract's
  Closeout Blocker. Resolving it requires a Program-governance edit to Sprint
  C's own `## PRD` section, not a change to this package.

## Retest Steps

- Re-run: `bun test tests/harness-benchmark-matrix.test.ts` and `bun test`
- Re-check: typecheck, deploy SQL order, architecture sync, task sync,
  project-state inspection, adopt dry-run, `contract-run preflight`,
  canonical report hashes, and allowed paths
- Re-check after a Program fix: `repo-harness run check-task-workflow
  --strict` once Sprint C's `## PRD` section is filled in

## Summary

- This package's own scope is verified end to end: the focused regression
  suite (31/31), the full repository suite (1676 pass / 0 fail / 1 skip), and
  every root-required check except one all pass from a clean, twice-rebased
  state. The one exception — `check-task-workflow --strict` — fails for a
  proven pre-existing, out-of-package-scope reason (Sprint C's own document,
  unrelated to this diff) and is documented rather than worked around.
  Semantic closeout remains pending on (1) a Program-level fix or waiver for
  that gate and (2) the typed AcceptanceReceipt; the authoritative provider
  matrix is correctly excluded from this bugfix.
