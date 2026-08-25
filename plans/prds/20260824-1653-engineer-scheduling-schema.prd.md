# PRD: Engineer Scheduling Schema (ME-1A)

> **Status**: Approved
> **Slug**: `engineer-scheduling-schema`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-25T11:49:00+0800
> **Human Approval**: User approved ME-1A execution on 2026-08-25
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: ME-0A for schema/projection; ME-0B only for engineer-scoped acquire mutation
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: current task identity is content-addressed and Fleet offers have no stable Work Package dependency/capability/concurrency schema; LLM prose cannot be scheduler authority。
- **Users**: Program Orchestrator、Module Engineer、Fleet scheduler。
- **Platform**: canonical Sprint/Work Package artifacts、task projection、Fleet offer/acquire。
- **P0 surface**: stable `repository_id + work_package_id`、independent Work Package/graph revisions、primary routing capability、typed dependency states、priority、repo-scoped concurrency key、required acceptance/rollback refs、cycle validation、deterministic `EngineerOfferV1` projection and acquire bridge。
- **Core metric**: identical canonical bytes produce identical eligible Engineer/offer set；missing structured fields never从 prose 推断。
- **Hard constraint**: `task_id/task_revision` semantics remain unchanged；`work_package_id` is a new logical reference, not a replacement Lease identity。
- **Key risk**: implicit legacy defaults would create a shadow semantic parser。
- **Unknowns**: blocking unknowns closed；future product-acceptance authority and capability/fleet concurrency remain explicitly unavailable outside P0。
- **Acceptance scenarios**: stable dependency across task revisions、cross-capability dependency、stale Engineer offer、scoped concurrency conflict、cycle rejection、explicit legacy lane。
- **Suggested next step**: execute `plans/plan-20260825-1149-me1a-engineer-scheduling-schema.md`；do not combine with messages or UI。

## Problem

Dependencies cannot safely point only at content-addressed `task_id`, because editing a task changes identity. Capability may be plural, and an unscoped `concurrency_key: release` has no deterministic fleet meaning.

### Product Direction

- `work_package_id` is stable logical identity; task revision remains current content version.
- The canonical carrier is the deterministic same-commit sibling obtained by replacing `.sprint.md` with `.work-graph.v1.json`; absence is `unclassified`, never an inferred legacy lane.
- Dependency targets `work_package_id + required_state`.
- Each P0 work package has exactly one `primary_capability` referencing a canonical ArchContext node ID. Cross-capability prerequisites are explicit `depends_on` Work Package edges; P0 has no multi-capability Engineer qualification field.
- P0 concurrency is repository-scoped with a normalized key. `capability` and `fleet` scopes are reserved and rejected until their authorities exist.
- Required acceptance and rollback boundary are explicit revision-fenced refs to their owning contracts; the scheduler validates presence/revisions but never invents gate semantics.
- Legacy v1 tasks remain explicitly generic and are never module-routed; migration is explicit and never inferred from prose/path.
- `EngineerOfferV1` is a rebuildable candidate, not an assignment or Lease. It binds one eligible Engineer to exact graph/work-package/task/binding/Fleet offer revisions; Program Orchestrator may select only from emitted offers.
- Authenticated MCP `engineer_acquire` revalidates those revisions under the existing Fleet acquire boundary, then delegates Claim/worktree/WorkEnvelope creation to `fleet acquire` and invokes ME-0B's receipt/compensation boundary. It never creates a second claim protocol.

### Feasibility Boundary

- **Confirmed**: current task identity/digest and canonical Sprint parsing are deterministic.
- **Confirmed**: scheduling fields live in a referenced same-commit JSON graph sibling. Sprint Backlog columns and `task_id/task_revision` derivation remain byte-compatible.
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

### Scenario 2: Cross-capability dependency

- **Given**: WP-UI has one frontend primary capability and depends on module-accepted WP-API owned by a backend capability.
- **When**: WP-API is not yet module-accepted.
- **Then**: no execution-ready WP-UI Engineer offer is emitted; the scheduler does not require a frontend Engineer to qualify for the backend capability.
- **Machine-checkable evidence**: closed dependency-state projection and zero inferred `required_capabilities`.

