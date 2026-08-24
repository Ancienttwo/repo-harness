# PRD: Interface Change Request (ME-4B)

> **Status**: Draft
> **Slug**: `interface-change-request`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T18:30:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-1A scheduling schema and ME-1C coordination messages
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: cross-capability interface change is currently prose/message, not a revisioned authority with actor and transition fencing.
- **Users**: requesting Module Engineer, owning Module Engineer, Program Orchestrator and Human approver.
- **Platform**: closed record store, per-request transition lock, typed messages and Work Package projection.
- **P0 surface**: `InterfaceChangeRequestV1`, lifecycle, actor matrix, acceptance projection and implementation/integration evidence closure.
- **Core metric**: message-body transition 0; stale revision transition 0.
- **Hard constraint**: accepted request creates/revises canonical Work Package through an explicit projection; it does not directly change code/task state.
- **Key risk**: request and generated Work Package drifting as two authorities.
- **Unknowns**: exact architecture event linkage must match existing queue/snapshot authority before approval.
- **Acceptance scenarios**: create, stale transition, accept/project, reject, implement/integrate closure and message notification.
- **Suggested next step**: freeze schema/store plus one acceptance-to-Work-Package fixture.

## Problem

Messages can notify but cannot own an interface decision. The request needs an immutable revision chain and explicit linkage to canonical planning/architecture artifacts.

### Product Direction

Persist closed revisions under one request ID. Server-derived principals authorize transitions. Acceptance emits a deterministic Work Package projection bound to request revision/digest; later evidence closes implementation and integration separately.

### Feasibility Boundary

- **Confirmed**: immutable records, locks and typed message subjects exist as established patterns.
- **[UNKNOWN]**: architecture queue/snapshot event chosen as the final interface decision projection.
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

Acceptance creates a deterministic repository-qualified Work Package revision referencing exact request digest.

### Scenario 3: Closure

Implementation and integration evidence are recorded as separate transitions; neither is inferred from task prose or a green PR alone.

## Non-goals

- General chat, task handoff, combined candidate or product Acceptance.
- Direct code mutation or automatic merge.

## Module Behaviors (P0)

### Module 1: Request Authority

Validate actor, expected revision and closed state transition under a per-request lock; append immutable record revision.

### Module 2: Planning Projection

On acceptance, produce/revise one canonical Work Package referencing request ID/revision/digest and send typed notifications through ME-1C.

## Data Model

```yaml
InterfaceChangeRequestV1:
  protocol: 1
  repository_id: string
  request_id: uuid
  request_revision: integer
  source_capability_id: string
  target_capability_id: string
  interface_ref: string
  proposed_change: bounded-utf8
  compatibility_impact: bounded-utf8
  requested_by: principal-ref
  state: proposed|under_review|accepted|rejected|implementing|implemented|integrated|cancelled
  accepted_work_package_ref: {repository_id: string, work_package_id: string, work_package_revision: sha256}|null
  implementation_evidence_sha256: sha256|null
  integration_evidence_sha256: sha256|null
  previous_revision_sha256: sha256|null
  record_sha256: sha256
```

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Architecture event projection | Blocks approval | map to existing architecture queue/snapshot | Architecture owner |

## Developer Handoff

Do not implement until the architecture projection and actor matrix are frozen. No generic payload/state extension is allowed.

### Acceptance Scripts

1. Race two revision transitions and assert one winner.
2. Accept and assert exact Work Package/request digests link both directions.
3. Send a message saying “accepted” and prove state remains unchanged.
4. Record implementation without integration and assert request is not `integrated`.
