# OAR deep integration plan

Date: 2026-10-14.
Status: the bounded observation correction is implemented in Draft PR [#741](https://github.com/Ancienttwo/repo-harness/pull/741). All other slices below are proposals. Recording this plan does not approve their execution.
Baseline: main `89837e523a333022465986684fd58784e7a08c04`, OAR `0.62.1`.
The [observation implementation plan](plan-20261014-oar-runtime-observation.md) records its scope and checks.

## Goal and system boundary

Make OAR coding and review tasks observable and recoverable under the existing task authority. Prioritize cache reuse across agent turns. Budget needs observation only; do not add local spending gates, automatic model downgrades or context cuts based on estimated cost. Lease, TaskRequest, TaskResult and AcceptanceReceipt retain their roles. OAR owns runtime observations and native turn results.

Direct coding sessions and native Herdr task-agent sessions do not use these OAR hosts. Gains in the OAR paths do not prove a gain for the whole coding SOP.

The supplied startup probes used Codex 0.162.1. They are report evidence, not fresh provider acceptance in this work. A zero-prompt open with an empty private CODEX_HOME does not prove authenticated work. Host exit or a foreground shell does not prove that a failed startup disposed all native resources.

## P1: Map

Coding: coding-session.ts, oar-coding-host.ts and coding-isolation.ts own admission, launch, the Session and Seatbelt. Review: generic-review.ts and oar-review-host.ts own the fixed review transport and Result wait. task-session.ts owns request delivery, process identity and cleanup. PM protocol owns its closed operation set. The Herdr notify plugin pushes only done or blocked.

The existing observation module serves both hosts. Extend that authority rather than adding another store or a native frame parser. S1 and S2 share host and task-session files. Their writers must be serialized or assigned disjoint files in separate worktrees.

## P2: Trace and pressure points

An admitted dispatch saves the request, launches the host and opens the native Session. The host sends the frozen input and observes a turn. The worker writes TaskResult. The owner validates and collects it. OAR phase and turn end are observations along that path.

The bounded correction removes raw-log file growth and reader replay. Remaining pressure points are startup failure cleanup, native state permissions, frequent review binding checks and missing Bot event delivery. Non-completed turns still end host service. The closed PM interface has no steer or cancel operation.

## P3: Decisions and slice order

The user clarified the priority on 2026-10-14: observe budget, then focus on each agent's cache-hit policy. Native quota failures remain runtime facts. The 16 KiB observation limit controls storage and private-data copying; it is not an inference budget. Existing request, review-round and timeout contracts are unchanged by this plan update.

Keep credentials and permission policy separate from observation. Keep host survival separate from retry authority. FailureAdvice gives recovery timing; it does not prove that replay is safe. A new request ID and a missing Result do not prove the absence of prior tool effects.

Finish the current review boundary first. Then evaluate the following bounded slices. Each slice needs its own approved scope and owning checks. Avoid concurrent writers on the shared hosts.

| Slice | Status and entrypoints | Stop condition and boundary |
| --- | --- | --- |
| S1a: bounded request observation | Implemented. task-runtime-observation.ts, task-session.ts, both hosts. | Production reads need no raw-log replay. Same-phase events refresh real time. Old outcomes cannot bind to new input. TaskResult authority stays intact. |
| S1b: typed telemetry and event delivery | Proposed. First add per-agent cache observations and a runtime policy inventory. Shared observation module, both hosts, generic-review.ts and assets/herdr/. | Usage/context and cache fields remain unavailable until reported. Tool categories and failure advice come from SDK functions. No native payload or local shadow parser. A real disposable Herdr fixture proves working-to-idle produces the required completion push; otherwise stop at the missing signal. Async reporting must not block the event loop. Review wait reads observations without inventing completion. |
| S2: admission and startup cleanup | Proposed. coding-session.ts, generic-review.ts, both hosts and task-session.ts. | Reject unsupported review runtime before launch. Run and cache preflight at dispatch, never in status. Cleanup requires the exact native launch identity and observed resource exit. A not-opened marker plus host exit is insufficient. No permission widening or credential probe is implied. |
| S0: coding native-state boundary | Needs separate credential and permission approval. coding-isolation.ts and coding-session.ts. | Bind an owner-prepared private native home to the exact task. Decide auth copy and expiry policy explicitly. Prove both permitted native state writes and denied protected writes. Verify nested sandbox behavior in the approved environment. Do not remove a sandbox setting merely to make a turn pass. |
| S3: failure survival and continuation | Proposed protocol change. Both hosts, task-session.ts and PM dispatch/follow-up. | Prove reusable Session behavior after failed and aborted turns. Runtime exit remains terminal. Require request ownership, worktree readback and an explicit continuation contract. Do not enable automatic replay from FailureAdvice. Gatekeeper review is required for the protocol change. |
| S4: bounded intervention | Proposed after survival semantics. PM schemas and host controls. | Add only an approved operation. Check the active request, capability and owner. Distinguish steer, cancel request, turn stop and disposal. Do not infer withdraw support from steer. |
| S5: explicit resume | Deferred until crash frequency and native-state ownership justify it. Session admission and request readback. | Restore only the native conversation under one writer. Start a new observation stream at seq 0. Preserve prior request identities. Never resend accepted or unknown delivery. Reject missing or unavailable native Session with SDK errors. |
| S6: structured review result | Paused. Generic review result and Receipt contracts. | Reopen only if malformed-result evidence justifies it and an authoritative producer contract exists. OAR outputSchema does not validate output. Codex text and Claude structured values cannot bypass the existing Receipt rule. |

S2 can diagnose startup without S0, but authenticated coding proof depends on an approved S0 boundary. S4 and S5 depend on the survival and ownership decisions. S3 is not permission to launch repeated attempts.

## Per-agent cache policy

Status: proposed. This section changes the plan priority. It does not change runtime configuration, prompt bytes, credentials or provider calls.

### P1 and P2: Current control boundary

OAR 0.62.1 TokenTotals exposes input, optional cacheRead and optional cacheWrite. Input already includes cache reads and writes. Session.usage() exposes session totals and reported agent breakdowns. The current capture does not contain these fields. SessionOptions has no common cache key, breakpoint or TTL option.

Coding sends serialized TaskRequest before content in oar-coding-host.ts. Review prefixes the packet the same way in oar-review-host.ts. IDs, rounds and paths vary. This limits reuse of the new packet body across requests from its first changed token. It does not prove that an existing native Session loses its cached earlier history. Both hosts already reuse a Session for sequential requests.

Review loads the deep-reasoner fleet prompt and a fixed Result-writing rule into appendSystemPrompt. Coding takes model and effort from operator admission. Native runtimes also add instructions and tools that these call sites do not fully expose. A local prompt hash cannot prove equality of the full provider-rendered prefix.

### Runtime policy inventory

Read the policy for the actual runtime, model and endpoint. Do not assign one TTL or cache key rule to all agents. Keep the effective fleet role separate from the provider model.

| Runtime or agent route | Policy to preserve | Verified control boundary |
| --- | --- | --- |
| Codex / OpenAI | Keep instructions, tool definitions and order, model settings and earlier history stable. OpenAI cache behavior differs by model generation. A persistent Session helps preserve history but does not guarantee a cache hit. | The OpenAI API has model-specific breakpoint, retention and key settings. GPT-5.6 and later handle routing automatically; a key serves separate cache accounting. Older models use a stable key for routing. These API options are not common OAR SessionOptions. Verify a native Codex channel before proposing a knob. [OpenAI policy](https://developers.openai.com/api/docs/guides/prompt-caching). |
| Claude Code / Anthropic | Preserve the tools, system and message prefix in that order. Keep stable role instructions and Result rules in the Session. Prefer a longer native retention policy for long gaps only when that channel supports it. | Claude Code manages caching. The Claude API supports 5-minute and 1-hour TTLs. API support does not establish an OAR/Claude Code override. Record the actual reported policy or mark it unavailable. [Claude Code](https://code.claude.com/docs/en/costs), [Claude API policy](https://platform.claude.com/docs/en/build-with-claude/prompt-caching). |
| Grok native / xAI | Preserve conversation items and stable instructions. A supported route should keep its conversation routing identity stable across turns. | xAI uses x-grok-conv-id for Chat Completions and prompt_cache_key for Responses. OAR/native CLI forwarding remains unverified here. This is inventory, not permission to admit Grok into a fixed Codex host. [xAI policy](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/maximizing-cache-hits). |
| Hermes, Dot and other Bot hosts | Identify their actual upstream provider, model and transport before selecting a policy. Preserve their profile and tool catalog where the host controls them. | Agent identity alone does not establish a provider cache mechanism. Native cache counts or policy settings that are not exposed stay unavailable. Do not copy API knobs into an unrelated host. |

### P3: Host policy

- Put reusable instructions and reference material before variable request content where the native contract permits it. Preserve the canonical TaskRequest, exact source binding and Result contract. Reordering the current first-line request header needs its own packet-contract and fixture change; this plan does not do it.
- Keep the role prompt, tool schemas and ordering stable within a work package. Treat a changed prompt, tool catalog, model, endpoint or compaction boundary as a new measured condition. Do not silently change model or effort to increase hit rate.
- Reuse the native Session for the same task and role under its existing owner. Shared static prefixes may allow provider reuse across agents. They do not permit sharing a Session or leaking task history across ownership boundaries.
- Distinguish the canonical request UUID from any provider cache-routing identity. A cache key must follow that provider's grouping and isolation policy. Never use a new per-request UUID as a default cache key, or assume one global key is suitable for all agents.
- Preserve earlier messages and native reasoning items through the runtime's supported channel. Do not rewrite old history for cache reuse. Record compaction or resume as a boundary; do not infer that it preserves warm cache.
- Select supported TTL from the observed turn interval and provider rules. Do not send keepalive prompts or prewarm requests in this slice. Cache residency remains provider-managed and cannot be guaranteed by host Session lifetime.

### Observation and stop condition

First expose native input, cacheRead and cacheWrite with agent role, runtime, reported model, Session and observation window. Use the SDK-reported byAgent breakdown when present. Do not double-count total, byAgent and withChildren. Keep unreported fields unavailable, including cacheWrite on older native builds.

For a window with compatible cumulative samples, input greater than zero and reported cacheRead, token hit share is cacheRead divided by input. Input already includes cached tokens. A fresh Session, reset counter, missing baseline or unmatched attribution makes that window unavailable. A session-wide delta is a window measure, not proof of exact request or subagent consumption. Aggregate by sums within compatible groups and report missing-data coverage. Do not average per-agent percentages or add cached input again to the denominator.

Separate first-turn cold samples, later warm samples, post-compaction/resume samples and idle-gap samples. Compare native cache reads and time to first token. Record local prefix changes where observable. Do not label a provider miss as TTL expiry or key mismatch unless the provider reports that cause.

Stop this slice when each admitted runtime has a sourced policy row, supported controls are distinguished from unavailable controls, native cache observations are correctly attributed, and scripted accounting fixtures cover missing fields and Session resets. Budget remains observation only. Provider hit-rate and latency claims require a separately approved live-provider run.

## Evidence and acceptance

Use separate evidence for SDK fixtures, real Herdr status/notify behavior, OS permission boundaries, zero-prompt native startup and authenticated provider work. Do not report one category as another.

Record channel, runtime version, request identity and revision for measurements. Compare per-agent cache read share, cache writes, first-turn versus later-turn latency, startup failures, cleanup_pending frequency, binding checks per wait and Bot completion latency. Record budget usage without making it a local dispatch gate. Do not claim a numeric SOP speedup before measuring the same channel and workload.

At ten times the task count, per-task process checks and native runtime resources remain costs. A bounded capture controls only its own file and reader cost. S1b must measure whether event delivery actually reduces polling before claiming an efficiency gain.

## Immediate closeout

Consume the current PR CI and run one Claude read-only review through an authorized Herdr pane. Focus that review on source correctness, privacy of saved fields, timer failure handling, request isolation and whether the changed assertions preserve the original authority checks. Keep the PR Draft until this gap closes. No main publication or release is approved by this plan.