### Scenario 3: Legacy task

- **Given**: an explicit generic-v1 task without scheduling fields.
- **When**: engineering-v2 scheduler runs.
- **Then**: it is excluded from module routing and never assigned defaults from prose.
- **Machine-checkable evidence**: typed lane result and zero inferred fields.

### Scenario 4: Stale Engineer offer

- **Given**: an offer for graph revision G, binding generation B and Fleet offer revision F.
- **When**: a dependency, task revision, Binding or Fleet eligibility changes before acquire.
- **Then**: `engineer_acquire` fails with a typed stale-precondition reason and does not call the mutating Fleet acquire path.
- **Machine-checkable evidence**: adapter spy count zero and unchanged Lease store.

## Non-goals

- Messaging delivery, UI rendering, Session lifecycle or Worker runtime.
- Replacing task/Lease identity.
- Heuristic default capability, dependency or concurrency inference.

## Module Behaviors (P0)

### Module 1: Canonical Work Graph

- validates IDs, capabilities, dependency states, priority, concurrency scope, required acceptance refs and rollback boundary refs;
- detects missing target, duplicate logical ID and cycle;
- reads only `<sprint-stem>.work-graph.v1.json` from the same canonical commit as the Sprint;
- classifies a missing carrier as `unclassified`; `generic-v1` requires zero Work Packages and `engineering-v2` requires exact full Sprint-row coverage;
- derives Work Package and graph revisions from canonical bytes rather than accepting authored revision fields.

### Module 2: Deterministic Offer Matching

- intersects registered repo authorization, dependency readiness, capability requirements, concurrency permits and existing execution readiness;
- emits typed exclusion reasons; never invokes LLM routing.

### Module 3: Engineer Offer and Acquire Bridge

- emits one immutable `EngineerOfferV1` per exact eligible Engineer/Binding candidate;
- computes `offer_revision` from canonical graph/work-package/task, Engineer contract, Binding and Fleet-offer revisions;
- revalidates all inputs before invoking existing Fleet acquire; success returns the canonical WorkEnvelope plus ClaimActorReceipt, while failure creates neither Lease nor synthetic assignment state.

## Data Model

```yaml
repository_id: repo-harness
work_package_id: wp-publication-reconcile
work_package_revision: sha256
work_graph_revision: sha256
primary_capability: capability.workflow-engine.contract-assets
depends_on:
  - repository_id: repo-harness
    work_package_id: wp-provider-receipt
    required_state: module_accepted
priority: 50
concurrency:
  scope: repo
  key: publication-state
execution_surface: contract
integration_group: fleet-publication
required_acceptance:
  - gate: module
    policy_id: module-default
    policy_ref: plans/policies/module-default.json
    policy_revision: sha256
rollback_boundary:
  kind: work_package
  boundary_id: repo-harness:wp-publication-reconcile
  boundary_ref: plans/rollback/repo-harness-wp-publication-reconcile.json
  boundary_revision: sha256

EngineerOfferV1:
  protocol: 1
  repository_id: repo-harness
  work_package_id: wp-publication-reconcile
  work_package_revision: sha256
  work_graph_revision: sha256
  task_id: sha256
  task_revision: sha256
  primary_capability: capability.workflow-engine.contract-assets
  dependency_state: ready
  engineer_id: engineer:workflow-contract-assets
  engineer_contract_revision: sha256
  binding_id: uuid
  binding_generation: integer
  fleet_offer_revision: sha256
  offer_revision: sha256
```

`EngineerOfferV1` contains no Provider Thread ID and grants no authority. The acquire request supplies only `offer_revision` plus exact expected revisions/generation; caller identity is server-derived by ME-0B. A successful bridge returns existing Fleet acquire output and ClaimActorReceipt, not a parallel Engineer lease.

