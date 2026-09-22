# Task Review: windows-task-persistence

> **Status**: Pending
> **Plan**: plans/plan-20260923-0031-windows-task-persistence.md
> **Contract**: tasks/contracts/20260923-0031-windows-task-persistence.contract.md
> **Notes File**: tasks/notes/20260923-0031-windows-task-persistence.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-23 01:36
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: code-change
- Intended files changed: five production persistence files, three existing test suites and six workflow/research artifacts within the contract.
- Actual files changed: 14 files against pinned source base `6167e895`, matching those categories.
- Check IDs and evidence disposition: full hosted CI passed on `e3d86d480fb09a96a670243fd1a3aa8b018e97c3`; canonical Verification Plan remains unexecuted after architecture preparation refused missing proof.
- Residual risks: Windows directory power-loss durability is not POSIX-equivalent; local architecture proof and independent acceptance remain missing.
- Reviewer action required: wait for current canonical proof, then consume this package's single independent review. This card is execution-owner evidence preparation, not a review verdict.
- Rollback: revert this package while retaining upstream `6167e895`; canonical stored records are unchanged.

## Mode Evidence

- Selected route: approved bugfix work-package in an isolated worktree.
- P1/P2/P3 evidence: the active plan traces Binding → Principal → Lease → ClaimActor → delivery/ACK/reply and preserves each existing authority.
- Root cause or plan evidence: contract Root Cause Evidence, original native failure log and Principal pre-fix regression are retained under `.ai/harness/runs/windows-task-persistence/`.

## Verification Evidence

Follow [Testing Policy and Artifact Standards](../../docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards).
Consume canonical evidence; do not rerun checks to populate this review or
copy the executable plan. Return missing/stale evidence to its execution owner.

- Independent semantic review: not consumed; canonical evidence is a prerequisite.
- Hosted execution: [CI 35759847282](https://github.com/Ancienttwo/repo-harness/actions/runs/35759847282), exact source head `e3d86d480fb09a96a670243fd1a3aa8b018e97c3`, passed Governance, full Test, Windows, macOS, Linux and Required / CI. The documentation lane was skipped by CI selection and is not counted as a pass.
- Windows job `106854943539`: 206 pass, 6 existing platform-specific skips, 0 fail across 15 files. Actual deep-path delivery/ACK/reply, exact-ID migration guards, staging expiry, scan/byte limits and process-exit recovery passed. The event-published recovery case took 22.85 seconds, confirming the former 20-second outer test limit was insufficient on this runner.
- Native logs and structured run readback: `.ai/harness/runs/windows-task-persistence/native-final.log` and `native-final-run.json`.
- Historical failures: native runs `35755604887` and `35756978653` remain failed; their logs and the corrected fixture/identity boundaries are recorded in the research and notes. They are not reclassified as passes.
- Canonical preparation: the earlier attempt stopped before contract checks because current CodeGraph proof was unavailable. Current readiness still has one unresolved architecture candidate and no acceptance/reconciliation receipt; the new worktree has no `.codegraph/`. Indexing authorization is pending.
- Source verification and rollback base: `6167e895`, containing the upstream exact-stat correction. Review subject remains selected by policy against `origin/main`.

## Manual Check Evidence

- Not applicable: this contract declares no `manual_checks`. Real Host admission and real-data migration are outside this package; hosted fixture execution is not either of those claims.

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

- ...

## Residual Risks / Follow-ups

- ...

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- ...

## Retest Steps

- Re-run:
- Re-check:

## Summary

- ...

## Implementation evidence

Pre-fix Principal restriction test:4 pass,1 fail with EBADF at the read-only flush handle, PRE_FIX_EXIT=1; post-fix5/5 passed. Owning Binding, Principal, Lease and protected Task reply suites passed118/118 with568 assertions in92.65seconds; typecheck passed. These are local source checks, not Windows native acceptance. Full native CI passed on the integrated source `e3d86d48` as recorded above. Current architecture proof, canonical verification and independent semantic review remain pending.
