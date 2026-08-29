# Plan: C1 CoordinationSignalV1 schema, common.ts and append-only store

> **Status**: Archived
> **Created**: 20260829-2137
> **Slug**: c1-coordination-signal-store
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#2
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Full bun suite, tsc --noEmit, task-sync, strict task workflow and architecture-sync all green; three actors publish concurrently; same id+payload idempotent and different payload conflicts; Task/Lease store bytes unchanged
> **Rollback Surface**: Single revertable commit adding src/core/collaboration/, src/effects/collaboration/, four test files, the archcontext node pair, one architecture module doc, one workstream ledger and one policy flag; collaboration.mode=off leaves the code inert
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260829-2137-c1-coordination-signal-store.contract.md`
> **Task Review**: `tasks/reviews/20260829-2137-c1-coordination-signal-store.review.md`
> **Implementation Notes**: `tasks/notes/20260829-2137-c1-coordination-signal-store.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#2
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260829-2137-c1-coordination-signal-store.md`
- Sprint contract: `tasks/contracts/20260829-2137-c1-coordination-signal-store.contract.md`
- Sprint review: `tasks/reviews/20260829-2137-c1-coordination-signal-store.review.md`
- Implementation notes: `tasks/notes/20260829-2137-c1-coordination-signal-store.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260829-2137-c1-coordination-signal-store.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260829-2137-c1-coordination-signal-store.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260829-2137-c1-coordination-signal-store.md`.

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
- Contract file: `tasks/contracts/20260829-2137-c1-coordination-signal-store.contract.md`
- Review file: `tasks/reviews/20260829-2137-c1-coordination-signal-store.review.md`
- Implementation notes file: `tasks/notes/20260829-2137-c1-coordination-signal-store.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260829-2137-c1-coordination-signal-store.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260829-2137-c1-coordination-signal-store.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revertable commit adding src/core/collaboration/, src/effects/collaboration/, four test files, the archcontext node pair, one architecture module doc, one workstream ledger and one policy flag; collaboration.mode=off leaves the code inert
- **Verification boundary**: Full bun suite, tsc --noEmit, task-sync, strict task workflow and architecture-sync all green; three actors publish concurrently; same id+payload idempotent and different payload conflicts; Task/Lease store bytes unchanged
- **Review/acceptance boundary**: `tasks/reviews/20260829-2137-c1-coordination-signal-store.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260829-2137-c1-coordination-signal-store.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260829-2137-c1-coordination-signal-store.contract.md`, `tasks/reviews/20260829-2137-c1-coordination-signal-store.review.md`, and `tasks/notes/20260829-2137-c1-coordination-signal-store.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260829-2137-c1-coordination-signal-store.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revertable commit adding src/core/collaboration/, src/effects/collaboration/, four test files, the archcontext node pair, one architecture module doc, one workstream ledger and one policy flag; collaboration.mode=off leaves the code inert

## Captured Planning Output

# Goal

Land sprint row C1 of
`plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`:
the `CoordinationSignalV1` protocol, the C1-exclusive shared mechanics in
`src/core/collaboration/common.ts`, and the append-only signal store under
`<git-common-dir>/repo-harness/collaboration/v1/signals/`. C1 also closes the
three items C0 explicitly handed forward: the closed `*_PROTOCOL` scan, the
capability registration (archcontext node, architecture module doc, workstream
ledger move), and the collaboration feature flag in `.ai/harness/policy.json`.

Every frozen decision is read from
`docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`
(D1-D12). C1 re-derives none of them.

## Context (P1 map / P2 trace, verified at main@74e8b652)

### P1 - components this row touches

New:

- `src/core/collaboration/common.ts` - C1-exclusive shared mechanics: the
  `CollaborationActorRefV1` discriminated union, `CollaborationScopeRefV1`,
  the artifact-ref alias, transport limits, deterministic record IDs, recorded
  time validation and the canonical digest helpers. C2-C9 consume, never edit.
- `src/core/collaboration/signal.ts` - `CoordinationSignalV1` exact-key
  validation and canonical digest.
- `src/effects/collaboration/feature-flag.ts` - reads
  `.ai/harness/policy.json#collaboration.mode` (D10) and fails closed.
