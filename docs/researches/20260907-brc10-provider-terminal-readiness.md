# BRC10 provider terminal evidence readiness

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

Status: historical design investigation. The parent has specified and implemented the producer/fence/recovery boundary in [BRC10 lifecycle](20260907-brc10-lifecycle.md); final acceptance remains with that work-package. The gaps below describe the pre-implementation baseline, not prerequisites delegated to the user.

Source baseline: `22e009e6fd401d0fc51fe79c041c5f5a4e42ca65` (PR #337), based on accepted main `188ae3529695623022c015c0cae0f7ec0b1304a4`. This investigation does not extend PR #337's supervised-renewal acceptance to reclaim or recovery.

## Observed producer boundaries

| Boundary | Existing evidence | Limit for campaign reclaim |
| --- | --- | --- |
| `src/effects/engineers/delegated-run-store.ts#dispatchDelegatedRun` | Capability verifies executable path/hash/version, fixed argv, environment; immutable process receipt references exact output blobs. Launch is persisted before execution. | Its admitted mode and `CODEX_READ_ONLY_ARGV_TEMPLATE` are read-only. Campaign writable commands cannot be routed through it by changing a flag. Its completed state alone is a process outcome, not a provider terminal observation. |
| `src/effects/collaboration/provider-output-adapter.ts#parseCodexExecStructuredOutput` | Decodes provider JSONL with one `thread.started`, one `turn.completed`, final agent message and usage. The store consumer verifies the receipt's stdout blob digest first. | Parsing arbitrary shell stdout would discard the producer binding. The parser does not establish absence of detached remote effects or establish campaign/Claim identity. |
| `scripts/contract-run.ts#runChild` | Campaign supervisor records the actual local invocation's bounded result, timeout and scoped process-group observation; renewal runs while the child is alive. | The input remains an arbitrary shell command. Exit zero, a local runtime digest or text resembling Codex JSONL cannot prove provider terminal state. |
| `src/effects/engineers/agent-runtime-adapters/codex-app-thread.ts` | Typed notify/wake adapter observation. | The callback's accepted result is not a worker turn completion and carries no worker provider terminal receipt. |
| `src/effects/automation/campaign-provider-execution.ts` | Budget reservation and outcome for the GitHub adapter's actual calls. | It does not observe internal provider calls made by the standalone child. |

## Trace and decision boundary

The current campaign path is authorization -> acquired Task/ClaimActor/WorkEnvelope -> durable launch/runtime identity -> arbitrary child -> local supervisor observation -> campaign final and settlement. The missing edge is an observed provider invocation and its terminal record, bound to that same dispatch and Lease generation.

A candidate provider terminal consumer must read persisted evidence produced at the actual trusted invocation boundary. It must bind the executable/argv invocation, raw output digest, provider identity and terminal event to the campaign dispatch/attempt/Claim/generation. Missing, malformed, failed, cancelled or timed-out terminal evidence remains unknown. Local process-group quiescence is a separate scoped observation and cannot stand in for remote provider evidence. Provider-issued operation/status authority is required if work can outlive the CLI turn.

The existing read-only delegated transport supplies useful evidence primitives, but extending its authority to writable execution is not a mechanical reuse. A concrete writable producer, or another real and safely reachable recovery state whose effects are provably absent, must be established before approving the full lifecycle plan. An injected boolean, fixture-only affirmative path, or always-unknown implementation does not fulfill the BRC10 reclaim requirement.

## Parent design disposition

Source inspection rejects direct reuse of `AutomationControllerRun` current/event as campaign-controller terminal proof: `campaign-worker.ts` derives a budget run identity but does not create or operate the generic `controller-run.ts` lifecycle. A coincident run identifier cannot establish that missing ownership edge. The campaign journal needs its own dispatch-bound terminal/fence record, consumed by its actual spawn boundary.

A prelaunch reclaim path also needs a real liveness baseline. Today the first renewal happens at the end of `beforeChild`, after launch reservation and runtime identity persistence. Merely observing an old handoff with no launch does not supply a #286 expiry observation. Any prelaunch arm must be durably bound to the handoff and checked under the same admission fence as launch; it must not loosen active-child renewal validation.

The necessary implementation boundary is therefore provider invocation evidence plus campaign lifecycle fencing, followed by the existing steal and exact rebind consumer. It is not a new scheduler or a promotion of the read-only delegated capability. The full plan cannot become executable until the actual provider producer and controller fence are specified; a generic `intent -> terminal` schema without its invocation producer would leave the original gap unchanged.

## Remaining recovery contract

Keep the campaign append-only journal as the recovery authority. Before existing `automaticReclaimLease`/steal, persist an exact intent and preselected next claim ID. Resume only that new reserving/bound generation on the original worktree; revalidate Task revision, authorization, binding and topology, then use existing bind/token/ClaimActor producers. Never replay ordinary acquisition or child execution during recovery. Crash tests must cover intent, steal, bind, token and actor boundaries, with two competing processes producing one owner.

Controller terminal, runtime inactivity and publication inactivity each need their owning producer. The remaining design pass must identify all three, including which states have affirmative evidence and which remain attention. Expiry and PID observations cannot close any of those gaps.

## Validation scope

This document records source inspection only. No real provider was invoked, no writable authority was changed, and no additional full suite or semantic review of PR #337 was run. The investigation used CodeGraph and direct source reads; the remaining provider/recovery boundary is not accepted implementation.
