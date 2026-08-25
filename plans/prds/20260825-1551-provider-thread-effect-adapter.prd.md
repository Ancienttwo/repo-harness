# PRD: Provider Thread Effect Adapter (ME-3A)

> **Status**: Draft
> **Slug**: `provider-thread-effect-adapter`
> **Created**: 2026-08-25T15:51:15+0800
> **Updated**: 2026-08-25T21:03:47+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-1C durable message core and the Runtime Admission Canary
> **Supersedes Part Of**: `plans/prds/20260824-1653-worker-host.prd.md`
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: a durable ModuleMessage still needs to reach the current Provider Thread without turning Provider liveness、history or turn state into Task authority。
- **Users**: Module Engineer、runtime operator、ME-1C delivery owner and security reviewer。
- **Platform**: Codex App Server first；Provider-specific adapter behind one closed effect/observation taxonomy；CLI/MCP sidecar first, daemon only after measured necessity。
- **P0 surface**: send/observe/resume/stop for an already-bound Thread、intent-first idempotency、lost-ack reconciliation、typed failure/capability observation and bounded usage evidence。Thread create/archive remain operator-only canary capabilities until their authorization and idempotency are proven。
- **Core metric**: duplicate Provider turn 0；runtime-only Task/Lease/Fleet mutation 0；unknown effect blind retry 0。
- **Hard constraint**: the adapter does not implement an Agent query loop、tool-call parser、streaming protocol、context compaction、Provider history store、semantic completion or automatic Provider fallback。
- **Key risk**: Provider effect succeeds but acknowledgement is lost, causing a duplicate turn on retry。
- **Unknowns**: Runtime Admission Canary 已冻结 ME-3A 所需的 exact Codex Thread/turn correlation 与 lost-ack reconciliation；ME-3A 实施仍需在自身 approval boundary 冻结生产 effect schema、restart observation store 和 failure taxonomy。
- **Acceptance scenarios**: persist-first delivery、lost ACK、binding rotation、adapter unavailable、restart reconciliation and unchanged control-plane authorities。
- **Suggested next step**: consume the passed canary evidence at `codex/me1c-engineer-inbox@ef731e6a`；在 ME-1C 合入后完成本 PRD 的独立 approval，不扩大到 daemon、query loop 或 Provider fallback。

## Problem

ME-1C owns durable communication, while the Provider owns Thread lifecycle and execution. The missing boundary is a thin effect adapter that consumes one exact persisted message reference, attempts one Provider effect, and publishes observations without inventing workflow state.

### Product Direction

`ProviderThreadEffectAdapter` receives an exact ME-1C event digest、delivery attempt、current Binding fence and bounded summary/reference payload. It persists an immutable effect intent before calling the Provider. A known success publishes one observation；a known failure publishes a typed failure；an unknown result enters `reconciliation_required` and may only resolve through positive observation of the exact Thread/turn relation.

The first adapter is Codex App Server. A second Provider is used only to test whether the taxonomy preserves required semantics；P0 does not promise simultaneous support. No local daemon is assumed. A daemon or background sidecar becomes a separate implementation decision only if restart/reconciliation measurements prove an in-process CLI/MCP boundary insufficient.

### Feasibility Boundary

- **Confirmed**: ME-1C can provide persist-first message identity and Binding fences；git-common-dir stores can journal immutable intent/observations；Runtime Admission Canary at `codex/me1c-engineer-inbox@ef731e6a` proved the exact Codex Engineer/thread binding and lost-ack reconciliation contract without changing Task/Lease authority。
- **[UNKNOWN]**: the production restart observation store and complete typed outcome taxonomy remain ME-3A design work；they are not authority to re-run the passed Provider effect。
- **Fail closed**: missing current Binding、unsupported capability、unknown outcome or unverifiable correlation never triggers a second Provider effect。

## Users

### Primary Users

- ME-1C delivery owner invoking one exact persisted effect。
- Runtime operator reconciling unknown Provider outcomes。

### Secondary Users

- ME-1B read model consuming typed runtime observations。

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Duplicate Provider turn | 0 | lost-ack fault fixture | any |
| Send without durable ME-1C event | 0 | persistence fault fixture | any |
| Runtime-only Task/Lease/Fleet mutation | 0 bytes | authority digest comparison | any change |
| Unknown outcome auto-retry | 0 | restart/reconcile matrix | any |

## Acceptance Scenarios

### Scenario 1: Persist-first delivery

