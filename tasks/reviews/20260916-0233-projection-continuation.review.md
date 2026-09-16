# Review: Projection continuation

> **Status**: Pending
> **Recommendation**: fail
> **Scope**: Local source and process/receipt verification; no merge or release approval
> **Reviewer**: gatekeeper agent continuation_gate
> **Base**: d52f9a9be7a8056f6ece98e8ff1d7684cd3b7672
> **Reviewed Tree**: 31c9d1f5234b772ebe759fd9d2d567db2538e6de
> **Reviewed Snapshot**: sha256:aa785570e7194668dc6b96a90d85100cd5bef039f1e99f37cbf687e103290fe3

The read-only review found no blocking source defect in the four production files and associated tests. The existing queue authority, policy reread, Stop-write ordering, strict gate and source/bundle lifetime remain intact. Actual archctx receipt was verified in a disposable fortune-algo copy.

The initial evidence BLOCKED verdict was resolved after canonical preparation: all 15 current_exact checks are backed by immutable run records. The reviewer verified 4,689 Git-visible file contents/modes against the frozen tree and validated the materialized report through the canonical redaction and verification validator. No second source review or test execution was performed by the reviewer.

This PASS binds the frozen tree above. Final plan/contract/notes/review-only changes are checked by the existing baseline_with_delta contract policy. Publication and installation remain unverified; formal merge/release acceptance is not claimed.

## Acceptance Receipt Projection

> **Disposition**: reject
> **Reviewer**: Codex
> **Source**: codex-plugin
> **Actor**: codex-plugin
> **Reviewed Subject SHA256**: sha256:7ff07497c672adec86cfe72c9b8662826ab9c46b23d7727a4e2fb991667ab7a0
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: d52f9a9be7a8056f6ece98e8ff1d7684cd3b7672
> **Verification Evidence SHA256**: sha256:093ecd3f1336d4eb89596a977909654a1747d6492c6fac8918917cc44c570870
> **Issued At**: 2026-09-16T02:12:23.995Z

- Summary: Do not ship yet: detached execution exposes a strict Stop gate bypass. Review was static; tests were not run.
- Findings: P2: Keep strict Stop blocked while the continuation owns unfinished work (src/cli/hook/stop-handler.ts:699-702) — After this launch, a subsequent Stop can encounter the child’s running job. projection-orchestrator.ts returns status='idle' for an existing running claim (lines 98 and 103), but the strict gate in stop-handler.ts:844 only blocks errors, retry-pending, or dead-letter. Consequently, with other gates satisfied, Stop succeeds before any completion receipt exists—even if the child subsequently fails. The added test checks only the launching Stop, missing this second-Stop bypass. Recommendation: Make strict gating account for unfinished queue work, including an idle drain with a running claim. Add a regression that holds the detached worker open, invokes another Stop, and verifies blocking until successful receipt completion.
