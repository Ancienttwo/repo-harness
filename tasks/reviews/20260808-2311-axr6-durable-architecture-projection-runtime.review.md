# Task Review: axr6-durable-architecture-projection-runtime

> **Status**: Pending
> **Plan**: plans/plan-20260808-2311-axr6-durable-architecture-projection-runtime.md
> **Contract**: tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md
> **Notes File**: tasks/notes/20260808-2311-axr6-durable-architecture-projection-runtime.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-09 11:14
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:f47706820795e594d0184f43e68c447b2e3c90a438be1ee467d6fedfcf97b5e6
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: cea71bc3c2c3c328c16e9c0d8af15f302703d367

## Human Review Card

- Verdict: pending external semantic acceptance
- Change type: code-change
- Intended files changed: durable architecture journal/job/orchestrator/refresh/Stop runtime, installer timeout contract, policy/assets, tests and AXR6 workflow artifacts
- Actual files changed: all paths are inside the contract `allowed_paths`; `verify-sprint --prepare-acceptance` reports no outside paths
- Commands passed: `bun run check:ci`; focused AXR6 contract suite; `bun run check:type`; `bun run check:helpers`; packed installed-host cycle; `repo-harness run verify-sprint --prepare-acceptance`
- Residual risks: provider semantic acceptance is unavailable until Claude capacity resets or the user explicitly grants the contract's allowed waiver
- Reviewer action required: Claude must review the frozen current subject, or the user must explicitly grant a waiver for that exact subject
- Rollback: disable the provider, drain to zero pending observations, revert AXR6 as one unit, preserve receipts/dead letters

## Mode Evidence

- Selected route: strict work-package implementation with frozen external acceptance policy
- P1/P2/P3 evidence: plan `Captured Planning Output` and implementation notes record the component map, concrete PostEdit-to-Stop trace, and durable-delivery rationale
- Root cause or plan evidence: AXR5 left Stop on a non-durable per-path helper path; AXR6 replaces that lane with one job-store-owned aggregate delivery

## Verification Evidence

- Waza `/check` run: not used; the frozen reviewer is Claude through repo-harness cross-review
- Commands run: final `bun run check:ci` completed with 2308 pass, 1 platform skip, 0 fail; workflow, package dry-run and tarball smoke all passed
- Manual checks: packed installed-host cycle proved the legacy 30-second kill, immediate orphan-provider quarantine without a second provider, and post-lease attempt-2 durable receipt
- Supporting artifacts: `.ai/harness/checks/latest.json` and `.ai/harness/runs/run-20260809T030948-19692-20260808-2311-axr6-durable-architecture-projection-runtime.json`
- Implementation notes reviewed: `tasks/notes/20260808-2311-axr6-durable-architecture-projection-runtime.notes.md`
- Run snapshot: contract total=15, failed=0, status=Fulfilled; acceptance receipt remains pending

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: Claude
> **Source**: repo-harness cross-review
> **Actor**: unavailable
> **Reviewed Subject SHA256**: sha256:f47706820795e594d0184f43e68c447b2e3c90a438be1ee467d6fedfcf97b5e6
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: cea71bc3c2c3c328c16e9c0d8af15f302703d367
> **Verification Evidence SHA256**: sha256:a92da55b48bef32605e962d7cd171cd7965cc65fe78cb4c0fdede6afbe6bed78
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded. The current frozen subject reached Claude, but the provider returned `You've hit your weekly limit · resets Aug 11 at 4pm (Asia/Hong_Kong)` before producing findings or a recommendation.
- Findings: none for the current subject; absence of findings is not a pass

## Behavior Diff Notes

- PostEdit writes a bounded v2 observation only; Stop coalesces eligible observations into one durable projection job.
- Source evidence is acknowledged only after a durable terminal receipt; failures, timeout, stale snapshot and unresolved-major signals remain retryable or dead-lettered.
- `ArchitectureRefreshSignalV1` is the only authority for major semantic refresh. repo-harness does not infer semantic importance from paths, diff size or Markdown.
- A stable source key owns delivery/dead-letter budget while the event id rotates per coalesced edit.
- Fresh abandoned running claims are quarantined for 150 seconds, longer than the 120-second provider bound, preventing a second apply while an orphan may still be alive.
- Managed `Stop.default` uses 150 seconds; all other managed hook routes remain at 30 seconds.

## Residual Risks / Follow-ups

- The current subject has no external semantic verdict because the required Claude provider is capacity-blocked.
- Operational receipts and dead letters have no retention policy in AXR6; this is advisory follow-up, not an acceptance failure.
- An explicitly retried dead letter still requires the queue to be otherwise operable; the runtime reports the durable blockage rather than deleting evidence.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | pending | Machine gates pass; semantic acceptance unavailable |
| Product depth | pending | Seven completed review rounds were repaired; current subject is unreviewed |
| Design quality | pending | Durable authority boundaries are implemented and tested |
| Code quality | pending | Final repository suite passes; frozen reviewer verdict is still required |

## Failing Items

- External acceptance gate: required Claude review could not complete because the provider weekly limit was reached.

## Retest Steps

- Re-run: repo-harness cross-review against subject `sha256:f47706820795e594d0184f43e68c447b2e3c90a438be1ee467d6fedfcf97b5e6` after 2026-08-11 16:00 Asia/Hong_Kong.
- Re-check: record one typed AcceptanceReceipt, then run `repo-harness run verify-sprint` without `--prepare-acceptance`.

## Summary

- Implementation and machine verification are complete. Promotion remains blocked exclusively on the frozen external AcceptanceReceipt; this document deliberately does not convert a provider-capacity failure into a pass.