- `src/effects/collaboration/signal-store.ts` - append-only store, per-thread
  lock, server-derived actor, retry-stable recorded time.

Reused without change:

- `src/core/messages/mechanics.ts` - exact-key, bounded-UTF-8, canonical JSON
  and digest mechanics (D9: no second serializer).
- `src/effects/locking/exclusive-directory-lock.ts` - the per-thread lock
  primitive named by D9.
- `src/effects/git/common-directory.ts` - store root resolution.
- `src/effects/engineers/principal.ts` `resolveEngineerPrincipal()` and
  `src/effects/engineers/principal-store.ts` `readEngineerPrincipalMapping()` -
  the only source of a `module_engineer` actor.

Changed with a stated reason:

- `src/core/engineers/delegation.ts` - extract the existing inline
  `WorkerResultV1.evidence_refs` validation into one exported function that
  `buildWorkerResult()` keeps calling. D8 requires `ArtifactRefV1` to be
  validated by *the same* validator; the alternative is a shadow parser. The
  wire shape, `DELEGATION_PROTOCOL`, `WORKER_RESULT_KIND` and every emitted byte
  are unchanged; this file appears in the C0 digest table, so the change is
  recorded here as required by the freeze record's Risks-to-re-check note.

Out of scope: any CLI or MCP surface (C7), thread/hotspot projection (C2),
handoff and adoption (C3), the admission bridge and contribution collector (C4).

### P2 - traced path: publish one signal

```text
publishCoordinationSignal({repo_root, authorization_id, idempotency_key, ...})
  -> assertCollaborationMutationEnabled(repo_root)
       reads .ai/harness/policy.json#collaboration.mode; "off" is a typed
       rejection, malformed or unknown value fails closed
  -> resolveCollaborationActor(repo_root, authorization_id)
       readEngineerPrincipalMapping() -> resolveEngineerPrincipal() fenced to
       that mapping -> CollaborationActorRefV1{kind:"module_engineer"}
       The input carries no actor field at all, so a caller cannot self-identify
  -> deriveCoordinationSignalId(repository_id, actor_sha256, identity_key)
  -> withExclusiveDirectoryLock(common, ".../collaboration/v1/locks/<thread>.lock")
       -> existing signals/<id>.json?
            yes -> rebuild the candidate with the *recorded* created_at and
                   compare canonical bytes: equal is idempotent, different is
                   an explicit conflict. The wall clock is never re-sampled.
            no  -> validate that reply_to/source/supersede refs already exist in
                   this store and carry this repository_id; supersede targets
                   must share the same actor lineage; sample the recorded time
                   exactly once; O_CREAT|O_EXCL|O_NOFOLLOW write + fsync + fsync
                   of the directory
  -> CoordinationSignalV1
```

The final side effect is one immutable file. No Task, Lease, Publication or
Acceptance store is opened for writing anywhere on this path.

### Pressure point

Recorded time is the one field a naive retry would move. Sampling the clock
before the existence check would make an idempotent retry look like a payload
conflict, so the store samples only on the branch that creates the file, and the
comparison branch always rebuilds from the persisted value.

## Frozen decisions consumed (not re-derived)

- D1 two-plane boundary; D8 `ArtifactRefV1` reuse; D9 store root, lock strategy
  and canonical JSON; D10 feature flags and degradation; D4 the P0 actor matrix
  (`module_engineer` and `delegated_worker` only, no placeholder branches).
- The C0 handoff: the closed scan, capability registration, and flag wiring are
  C1's, named in the freeze record's "Closed scan deferred to C1" paragraph and
  its Program Slice Ledger.

## Closed-scan design (C0 handoff item 1)