The restricted MCP inventory becomes exactly `engineer_status`, `engineer_offers`, and `engineer_acquire`. `engineer_acquire` requires an exact `EngineerOfferV1` revision and has no compatibility fallback to a bare Fleet offer. Local CLI surfaces are read-only; no unauthenticated CLI acquire route is introduced.

Closed dependency states and their sole authorities:

- `canonical_done`: canonical task/Sprint state authority;
- `module_accepted`: existing exact-subject AcceptanceReceipt;
- `publication_integrated`: existing Publication receipt/state authority;
- `product_accepted`: ME-4C product Acceptance receipt.

P0 accepts only `concurrency.scope: repo`. `capability|fleet` values and an unknown `required_capabilities` key are schema errors until a separate qualification/permit authority is Approved. A dependency owned by another capability is represented only through its repository-qualified Work Package edge and closed required state. Offer-time filtering is not the election authority: acquire holds one Git-common-dir exclusive lock for the normalized repository-scoped key across final offer revalidation and the synchronous ME-0B/Fleet acquire call, so different Task locks cannot admit two winners.

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Graph validation | ≤3 s for 100 nodes | fixture benchmark | 15 s |
| Offer matching | ≤250 ms per repo snapshot | benchmark | 2 s |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Multi-capability Engineer qualification | Deferred outside P0 | separate qualification authority PRD; do not infer from capability graph | Architecture owner |
| Product Acceptance authority | Deferred outside P0 | ME-4C receipt authority; return `authority_unavailable` until it exists | Acceptance owner |
| Capability/fleet concurrency | Deferred outside P0 | separate permit authority; schema rejects these scopes | Scheduling owner |

## Developer Handoff

The canonical carrier and bounded legacy migration are frozen by the Approved decisions below.

- **Build first after approval**: pure schema/graph validation, then deterministic projection, then acquire revalidation.
- **Do not reinterpret**: no prose inference; no task digest change without explicit migration design.
- **Verify with**: identity fixtures, cycles, revision stability, capability mismatch and concurrency races.

### Acceptance Scripts

1. Validate 100-node acyclic graph and reject one introduced cycle.
2. Revise a task while retaining Work Package identity and dependency semantics.
3. Exercise repo-scoped concurrency and reject fleet scope as unsupported.
4. Confirm generic-v1 tasks never enter module routing.
5. Change only scheduling metadata; assert `work_package_revision/work_graph_revision` change and stale Offer/acquire preconditions fail.
6. Add `required_capabilities` or `concurrency.scope: capability|fleet`; assert exact schema refusal rather than inferred qualification or a synthetic permit.
7. Change graph, task, binding and Fleet-offer revisions one at a time; assert every stale offer fails before Fleet mutation, while one current offer produces exactly one canonical Claim and WorkEnvelope.
8. Remove or stale an acceptance-policy/rollback-boundary ref and assert graph validation fails before offer projection.

## Approved Carrier and Migration Contract

- For `plans/sprints/<name>.sprint.md`, the only scheduling carrier is `plans/sprints/<name>.work-graph.v1.json` at the exact commit returned by the canonical Sprint read. Headers, Plan cells, filenames outside this deterministic relation, local working-tree bytes and Provider context cannot redirect it.
- A missing carrier is typed `unclassified` and excluded from Module Engineer routing. It is not treated as legacy, empty, or ready.
- `lane: generic-v1` is the sole legacy marker and requires an empty Work Package list. Generic Fleet continues unchanged, but Module Engineer routing emits no offers for the lane.
- `lane: engineering-v2` requires every canonical Backlog row to match exactly one `task_ref`, and every node to match one row. Partial migration fails closed.
- Migration is an explicit tracked artifact change. No command synthesizes capability, dependency, concurrency, acceptance, rollback or Work Package identity from prose or paths.
- The legacy lane removal trigger is a release audit over all registered repositories reporting zero `generic-v1` carriers. Until that observable trigger, the parser accepts the lane but never routes it.
- Required acceptance and rollback references carry safe repo-relative `*_ref` plus exact SHA-256 revision. The scheduler validates same-commit bytes; missing or stale references block the graph before offer projection.