ME-1C event and delivery receipt are durable before the adapter accepts the effect. Persistence failure prevents every Provider call.

### Scenario 2: Lost acknowledgement

The Codex turn starts but acknowledgement is lost. Reconciliation observes the same Thread/turn and appends one delivery observation；the original intent never authorizes a second send。

### Scenario 3: Binding rotation

The target Binding generation changes before effect admission. The request fails `binding_stale` and no Provider call occurs. A module-scope message may be retargeted only by an ME-1C transition, not by the adapter.

### Scenario 4: Unsupported observation

The Provider cannot prove the required correlation after restart. Current state becomes `reconciliation_required`; Task、Lease、message acknowledgement and Fleet column remain unchanged。

## Non-goals

- Agent query loop、tool execution、prompt assembly、history persistence or context compaction。
- Work Package assignment、Claim/Lease creation、message persistence、semantic verification、Acceptance、Publication or Human merge。
- Automatic Provider fallback、multi-Provider broadcast or model routing。
- Local daemon、remote service or automatic Thread creation in P0。

## Module Behaviors (P0)

### Module 1: Capability Observation

Probe the selected Provider for exact supported operations and evidence carriers. Emit `supported|unsupported|unavailable|unverifiable` per capability；missing data is never inferred from CLI presence or documentation prose。

### Module 2: Intent and Effect

Validate ME-1C event、delivery attempt and current Binding；persist immutable intent；call the selected adapter at most once；publish typed observation or `reconciliation_required` under one exact intent identity。

### Module 3: Reconciliation

Read Provider facts for the exact Thread/effect fingerprint. Positive exact correlation may publish recovery；absence、ambiguous history or unsupported observation cannot retry or acknowledge the message。

## Data Model

```yaml
ProviderThreadEffectIntentV1:
  protocol: 1
  kind: repo-harness-provider-thread-effect-intent
  effect_id: sha256(adapter_kind + idempotency_key)
  idempotency_key: bounded-opaque
  operation_fingerprint: sha256
  message_event_digest: sha256
  delivery_attempt: integer
  engineer_id: string
  binding_id: uuid
  binding_generation: integer
  adapter_kind: closed-enum
  operation: send|resume|observe|stop
  resource_refs: [{ref: string, sha256: sha256}]
  intent_sha256: sha256

ProviderThreadEffectObservationV1:
  protocol: 1
  effect_id: sha256
  intent_sha256: sha256
  state: intent_persisted|effect_started|observed_success|observed_failure|reconciliation_required|stopped
  provider_thread_ref: opaque
  provider_effect_ref: opaque|null
  failure_class: none|binding_stale|adapter_unavailable|provider|unknown
  usage: {authority: provider|unavailable, input_tokens: integer|null, cached_input_tokens: integer|null, output_tokens: integer|null}
  previous_observation_sha256: sha256|null
  observation_sha256: sha256
```

Usage is observational economics evidence only. It cannot alter routing、Task identity、Acceptance or Publication readiness. Provider-owned fields remain null when unavailable；repo-harness does not estimate them。

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Intent persistence | ≤100 ms local | store benchmark | 1 s |
| Observation projection | ≤250 ms excluding Provider latency | fixture benchmark | 2 s |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Codex exact Thread/turn correlation | Closed by admission canary | `codex/me1c-engineer-inbox@ef731e6a` | Provider owner |
| Production restart observation completeness | Blocks ME-3A approval, not ME-1C merge | freeze the intent/observation store and kill/restart acceptance fixture before selecting process shape | Runtime owner |
| Second Provider taxonomy fit | Guards false portability | one read-only conformance implementation after Codex | Adapter owner |

## Developer Handoff

Runtime Admission Canary has frozen the Codex effect correlation contract at `codex/me1c-engineer-inbox@ef731e6a`. Do not treat that evidence as approval of this Draft PRD. After ME-1C lands and this PRD independently closes its production schemas, build one Codex send/observe path first；do not create a generic model gateway、daemon or fallback adapter。

### Acceptance Scripts

1. Fault ME-1C persistence and prove zero Provider calls。
2. Lose acknowledgement after one Provider turn and reconcile to the same effect。
3. Rotate Binding before admission and prove typed refusal。
4. Restart between Provider success and observation publication；prove no duplicate send。
5. Compare Task、Lease、Fleet and Acceptance bytes before/after runtime-only observations。
6. Omit Provider usage and prove null observational fields rather than estimates。