`tests/unit/collaboration-authority-baseline.test.ts` sweeps every
`src/core/**/*.ts` for a `^export const <NAME>_PROTOCOL` declaration and asserts
that the resulting module set equals `AUTHORITY_SOURCE_MODULES` united with an
explicit `DELIBERATELY_EXCLUDED` list, where every excluded row names the
inclusion clause it fails plus its evidence. The list is seeded with the ten
modules the freeze record already adjudicated by hand.

`src/core/collaboration/common.ts` is the first module the criterion classifies
without hindsight, and it is **excluded**: it fails C-1 because the
collaboration plane is not one of the five planes C0 froze, and it fails C-2
because signal bytes decide nothing for another agent about who owns work or
what has been published or accepted. `signal.ts` draws its protocol constant
from `common.ts`, so exactly one collaboration row enters the list.

## Scope

Allowed surfaces:

- `src/core/collaboration/common.ts`, `src/core/collaboration/signal.ts`
- `src/effects/collaboration/feature-flag.ts`,
  `src/effects/collaboration/signal-store.ts`
- `src/core/engineers/delegation.ts` - the single evidence-ref validator
  extraction described above, zero wire change
- `tests/unit/collaboration-common.test.ts`,
  `tests/unit/collaboration-signal.test.ts`,
  `tests/unit/collaboration-authority-baseline.test.ts`,
  `tests/effects/collaboration-signal-store.test.ts`
- `.archcontext/model/nodes/capability.runtime-harness.collaboration.yaml`,
  `.archcontext/model/nodes/component.collaboration.primary.yaml`
- `docs/architecture/modules/runtime-harness/collaboration.md`
- `tasks/workstreams/runtime-harness/collaboration/`
- `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md` -
  additive handoff closure only: record that the deferred scan landed, add the
  collaboration exclusion row, and replace the Program Slice Ledger body with a
  pointer to the capability workstream
- `.ai/harness/policy.json` - add `collaboration.mode = "off"`
- this plan and its contract, review and notes artifacts

Forbidden: the five program plan files; any CLI, MCP or Operator surface; any
Review, Verification or Merge file (D12); any handoff, adoption, thread,
hotspot, admission-bridge or contribution code; any write path into a Task,
Lease, Publication or Acceptance store; `AUTHORITY_INVENTORY` and
`FROZEN_INVENTORY_SHA256` in the baseline test.

## Oracles

