# PRD: Provider-Neutral Agent Runtime Adapter and tmux Endpoint

> **Status**: Approved
> **Slug**: `provider-neutral-agent-runtime-adapter`
> **Created**: 2026-08-30T18:27:10+0800
> **Updated**: 2026-08-30T19:03:00+0800
> **Approval**: Human-approved in the originating Codex task on 2026-08-30
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260828-2321-collaborative-work-exchange-agent-succession.prd.md`
> **Extends**: `plans/prds/20260825-1551-provider-thread-effect-adapter.prd.md`
> **Depends On**: ME-1C durable messages, ME-3A Provider Thread Effect journal, Child PRD A C6 collaboration snapshot and run-context binding
> **Program Sprint**: `plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`
> **Architecture Request**: `docs/architecture/requests/archive/2026/runtime-harness-provider-thread-effects.md` (Resolved)
> **Implementation Plan**: `plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md` (Approved, not activated)
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: repo-harness can deliver through Claude/Codex turn hooks and one hard-coded `codex-app-thread` effect adapter, but it cannot address another terminal-based harness Agent through the same persisted, fenced and observable delivery contract. The Operator Board therefore cannot distinguish pending, delivered, acknowledged and runtime-unavailable work across heterogeneous local Agents.
- **Users**: Maintainer / Human Operator, current Task owner, Module Engineer, terminal-based harness Agent, collaboration canary operator.
- **Platform**: provider-neutral runtime-effect contract; Codex App Thread and an optional local `tmux-cli-agent` adapter; Task/Module Inbox remain the message authorities.
- **P0 surface**: exact runtime endpoint binding through the existing `EngineerBindingV1`; closed adapter capability observation; persist-first wake/send effect; Task/Module message correlation; structured delivery acknowledgement; read-only Board runtime/delivery projection; one real tmux canary.
- **Core metric**: duplicate Agent-visible delivery 0; direct message-body injection through tmux 0; runtime-only Task/Lease/Publication/Acceptance mutation 0 bytes; unknown outcome auto-retry 0.
- **Hard constraint**: tmux is an optional Host capability and process/session carrier, never the communication authority, Task scheduler, identity authority, transcript authority or mandatory repo-harness installation dependency.
- **Key risk**: treating successful pane input as successful Agent delivery creates an unprovable acknowledgement and an unsafe retry path.
- **Unknowns**: exact tmux availability and terminal-Agent wake behavior on supported Hosts are canary facts, not assumptions; automatic session creation remains deferred.
- **Acceptance scenarios**: persisted-message-before-wake, stale Binding refusal, lost ACK reconciliation, unavailable tmux, Task Board receipt projection, no transcript parsing, unchanged authority bytes.
- **Suggested next step**: activate the approved R1 work package through the contract-worktree flow; the Agent Runtime capability replacement is accepted, while product implementation remains intentionally unstarted.

## Problem

### Product Direction

One durable message must have one authority regardless of how the target Agent is hosted:

```text
TaskMessage / ModuleMessage (authority)
→ exact Claim or Engineer Binding fence
→ persisted runtime-effect intent
→ adapter-owned Host action
→ structured delivery observation / acknowledgement
→ read-only Task Board and collaboration projection
```

The first provider-neutral expansion adds `tmux-cli-agent` beside the existing
`codex-app-thread`. tmux may keep an Agent process alive, address its bound
session/pane and submit a bounded wake/control action. It does not carry the
authoritative message body. A Claude/Codex turn hook or a harness wrapper reads
the durable inbox at the turn boundary and records the delivery receipt.

`tmux send-keys`, when used internally by the adapter, may carry only an opaque
inbox notification/control token derived from an already-persisted effect. A
successful tmux command advances the effect to `effect_started`; it never proves
`observed_success`. Positive delivery requires the exact Task/Module Inbox
receipt or an equally exact wrapper acknowledgement bound to the same message,
recipient generation and effect.

### Hard Constraints

- Task、Lease、Publication、Acceptance and the two message stores remain the only authorities for their data.
- The Fleet/Operator Board stays a read model; runtime reachability never changes its five-column Task classification.
- tmux is optional. Selecting `tmux-cli-agent` while tmux is unavailable fails `adapter_unavailable`; there is no fallback to Codex App Thread, Claude resume, main thread or generic shell.
- The existing `EngineerBindingV1` remains the endpoint identity carrier: `provider`, `provider_thread_id`, `host_id`, `binding_id` and `binding_generation`. No second endpoint-binding store is introduced.
- A tmux target change, pane replacement or Agent replacement requires Binding rotation. Session/pane names alone are never identity.
- No transcript/pane-output parser may create Task state, delivery acknowledgement, Collaboration signal, Handoff, Acceptance or completion evidence.
- No generic shell command enters the adapter wire contract. Host commands are constructed from validated closed operations and an exact bound endpoint.
- P0 targets already-bound endpoints only. Automatic tmux session/pane creation, Agent installation and model routing are separate work.
- The adapter does not add `tmux_agent` to `CollaborationActorRefV1`. An author remains a server-verifiable `module_engineer` or Host-derived `delegated_worker`.
- Existing ME-3A lost-ACK semantics remain: an unknown effect becomes `reconciliation_required` and cannot authorize a blind retry.

### Recommended Defaults

```jsonc
{
  "agent_runtime": {
    "mode": "off",
    "adapters": {
      "codex-app-thread": "existing",
      "tmux-cli-agent": "disabled"
    }
  }
}
```

Promotion is `off → shadow → active`. Shadow records capability and effect
observations but does not wake a tmux endpoint. No state is skipped.

### Feasibility Boundary

- **Confirmed**: ME-3A already provides persist-first intent, Binding fencing, one Host action, immutable observations and `reconciliation_required`.
- **Confirmed**: Task Inbox already resolves exact `claim_id + generation`, persists delivery before returning context and treats message bodies as untrusted peer data.
- **Confirmed**: `EngineerBindingV1` already carries the provider-neutral endpoint tuple required by the adapter; no new identity authority is needed.
- **[UNVERIFIED]**: supported Hosts have a usable tmux binary and a stable way to address the intended session/pane. Capability observation and the real canary must measure this.
- **[UNVERIFIED]**: a non-Claude/non-Codex terminal harness has a wrapper capable of consuming the durable inbox and emitting the exact acknowledgement. Such an Agent is unavailable, not heuristically supported, until the wrapper proves the contract.

## Users

### Primary Users

- **Human Operator**
  - Need: send one durable assignment and see whether the current owner has not received, received or acknowledged it.
  - Success signal: the Board shows exact receipt/effect state without reading a terminal transcript.
- **Bound terminal Agent**
  - Need: remain addressable across turns without becoming a second Task owner.
  - Success signal: one inbox message is consumed once under the current Claim/Binding generation.

### Secondary Users

- Collaboration canary operator comparing Codex App Thread and tmux-hosted participants under one effect taxonomy.
- Runtime maintainer reconciling an effect whose Host action outcome is unknown.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Duplicate Agent-visible delivery | 0 | lost-ACK and retry fault matrix | any duplicate |
| Direct tmux message-body delivery | 0 | host-action schema and command-spy assertion | any body byte |
| Runtime-only Task/Lease/Publication/Acceptance mutation | 0 bytes | before/after authority digests | any change |
| Unknown outcome auto-retry | 0 | restart/reconciliation fixture | any retry |
| Stale Claim/Binding Host action | 0 | generation-rotation fixture | any action |
| Board delivery-state derivation in client | 0 | browser payload/schema test | any client inference |

## Acceptance Scenarios

### Scenario 1: persisted message before tmux wake

- **Given**: an exact pending Task or Module message and a current tmux endpoint Binding.
- **When**: the Host starts one runtime effect.
- **Then**: the message event, recipient generation and effect intent are durable before any tmux call; the Host action contains only the bounded control reference, not the message body.
- **Machine-checkable evidence**: write/call ordering spy, canonical action snapshot, message/event digest match.

### Scenario 2: turn-boundary consumption and acknowledgement

- **Given**: `effect_started` and a live recipient with the same Claim/Binding generation.
- **When**: its hook/wrapper consumes the durable inbox.
- **Then**: the untrusted message is delivered once and the exact receipt closes the effect as `observed_success`; the Board projects `acknowledged` without changing its Task column.
- **Machine-checkable evidence**: receipt/effect correlation, idempotent second consume, unchanged card column.

### Scenario 3: endpoint replacement

- **Given**: an intent prepared for Binding generation G and an endpoint rotated to G+1.
- **When**: the Host attempts the action.
- **Then**: it fails `binding_stale`; no tmux command runs and no delivery receipt is written.
- **Machine-checkable evidence**: command spy count 0 and exact typed error.

### Scenario 4: lost acknowledgement

- **Given**: the wake/control action may have succeeded but the Host cannot prove the exact inbox receipt.
- **When**: the process restarts or observation is requested.
- **Then**: the effect becomes `reconciliation_required`; the same intent cannot emit a second Host action.
- **Machine-checkable evidence**: kill-boundary fixture and action count 1.

### Scenario 5: tmux unavailable

- **Given**: a Binding selecting `tmux-cli-agent` on a Host whose capability observation is unavailable or unsupported.
- **When**: dispatch is attempted.
- **Then**: it fails closed as `adapter_unavailable` or `capability_unsupported`; the message stays pending and no alternative adapter runs.
- **Machine-checkable evidence**: capability fixture, unchanged receipt, zero fallback calls.

### Scenario 6: Board boundary

- **Given**: pending, delivered, acknowledged, failed and reconciliation-required examples.
- **When**: Fleet/Operator snapshots are collected.
- **Then**: the server projects closed delivery/runtime states and redacted endpoint diagnostics; client code derives no semantics and the only browser mutation remains task-message POST.
- **Machine-checkable evidence**: server snapshot tests, route inventory, client lexical/behavior test.

### Scenario 7 (negative): transcript and liveness carry no authority

- **Given**: a live tmux pane printing completion-like text while the durable receipt is absent.
- **When**: Board, Collaboration and Task projections run.
- **Then (must NOT)**: no acknowledgement, Task completion, signal, handoff, acceptance or readiness is synthesized.
- **Machine-checkable evidence**: adversarial pane-output fixture and authority digest comparison.

## Non-goals

- Automatic tmux session/pane creation, Agent installation, login shell management or daemon lifecycle.
- Generic shell, arbitrary key injection, transcript exchange or pane-output semantic parsing.
- New Task acquire/release/takeover semantics, multi-writer execution or automatic reassignment.
- Provider/model fallback, broadcast, load balancing or model routing.
- Remote/multi-machine tmux transport.
- Treating tmux presence, pane liveness or process exit as Agent identity or task completion.

## Module Behaviors (P0)

### Module 1: Provider-Neutral Runtime Effect Contract

- Extend the singleton `codex-app-thread` adapter contract into a closed adapter union containing `codex-app-thread | tmux-cli-agent`.
- Consume a discriminated exact message reference: Task message fenced by task revision/Claim generation, or Module message fenced by Engineer Binding generation.
- Preserve persist-first, exactly-one Host action and immutable observation-chain semantics.
- Protocol migration is explicit and one-shot: no reader guesses v1/v2 shape and no adapter fallback translates one provider's evidence into another's.

### Module 2: tmux Host Adapter

- Discover exact capability; validate Host and endpoint against the current Binding twice around admission.
- Construct only closed wake/observe/stop actions. `send` means notify the endpoint that durable inbox work exists, not transmit the message body.
- Require a hook/wrapper receipt for positive delivery; command success alone remains `effect_started`.
- Validate targets without shell interpolation and redact local endpoint diagnostics from browser output.

### Module 3: Delivery and Runtime Projection

- Promote the deferred `FleetBoardInboxSummaryV1` receipt-state goal into this PRD.
- Project `pending | delivered | acknowledged | failed | reconciliation_required` plus `reachable | unavailable | unknown` from server-owned receipts/effects.
- Runtime facts affect attention and diagnostics only; they never alter Task column, execution readiness, Lease state or writer identity.
- The Operator collaboration view may show adapter kind and redacted status, never tmux target names, local paths or pane output.

### Module 4: Real Canary

- Bind one already-running terminal Agent through `tmux-cli-agent` and one Codex App Thread under the same closed effect taxonomy.
- Deliver exact persisted messages, force one lost-ACK boundary and rotate one Binding.
- Feed structured Worker output through the existing Host collector into Collaboration records; tmux itself publishes nothing.
- Record availability, delivery latency, reconciliation outcome and authority-byte evidence for C9.

## Data Model Direction

The implementation plan freezes exact protocol fields after the architecture
request, but these ownership decisions are final:

```yaml
RuntimeMessageRefV1:
  task_message:
    message_id: uuid
    message_event_digest: sha256
    task_id: sha256
    task_revision: sha256
    claim_id: uuid
    lease_generation: positive-integer
  module_message:
    message_id: uuid
    message_event_digest: sha256
    engineer_id: engineer-id
    binding_id: uuid
    binding_generation: positive-integer

