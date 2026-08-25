# PRD: Engineering Overlay and Human Control Board (ME-1B)

> **Status**: Approved
> **Slug**: `engineering-overlay-control-board`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-25T23:39:00+0800
> **Human Approval**: User authorized continuous implementation through ME-2A/2B on 2026-08-25; this approval covers the minimal CLI/JSON ME-1B boundary frozen below
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-0A binding read model; later fields activate only when their owning PRD ships
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: existing Fleet Board 正确表达 task lifecycle，但没有 Engineer、Binding、delegation、message、memory freshness 和组织级 attention 的稳定 read model。
- **Users**: Maintainer、Program Orchestrator、Reviewer。
- **Platform**: CLI/JSON read models；localhost Human Board remains a later independently approved presentation slice。
- **P0 surface**: capability-bearing `EngineeringOverlaySnapshotV1`、`OrganizationAttentionSnapshotV1`、per-component double-read revisions/consistency；CLI exposes separate Planning Graph、Delivery Kanban、Organization/Attention views。Composite `HumanControlSnapshotV1` and UI are not part of this minimal approval。
- **Core metric**: Session/Worker 状态变化导致 Fleet column 变化 0 次；mixed-generation snapshot 输出 0 次。
- **Hard constraint**: UI 不保存 status/current owner，不推导 Fleet column，不提供 mutation endpoint in first slice。
- **Key risk**: 把四个不同时间点的 snapshot 拼成看似原子的事实。
- **Unknowns**: frontend stack、WebSocket transport and composite join remain later presentation choices and do not affect this approved read-model boundary。
- **Acceptance scenarios**: binding change only alters overlay、organization attention without task、changed-during-read、degraded repo isolation、three-view semantic independence。
- **Suggested next step**: execute `plans/plan-20260825-2339-me1b-engineering-overlay.md`；页面不得先于相同 read model 的独立 approval。

## Problem

Task attention 与 organization attention 不同。没有 active binding、SOP revision drift 或 Provider auth failure 可能完全不绑定 task，不能硬塞进 Fleet card；反之 Session unreachable 也不能移动 `Working` column。

### Product Direction

```text
FleetBoardSnapshotV1             → task/Kanban authority projection
EngineeringOverlaySnapshotV1    → Engineer/Binding/Claim/Worker/message projection
OrganizationAttentionSnapshotV1 → non-task organizational attention
HumanControlSnapshotV1          → component refs + consistency, not new authority
```

- Task overlay join key: `repository_id + task_id + task_revision`.
- Composite records every component digest/revision and double-reads authority markers.
- `stable|changed_during_read|degraded` is explicit; mixed facts are never labeled stable.
- The CLI product has three explicit views: `sprint graph` projects Work Package dependencies and routing; existing `fleet board` remains the five-column task lifecycle; `engineer board` projects Engineer/Binding/Session/Worker/message attention. They may be joined for display but never collapsed into one status field.
- `fleet board --with-engineering` enriches cards only with exact-fenced overlay refs such as Engineer, binding generation, Provider observation, active Worker and unread-message counts. An unreachable Thread or crashed Worker can change attention, never `Available|Working|In Review|Ready to Merge|Done`.

### Feasibility Boundary

- **Confirmed**: Fleet read model and stable/changed-during-read precedent exist.
- **[UNKNOWN]**: Web UI framework and streaming transport; defer until JSON contract passes.
- **[UNVERIFIED]**: 10-Engineer local p95 target until real stores exist.

## Users

### Primary Users

- **Maintainer**: sees organization attention, exact fences and evidence links.
- **Program Orchestrator**: sees capability/binding/claim/dependency distribution without owning tasks.

### Secondary Users

- **Reviewer**: opens exact Task Drawer evidence and frozen subject.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Runtime-only Fleet column changes | 0 | projection fixtures | any change |
| Stable mixed-generation snapshots | 0 | mutation-during-read tests | any stable output |
| Overlay 10 Engineers | p95 ≤3 s local | benchmark | 10 s |
| UI mutation endpoints first slice | 0 | route inventory | any endpoint |

## Acceptance Scenarios

### Scenario 1: Session crash

- **Given**: task column is Working because Lease is bound.
- **When**: binding observation becomes unreachable.
- **Then**: base Fleet snapshot is byte-identical; overlay and organization attention change.
- **Machine-checkable evidence**: paired fixtures.

### Scenario 2: Consistency fence

- **Given**: binding generation changes during projection.
- **When**: second read detects a different component digest.
- **Then**: snapshot is `changed_during_read` or retried within a bounded attempt; never stable mixed data.
- **Machine-checkable evidence**: injected concurrent mutation.

### Scenario 3: Organization-only attention

- **Given**: Engineer has no active binding and no active task.
- **When**: organization projection runs.
- **Then**: attention appears outside task cards.
- **Machine-checkable evidence**: empty Fleet overlay plus non-empty organization attention.

### Scenario 4: Three views keep independent semantics

- **Given**: WP-UI is dependency-blocked, its Engineer has an active Binding, and it has no active Claim.
- **When**: all CLI views render.
- **Then**: Planning Graph reports the dependency block, Delivery Kanban retains the canonical task column, and Engineer Board reports the active Binding; no view synthesizes a combined status or mutates another authority.
- **Machine-checkable evidence**: three JSON snapshots with independent schemas and unchanged source digests.

## Non-goals

