# PRD: Provider Thread Effect Adapter (ME-3A)

> **Status**: Approved
> **Slug**: `provider-thread-effect-adapter`
> **Created**: 2026-08-25T15:51:15+0800
> **Updated**: 2026-08-25T21:28:00+0800
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
- **Unknowns**: Runtime Admission Canary 已冻结 exact Codex Thread/turn correlation；生产 schema、restart journal 与 failure taxonomy 已在本 approval boundary 冻结。第二 Provider 的 taxonomy fit 仍是后续 read-only conformance unknown，不扩大 P0。
- **Acceptance scenarios**: persist-first delivery、lost ACK、binding rotation、adapter unavailable、restart reconciliation and unchanged control-plane authorities。
- **Suggested next step**: execute `plans/plan-20260825-2120-me3a-provider-thread-effect.md` against merged ME-1C，严格保持 host-executed action/evidence bridge，不扩大到 daemon、query loop 或 Provider fallback。

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
ProviderThreadCapabilityObservationV1:
  protocol: 1
  kind: repo-harness-provider-thread-capability-observation
  adapter_kind: codex-app-thread
  host_id: bounded-opaque
  operations: {send: status, resume: status, observe: status, stop: status}
  # status = supported|unsupported|unavailable|unverifiable
  evidence_refs: [{ref: bounded-opaque, sha256: sha256}]
  observed_at: RFC3339
  capability_sha256: sha256

ProviderThreadEffectIntentV1:
  protocol: 1
  kind: repo-harness-provider-thread-effect-intent
  effect_id: sha256(adapter_kind + idempotency_key)
  idempotency_key: bounded-opaque
  operation_fingerprint: sha256
  message_id: uuid
  message_event_digest: sha256
  delivery_attempt: positive-integer
  engineer_id: string
  binding_id: uuid
  binding_generation: positive-integer
  engineer_contract_revision: sha256
  adapter_kind: codex-app-thread
  operation: send|resume|observe|stop
  host_id: bounded-opaque
  provider_thread_id: bounded-opaque
  capability_sha256: sha256
  payload: bounded-canonical-ME-1C-transport-payload
  payload_sha256: sha256
  created_at: RFC3339
  intent_sha256: sha256

ProviderThreadHostActionV1:
  protocol: 1
  kind: repo-harness-provider-thread-host-action
  effect_id: sha256
  intent_sha256: sha256
  adapter_kind: codex-app-thread
  operation: send|resume|observe|stop
  host_id: bounded-opaque
  provider_thread_id: bounded-opaque
  payload: bounded-canonical-ME-1C-transport-payload
  message_event_digest: sha256
  delivery_attempt: positive-integer
  action_sha256: sha256

ProviderThreadEffectObservationV1:
  protocol: 1
  kind: repo-harness-provider-thread-effect-observation
  effect_id: sha256
  intent_sha256: sha256
  sequence: non-negative-integer
  state: intent_persisted|effect_started|observed_success|observed_failure|reconciliation_required|stopped
  host_id: bounded-opaque
  provider_thread_id: bounded-opaque
  provider_turn_id: bounded-opaque|null
  provider_user_message_id: bounded-opaque|null
  provider_assistant_message_id: bounded-opaque|null
  provider_effect_ref: bounded-opaque|null
  failure_class: none|binding_stale|capability_unsupported|adapter_unavailable|provider|unknown
  usage: {authority: provider|unavailable, input_tokens: integer|null, cached_input_tokens: integer|null, output_tokens: integer|null}
  observed_at: RFC3339
  previous_observation_sha256: sha256|null
  observation_sha256: sha256
```

Positive `observed_success` 必须同时匹配 intent 的 `host_id`、`provider_thread_id`、`message_event_digest`，并提供 canary 冻结的 `provider_turn_id + provider_user_message_id + provider_assistant_message_id`。任何字段缺失、Thread 不符或 evidence ambiguity 都只能产生 `reconciliation_required`。`effect_started` 在 host action 返回前写入；因此其后永不产生第二 action。

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
| Production restart observation completeness | Closed for P0 by immutable per-effect journal plus deterministic current repair | kill/restart acceptance fixture must prove recovery before merge | Runtime owner |
| Second Provider taxonomy fit | Guards false portability | one read-only conformance implementation after Codex | Adapter owner |

## Developer Handoff

Runtime Admission Canary has frozen the Codex effect correlation contract at `codex/me1c-engineer-inbox@ef731e6a`. Human approval `event.user-approval-20260825-control-plane-me3a` accepts the associated major architecture changeset `changeset.docs-projection-f646e47931537512` and this production schema boundary。Build one Codex send/observe path first；do not create a generic model gateway、daemon or fallback adapter。

### Acceptance Scripts

1. Fault ME-1C persistence and prove zero Provider calls。
2. Lose acknowledgement after one Provider turn and reconcile to the same effect。
3. Rotate Binding before admission and prove typed refusal。
4. Restart between Provider success and observation publication；prove no duplicate send。
5. Compare Task、Lease、Fleet and Acceptance bytes before/after runtime-only observations。
6. Omit Provider usage and prove null observational fields rather than estimates。
