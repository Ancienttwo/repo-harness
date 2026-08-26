> **Archived**: 2026-08-26 22:40
> **Related Plan**: plans/archive/plan-20260826-1558-archctx-v2-provider-acceptance.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260826-2240

# Task Review: archctx-v2-provider-acceptance

> **Status**: Pass
> **Plan**: plans/plan-20260826-1558-archctx-v2-provider-acceptance.md
> **Contract**: tasks/contracts/20260826-1558-archctx-v2-provider-acceptance.contract.md
> **Notes File**: tasks/notes/20260826-1558-archctx-v2-provider-acceptance.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-26 17:25
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:1194d540ff9a30faf353d43a6c03d15cd61a2c2aaa316a1580f302e0ba49be5b
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 42b8d1e2bc8ce7fd98b8ee6972c1d58240fb9494

## Human Review Card

- Verdict: pass for repo-harness integration against the published exact ArchContext 0.4.5 packages.
- Change type: code-change
- Intended files changed: projection v2 contract, provider, durable jobs/orchestrator, CLI status, focused and fixture tests, workflow artifacts.
- Actual files changed: matches the widened contract `allowed_paths`, including exact package/lock, policy, generated-template and live fixture pins.
- Commands passed: registry-package real three-state cycle; focused 52-test state-machine suite; 128 package/policy/runtime tests; typecheck; clean-room 0.4.5 packaging; normal architecture/task/deploy gates without an overlay; strict contract 11/11.
- Residual risks: full suite has one unrelated persistent HRD-09 timeout; real upstream selector integration still requires CI to expose the pinned CodeGraph 1.5.0 binary.
- Reviewer action required: complete; typed external-pass AcceptanceReceipt is recorded and the final sprint gate passes.
- Rollback: revert this work-package as one unit; no repo-harness migration or persistent product state was introduced.

## Mode Evidence

- Selected route: isolated contract worktree plus local tarball runtime acceptance.
- P1/P2/P3 evidence: captured in the plan and independently exercised by the real provider trace.
- Root cause or plan evidence: existing provider unconditionally compared a fresh retry to the original result snapshot and treated every committed post-write divergence as an ordinary failure.

## Verification Evidence

- Waza `/check` run: equivalent bounded review performed against the final diff and real package bytes.
- Commands run: see implementation notes `Verification Results`.
- Manual checks: verified no v1 acceptance path, no signed-result mutation, receipt correlation on accepted change/repository/workspace, and retained provider stderr.
- Supporting artifacts: `/private/tmp/archctx-v2-provider-real-acceptance.json`, `/private/tmp/archctx-v2-provider-published-acceptance.json`, registry and release digests in notes.
- Implementation notes reviewed: yes.
- Run snapshot: focused suites, registry runtime evidence and normal package-local architecture gate pass; one unrelated full-suite timeout remains recorded, not hidden.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Codex
> **Source**: codex-plugin
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:efba14d82f0aabf896c43fe67bc1db39a3f8913e5f530a43d91a0784edc5d6fc
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 664c9224c91766ce2aaefb37d846184db728bb9b
> **Verification Evidence SHA256**: sha256:3c78550e9e050613103cbe194340de541623b60930654fbd59e9ddaadd7c53a9
> **Issued At**: 2026-08-26T14:38:57.025Z

- Summary: Published ArchContext 0.4.5 exact pins pass the projection-result/v2 provider state machine, registry-byte, package-local, architecture-sync, and strict contract gates against latest main.
- Findings: none

## Behavior Diff Notes

- Pre-write stale remains a thrown provider failure with no receipt or reconciliation state.
- Post-write concurrent non-owned mutation becomes durable `reconcile-pending`; it does not consume attempts or refresh signals.
- Receipt retry accepts only exact accepted-change/repository/workspace correlation, asserts the fresh disk snapshot, delivers the original signal once, and converges to noop.

## Residual Risks / Follow-ups

- CI must keep a real `codegraph` binary for the production structured-index selector test.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Real three-state cycle and fail-closed stale path passed. |
| Product depth | 9/10 | Durable receipt, signal consumption, and orchestration retry are covered end to end. |
| Design quality | 9/10 | Signed upstream result remains immutable; diagnostics own local observation. |
| Code quality | 9/10 | Strict v2 decoder, bounded correlation, and focused regressions; no new dependency. |

## Failing Items

- None in the acceptance scope. The HRD-09 timeout is unrelated and reproduces standalone.

## Retest Steps

- Re-run: registry-installed provider cycle, focused 52-test suite, and `bash scripts/check-architecture-sync.sh` without an overlay.

## Summary

- ArchContext `projection-result/v2` is accepted from the exact published 0.4.5 packages. The provider preserves all three reconciliation states, visible concurrent-mutation evidence, fail-closed pre-write behavior and exactly-once refresh consumption without a compatibility path.