AgentRuntimeAdapterKind:
  - codex-app-thread
  - tmux-cli-agent

RuntimeDeliveryState:
  - pending
  - delivered
  - acknowledged
  - failed
  - reconciliation_required

RuntimeReachability:
  - reachable
  - unavailable
  - unknown
```

No `tmux_agent` actor, second endpoint Binding, transcript record or Board-owned
runtime status is introduced.

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Local effect admission excluding adapter latency | p95 ≤250 ms | disposable-store benchmark | 1 s |
| Board runtime/delivery projection | p95 ≤500 ms per repository | snapshot benchmark | 2 s |
| Duplicate action under restart | 0 | kill-boundary suite | any |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Host tmux capability and endpoint addressing | Determines adapter availability | R1 capability probe and real canary; no documentation assumption | Runtime owner |
| Third-party terminal harness acknowledgement | Determines whether it can be addressed safely | require wrapper conformance; otherwise unavailable | Adapter owner |
| Automatic endpoint creation | Affects zero-touch dispatch | deferred PRD after measured manual-binding cost | Program owner |

## Developer Handoff

- **Build first**: the closed provider-neutral effect/message-reference protocol and migration decision; do not begin with tmux command execution.
- **Do not reinterpret**: Task/Module message authority, current Claim/Binding generation, C6 run-context binding, or Board column classification.
- **You may improve**: adapter capability diagnostics and Board presentation, within the frozen redaction and read-only boundaries.
- **Verify with**: focused effect/inbox/board tests, command-spy and kill-boundary fixtures, route inventory, authority-byte comparison, full required checks and one real canary.

### Acceptance Scripts

1. Prepare/start/observe every adapter against exact Task and Module message fixtures.
2. Rotate Claim and Engineer Binding generations between prepare/start and prove zero Host action.
3. Lose acknowledgement after the tmux action and prove one action plus `reconciliation_required`.
4. Feed adversarial pane output and prove zero semantic projection.
5. Collect Board snapshots for every delivery/runtime state and prove unchanged Task columns.
6. Run one real already-bound tmux endpoint canary and one Codex App Thread control.
7. Run repository Required Checks and architecture acceptance.

## Adjacent Patterns

- `plans/prds/20260825-1551-provider-thread-effect-adapter.prd.md`: persist-first effect, exact Binding fence, lost-ACK reconciliation and no Provider fallback.
- `src/cli/hook/task-inbox-handler.ts`: current Claim resolution, turn-boundary untrusted delivery and receipt-before-context behavior.
- `src/core/fleet/board.ts`: read-only five-column classification and inbox attention projection.
- `plans/prds/20260828-2321-collaboration-substrate.prd.md`: two-plane authority, Host-derived authorship and read-only Operator collaboration surface.
