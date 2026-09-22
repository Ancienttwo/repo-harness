# Task Review: windows-task-persistence

> **Status**: Accepted
> **Plan**: plans/plan-20260923-0031-windows-task-persistence.md
> **Contract**: tasks/contracts/20260923-0031-windows-task-persistence.contract.md
> **Notes File**: tasks/notes/20260923-0031-windows-task-persistence.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-23 01:36
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:c21805db55803c9e4430b04ed63d788c55fd2d0bfe5684af7d6c2927c57c5770
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 0d4371c3f95e63851f4e083718f3337bf9646345

## Human Review Card

- Verdict: pending
- Change type: code-change
- Intended files changed: five production persistence files, three existing test suites and workflow/research artifacts plus the deterministic architecture manifest within the contract.
- Actual files changed: the source diff against pinned base `271f4d31` stays within the contract, including the deterministic architecture manifest.
- Check IDs and evidence disposition: full hosted CI passed on `e3d86d480fb09a96a670243fd1a3aa8b018e97c3`; canonical Verification Plan passed 16/16 (28/28 total criteria) in run-20260923T014911-15248-20260923-0031-windows-task-persistence.json.
- Residual risks: Windows directory power-loss durability is not POSIX-equivalent; the upstream P2 is corrected in `271f4d31`; all canonical and native checks pass, while exact owner acceptance remains pending.
- Reviewer action required: the single independent review is consumed; resolve the upstream P2 and obtain owner acceptance on the final corrected subject.
- Rollback: revert this package while retaining upstream `6167e895`; canonical stored records are unchanged.

## Mode Evidence

- Selected route: approved bugfix work-package in an isolated worktree.
- P1/P2/P3 evidence: the active plan traces Binding → Principal → Lease → ClaimActor → delivery/ACK/reply and preserves each existing authority.
- Root cause or plan evidence: contract Root Cause Evidence, original native failure log and Principal pre-fix regression are retained under `.ai/harness/runs/windows-task-persistence/`.

## Verification Evidence

Follow [Testing Policy and Artifact Standards](../../docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards).
Consume canonical evidence; do not rerun checks to populate this review or
copy the executable plan. Return missing/stale evidence to its execution owner.

