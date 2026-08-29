# Plan: C2 signal threads, discovery and hotspot projection

> **Status**: Executing
> **Created**: 20260830-0121
> **Slug**: c2-thread-hotspot-projection
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#3
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Full bun suite, tsc --noEmit, task-sync, strict task workflow and architecture-sync all green; same source bytes produce byte-identical thread, opportunity and packet projections twice; quota allocation, truncation evidence, epoch-relative recency, closed reason codes and the 1,500 estimated-token budget all proven by test
> **Rollback Surface**: Single revertable commit adding three pure src/core/collaboration modules, three unit test files, archcontext node entrypoints and the re-rendered architecture projection; nothing imports the new modules yet, so reverting removes a pure read model with no consumer
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260830-0121-c2-thread-hotspot-projection.contract.md`
> **Task Review**: `tasks/reviews/20260830-0121-c2-thread-hotspot-projection.review.md`
> **Implementation Notes**: `tasks/notes/20260830-0121-c2-thread-hotspot-projection.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#3
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260830-0121-c2-thread-hotspot-projection.md`
- Sprint contract: `tasks/contracts/20260830-0121-c2-thread-hotspot-projection.contract.md`
- Sprint review: `tasks/reviews/20260830-0121-c2-thread-hotspot-projection.review.md`
- Implementation notes: `tasks/notes/20260830-0121-c2-thread-hotspot-projection.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260830-0121-c2-thread-hotspot-projection.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260830-0121-c2-thread-hotspot-projection.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260830-0121-c2-thread-hotspot-projection.md`.

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
- Contract file: `tasks/contracts/20260830-0121-c2-thread-hotspot-projection.contract.md`
- Review file: `tasks/reviews/20260830-0121-c2-thread-hotspot-projection.review.md`
- Implementation notes file: `tasks/notes/20260830-0121-c2-thread-hotspot-projection.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260830-0121-c2-thread-hotspot-projection.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260830-0121-c2-thread-hotspot-projection.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revertable commit adding three pure src/core/collaboration modules, three unit test files, archcontext node entrypoints and the re-rendered architecture projection; nothing imports the new modules yet, so reverting removes a pure read model with no consumer
- **Verification boundary**: Full bun suite, tsc --noEmit, task-sync, strict task workflow and architecture-sync all green; same source bytes produce byte-identical thread, opportunity and packet projections twice; quota allocation, truncation evidence, epoch-relative recency, closed reason codes and the 1,500 estimated-token budget all proven by test
- **Review/acceptance boundary**: `tasks/reviews/20260830-0121-c2-thread-hotspot-projection.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260830-0121-c2-thread-hotspot-projection.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260830-0121-c2-thread-hotspot-projection.contract.md`, `tasks/reviews/20260830-0121-c2-thread-hotspot-projection.review.md`, and `tasks/notes/20260830-0121-c2-thread-hotspot-projection.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260830-0121-c2-thread-hotspot-projection.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revertable commit adding three pure src/core/collaboration modules, three unit test files, archcontext node entrypoints and the re-rendered architecture projection; nothing imports the new modules yet, so reverting removes a pure read model with no consumer

## Captured Planning Output

# Goal

Land sprint row C2 (INDEX 3) of
`plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`:
the deterministic read-model layer over the C1 signal store — thread aggregation
from opaque `thread_key`, deterministic hotspot scoring, structural contribution
opportunities over a closed reason set, `RelevantSignalV1` retrieval with a
deterministic exploitation/exploration quota, and the
`CollaborationContextPacketV1` builder with deterministic truncation inside a
1,500 estimated-token budget.

C2 adds no authority. Everything is a pure function of committed signal bytes
plus injected structural facts. `src/core/collaboration/common.ts` and
`src/core/collaboration/signal.ts` are C1-frozen and are consumed unchanged.

## Context (P1 map / P2 trace, verified at main@461107cb)

### P1 - components this row touches

New (all pure, all under `src/core/collaboration/`):

- `thread-projection.ts` - aggregate committed signals by exact `thread_key`
  into `CollaborationThreadSnapshotV1`, derive the deterministic epoch from the
  source set, and project `ContributionOpportunityV1` over the closed structural
  reason set.
- `hotspot.ts` - the deterministic integer hotspot function and its bounded
  inputs, separated from aggregation so the score can be re-weighted without
  touching the aggregation contract.
- `context-packet.ts` - `RelevantSignalV1` classification over the closed
  retrieval-reason set, the exploitation/exploration quota, the frozen
  `utf8_bytes_div_4` token estimator, deterministic truncation, the
  `[CoordinationContextUntrusted]` rendering and `CollaborationContextPacketV1`.

Consumed unchanged:

- `src/core/collaboration/common.ts` (C1-frozen) - `CollaborationScopeRefV1`,
  `CollaborationArtifactRefV1`, `canonicalCollaborationBytes`,
  `canonicalCollaborationDigest`, `collaborationSha256`, `CollaborationError`,
  `collaborationInvalid`, `collaborationActorLineage`.
- `src/core/collaboration/signal.ts` (C1-frozen) - `CoordinationSignalV1` and
  `validateCoordinationSignal`.
- `src/core/messages/mechanics.ts` - exact-key and canonical JSON mechanics.
- `src/core/fleet/task-message.ts` / `src/core/engineers/module-message.ts` -
  read only as the frozen untrusted-marker shape precedent; not imported.
- `scripts/session-context-packet-panel.ts` `estimatedTokens()` and
  `SESSION_START_CONTEXT_TOKEN_SLO = 1500` in
  `scripts/hook-dispatch-diet-report.ts` - the frozen estimator formula and the
  1,500-token precedent this budget cites; not imported (a `scripts/` import
  from `src/core/` would invert the dependency direction), mirrored with the
  precedent named in the source.

Out of scope: any CLI, MCP or Operator surface (C7/C8); handoff, adoption or
receipt code (C3); the exchange snapshot assembly (C6); the admission bridge and
contribution collector (C4); any store, any write path, any cache file.

### P2 - traced path: build one context packet

```text
buildCollaborationContextPacket({repository_id, signals, subject_refs,
                                 handoff_facts, handoff, budget})
  -> projectCollaborationThreads(signals, handoff_facts)
       group by exact thread_key equality (no similarity, no merge)
       epoch = max(Date.parse(created_at)) over the source signal set
       per thread: signal_count, distinct_contributor_count (by actor lineage),
                   latest_signal_at, artifact_ref_count,
                   cross_thread_reference_count (resolvable edges only),
                   unadopted_handoff_count / adoption_count (injected facts),
                   hotspot_score = collaborationHotspotScore(inputs)
                   thread_sha256 = canonical digest of the snapshot minus itself
  -> sourceSnapshotDigest(signals)  // ordered (signal_id, signal_sha256) pairs
  -> classify every signal to exactly one closed retrieval reason, highest
     specificity first: same_task > same_work_package > same_capability >
     same_path > same_thread > source_reference > handoff > hotspot >
     exploration_slot
  -> split the budget 60/40 into an exploitation pool and an exploration pool;
     fill each pool independently, round 1 taking at most one signal per thread,
     round 2 taking the rest by the total order; neither pool spills into the
     other
  -> render the selected signals inside [CoordinationContextUntrusted]
  -> rendered_context_sha256, truncated, omitted_signal_count, packet_sha256
