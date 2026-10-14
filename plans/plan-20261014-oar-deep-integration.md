# OAR deep integration plan

Date: 2026-10-14.
Status: the bounded observation correction is implemented in Draft PR [#741](https://github.com/Ancienttwo/repo-harness/pull/741). All other slices below are proposals. Recording this plan does not approve their execution.
Baseline: main `89837e523a333022465986684fd58784e7a08c04`, OAR `0.62.1`.
The [observation implementation plan](plan-20261014-oar-runtime-observation.md) records its scope and checks.

## Goal and system boundary

Make OAR coding and review tasks observable and recoverable under the existing task authority. Lease, TaskRequest, TaskResult and AcceptanceReceipt retain their roles. OAR owns runtime observations and native turn results.

Direct coding sessions and native Herdr task-agent sessions do not use these OAR hosts. Gains in the OAR paths do not prove a gain for the whole coding SOP.

The supplied startup probes used Codex 0.162.1. They are report evidence, not fresh provider acceptance in this work. A zero-prompt open with an empty private CODEX_HOME does not prove authenticated work. Host exit or a foreground shell does not prove that a failed startup disposed all native resources.

## P1: Map

Coding: coding-session.ts, oar-coding-host.ts and coding-isolation.ts own admission, launch, the Session and Seatbelt. Review: generic-review.ts and oar-review-host.ts own the fixed review transport and Result wait. task-session.ts owns request delivery, process identity and cleanup. PM protocol owns its closed operation set. The Herdr notify plugin pushes only done or blocked.

The existing observation module serves both hosts. Extend that authority rather than adding another store or a native frame parser. S1 and S2 share host and task-session files. Their writers must be serialized or assigned disjoint files in separate worktrees.

## P2: Trace and pressure points

An admitted dispatch saves the request, launches the host and opens the native Session. The host sends the frozen input and observes a turn. The worker writes TaskResult. The owner validates and collects it. OAR phase and turn end are observations along that path.

The bounded correction removes raw-log file growth and reader replay. Remaining pressure points are startup failure cleanup, native state permissions, frequent review binding checks and missing Bot event delivery. Non-completed turns still end host service. The closed PM interface has no steer or cancel operation.

## P3: Decisions and slice order

Keep credentials and permission policy separate from observation. Keep host survival separate from retry authority. FailureAdvice gives recovery timing; it does not prove that replay is safe. A new request ID and a missing Result do not prove the absence of prior tool effects.

Finish the current review boundary first. Then evaluate the following bounded slices. Each slice needs its own approved scope and owning checks. Avoid concurrent writers on the shared hosts.

| Slice | Status and entrypoints | Stop condition and boundary |
| --- | --- | --- |
| S1a: bounded request observation | Implemented. task-runtime-observation.ts, task-session.ts, both hosts. | Production reads need no raw-log replay. Same-phase events refresh real time. Old outcomes cannot bind to new input. TaskResult authority stays intact. |
| S1b: typed telemetry and event delivery | Proposed. Shared observation module, both hosts, generic-review.ts and assets/herdr/. | Usage/context remain null until reported. Tool categories and failure advice come from SDK functions. No native payload or local shadow parser. A real disposable Herdr fixture proves working-to-idle produces the required completion push; otherwise stop at the missing signal. Async reporting must not block the event loop. Review wait reads observations without inventing completion. |
| S2: admission and startup cleanup | Proposed. coding-session.ts, generic-review.ts, both hosts and task-session.ts. | Reject unsupported review runtime before launch. Run and cache preflight at dispatch, never in status. Cleanup requires the exact native launch identity and observed resource exit. A not-opened marker plus host exit is insufficient. No permission widening or credential probe is implied. |
| S0: coding native-state boundary | Needs separate credential and permission approval. coding-isolation.ts and coding-session.ts. | Bind an owner-prepared private native home to the exact task. Decide auth copy and expiry policy explicitly. Prove both permitted native state writes and denied protected writes. Verify nested sandbox behavior in the approved environment. Do not remove a sandbox setting merely to make a turn pass. |
| S3: failure survival and continuation | Proposed protocol change. Both hosts, task-session.ts and PM dispatch/follow-up. | Prove reusable Session behavior after failed and aborted turns. Runtime exit remains terminal. Require request ownership, worktree readback and an explicit continuation contract. Do not enable automatic replay from FailureAdvice. Gatekeeper review is required for the protocol change. |
| S4: bounded intervention | Proposed after survival semantics. PM schemas and host controls. | Add only an approved operation. Check the active request, capability and owner. Distinguish steer, cancel request, turn stop and disposal. Do not infer withdraw support from steer. |
| S5: explicit resume | Deferred until crash frequency and native-state ownership justify it. Session admission and request readback. | Restore only the native conversation under one writer. Start a new observation stream at seq 0. Preserve prior request identities. Never resend accepted or unknown delivery. Reject missing or unavailable native Session with SDK errors. |
| S6: structured review result | Paused. Generic review result and Receipt contracts. | Reopen only if malformed-result evidence justifies it and an authoritative producer contract exists. OAR outputSchema does not validate output. Codex text and Claude structured values cannot bypass the existing Receipt rule. |

S2 can diagnose startup without S0, but authenticated coding proof depends on an approved S0 boundary. S4 and S5 depend on the survival and ownership decisions. S3 is not permission to launch repeated attempts.

## Evidence and acceptance

Use separate evidence for SDK fixtures, real Herdr status/notify behavior, OS permission boundaries, zero-prompt native startup and authenticated provider work. Do not report one category as another.

Record channel, runtime version, request identity and revision for measurements. Compare startup failures, cleanup_pending frequency, binding checks per wait and Bot completion latency. Do not claim a numeric SOP speedup before measuring the same channel and workload.

At ten times the task count, per-task process checks and native runtime resources remain costs. A bounded capture controls only its own file and reader cost. S1b must measure whether event delivery actually reduces polling before claiming an efficiency gain.

## Immediate closeout

Consume the current PR CI and run one Claude read-only review through an authorized Herdr pane. Focus that review on source correctness, privacy of saved fields, timer failure handling, request isolation and whether the changed assertions preserve the original authority checks. Keep the PR Draft until this gap closes. No main publication or release is approved by this plan.