- Independent semantic review: consumed via codex-plugin on subject `sha256:c34055e0e40205783e955c94f78760c72a39d510ad30bf8eb1b7ef8e0309d7ff`, base origin/main at `0d4371c3`. Verdict needs-attention, one P2: rollback leaves a prepared forward receipt that blocks a fresh upgrade after new v1 history. The provider advisory PASS mapping is not treated as acceptance. The correction is integrated from upstream `271f4d31`; the original reviewed subject is retained as historical evidence.
- Hosted execution: [CI 35759847282](https://github.com/Ancienttwo/repo-harness/actions/runs/35759847282), exact source head `e3d86d480fb09a96a670243fd1a3aa8b018e97c3`, passed Governance, full Test, Windows, macOS, Linux and Required / CI. The documentation lane was skipped by CI selection and is not counted as a pass.
- Windows job `106854943539`: 206 pass, 6 existing platform-specific skips, 0 fail across 15 files. Actual deep-path delivery/ACK/reply, exact-ID migration guards, staging expiry, scan/byte limits and process-exit recovery passed. The event-published recovery case took 22.85 seconds, confirming the former 20-second outer test limit was insufficient on this runner.
- Native logs and structured run readback: `.ai/harness/runs/windows-task-persistence/native-final.log` and `native-final-run.json`.
- Historical failures: native runs `35755604887` and `35756978653` remain failed; their logs and the corrected fixture/identity boundaries are recorded in the research and notes. They are not reclassified as passes.
- Canonical preparation: the earlier attempt stopped before contract checks because current CodeGraph proof was unavailable. The owner authorized the local index; deterministic projection updated only the manifest. Reconciliation receipt `sha256:6ce967e4814bba66a15ddc07b8d4ae528a52483ebdf7b862b132177056228bf2` leaves zero unresolved candidates. Canonical preparation then passed all 16 checks.
- Source verification and rollback base: `6167e895`, containing the upstream exact-stat correction. Review subject remains selected by policy against `origin/main`.

## Manual Check Evidence

- Not applicable: this contract declares no `manual_checks`. Real Host admission and real-data migration are outside this package; hosted fixture execution is not either of those claims.

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: ancienttwo
> **Reviewed Subject SHA256**: sha256:c21805db55803c9e4430b04ed63d788c55fd2d0bfe5684af7d6c2927c57c5770
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 0d4371c3f95e63851f4e083718f3337bf9646345
> **Verification Evidence SHA256**: sha256:f96e3d9a8ef41c6b96aa6b08a36104a380d1a08049e9246161016e2184ee2b29
> **Issued At**: 2026-09-22T18:34:20.598Z

- Summary: Owner explicitly approved corrected PR444 subject c21805db55803c9e4430b04ed63d788c55fd2d0bfe5684af7d6c2927c57c5770 after 28/28 canonical criteria and successful full CI35765127664 on source2948a041. The consumed review finding was corrected upstream in271f4d31 with real red/green and native tests. Authorized acceptance, archive and downstream integration; excludes main merge, global install, real migration, Host admission, Campaign and canary.
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

Pre-fix Principal restriction test:4 pass,1 fail with EBADF at the read-only flush handle, PRE_FIX_EXIT=1; post-fix5/5 passed. Owning Binding, Principal, Lease and protected Task reply suites passed118/118 with568 assertions in92.65seconds; typecheck passed. These are local source checks, not Windows native acceptance. Full native CI passed on the integrated source `e3d86d48` as recorded above. Current architecture proof and canonical verification passed on the reviewed candidate. Its independent review returned the upstream P2 above; corrected-source acceptance remains pending.

## Independent review transcript

```json
{
  "verdict": "needs-attention",
  "summary": "Do not ship: interrupted receipt publication can block subsequent migrations after rollback.",
  "findings": [
    {
      "severity": "medium",
      "title": "Rollback leaves a prepared receipt that poisons the next upgrade",
      "body": "If migration fails after writing migration-v1-v2.receipt.json.pending but before renaming it, rollback succeeds while leaving that pending file behind. After new v1 history changes the inventory, a freshly approved migration produces different receipt bytes. Both apply and resume then fail with 'conflicting transaction file', leaving an active journal that blocks Inbox access. This sequence was reproduced using the production migration logic with an in-memory filesystem.",
      "file": "src/effects/fleet/task-inbox-layout-migration.ts",
      "line_start": 308,
      "line_end": 309,
      "confidence": 0.99,
      "recommendation": "During rollback, validate the pending receipt against the transaction's expected bytes or permitted prefix, then durably remove it. Add a regression covering interrupted receipt publication, rollback, new v1 history, and successful reapply."
    }
  ],
  "next_steps": [
    "Fix pending-receipt cleanup and verify the complete rollback-to-reapply sequence."
  ]
}
```

## Corrected candidate verification

- Source: `2948a041df8e3ecbf2ccecba5e72eb7879229cb6`, retaining upstream source/rollback base `271f4d31`.
- Frozen corrected subject: `sha256:c21805db55803c9e4430b04ed63d788c55fd2d0bfe5684af7d6c2927c57c5770`; target `origin/main` at `0d4371c3`.
- Canonical: 16/16 checks, 28/28 total criteria, run `.ai/harness/runs/run-20260923T020805-38146-20260923-0031-windows-task-persistence.json`.
- Architecture: current local index and deterministic manifest materialization; no semantic model changes.
- Native/full CI: [run `35765127664`](https://github.com/Ancienttwo/repo-harness/actions/runs/35765127664), success on `2948a041`. Governance, Test, Windows, macOS, Linux and Required / CI passed; documentation assertions were skipped. Windows: 210 pass, 6 existing skips, 0 fail across 216 tests/15 files. All four new complete/prefix and foreign/linked prepared-receipt cases passed natively. Logs: `.ai/harness/runs/windows-task-persistence/native-corrected.log` and `native-corrected-run.json`.
- Acceptance remains unavailable. The one independent review is consumed; owner acceptance must bind the corrected candidate after native CI.
