# Plan: ME-1A Engineer Scheduling Schema

> **Status**: Archived
> **Created**: 20260825-1149
> **Slug**: me1a-engineer-scheduling-schema
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Closed graph schema, deterministic offers, repo concurrency election, stale-fence matrix, authenticated ME-0B bridge, and full repository checks
> **Rollback Surface**: Revert ME-1A graph, projection, MCP surface, tests, architecture and workflow artifacts without changing existing Task, Lease, Fleet, Publication or Acceptance state
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260825-1149-me1a-engineer-scheduling-schema.contract.md`
> **Task Review**: `tasks/reviews/20260825-1149-me1a-engineer-scheduling-schema.review.md`
> **Implementation Notes**: `tasks/notes/20260825-1149-me1a-engineer-scheduling-schema.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260825-1149-me1a-engineer-scheduling-schema.md`
- Sprint contract: `tasks/contracts/20260825-1149-me1a-engineer-scheduling-schema.contract.md`
- Sprint review: `tasks/reviews/20260825-1149-me1a-engineer-scheduling-schema.review.md`
- Implementation notes: `tasks/notes/20260825-1149-me1a-engineer-scheduling-schema.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260825-1149-me1a-engineer-scheduling-schema.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260825-1149-me1a-engineer-scheduling-schema.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260825-1149-me1a-engineer-scheduling-schema.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260825-1149-me1a-engineer-scheduling-schema.contract.md`
- Review file: `tasks/reviews/20260825-1149-me1a-engineer-scheduling-schema.review.md`
- Implementation notes file: `tasks/notes/20260825-1149-me1a-engineer-scheduling-schema.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260825-1149-me1a-engineer-scheduling-schema.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260825-1149-me1a-engineer-scheduling-schema.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert ME-1A graph, projection, MCP surface, tests, architecture and workflow artifacts without changing existing Task, Lease, Fleet, Publication or Acceptance state
- **Verification boundary**: Closed graph schema, deterministic offers, repo concurrency election, stale-fence matrix, authenticated ME-0B bridge, and full repository checks
- **Review/acceptance boundary**: `tasks/reviews/20260825-1149-me1a-engineer-scheduling-schema.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260825-1149-me1a-engineer-scheduling-schema.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260825-1149-me1a-engineer-scheduling-schema.contract.md`, `tasks/reviews/20260825-1149-me1a-engineer-scheduling-schema.review.md`, and `tasks/notes/20260825-1149-me1a-engineer-scheduling-schema.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260825-1149-me1a-engineer-scheduling-schema.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert ME-1A graph, projection, MCP surface, tests, architecture and workflow artifacts without changing existing Task, Lease, Fleet, Publication or Acceptance state

## Captured Planning Output

## Goal

Promote and implement ME-1A as the first scheduling authority for persistent Module Engineers: an explicit versioned Work Package Graph carrier, deterministic `EngineerOfferV1` projection, repository-scoped concurrency fencing, and an authenticated acquire bridge that reuses ME-0B and the existing Fleet/Lease/WorkEnvelope path.

## Success Criteria

- A canonical Sprint participates in module routing only when its deterministic sibling carrier `<sprint-stem>.work-graph.v1.json` exists at the same canonical Git commit and validates as either explicit `generic-v1` or `engineering-v2`; a missing carrier is `unclassified`, never inferred from prose or paths.
- `engineering-v2` requires an exact one-to-one mapping from every canonical backlog row to a stable `work_package_id` and exact `task_ref`; revisions are deterministic projections and do not alter existing `task_id` or `task_revision` derivation.
- The graph schema is closed: one `primary_capability`, repository-qualified dependencies, closed dependency states, repo-only concurrency, revision-fenced acceptance-policy and rollback references, no `required_capabilities`, no unknown keys, duplicate IDs, missing targets, or cycles.
- `EngineerOfferV1` is emitted only when the current Engineer Profile capability matches the Work Package primary capability, the exact ME-0A Binding is active, the underlying Fleet offer is execution-ready, dependencies are proven, concurrency is available, and active-claim limits permit another claim.
- Every offer revision binds repository, graph/work-package/task, Engineer contract, Binding, Fleet offer, dependency and concurrency observations. Changing any authority makes the offer stale.
- Authenticated `engineer_acquire` accepts an exact Engineer offer fence, revalidates it under the repository-scoped concurrency lock, then calls the existing ME-0B acquire wrapper. It creates no second Lease, assignment, claim protocol, or synthetic task authority.
- Existing generic Fleet offers/acquire and Sprint row identity remain unchanged. Unsupported future dependency authorities stay typed `authority_unavailable` and never become ready through fallback inference.

## Scope

- Promote `plans/prds/20260824-1653-engineer-scheduling-schema.prd.md` to Approved and freeze the carrier, explicit legacy lane, proof-reference, concurrency, offer, and acquire decisions.
- Add pure closed Work Graph and Engineer Offer schemas, canonical digests, graph validation, cycle detection, row projection, dependency evaluation, and deterministic matching under `src/core/engineers/`.
- Add canonical same-commit graph/ref reads, Profile/Binding/Fleet joins, live ClaimActor/Lease counting, dependency-authority adapters, deterministic offer collection, and repo concurrency locking under `src/effects/engineers/`.
- Extend the restricted Engineer MCP surface with read-only `engineer_offers` and require scheduling offer fences for `engineer_acquire`; keep the OAuth principal as the sole caller identity.
- Add local read-only CLI inspection/validation surfaces where they do not create an unauthenticated mutation path.
- Add ArchContext capability/relations/flow/module projection, durable workstream, tests, plan/contract/review/notes, and full verification evidence.

## Non-scope

- No Provider Thread identity, Session lifecycle, Worker Host, delegation, messaging, writable Worker grants, handoff, interface requests, Human Board, or product Acceptance implementation.
- No new Task/Lease/Publication/Acceptance identity or state machine and no changes to generic Fleet selection semantics.
- No `capability|fleet` concurrency scope, multi-capability qualification, cross-process fleet-global scheduler, automatic graph authoring, prose/path inference, compatibility default for carrier-less Sprints, or silent migration.
- No production claim that future `product_accepted` authority exists; an unavailable authority fails closed.
- No new dependency, database, daemon, cache, or background reconciler.

## P1 · Architecture Map

- Canonical Sprint bytes at the configured target ref remain the task-row authority; `coordination-identity.ts` remains the sole `task_id/task_revision` derivation and is not edited.
- A deterministic sibling JSON carrier at the same commit owns stable Work Package identity and scheduling metadata. It is a separate authority because scheduling revisions must move without changing Task/Lease identity.
- `src/core/engineers/scheduling.ts` owns closed schemas and pure validation/projection only.
- `src/effects/engineers/scheduling.ts` owns Git reads at one resolved commit, exact referenced-file digest validation, Profile/Binding/Fleet/Lease joins, and offer projection.
- `src/effects/engineers/scheduling-acquire.ts` owns the repo-concurrency lock and current-offer revalidation before delegating to `acquireEngineerTask`; ME-0B remains principal/receipt/compensation authority and Fleet remains task mutation authority.
- `src/cli/mcp/engineer-tools.ts` remains the authenticated transport boundary. Local CLI surfaces are read-only and cannot fabricate an Engineer principal.
- A new `capability.runtime-harness.engineer-scheduling` ArchContext node owns the new scheduling modules and records explicit calls to Engineer Bindings and the existing Fleet acquire boundary.

Scale signal: existing Fleet acquire is ~874 lines and already owns claim/provision/bind/rollback. The smallest coherent ME-1A change wraps that path and adds a separate pure graph projection; copying or extending the Lease state machine would create dual authority. At 10x, full graph/profile/receipt scans and per-key synchronous lock hold time fail first; 100-node/10-Engineer P0 remains bounded and measured before any index or daemon is justified.

## P2 · Concrete Trace

The scheduler resolves the registry repo and canonical target, reads the Sprint and its deterministic graph sibling from the same commit, validates exact keys and referenced policy/rollback bytes, then projects each graph node onto exactly one canonical backlog row. It derives graph/work-package revisions without touching task identity. It joins the existing Fleet offer for that task, the canonical Engineer Profile whose capability exactly matches `primary_capability`, and the current active Binding. Dependency adapters return closed observations; any missing proof, unsupported authority, active same-key Lease, active-claim limit, stale Binding, non-ready Fleet offer, or mixed snapshot yields a typed exclusion rather than an offer.

`engineer_offers` resolves the OAuth authorization to the live ME-0B principal and returns only offers for that exact Engineer/repository. `engineer_acquire` supplies the exact Engineer offer revision plus graph/work-package/task/binding/Fleet fences. Under the repo-scoped concurrency-key lock, the acquire effect recollects the offer; mismatch stops before Fleet mutation. A current offer is translated only into the existing exact Fleet assertion and passed to `acquireEngineerTask`, which performs Fleet claim/worktree/WorkEnvelope creation and ClaimActorReceipt publication/compensation. The returned result includes the canonical WorkEnvelope and receipt; no Engineer assignment store is written.

Error paths are fail-closed: malformed/missing carrier, stale ref digest, graph cycle, unavailable dependency authority, concurrency contention, changed Binding/Profile/Fleet offer, or receipt failure returns a closed error. Only ME-0B may compensate its own exact Claim after Fleet mutation; ME-1A never releases a foreign Claim.

## P3 · Design Decision

Use a deterministic sibling JSON graph rather than adding Sprint columns. Existing row identity deliberately hashes Task/Mode/Acceptance with specific exclusions; adding scheduling semantics to that grammar would either silently alter revisions or create a second parser in shell. A separate canonical carrier preserves task identity and gives scheduling metadata an independent digest and migration boundary.

Absence is `unclassified`, not legacy. Legacy participation is explicit `lane: generic-v1` with no module nodes; `engineering-v2` requires complete row coverage. The legacy lane is removed only after a release audit finds zero `generic-v1` carriers across all registered repositories; until then it remains excluded from Module Engineer routing while generic Fleet continues unchanged.

Use repository-scoped lock + live Lease recheck for concurrency. Offer-time filtering alone races across two different tasks, while extending Lease with a scheduling key would contaminate generic Fleet. Holding one existing-style exclusive lock across final offer revalidation and the synchronous ME-0B/Fleet acquire call elects one winner without a second ownership record.

Keep dependency authority adapters closed. `canonical_done` can be proven now from canonical rows; other states consume only their named receipt authority when available. Missing future authorities return `authority_unavailable`; they are never approximated from review Markdown, plan status, branch names, or prose.

## Closed Protocol Decisions

- Carrier path: replace `.sprint.md` with `.work-graph.v1.json`; any other suffix or header pointer is rejected as non-authoritative.
- Carrier lanes: `generic-v1` requires zero Work Packages; `engineering-v2` requires exact full Sprint-row coverage. Missing carrier is `unclassified`.
- Repository identity uses the existing registry `repo_<hex16>` ID. Work Package identity is `(repository_id, work_package_id)` and stays stable across Task revisions.
- `task_ref` is the exact canonical Task cell. It is a mapping fence, never an ID derivation.
- P0 capability qualification is exact equality between Profile `capability_id` and node `primary_capability`.
- P0 dependencies are repository-qualified edges with `canonical_done|module_accepted|publication_integrated|product_accepted`; no inferred multi-capability set.
- P0 concurrency accepts only `{scope:"repo", key}` and uses a Git-common-dir exclusive lock plus live Lease observations.
- Acceptance and rollback records carry safe repo-relative refs and SHA-256 revisions; same-commit bytes must match before offers exist.
- Work Package and graph revisions are derived canonical SHA-256 values, never authored fields.
- Engineer offer revisions bind all source revisions and observations but grant no authority.
- Restricted MCP tool inventory becomes exactly `engineer_status`, `engineer_offers`, `engineer_acquire`; acquire requires exact scheduling fences and has no compatibility fallback to a bare Fleet offer.
- Generic Fleet behavior remains byte-compatible because only the authenticated Engineer route consumes Work Graphs.

## Candidate File Changes

- PRD, work-package plan/contract/review/notes and durable workstream artifacts.
- `src/core/engineers/scheduling.ts`.
- `src/effects/engineers/scheduling.ts`, `scheduling-acquire.ts`, and bounded ClaimActor listing support.
- `src/cli/mcp/engineer-tools.ts`, `instructions.ts`, and `src/cli/commands/engineer.ts` read-only surfaces.
- New ArchContext scheduling node/component/relation/flow and generated architecture projections.
- Focused `tests/unit/me1a-*`, CLI/MCP tests, plus existing ME-0B/Fleet/coordination regression suites.

## Verification

- Pure schema/graph tests: exact keys, explicit lanes, full row coverage, stable ID across task revision, duplicate/missing/cross-repo edges, cycles, repo-only concurrency, forbidden future keys/scopes, policy/rollback ref fencing, 100-node performance.
- Offer projection tests: exact capability match, dependency observations, generic/unclassified exclusion, active Binding/Profile revision, max claims, concurrency conflict, Fleet readiness, deterministic ordering/revisions.
- Acquire tests: every graph/work-package/task/Binding/Fleet/concurrency fence stale before mutation, N-way same-key winner, current offer delegates exactly once to ME-0B, receipt/WorkEnvelope returned unchanged.
- MCP tests: exact three-tool inventory, read-only offers, authenticated principal-only selection, stale offer failure, no generic Fleet/shell/write surface.
- `bun run check:type` and focused suites.
- Full `bun test --timeout 60000` plus all repository Required Checks.
- Independent final-subject acceptance before merge.

## Task Breakdown

- [x] Freeze and promote the carrier/schema/migration decisions in the ME-1A PRD; capture architecture change and contract scope.
- [x] Implement pure Work Graph/Engineer Offer schemas, validation, revisions and dependency/concurrency classification.
- [x] Implement same-commit carrier/ref reads, Profile/Binding/Fleet/Lease joins and deterministic offer collection.
- [x] Implement concurrency-fenced authenticated acquire bridge and restricted MCP/CLI surfaces.
- [x] Add focused tests, architecture/workstream projections, and full repository verification.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
