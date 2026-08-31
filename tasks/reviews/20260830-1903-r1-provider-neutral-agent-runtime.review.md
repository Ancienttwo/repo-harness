# Task Review: r1-provider-neutral-agent-runtime

> **Status**: Accepted
> **Plan**: plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md
> **Contract**: tasks/contracts/20260830-1903-r1-provider-neutral-agent-runtime.contract.md
> **Notes File**: tasks/notes/20260830-1903-r1-provider-neutral-agent-runtime.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-31 02:45
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:966c490cf1b5f80d82a023d6b4644720bf82dd82b87f3079c8e9d28383d2f21e
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: aef4edff1fd21ca97643e0d13cf5fd29ba746d69

## Human Review Card

- Verdict: implementation review clean; the real Codex App Thread canary passed on 2026-08-31, closing the last acceptance blocker
- Change type: code-change + bounded terminal migration
- Intended files changed: Agent Runtime protocol/store/adapters, CLI/MCP/overlay, Fleet/operator DTO, policy, architecture and workflow evidence
- Actual files changed: the tracked-diff path count drifts with each fix round (frozen selection packet is the authority); captured plan/PRD/contract/review/notes artifacts stay excluded from the normalized review subject
- Commands passed: full `bun test --timeout 60000` green at each frozen round (latest run snapshot `run-20260831T042558-70779`; counts drift with the fix rounds, so the snapshot is the count authority), focused R1/task-message/inbox/authority/CLI suites green after the correlation hardening, typecheck and all root Required Checks
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
- Receipt-correlation hardening (2026-08-31, Codex acceptance round): success now requires this exact effect's bounded control reference on the delivery evidence — the Module observation chain must carry `provider_delivery_ref === control_ref` at the effect's delivery attempt, and Task delivery settles `delivery_channel: agent_runtime_effect` with the exact `delivery_ref` at delivery time (hook/manual lanes can never prove an effect); negative tests cover null ref, foreign ref, and hook-lane delivery
- Real Codex App Thread canary (2026-08-31, rerun after receipt-correlation hardening): `codex app-server` 0.150.1 stdio JSON-RPC; fresh real thread `01a0544f-3a0a-7352-b3ad-e44dec748eab` (supersedes thread `01a053dc-033e-7d33-9659-192c096675b2` from the pre-hardening run); the delivered module observation now carries the exact `control_ref`, closing the chain under the hardened success rule bound as engineer endpoint; one `turn/start` delivered exactly the bounded control line (accepted, turn completed); repeated start emitted no second Host action; message body absent from action and delivered text; exact module receipt closed the chain at `observed_success`; thread archived and fixture repo removed after capture
- Supporting artifacts: architecture receipt `sha256:6d1d03493a689cbc3eac9182d182252536b2d4e0f586538e53d28db7ce40590b`; implementation notes
- Implementation notes reviewed: yes
- Run snapshot: the latest frozen `verify-sprint` run under `.ai/harness/runs/` is the count authority for each round; post-hardening focused suites are green (R1 suite 18 pass, task/inbox/authority/CLI suites green)

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Codex
> **Source**: codex-plugin
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:966c490cf1b5f80d82a023d6b4644720bf82dd82b87f3079c8e9d28383d2f21e
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: aef4edff1fd21ca97643e0d13cf5fd29ba746d69
> **Verification Evidence SHA256**: sha256:71afc045781ec3f70733a11d4ef7cc340df2b22f53386c959068b5f1b714cd3f
> **Issued At**: 2026-08-31T00:57:00.440Z

- Summary: Round-4 Codex xhigh review on subject 966c490c (diff HEAD 809895d8 + plan source-ref row-index fix ea6a978b): VERDICT PASS; all three round-3 findings closed (attempt-direction observe, replay identity, module-scope fence); final sweep found no bypass path to observed_success without the exact control reference; Codex Host canary thread 01a0544f recorded in review card.
- Findings: none

## Behavior Diff Notes

- Provider-specific V1 product surface is replaced by a closed V2 runtime effect with `codex-app-thread | tmux-cli-agent` only.
- Host actions contain control identity only; message bodies remain in Task/Module Inbox authority.
- Runtime facts are additive Fleet/operator read-model fields and cannot change Task column or execution readiness.

## Residual Risks / Follow-ups

- The real Codex App Thread canary blocker is closed (2026-08-31); remaining follow-up is the receipt-correlation hardening review round recorded in Deviations.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Protocol/store/both adapter paths and exact effect-bound receipts verified, including the real Codex Host invocation. |
| Product depth | 9/10 | Cross-plane proof, migration and read-model integration are complete within R1 scope. |
| Design quality | 9/10 | One endpoint authority, closed adapters, no fallback, at-most-once recovery. |
| Code quality | 9/10 | Full suite and focused fault matrix pass; policy schema is exact-key fail-closed. |

## Failing Items

- (none)

## Retest Steps

- Re-run: `repo-harness run verify-sprint --prepare-acceptance --contract tasks/contracts/20260830-1903-r1-provider-neutral-agent-runtime.contract.md` after each fix round; the frozen subject is rebound to the fixing HEAD.
- Re-check: normalized review subject, architecture fixed point, contract criteria and AcceptanceReceipt projection.

## Summary

- No open code finding remains. Both real-runtime adapter canaries (tmux session and Codex App Thread) passed, and the Codex acceptance rounds closed the receipt-correlation findings; recommendation is `pass` pending the final subject-bound re-review of this fix round.
