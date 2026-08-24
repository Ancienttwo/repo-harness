# PRD: Engineer Scheduling Schema (ME-1A)

> **Status**: Draft
> **Slug**: `engineer-scheduling-schema`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T16:53:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: `plans/prds/20260824-1653-engineer-binding-principal-claim-actor.prd.md`
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: current task identity is content-addressed and Fleet offers have no stable Work Package dependency/capability/concurrency schema; LLM prose cannot be scheduler authority。
- **Users**: Program Orchestrator、Module Engineer、Fleet scheduler。
- **Platform**: canonical Sprint/Work Package artifacts、task projection、Fleet offer/acquire。
- **P0 surface**: stable `work_package_id`、primary/required capabilities、typed dependencies、priority、scoped concurrency key、cycle validation、deterministic matching。
- **Core metric**: identical canonical bytes produce identical eligible Engineer/offer set；missing structured fields never从 prose 推断。
- **Hard constraint**: `task_id/task_revision` semantics remain unchanged；`work_package_id` is a new logical reference, not a replacement Lease identity。
- **Key risk**: implicit legacy defaults would create a shadow semantic parser。
- **Unknowns**: exact migration carrier in Sprint markdown/schema remains to be frozen。
- **Acceptance scenarios**: stable dependency across task revisions、multi-capability task、scoped concurrency conflict、cycle rejection、explicit legacy lane。
- **Suggested next step**: first freeze canonical schema and one-shot migration fixture；do not combine with messages or UI。

## Problem

Dependencies cannot safely point only at content-addressed `task_id`, because editing a task changes identity. Capability may be plural, and an unscoped `concurrency_key: release` has no deterministic fleet meaning.

### Product Direction

- `work_package_id` is stable logical identity; task revision remains current content version.
- Dependency targets `work_package_id + required_state`.
- Each work package has one `primary_capability` and zero or more `required_capabilities` referencing canonical ArchContext node IDs.
- Concurrency key includes `scope = repo|capability|fleet` and normalized key.
- Legacy v1 tasks remain explicitly generic and are never module-routed; migration is explicit and never inferred from prose/path.

### Feasibility Boundary

- **Confirmed**: current task identity/digest and canonical Sprint parsing are deterministic.
- **[UNKNOWN]**: whether fields live in Sprint columns or a referenced tracked graph while preserving current row identity.
- **[UNVERIFIED]**: fleet-global concurrency behavior across registered repos under race.

## Users

### Primary Users

- **Program Orchestrator**: creates approved structured work graph.
- **Module Engineer**: receives only capability-compatible, dependency-ready offers.

### Secondary Users

- **Legacy generic Worker**: continues only on explicit generic-v1 tasks during a bounded migration window.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Prose-derived routing | 0 | negative fixtures | any inference |
| Cyclic graphs admitted | 0 | graph tests | any cycle |
| Capability-mismatched offers | 0 | projection fixtures | any offer |
| Stable dependency after task revision | 100% | revision fixture | broken edge |
| Concurrency race winners | exactly allowed cardinality | N-way tests | excess winner |

## Acceptance Scenarios

### Scenario 1: Stable logical dependency

- **Given**: B depends on logical Work Package A in accepted state.
- **When**: A's task content is revised without changing `work_package_id`.
- **Then**: B still references A and waits for the new accepted revision.
- **Machine-checkable evidence**: graph projection before/after revision.

### Scenario 2: Multi-capability matching

- **Given**: one primary and two required capabilities.
- **When**: Engineer lacks one required capability.
- **Then**: offer is not execution-ready for that Engineer.
- **Machine-checkable evidence**: closed capability set comparison.

### Scenario 3: Legacy task

- **Given**: an explicit generic-v1 task without scheduling fields.
- **When**: engineering-v2 scheduler runs.
- **Then**: it is excluded from module routing and never assigned defaults from prose.
- **Machine-checkable evidence**: typed lane result and zero inferred fields.

## Non-goals

- Messaging, UI, Session binding or Worker runtime.
- Replacing task/Lease identity.
- Heuristic default capability, dependency or concurrency inference.

## Module Behaviors (P0)

### Module 1: Canonical Work Graph

- validates IDs, capabilities, dependency states, priority and concurrency scope;
- detects missing target, duplicate logical ID and cycle;
- version/migration decision remains open until the tracked carrier is selected.

### Module 2: Deterministic Offer Matching

- intersects registered repo authorization, dependency readiness, capability requirements, concurrency permits and existing execution readiness;
- emits typed exclusion reasons; never invokes LLM routing.

## Data Model

```yaml
work_package_id: wp-publication-reconcile
primary_capability: capability.workflow-engine.contract-assets
required_capabilities:
  - capability.verification.evals-checks
depends_on:
  - work_package_id: wp-provider-receipt
    required_state: accepted
priority: 50
concurrency:
  scope: repo
  key: publication-state
execution_surface: cli
integration_group: fleet-publication
```

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Graph validation | ≤3 s for 100 nodes | fixture benchmark | 15 s |
| Offer matching | ≤250 ms per repo snapshot | benchmark | 2 s |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Sprint column vs referenced graph carrier | Blocks approval | compare digest/migration blast radius | State owner |
| Explicit legacy window/removal trigger | Compatibility scope | freeze migration contract | Maintainer |

## Developer Handoff

Do not implement until the canonical carrier and bounded legacy migration are frozen.

- **Build first after approval**: pure schema/graph validation, then deterministic projection, then acquire revalidation.
- **Do not reinterpret**: no prose inference; no task digest change without explicit migration design.
- **Verify with**: identity fixtures, cycles, revision stability, capability mismatch and concurrency races.

### Acceptance Scripts

1. Validate 100-node acyclic graph and reject one introduced cycle.
2. Revise a task while retaining Work Package identity and dependency semantics.
3. Exercise repo/capability/fleet concurrency scopes.
4. Confirm generic-v1 tasks never enter module routing.

