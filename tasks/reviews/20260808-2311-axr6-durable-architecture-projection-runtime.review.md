# Task Review: axr6-durable-architecture-projection-runtime

> **Status**: Reviewed
> **Plan**: plans/plan-20260808-2311-axr6-durable-architecture-projection-runtime.md
> **Contract**: tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md
> **Notes File**: tasks/notes/20260808-2311-axr6-durable-architecture-projection-runtime.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-09 11:25
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:f47706820795e594d0184f43e68c447b2e3c90a438be1ee467d6fedfcf97b5e6
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 65c58c4f7f92df3383bd1cee2ef8f4e99eda8e2d

## Human Review Card

- Verdict: pass by the contract-authorized typed user waiver; this is not represented as an external Claude pass
- Change type: code-change
- Intended files changed: durable architecture journal/job/orchestrator/refresh/Stop runtime, installer timeout contract, policy/assets, tests and AXR6 workflow artifacts
- Actual files changed: all paths are inside the contract `allowed_paths`; `verify-sprint --prepare-acceptance` reports no outside paths
- Commands passed: `bun run check:ci`; focused AXR6 contract suite; `bun run check:type`; `bun run check:helpers`; packed installed-host cycle; `repo-harness run verify-sprint --prepare-acceptance`
- Residual risks: the current subject has no external Claude verdict; the owner explicitly accepted that bounded review risk after all machine gates passed
- Reviewer action required: none; the valid `user_waiver` AcceptanceReceipt is recorded and exact-subject bound
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
- Run snapshot: contract total=15, failed=0, status=Fulfilled; final `verify-sprint` accepted the typed waiver without rerunning verification

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: ancienttwo
> **Reviewed Subject SHA256**: sha256:f47706820795e594d0184f43e68c447b2e3c90a438be1ee467d6fedfcf97b5e6
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 65c58c4f7f92df3383bd1cee2ef8f4e99eda8e2d
> **Verification Evidence SHA256**: sha256:91c4a41deda4d5e2dbbab9088f8d3718472d7abb01f2f1ccd27624bf269347d6
> **Issued At**: 2026-08-08T19:25:17.833Z

- Summary: User explicitly instructed to skip the frozen Claude review for AXR6 on 2026-08-09.
- Findings: none

## Behavior Diff Notes

- PostEdit writes a bounded v2 observation only; Stop coalesces eligible observations into one durable projection job.
- Source evidence is acknowledged only after a durable terminal receipt; failures, timeout, stale snapshot and unresolved-major signals remain retryable or dead-lettered.
- `ArchitectureRefreshSignalV1` is the only authority for major semantic refresh. repo-harness does not infer semantic importance from paths, diff size or Markdown.
- A stable source key owns delivery/dead-letter budget while the event id rotates per coalesced edit.
- Fresh abandoned running claims are quarantined for 150 seconds, longer than the 120-second provider bound, preventing a second apply while an orphan may still be alive.
- Managed `Stop.default` uses 150 seconds; all other managed hook routes remain at 30 seconds.

## Residual Risks / Follow-ups

- The current subject has no external semantic verdict because the required Claude provider was capacity-blocked; the owner accepted this bounded residual risk through the recorded waiver.
- Operational receipts and dead letters have no retention policy in AXR6; this is advisory follow-up, not an acceptance failure.
- An explicitly retried dead letter still requires the queue to be otherwise operable; the runtime reports the durable blockage rather than deleting evidence.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Machine gates and installed-host cycle pass |
| Product depth | 9/10 | Seven completed review rounds were repaired; external final verdict was waived |
| Design quality | 9/10 | Durable authority boundaries are implemented and tested |
| Code quality | 9/10 | Final repository suite passes; typed owner acceptance is exact-subject bound |

## Failing Items

- None. Claude review was explicitly skipped through the contract-authorized user waiver, not reclassified as an external pass.

## Retest Steps

- Re-run: `repo-harness run verify-sprint` verifies the exact typed receipt without rerunning contract commands.
- Re-check: `repo-harness run acceptance-receipt verify --contract tasks/contracts/20260808-2311-axr6-durable-architecture-projection-runtime.contract.md --verification .ai/harness/checks/latest.json`.

## Summary

- Implementation and machine verification are complete. Promotion is authorized by the typed `user_waiver`; the evidence deliberately preserves that provenance instead of converting it into a Claude pass.
