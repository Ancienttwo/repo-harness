# Task Review: codex-native-role-model-override

> **Status**: Complete
> **Plan**: plans/plan-20260711-0219-codex-native-role-model-override.md
> **Contract**: tasks/contracts/20260711-0219-codex-native-role-model-override.contract.md
> **Notes File**: tasks/notes/20260711-0219-codex-native-role-model-override.notes.md
> **Checks File**: `.ai/harness/checks/latest.json`
> **Last Updated**: 2026-07-11 19:49 +0800
> **Recommendation**: fail
> **Review Rubric Version**: 1
> **Reviewed Diff Fingerprint**: pending
> **Reviewed Scope**: branch+staged+unstaged+untracked

## Human Review Card

- Verdict: fail closed
- Change type: platform-capability investigation; candidate code reverted
- Intended files changed: contract Allowed Paths only
- Actual files changed: workflow/evidence artifacts only; no product diff remains
- Commands passed: focused candidate tests passed before runtime falsification, but cannot satisfy the runtime acceptance criterion
- External acceptance: unavailable
- Residual risks: GPT-5.6 V2 remains all-inherited-model by design of the exposed schema
- Reviewer action required: none until the user chooses which invariant may be relaxed
- Rollback: completed; no branch commit exists and the prior local fleet is restored

## Mode Evidence

- Selected route: Waza `/hunt`
- P1/P2/P3 evidence: corrected and recorded in the source plan
- Root cause or plan evidence: V2 reserved flat spawn lacks a role/model selection channel

## Verification Evidence

- Waza `/check` run: runtime canary is the authoritative acceptance surface; full product checks were not rerun after the candidate diff was removed
- Commands run: multiple `codex exec --json` A/B canaries with plain files, role registration, `use_agent_identity`, and `hide_spawn_agent_metadata=false`; one fresh explicit-name canary after updating to the latest published `codex-cli 0.144.1`
- Manual checks: child rollout `session_meta.source.subagent.thread_spawn.agent_role` and first `turn_context.model/effort`
- Supporting artifacts: the five canary families listed in the notes
- Implementation notes reviewed: yes
- Run snapshot: not applicable; goal blocked before a shippable product change

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:

- P1 blockers: native V2 cannot express the requested per-role model override
- P2 advisories: oh-my-openagent separates TOML agent routing from V2 team transport; it does not solve this binding
- Acceptance checklist: fail

## Behavior Diff Notes

- Same-name TOMLs, explicit registration, and identity feature variants all spawned `agent_role:null` children on Sol.
- The `0.144.1` explicit `explorer` retest also spawned `/root/explorer` with `agent_role:null` and inherited Sol/high, despite the current official documentation describing name-based custom-agent selection.
- Forcing spawn metadata caused a reserved-schema HTTP 400, matching the upstream v4.16.2 guard rationale.
- Candidate product edits and host installation were rolled back.

## Residual Risks / Follow-ups

- Any future implementation must explicitly change one invariant: native V2 transport, root Sol/xhigh, or worker Terra/xhigh.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | Requested runtime behavior is not achievable on the active native surface |
| Product depth | 8/10 | Platform boundary was proven through local canaries and tagged upstream source |
| Design quality | 9/10 | False-positive implementation was reverted at the falsifier |
| Code quality | 10/10 | No ineffective product code remains |

## Failing Items

- Native V2 worker remains Sol/inherited instead of Terra/xhigh.

## Retest Steps

- Re-test only after a newer Codex release exposes a GPT-5.6-compatible role/model selection field in the actual spawn surface, or after the contract explicitly permits a different runner. Documentation text alone is not a sufficient retest trigger.

## Summary

- Fail closed. The current native GPT-5.6 V2 schema cannot keep a Sol/xhigh root while selecting Terra/xhigh for a worker.
