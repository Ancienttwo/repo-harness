# PRD: Engineer Coordination Messages (ME-1C)

> **Status**: Draft
> **Slug**: `engineer-coordination-messages`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T22:00:24+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-0B trusted principal and binding fences
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: Task Inbox 只有 task/claim scope；长期 Engineer 需要跨 Session 存续的 module/assignment communication，但不能复制四套 inbox mechanics 或把聊天消息当 Decision/Interface authority。
- **Users**: Program Orchestrator、Module Engineer、Maintainer。
- **Platform**: shared immutable-message mechanics、closed event schemas、git-common-dir durable inbox、optional Provider delivery adapter。
- **P0 surface**: reusable event/receipt/transition primitives、closed `ModuleMessageEventV1`、`ModuleMessageDeliveryReceiptV1`、delivery observations/errors、binding-fenced recipient、persist-first delivery、ack/supersede；Task Inbox wire format unchanged。
- **Core metric**: important message durable-before-native 100%；旧 binding 接收新 assignment message 0 次。
- **Hard constraint**: common core abstracts mechanics, not an `anything` subject/payload schema；Decision and Interface records remain separate authorities；Provider chat contains only bounded summary + typed/content-addressed refs。
- **Key risk**: native success without durable event or message body influencing routing/authorization。
- **Unknowns**: stable Provider native send APIs remain optional and cannot block correctness。
- **Acceptance scenarios**: persist fault prevents native send、native fault leaves pending、rotation supersedes assignment message、module message survives rotation、typed subject notification、summary-and-reference fetch。
- **Suggested next step**: first extract mechanics under existing Task Inbox golden tests, then add Module schema/store without changing Task wire bytes。

## Problem

Duplicating task, module, decision and interface stores would duplicate digest, lock, receipt and transition logic. A universal payload would remove fencing. The correct abstraction is shared mechanics under closed domain protocols.

### Product Direction

```text
validate closed event
→ persist immutable canonical bytes under subject lock
→ derive stable recipient
→ create/update delivery receipt
→ optionally attempt Provider-native delivery
→ acknowledge consumption
```

- `module` scope follows stable Engineer/capability across rotation.
- `assignment` scope binds exact engineer ID, binding ID/generation and profile revision.
- Message notification may reference `DecisionRequestV1` or `InterfaceChangeRequestV1`; it cannot carry their authoritative state transition.
- Native delivery error remains explicit pending/attention; there is no semantic fallback runner.
- Full Contract、WorkEnvelope、SOP、capability/verified context 和 evidence are fetched on demand from their owning CLI/MCP resource after digest validation; message bodies and Provider-native notifications never inline those artifacts or raw transcripts.
- Provider-native send is an accelerator over an already-persisted event. The transport receives the event digest/attempt and returns only a typed delivery observation; it cannot mutate Lease, Binding, Decision, Interface or Acceptance state.

### Feasibility Boundary

- **Confirmed**: Task Inbox already provides immutable events, recipient receipts, bounded untrusted rendering, per-task lock and closed transitions.
- **[UNKNOWN]**: Provider native send adapters; correctness uses durable consumption.
- **[UNVERIFIED]**: cross-Provider delivery latency.

## Users

### Primary Users

- **Program Orchestrator**: sends durable work/status/review notifications.
- **Module Engineer**: consumes module/assignment messages under current Binding.

### Secondary Users

- **Maintainer**: audits delivery and acknowledges human decisions through their owning protocol.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Native send without durable event | 0 | fault injection | any occurrence |
| New-generation assignment delivered to old binding | 0 | rotation test | any delivery |
| Task Inbox wire drift | 0 bytes | golden fixtures | any drift |
| Unbounded body injection | 0 | size/count tests | any overflow |

## Acceptance Scenarios

### Scenario 1: Persist first

- **Given**: Provider transport available but event store faults.
- **When**: send executes.
- **Then**: native send is not attempted and typed persistence failure is returned.
- **Machine-checkable evidence**: adapter spy count zero.

### Scenario 2: Native failure

- **Given**: event and receipt persist successfully.
- **When**: Provider send fails.
- **Then**: receipt stays pending with delivery error observation; next bound Session can consume it.
- **Machine-checkable evidence**: durable canonical event and pending receipt.

### Scenario 3: Typed authority reference

- **Given**: InterfaceChangeRequest exists at revision R.
- **When**: notification is sent.
- **Then**: message carries typed subject ref/R but cannot update request state.
- **Machine-checkable evidence**: unchanged request bytes after message lifecycle.

### Scenario 4: Summary-and-reference delivery

- **Given**: a work request referencing exact Work Package, Contract and WorkEnvelope digests.
- **When**: the target Session receives the Provider-native notification.
- **Then**: it receives only bounded summary and refs, fetches full bytes through the declared CLI/MCP resource, and rejects a digest mismatch without acknowledging the message.
- **Machine-checkable evidence**: transport payload snapshot, resource fetch spy and pending receipt after mismatch.

