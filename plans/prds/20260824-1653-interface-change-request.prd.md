# PRD: Interface Change Request (ME-4B)

> **Status**: Approved
> **Slug**: `interface-change-request`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-26T16:17:57+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-1A scheduling schema and ME-1C coordination messages
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: cross-capability interface change is currently prose/message, not a revisioned authority with actor and transition fencing.
- **Users**: requesting Module Engineer, owning Module Engineer, Program Orchestrator and Human approver.
- **Platform**: closed request/event/current store in Git common dir, per-request transition lock, current Engineer Binding fences, typed messages and an immutable planning projection that is materialized only by the existing tracked Sprint/Work Graph authority.
- **P0 surface**: `InterfaceChangeRequestV1`, lifecycle, actor matrix, acceptance projection and implementation/integration evidence closure.
- **Core metric**: message-body transition 0; stale revision transition 0.
- **Hard constraint**: accepted request creates/revises canonical Work Package through an explicit projection; it does not directly change code/task state.
- **Key risk**: request and generated Work Package drifting as two authorities.
- **Architecture decision**: the accepted event is semantic authority. ArchContext architecture events are downstream drift projections keyed by the accepted event digest and never transition the request. No product store calls `architecture-event.ts`.
- **Acceptance scenarios**: create, stale transition, accept/project, reject, implement/integrate closure and message notification.
- **Suggested next step**: freeze schema/store plus one acceptance-to-Work-Package fixture.

## Problem

Messages can notify but cannot own an interface decision. The request needs an immutable revision chain and explicit linkage to canonical planning/architecture artifacts.

### Product Direction

Persist closed revisions under one request ID. Server-derived principals authorize transitions. Acceptance emits a deterministic Work Package projection bound to request revision/digest; later evidence closes implementation and integration separately.

### Feasibility Boundary

- **Confirmed**: immutable records, locks and typed message subjects exist as established patterns.
- **Confirmed**: the canonical Work Package is a deterministic projection of one tracked Sprint row plus its sibling `WorkGraphV1` carrier. ME-4B may freeze exact proposed carrier bytes and later verify exact tracked materialization, but cannot create a second Work Package store.
- **Fail closed**: messages and code changes cannot transition the request implicitly.

## Users

### Primary Users

- Requesting and owning Module Engineers.
- Program Orchestrator/Human with acceptance authority.

### Secondary Users

- Scheduler projecting accepted work.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Stale transitions accepted | 0 | revision race | any |
| Body-derived transitions | 0 | message fixtures | any |
| Accepted request without Work Package link | 0 | projection fixture | any |

## Acceptance Scenarios

### Scenario 1: Stale acceptance

Two actors transition revision N. One wins under lock; the other receives typed stale refusal.

### Scenario 2: Accepted projection

Human acceptance creates an immutable `InterfaceWorkPackageProjectionV1` bound to the exact request/current digest, expected carrier revision and proposed `WorkPackageDefinitionV1`. It does not edit the tracked Sprint or Work Graph. A later `materialize` transition succeeds only after the existing planning transaction has committed exact matching carrier bytes.

### Scenario 3: Closure

Implementation and integration evidence are recorded as separate transitions; neither is inferred from task prose or a green PR alone.

## Non-goals

- General chat, task handoff, combined candidate or product Acceptance.
- Direct code mutation or automatic merge.

## Module Behaviors (P0)

### Module 1: Request Authority

Validate actor, expected revision and closed state transition under a per-request lock; append immutable record revision.

### Module 2: Planning Projection

On acceptance, persist one immutable planning projection. A separate Human-approved Git planning transaction materializes it into the existing Sprint/Work Graph authority. The request advances to `implementing` only after re-reading the exact commit and proving repository, Sprint path, Work Package ID and Work Package revision match. ME-1C messages use `interface_change_request` subjects as notification only.

## Frozen Actor Matrix

