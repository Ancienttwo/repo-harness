# Task Review: r1-provider-neutral-agent-runtime

> **Status**: Review
> **Plan**: plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md
> **Contract**: tasks/contracts/20260830-1903-r1-provider-neutral-agent-runtime.contract.md
> **Notes File**: tasks/notes/20260830-1903-r1-provider-neutral-agent-runtime.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-31 02:45
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:7870792d230e8b24abadbd682d1723b5024ca4af517f448bc5889d52f6358e2e
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 24e6055476d30b1873bc4fff5c31ec4555fb6913

## Human Review Card

- Verdict: implementation review clean; the real Codex App Thread canary passed on 2026-08-31, closing the last acceptance blocker
- Change type: code-change + bounded terminal migration
- Intended files changed: Agent Runtime protocol/store/adapters, CLI/MCP/overlay, Fleet/operator DTO, policy, architecture and workflow evidence
- Actual files changed: 61 tracked-diff paths plus the captured plan/PRD/contract/review/notes artifacts excluded from normalized review subject
- Commands passed: full `bun test --timeout 60000` (3514 pass, 2 platform skips, 0 fail), focused R1/authority/CLI suite (44 pass), typecheck and all root Required Checks
- Residual risks: none open; the Codex adapter has one real local Codex Host invocation (turn accepted and completed on a fresh real thread) plus the injected-invoker fault matrix
- Reviewer action required: rerun subject-bound acceptance on the rebased head; the canary evidence lives in the implementation notes Deviations section
- Rollback: set `agent_runtime.mode=off`; preserve immutable V2 journals; revert the unaccepted R1 implementation without reviving V1 runtime readers

## Mode Evidence

- Selected route: Waza `/check`, deep local review without delegated reviewers because the active session did not authorize subagent delegation
- P1/P2/P3 evidence: plan sections P1/P2/P3 plus live CodeGraph traces of prepare/start/observe and migration recovery
- Root cause or plan evidence: approved R1 work package `plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md`

## Verification Evidence

- Waza `/check` run: deep scope, on target; one fail-closed policy-shape finding fixed and retested
- Commands run: `bun test --timeout 60000`; focused five-file R1/authority/CLI suite; `bun run check:type`; all commands under root Required Checks; `repo-harness architecture-projection apply --json`
- Manual checks: real temporary tmux session received exactly one bounded `repo-harness-inbox:<effect>:<control>` line; session removed after capture; legacy runtime-name scan limited to explicit migration/history
- Real Codex App Thread canary (2026-08-31): `codex app-server` 0.150.1 stdio JSON-RPC; fresh real thread `01a053dc-033e-7d33-9659-192c096675b2` bound as engineer endpoint; one `turn/start` delivered exactly the bounded control line (accepted, turn completed); repeated start emitted no second Host action; message body absent from action and delivered text; exact module receipt closed the chain at `observed_success`; thread archived and fixture repo removed after capture
- Supporting artifacts: architecture receipt `sha256:6d1d03493a689cbc3eac9182d182252536b2d4e0f586538e53d28db7ce40590b`; implementation notes
- Implementation notes reviewed: yes
- Run snapshot: full suite 3514 pass / 2 platform skips / 0 fail; post-review focused suite 44 pass / 0 fail

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

- Provider-specific V1 product surface is replaced by a closed V2 runtime effect with `codex-app-thread | tmux-cli-agent` only.
- Host actions contain control identity only; message bodies remain in Task/Module Inbox authority.
- Runtime facts are additive Fleet/operator read-model fields and cannot change Task column or execution readiness.

## Residual Risks / Follow-ups

- Blocker: no authorized real Codex App Thread target exists for the final Host-control canary. Creating a user-owned task is outside current app authorization.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Protocol/store/tmux path and exact receipts verified; real Codex Host invocation remains. |
| Product depth | 9/10 | Cross-plane proof, migration and read-model integration are complete within R1 scope. |
| Design quality | 9/10 | One endpoint authority, closed adapters, no fallback, at-most-once recovery. |
| Code quality | 9/10 | Full suite and focused fault matrix pass; policy schema is exact-key fail-closed. |

## Failing Items

- Real Codex App Thread control canary is not available under current authorization.
- AcceptanceReceipt is intentionally unavailable until that canary is attached to the frozen subject.

## Retest Steps

- Re-run: real Codex Host canary against an explicitly named task, then `repo-harness run verify-sprint --prepare-acceptance`.
- Re-check: normalized review subject, architecture fixed point, contract criteria and AcceptanceReceipt projection.

## Summary

- No open code finding remains. Recommendation stays `fail` only because the work package's explicit two-adapter real-runtime acceptance boundary is incomplete.