## Non-goals

- Changing TaskMessageEventV1 wire format in this PRD.
- Generic arbitrary payload event.
- Message-triggered Lease, binding, Decision or Interface mutation.
- Session wake, PTY injection or raw transcript exchange.
- Full Contract/WorkEnvelope/context/evidence copies in message bodies or Provider notifications.

## Module Behaviors (P0)

### Module 1: Shared Mechanics

- canonical create-if-absent/event conflict;
- subject lock, recipient derivation and receipt transitions;
- body byte/count limits and explicit untrusted rendering;
- no domain-specific open payload.

### Module 2: Module Message

- closed message kinds: `work_request|status_update|blocker|decision_request|review_request|handoff|integration_ready|incident|subject_notification`;
- module vs assignment scope and rotation supersession;
- sender principal derived from invocation channel.
- optional native adapter renders only bounded summary/refs from persisted canonical bytes and appends delivery observations; it never accepts an ad-hoc chat payload.

## Data Model

```yaml
ModuleMessageEventV1:
  protocol: 1
  kind: repo-harness-module-message-event
  message_id: uuid
  capability_id: string
  target_engineer_id: string
  scope: module|assignment
  target_binding_id: uuid|null
  target_binding_generation: integer|null
  target_engineer_contract_revision: sha256|null
  message_type: closed-enum
  subject_ref: {kind: work_package|decision_request|interface_change_request|task|claim|publication|integration|acceptance_receipt, id: string, revision: string}|null
  resource_refs: bounded-array<{kind: contract|work_envelope|capability_context|verified_context|evidence, locator: bounded-string, sha256: sha256}>
  sender:
    kind: engineer|program_orchestrator|human
    principal_ref: string
    binding_generation: integer|null
  body: bounded-utf8
  body_sha256: sha256
  created_at: datetime
  event_digest: sha256

ModuleMessageDeliveryReceiptV1:
  protocol: 1
  message_event_digest: sha256
  recipient_engineer_id: string
  target_binding_generation: integer|null
  delivery_state: pending|delivered|acknowledged|superseded
  attempt: integer
  latest_observation_digest: sha256|null
  acknowledged_by_binding_generation: integer|null
  transition_revision: integer
  receipt_digest: sha256

ModuleMessageDeliveryObservationV1:
  protocol: 1
  message_event_digest: sha256
  recipient_engineer_id: string
  target_binding_generation: integer|null
  attempt: integer
  outcome: delivered|transport_error|recipient_unavailable|binding_stale|adapter_unavailable
  provider_delivery_ref: opaque|null
  observed_at: datetime
  previous_observation_digest: sha256|null
  observation_digest: sha256
```

Each subject/resource kind invokes its owning validator; locators are resolved only through declared repo-local CLI/MCP channels and the fetched bytes must match `sha256`. The message store never validates domain meaning from body text. Module-scope acknowledgement is satisfied by the first current Binding that acknowledges the exact event digest and remains durable across later Engineer replacement; assignment-scope events may instead be superseded by a binding rotation transition.

Delivery failure never changes the receipt out of `pending`; it appends one observation and increments `attempt` under the recipient lock. `pending → delivered → acknowledged` and `pending|delivered → superseded` are the only transitions. A later attempt may append `delivered` after any number of error observations. ACK from pending is forbidden; assignment rotation supersedes pending/delivered receipts for the old binding, while module-scope pending survives rotation and is retargeted by a new receipt transition.

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Event persist | ≤100 ms local | store benchmark | 1 s |
| Pending inbox list, 1,000 events | ≤500 ms local | benchmark | 3 s |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Codex/Claude native send stability | latency only | optional adapter canary | Provider owner |

## Developer Handoff

Do not implement before ME-0B principal is Approved.

- **Build first after approval**: mechanics extraction with Task golden tests, Module core schema, store/receipt, durable consumption, optional native adapter last.
- **Do not reinterpret**: durable inbox is primary; message never becomes Decision/Interface authority.
- **Verify with**: byte golden tests, persistence/provider fault matrix, rotation supersession and untrusted rendering limits.

### Acceptance Scripts

1. Prove Task Inbox canonical bytes are unchanged after mechanics extraction.
2. Fault event persistence and assert no native send.
3. Fault native send and consume pending message after rebinding.
4. Reference a Decision/Interface subject and assert its authority bytes remain unchanged.
5. Validate every delivery/ack/supersede transition under lock and reject unknown sender/subject kinds.
6. Append transport, unavailable, stale and adapter observations; assert receipt stays pending, attempt is monotonic, unknown outcomes fail schema validation and later delivery may succeed.
7. Snapshot a Provider notification and prove it contains bounded summary/refs only; corrupt a referenced resource and assert no ACK or downstream command executes.