```

The final output is one frozen value. No filesystem access, no clock read, no
network, no store.

### Pressure point

The clock. `recent_activity`, the hotspot recency term and any age comparison
all want "now". Reading the wall clock would make the same store bytes produce a
different packet on every rebuild and would put a moving value inside
`packet_sha256`. The epoch is therefore the maximum `created_at` in the source
signal set itself, and every recency term is an integer bucket of
`epoch_ms - latest_signal_ms`. `built_at` is not a field of the packet at all,
so there is no wall-clock input to omit from the digest — there is none to
begin with.

## Frozen decisions consumed (not re-derived)

- C1's `common.ts` and `signal.ts` are frozen; this row reads them and edits
  neither. If a change to `common.ts` looked necessary, this row stops.
- Child PRD A: no central lane enum; hotspots affect only ordering, selection
  and recommended exploration, never Work Graph priority, dependency, Task state
  or Lease eligibility; `open_request`, `unverified_hypothesis` and
  `stalled_thread` are removed from machine semantics; `built_at` is not in the
  content digest; P0 keeps no thread cache.
- The frozen `utf8_bytes_div_4` estimator formula and the 1,500 estimated-token
  budget precedent.
- The `[TaskInboxUntrustedPeerMessages]` / `[ModuleInboxUntrustedPeerMessage]`
  marker-plus-fixed-warning shape; `[CoordinationContextUntrusted]` is the third
  instance of it, not a new prompt-trust model.

## Protocol adjudication

None of the three new modules exports a `*_PROTOCOL` constant. They import
`COLLABORATION_PROTOCOL` from the frozen `common.ts`, exactly as `signal.ts`
already does, so the closed `src/core/**` scan in
`tests/unit/collaboration-authority-baseline.test.ts` sees no new
protocol-owning module and neither `AUTHORITY_SOURCE_MODULES` nor
`DELIBERATELY_EXCLUDED` nor `FROZEN_INVENTORY_SHA256` nor the freeze record
needs to move. This is the honest classification and not an evasion: were these
modules to own a protocol constant they would be excluded anyway, failing C-1
because a derived read model sits on no delivery plane and failing C-2 because a
thread snapshot, a hotspot score and a context packet decide nothing for another
agent about who owns work or what has been published or accepted — the packet is
rendered to its reader inside an untrusted wrapper. The scan is run as an oracle
to prove the scan stays closed.

## C3 seam

C2 needs unadopted-handoff and adoption counts that C3 owns. The consumer
declares the interface and C3 constructs it:

```ts
export interface CollaborationHandoffFactV1 {
  readonly thread_key: string;
  readonly handoff_id: string;
  readonly adoption_count: number;
}
```

`projectCollaborationThreads()` and `buildCollaborationContextPacket()` take
`readonly CollaborationHandoffFactV1[]`, defaulting to the empty collection, and
every C2 test drives it with injected facts. C3 wires real handoff and adoption
records into that collection without changing a line of C2. C2 imports nothing
from C3 and touches no handoff, adoption or receipt file.

## Scope

Allowed surfaces:

- `src/core/collaboration/thread-projection.ts`
- `src/core/collaboration/hotspot.ts`
- `src/core/collaboration/context-packet.ts`
- `tests/unit/collaboration-thread-projection.test.ts`
- `tests/unit/collaboration-hotspot.test.ts`
- `tests/unit/collaboration-context-packet.test.ts`
- `.archcontext/model/nodes/capability.runtime-harness.collaboration.yaml` -
  entrypoint and verification additions for the new modules only
- `docs/architecture/modules/runtime-harness/collaboration.md` and
  `docs/architecture/.projection-manifest.json` - the re-rendered projection when
  the added lines or files cross a capability size bucket
- `tasks/workstreams/runtime-harness/collaboration/` - durable progress
- this plan and its contract, review and notes artifacts

Forbidden: `src/core/collaboration/common.ts` and
`src/core/collaboration/signal.ts` (C1-frozen); any handoff, adoption, receipt,
admission-bridge, contribution or exchange file (C3/C4/C6); any CLI, MCP or
Operator surface; any `src/effects/**` file; the five program plan and PRD files;
`AUTHORITY_INVENTORY`, `DELIBERATELY_EXCLUDED` and `FROZEN_INVENTORY_SHA256` in
the baseline test; any write path into a Task, Lease, Publication or Acceptance
store; any cache file under the collaboration store root.

## Oracles

- `bun test --timeout 60000`
- `node node_modules/typescript/bin/tsc --noEmit`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bash scripts/check-architecture-sync.sh`
- `bun test tests/unit/collaboration-thread-projection.test.ts tests/unit/collaboration-hotspot.test.ts tests/unit/collaboration-context-packet.test.ts tests/unit/collaboration-authority-baseline.test.ts --timeout 60000`
- `bun scripts/capability-resolver.ts validate --repo .`

## Task Breakdown

- [x] Add `src/core/collaboration/hotspot.ts`: a bounded integer input record, fixed integer weights, capped per-dimension contributions and a recency bucket computed from `epoch_ms - latest_signal_ms`, so the score is a total integer function with no float and no clock.
- [x] Add `src/core/collaboration/thread-projection.ts`: aggregation on exact `thread_key` equality, the deterministic epoch as the maximum `created_at` in the source set, `CollaborationThreadSnapshotV1` with `thread_sha256`, cross-thread reference counting over resolvable edges only, the injected `CollaborationHandoffFactV1` seam, and the closed `ContributionOpportunityReason` projection covering exactly `unadopted_handoff`, `low_contributor_coverage`, `cross_thread_reference`, `recent_activity`, `artifact_rich_thread` and `exploration_slot`.
- [x] Add `src/core/collaboration/context-packet.ts`: the closed `RelevantSignalV1` reason set with `matched_refs`, the deterministic total order used for selection, the 60/40 exploitation/exploration quota with no spill between pools, the mirrored `utf8_bytes_div_4` estimator with `estimator_version`, deterministic truncation writing `truncated` and `omitted_signal_count`, the `[CoordinationContextUntrusted]` rendering with a fixed warning, `rendered_context_sha256`, `source_snapshot_sha256` and `packet_sha256` with no `built_at` field anywhere.
- [x] Add `tests/unit/collaboration-hotspot.test.ts` covering integer-only output, per-dimension caps, epoch-relative recency buckets, monotonicity per dimension and the absence of any clock read.
- [x] Add `tests/unit/collaboration-thread-projection.test.ts` covering byte-identical output for the same input twice, aggregation of identical opaque keys with no merging of similar keys, distinct contributor counting by actor lineage, cross-thread edge counting, the injected handoff seam with an empty collection, closed opportunity reasons with the three removed reasons absent, and epoch-relative recency independent of the wall clock.
- [x] Add `tests/unit/collaboration-context-packet.test.ts` covering byte-identical packets for the same input twice, the closed retrieval reason set with `matched_refs`, quota allocation proving the hottest thread cannot take the whole budget, truncation evidence, the 1,500-token budget being respected by the rendered text, no `built_at` field in the packet or its digest preimage, and the untrusted markers.
- [ ] Update the archcontext capability node with entrypoints and sinks for the three new modules and the new verification command, then re-render the architecture projection and commit the re-rendered module doc together with the projection manifest and this row's source commit if a size bucket moved.
- [x] Record durable progress in `tasks/workstreams/runtime-harness/collaboration/` and run every oracle, recording the outputs.

## Annotations

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add `src/core/collaboration/hotspot.ts`: a bounded integer input record, fixed integer weights, capped per-dimension contributions and a recency bucket computed from `epoch_ms - latest_signal_ms`, so the score is a total integer function with no float and no clock.
- [x] Add `src/core/collaboration/thread-projection.ts`: aggregation on exact `thread_key` equality, the deterministic epoch as the maximum `created_at` in the source set, `CollaborationThreadSnapshotV1` with `thread_sha256`, cross-thread reference counting over resolvable edges only, the injected `CollaborationHandoffFactV1` seam, and the closed `ContributionOpportunityReason` projection covering exactly `unadopted_handoff`, `low_contributor_coverage`, `cross_thread_reference`, `recent_activity`, `artifact_rich_thread` and `exploration_slot`.
- [x] Add `src/core/collaboration/context-packet.ts`: the closed `RelevantSignalV1` reason set with `matched_refs`, the deterministic total order used for selection, the 60/40 exploitation/exploration quota with no spill between pools, the mirrored `utf8_bytes_div_4` estimator with `estimator_version`, deterministic truncation writing `truncated` and `omitted_signal_count`, the `[CoordinationContextUntrusted]` rendering with a fixed warning, `rendered_context_sha256`, `source_snapshot_sha256` and `packet_sha256` with no `built_at` field anywhere.
- [x] Add `tests/unit/collaboration-hotspot.test.ts` covering integer-only output, per-dimension caps, epoch-relative recency buckets, monotonicity per dimension and the absence of any clock read.
- [x] Add `tests/unit/collaboration-thread-projection.test.ts` covering byte-identical output for the same input twice, aggregation of identical opaque keys with no merging of similar keys, distinct contributor counting by actor lineage, cross-thread edge counting, the injected handoff seam with an empty collection, closed opportunity reasons with the three removed reasons absent, and epoch-relative recency independent of the wall clock.
- [x] Add `tests/unit/collaboration-context-packet.test.ts` covering byte-identical packets for the same input twice, the closed retrieval reason set with `matched_refs`, quota allocation proving the hottest thread cannot take the whole budget, truncation evidence, the 1,500-token budget being respected by the rendered text, no `built_at` field in the packet or its digest preimage, and the untrusted markers.
- [ ] Update the archcontext capability node with entrypoints and sinks for the three new modules and the new verification command, then re-render the architecture projection and commit the re-rendered module doc together with the projection manifest and this row's source commit if a size bucket moved.
- [x] Record durable progress in `tasks/workstreams/runtime-harness/collaboration/` and run every oracle, recording the outputs.