- `bun test --timeout 60000`
- `node node_modules/typescript/bin/tsc --noEmit`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bash scripts/check-architecture-sync.sh`
- `bun test tests/unit/collaboration-common.test.ts tests/unit/collaboration-signal.test.ts tests/unit/collaboration-authority-baseline.test.ts tests/effects/collaboration-signal-store.test.ts --timeout 60000`
- `bun scripts/capability-resolver.ts validate --repo .`

## Task Breakdown

- [ ] Add `src/core/collaboration/common.ts` with the actor union, scope-ref union, artifact-ref alias, transport limits, deterministic record-ID derivation, recorded-time validation and canonical digest helpers built on `src/core/messages/mechanics.ts`.
- [ ] Export the existing `WorkerResultV1.evidence_refs` validator from `src/core/engineers/delegation.ts` and consume it from `common.ts` so D8's single-validator rule holds with no wire change.
- [ ] Add `src/core/collaboration/signal.ts` with `CoordinationSignalV1` exact-key validation, transport limits, canonical bytes and the deterministic signal-ID derivation.
- [ ] Add `src/effects/collaboration/feature-flag.ts` reading `.ai/harness/policy.json#collaboration.mode` with `off` refusing mutation and malformed or unknown values failing closed; wire `"collaboration": {"mode": "off"}` into `.ai/harness/policy.json`.
- [ ] Add `src/effects/collaboration/signal-store.ts`: server-derived actor from the authenticated principal, per-thread exclusive lock, lstat ancestor walk, immutable create plus fsync, retry-stable recorded time, same-id/same-payload idempotency and same-id/different-payload conflict, supersede restricted to the same actor lineage with an existing target, and source refs that must already exist in the same repository.
- [ ] Add `tests/unit/collaboration-common.test.ts` and `tests/unit/collaboration-signal.test.ts` covering canonical ordering, unknown-field rejection, stale digest rejection, every transport limit boundary, and both actor and scope-ref branches.
- [ ] Add `tests/effects/collaboration-signal-store.test.ts` covering three actors publishing concurrently in independent processes, same-id/same-payload idempotency, same-id/different-payload conflict, supersede target missing and cross-lineage, source ref missing and cross-repository, feature flag off, unreadable store failing loud, and byte-identical Task/Lease store digests before and after.
- [ ] Extend `tests/unit/collaboration-authority-baseline.test.ts` with the closed `src/core/**` `*_PROTOCOL` scan against `AUTHORITY_SOURCE_MODULES` united with an explicit `DELIBERATELY_EXCLUDED` list, plus an assertion that no Task, Lease, Publication or Acceptance module imports the collaboration modules.
- [ ] Register `capability.runtime-harness.collaboration` as an archcontext capability node with a primary component node, entrypoint and sink anchors that resolve, and existing source prefixes.
- [ ] Add `docs/architecture/modules/runtime-harness/collaboration.md` and create `tasks/workstreams/runtime-harness/collaboration/` through `repo-harness run workstream-sync ensure`, moving the C0 Program Slice Ledger into it and leaving a pointer in the freeze record.
- [ ] Run every oracle and record the outputs.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Add `src/core/collaboration/common.ts` with the actor union, scope-ref union, artifact-ref alias, transport limits, deterministic record-ID derivation, recorded-time validation and canonical digest helpers built on `src/core/messages/mechanics.ts`.
- [ ] Export the existing `WorkerResultV1.evidence_refs` validator from `src/core/engineers/delegation.ts` and consume it from `common.ts` so D8's single-validator rule holds with no wire change.
- [ ] Add `src/core/collaboration/signal.ts` with `CoordinationSignalV1` exact-key validation, transport limits, canonical bytes and the deterministic signal-ID derivation.
- [ ] Add `src/effects/collaboration/feature-flag.ts` reading `.ai/harness/policy.json#collaboration.mode` with `off` refusing mutation and malformed or unknown values failing closed; wire `"collaboration": {"mode": "off"}` into `.ai/harness/policy.json`.
- [ ] Add `src/effects/collaboration/signal-store.ts`: server-derived actor from the authenticated principal, per-thread exclusive lock, lstat ancestor walk, immutable create plus fsync, retry-stable recorded time, same-id/same-payload idempotency and same-id/different-payload conflict, supersede restricted to the same actor lineage with an existing target, and source refs that must already exist in the same repository.
- [ ] Add `tests/unit/collaboration-common.test.ts` and `tests/unit/collaboration-signal.test.ts` covering canonical ordering, unknown-field rejection, stale digest rejection, every transport limit boundary, and both actor and scope-ref branches.
- [ ] Add `tests/effects/collaboration-signal-store.test.ts` covering three actors publishing concurrently in independent processes, same-id/same-payload idempotency, same-id/different-payload conflict, supersede target missing and cross-lineage, source ref missing and cross-repository, feature flag off, unreadable store failing loud, and byte-identical Task/Lease store digests before and after.
- [ ] Extend `tests/unit/collaboration-authority-baseline.test.ts` with the closed `src/core/**` `*_PROTOCOL` scan against `AUTHORITY_SOURCE_MODULES` united with an explicit `DELIBERATELY_EXCLUDED` list, plus an assertion that no Task, Lease, Publication or Acceptance module imports the collaboration modules.
- [ ] Register `capability.runtime-harness.collaboration` as an archcontext capability node with a primary component node, entrypoint and sink anchors that resolve, and existing source prefixes.
- [ ] Add `docs/architecture/modules/runtime-harness/collaboration.md` and create `tasks/workstreams/runtime-harness/collaboration/` through `repo-harness run workstream-sync ensure`, moving the C0 Program Slice Ledger into it and leaving a pointer in the freeze record.
- [ ] Run every oracle and record the outputs.