| Transition | Required actor | Additional fence |
|---|---|---|
| `propose` | requesting Module Engineer | actor equals source capability's current active Binding and the request's requester fence |
| `submit` | requesting Module Engineer | exact current digest and current Binding generation |
| `accept` / `reject` | Human | exact current digest; acceptance includes the complete planning projection |
| `cancel` | requesting Module Engineer or Human | only before acceptance; Engineer remains Binding-fenced |
| `materialize` | target Module Engineer | exact current target Binding plus exact tracked Git commit/Sprint/Work Graph proof |
| `implemented` | target Module Engineer | immutable implementation evidence digest and exact current digest |
| `integrated` | Human | immutable integration evidence digest; target Engineer cannot self-integrate |

`Program Orchestrator` is a workflow role, not a third mutation principal kind. It acts through an authenticated Human authority or a current Engineer principal. `authorization_id` is only a server-side lookup carrier for an Engineer principal and never appears in the semantic record.

The Human-approved product entrypoints are closed: authenticated Engineer MCP may invoke only `propose`, `submit`, `cancel`, `materialize`, and `implemented`; the server derives the Engineer principal from the existing OAuth authorization carrier and revalidates current Binding. Human CLI may invoke only `accept`, `reject`, `cancel`, and `integrated`. There is no CLI option that accepts an Engineer authorization ID.

## Data Model

```yaml
InterfaceChangeRequestV1:
  protocol: 1
  kind: repo-harness-interface-change-request
  repository_id: string
  request_id: uuid
  source_capability_id: string
  target_capability_id: string
  requester_fence: {engineer_id: string, binding_id: uuid, binding_generation: integer, engineer_contract_revision: sha256}
  target_engineer_id: string
  interface_ref: string
  proposed_change: bounded-utf8
  compatibility_impact: bounded-utf8
  request_sha256: sha256

InterfaceWorkPackageProjectionV1:
  protocol: 1
  kind: repo-harness-interface-work-package-projection
  request_id: uuid
  request_sha256: sha256
  accepted_from_current_digest: sha256
  sprint_ref: repo-relative-path
  expected_work_graph_revision: sha256|null
  proposed_work_package: WorkPackageDefinitionV1
  proposed_work_package_revision: sha256
  projection_sha256: sha256

InterfaceChangeCurrentV1:
  protocol: 1
  kind: repo-harness-interface-change-current
  request_id: uuid
  request_sha256: sha256
  request_revision: integer
  state: proposed|under_review|accepted|rejected|implementing|implemented|integrated|cancelled
  current_event_sha256: sha256
  accepted_projection_sha256: sha256|null
  materialized_work_package_ref: {repository_id: string, sprint_ref: string, work_graph_revision: sha256, work_package_id: string, work_package_revision: sha256, materialized_commit: git-oid}|null
  implementation_evidence_sha256: sha256|null
  integration_evidence_sha256: sha256|null
  previous_current_digest: sha256|null
  current_digest: sha256
```

## Authority and Projection Closure

- `InterfaceChangeRequestV1` plus its immutable event/current chain is the only interface-decision authority.
- `InterfaceWorkPackageProjectionV1` is a proposal to the existing planning authority, not a schedulable Work Package and not permission to edit code.
- The tracked Sprint plus sibling `WorkGraphV1` remains the only scheduling authority. `materialize` verifies exact committed bytes; it does not write them.
- Reverse lookup from canonical Work Package to request is a deterministic index over accepted projections/materialization events. It is not embedded into `WorkPackageDefinitionV1`, so ME-1A wire semantics remain unchanged.
- ArchContext receives normal architecture drift events after acceptance/materialization. Those events are observability/projection evidence and cannot accept, reject or integrate a request.

## Developer Handoff

The architecture projection, actor matrix and planning boundary above are frozen. No generic payload/state extension is allowed. Do not add direct Sprint/Work Graph mutation, architecture queue mutation, code mutation, merge, Provider runtime or Task/Lease/Publication/Acceptance authority.

### Acceptance Scripts

1. Race two revision transitions and assert one winner.
2. Accept and assert exact request/projection/Work Package definition digests link both directions through the deterministic reverse index.
3. Refuse `materialize` until an exact tracked Sprint/Work Graph commit contains the projected definition; then accept exactly one matching materialization.
4. Send a message saying “accepted” and prove state remains unchanged.
5. Record implementation without integration and assert request is not `integrated`; prove only Human can integrate.