- Task/Lease/Publication mutation, automatic Session lifecycle or offline action replay.
- Replacing existing five Fleet columns.
- Worker Timeline authority before WorkerRoundReceipt exists.
- Remote/public deployment.
- Drag-to-move cards, direct message/send side effects from read commands, or any UI-owned assignment/status cache.

## Module Behaviors (P0)

### Module 1: Engineering Overlay

- projects tracked Profile plus current Binding, ClaimActor, ME-1C message and ME-3A Provider-effect observations;
- delegation and memory remain explicit `unsupported`, not invented empty success;
- never reads, copies or recalculates a Fleet task column.

### Module 2: Organization Attention

- closed reasons are `binding_missing`, `binding_stale`, `engineer_contract_revision_changed`, `message_delivery_failed`, and `provider_reconciliation_required`;
- each reason names owner and source revision.

### Module 3: Local Board (Deferred)

- The minimal Approved slice exposes no web route or frontend bundle.
- A later Board may consume the exact CLI/JSON schemas but cannot add cached authority or mutation endpoints.

### Module 4: CLI View Contract

- `repo-harness sprint graph --sprint <path> --format json|text` reads the exact canonical ME-1A graph projection and reports an absent graph without synthesizing one;
- `repo-harness engineer board --format json|text` emits Engineering Overlay plus Organization Attention;
- the existing Fleet Board command remains independent and gains no Engineering join or new status semantics;
- every command is read-only; later mutation commands call their owning domain protocol rather than editing projection state.

## Data Model

```yaml
EngineeringOverlaySnapshotV1:
  protocol: 1
  kind: repo-harness-engineering-overlay-snapshot
  repository_id: repo-id
  registry_revision: sha256
  observed_at: datetime
  engineers:
    - engineer_id: string
      capability_id: string
      binding:
        support: available|unreadable
        state: unbound|active|retired|null
        value: null|{binding_id: uuid, binding_generation: integer, engineer_contract_revision: sha256, observation: unknown|reachable|unreachable}
      active_claim: {support: available|unreadable, value: null|object}
      delegations: {support: unsupported, value: null}
      messages: {support: available|unreadable, pending: null|integer, delivery_failed: null|integer, revision: null|sha256}
      provider_effects: {support: available|unreadable, active: null|integer, reconciliation_required: null|integer, failed: null|integer, revision: null|sha256}
      memory: {support: unsupported, value: null}
  components: [{component: profiles|bindings|claims|messages|provider_effects, support: available|unreadable, observation_before: null|sha256, observation_after: null|sha256}]
  snapshot_consistency: stable|changed_during_read|degraded
  snapshot_sha256: sha256

OrganizationAttentionSnapshotV1:
  protocol: 1
  kind: repo-harness-organization-attention-snapshot
  repository_id: repo-id
  overlay_snapshot_sha256: sha256
  observed_at: datetime
  attention: [{engineer_id: string, reason: closed-enum, owner: maintainer|module_engineer|runtime_operator, source_revision: sha256}]
  snapshot_consistency: stable|changed_during_read|degraded
  snapshot_sha256: sha256
```

Unsupported, unreadable and healthy-empty are distinct closed states. P0 may ship Engineering Overlay and Organization Attention separately; a composite snapshot may claim `stable` only when every component's before/after marker matches. Partial read failure produces `degraded` and preserves each readable component's own revision/digest.

Binding invariants are exact: `support: unreadable` requires `state/value: null`; `available + unbound` requires `value: null`; `available + active` requires a non-null current value; `available + retired` may expose only the current retired pointer value. Because ME-1B depends on ME-0A, `unsupported` is not a legal binding value for an emitted overlay.

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| JSON overlay, 10 Engineers | p95 ≤3 s | local benchmark | 10 s |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Frontend stack | implementation only | choose after schema fixture | UI owner |
| Streaming vs polling | freshness/cost | measure local change rate | Runtime owner |

## Approval Closure

- The approved candidate is CLI/JSON only; there is no UI or composite consistency authority in this slice.
- Profile/Binding, ClaimActor, ME-1C inbox and ME-3A effect observations are read independently and twice. Any unreadable component degrades the snapshot；any revision change prevents `stable`。
- Delegation and memory are emitted as exact `unsupported` states until their owning PRDs ship；they are not healthy-empty placeholders。
- Planning Graph and Fleet Board retain their existing authorities and are never recomputed from the overlay。

## Developer Handoff

Do not infer UI authority from this approval. The delivered boundary is the frozen JSON/read-command surface and its consistency fixtures.

- **Delivered order**: pure overlay/attention schemas and projections, then independent CLI JSON/text commands.
- **Do not reinterpret**: absent sources are unsupported/degraded, not healthy defaults; UI never computes authority.
- **Verify with**: byte-identical Fleet fixtures, mutation-during-read, degraded authority, route inventory and ten-Engineer timing tests.

### Acceptance Scripts

1. Toggle binding observations and prove Fleet column bytes remain unchanged.
2. Mutate binding generation mid-read and assert non-stable consistency.
3. Render an Engineer with no task but active organization attention.
4. Inventory routes and assert no mutation endpoint.
5. Emit `available/unbound`, `available/active`, `available/retired` and `unreadable` binding fixtures; reject every illegal state/value combination.
6. Render Planning Graph, Fleet Board and Engineer Board from one fixture; rotate only Binding state and prove Fleet bytes remain unchanged.

## Frontend Perspective

Stable components are `FleetColumns`, `OrganizationView`, `TaskDrawer`, `AttentionCenter` and `EvidencePanel`. Every card displays exact task revision, claim/lease generation, binding generation and component consistency where applicable.
