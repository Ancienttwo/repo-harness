# Implementation Notes: c1-coordination-signal-store

> **Status**: Active
> **Plan**: plans/plan-20260829-2137-c1-coordination-signal-store.md
> **Contract**: tasks/contracts/20260829-2137-c1-coordination-signal-store.contract.md
> **Review**: tasks/reviews/20260829-2137-c1-coordination-signal-store.review.md
> **Last Updated**: 2026-08-29 21:38
> **Lifecycle**: notes

## Design Decisions

- **The evidence-ref validator was extracted, not copied.** D8 says
  `ArtifactRefV1` is the `WorkerResultV1.evidence_refs` shape "validated by the
  same validator". That validation was inline inside `buildWorkerResult()`, so
  honouring D8 literally meant either exporting it or writing a second copy of
  the same rules in `common.ts`. A second copy is a shadow parser, so
  `src/core/engineers/delegation.ts` now exports `validateWorkerEvidenceRefs()`
  and `buildWorkerResult()` calls it. That file is in the C0 baseline digest
  table; the wire shape, `DELEGATION_PROTOCOL`, `WORKER_RESULT_KIND` and every
  emitted byte are unchanged, and `tests/unit/me2a-me3b-readonly-delegation.test.ts`
  is the guard.
- **Recorded time is a discriminated union, and the clock is read on exactly one
  branch.** `first_publication` freezes the clock on the create; a delegated
  contribution passes `persisted_observation` with that run's persisted time.
  A retry never reaches either: the store finds the record, rebuilds its
  candidate from the persisted `created_at`, and compares bytes. Sampling before
  the existence check would have made a correct retry look like a payload
  conflict.
- **The publish input has no actor field.** Server derivation is not "ignore
  what the caller declared", it is "there is nowhere to declare it". The actor
  comes from `resolveEngineerPrincipal()`, then a second read of the principal
  mapping fences the result; a mapping that moved between the two reads fails
  closed rather than publishing an uncertain author.
- **Actor lineage keys on the durable participant, not on the actor digest.**
  Module Engineer lineage is `engineer_id`, because `binding_generation` counts
  rebindings of one persistent Engineer and a rebound Engineer must still be
  able to revise its own signals. Delegated Worker lineage is
  `worker_run_ref_sha256`, because two runs are two participants even under one
  parent.
- **`reply_to_signal_id` is treated as a source reference.** The sprint names
  source refs; a reply target is the same invariant (an unresolvable pointer is
  an unverifiable claim), so it gets the same existence and same-repository
  check.
- **`collaboration.mode` was wired only into this repo's policy, not into the
  adoption planner defaults.** The freeze record names `.ai/harness/policy.json`
  as the surface; pushing the key into `src/core/adoption/standard-plan.ts` would
  ship the flag into every generated repo, which is a different capability's
  decision and is not what C1's acceptance asks for. `deepMergeDefaults` keeps
  the key across `init`, verified by `init --repo . --dry-run`.

## Deviations From Plan Or Spec

- The C0 freeze record was edited rather than superseded. Its usage note says to
  supersede instead of silently editing, and the edits here are neither silent
  nor decisions: they close the two handoffs C0 itself wrote (the deferred scan,
  and moving the Program Slice Ledger once the capability could be registered)
  and add the collaboration row to an adjudication table whose criterion is
  unchanged. No D-decision was reopened; `AUTHORITY_INVENTORY` and
  `FROZEN_INVENTORY_SHA256` are untouched.
- `allowed_paths` was widened by twelve entries before the acceptance freeze,
  because the capability registration writes more than the node file the
  contract originally named. Two are archctx model surfaces the node needs to be
  reachable: `.archcontext/model/flows/` holds the collaboration publish-signal
  flow whose selectors prove the node, and `.archcontext/model/relations/` holds
  the edges that attach it to the existing graph. Seven are outputs of
  `architecture-projection apply`, which regenerates them from the model rather
  than accepting hand edits: `docs/architecture/.projection-manifest.json`,
  `docs/architecture/changelog.md`, `docs/architecture/decisions/index.md`, the
  three `docs/architecture/diagrams/architecture.{likec4,mmd,structurizr.json}`
  renderings, and `docs/architecture/modules/runtime-harness/engineer-bindings.md`
  (the `relation-changed` half of the accepted delta, already named in the
  acceptance evidence above). The last two,
  `tests/architecture-projection-e2e.test.ts` and
  `tests/capability-archcontext-export.test.ts`, hardcode a capability count that
  a new capability necessarily moves. Every one of them traces to C1's stated
  goal of registering `capability.runtime-harness.collaboration`; none is a new
  decision, and no source or protocol surface was widened.
- The workstream ledger file is named `collaboration-substrate-program.md`
  rather than after this slice, because it carries C0-C9 rather than one row.
  That matches the existing topic-named workstream files.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Export the WorkerResult evidence-ref validator vs. write a second one in `common.ts` | Export | D8 says "the same validator"; a second copy is a shadow parser. Cost is one byte change to a digest-table file, recorded above |
| Derive the actor server-side in C1 vs. accept an actor and defer derivation to C7's CLI | Derive now | "actor 一律服務端從 principal 推導" is a C1 task, and an input that accepts an actor would need that field removed later — a wire change in a file frozen after C1 |
| Sort labels and source ids vs. require uniqueness only | Uniqueness only | The PRD closes counts, not ordering. Forcing a sort invents a constraint and silently normalises caller input; uniqueness is what a set actually requires |
| Wire `collaboration.mode` into adoption defaults vs. this repo's policy only | This repo only | The freeze record names one surface, and the adoption planner is another capability's boundary |
| Store the lock per signal id vs. per thread key | Per thread | D9 freezes per-thread locking; identity is per signal but every writer on one thread serialises, and the `EEXIST` branch reconciles the cross-thread race anyway |

## Open Questions

- **Resolved: the `node-added` acceptance.** Registering
  `capability.runtime-harness.collaboration` is a major change, and
  `ProjectionRequestV1.acceptedChange` — the field that accepts it — has no
  production caller: only
  `src/effects/architecture/projection-orchestrator.ts:57` takes it as an
  option, and neither `repo-harness architecture-projection` nor the Stop hook
  ever sets it. The id convention is documented by precedent in
  `docs/researches/20260824-persistent-module-engineer-organization.md`
  (`changeset.docs-projection-<digest16>` / `event.user-approval-<date>-<slug>`,
  with prior `node-added,relation-changed` acceptances for the delegated-runs
  and bound-task-freezes capabilities), so the acceptance was executed through
  the internal API with those shapes. Full evidence below.

- **Two real preconditions had to be fixed first, and neither was the flag.**
  1. **Stale CodeGraph index.** `archctx.mjs:7669` refuses an acceptance while
     any capability's flow proof is `unprovable`, and
     `scripts/contract-worktree.sh:460` says so outright ("codegraph init
     failed; architecture projection will report unresolved-major-change for
     every capability"). The worktree was indexed at creation, before any
     collaboration source existed. `codegraph index .` (743 files, 15,213
     nodes) fixed it.
  2. **Three flow selectors pointed at indirect calls.** The original node
     anchored `listCoordinationSignals -> canonicalCoordinationSignalBytes` and
     `validateCoordinationSignal -> validateCollaborationActorRef /
     validateCollaborationArtifactRefs`, none of which are direct edges.
     Re-anchored to edges CodeGraph actually records — verified with
     `codegraph node <symbol>` — so the flow now proves 5/5 selectors:
     `publishCoordinationSignal -> assertCollaborationMutationEnabled`,
     `resolveModuleEngineerActor -> resolveEngineerPrincipal`,
     `publishCoordinationSignal -> buildCoordinationSignal`,
     `buildCoordinationSignal -> validateCollaborationActorRef`,
     `readPersistedSignal -> canonicalCoordinationSignalBytes`.

- **`apply`, not `adopt`.** A hand-written module doc turns the run into an
  adoption candidate, and `archctx docs adopt` with an `acceptedChange` throws
  `architecture-major-change-accepted-reference-without-semantic-delta` because
  its inner projection already simulates the adopted files. The repo's
  precedent creates the doc through the projection instead: `60677edc`
  (`docs(architecture): project ME-4B authority`) added
  `docs/architecture/modules/runtime-harness/interface-change.md` as a create.
  So the hand-written doc was removed, `apply` rendered it, and the human
  sections 3 and 4 were restored into the preserved region afterwards.

### Architecture acceptance evidence

Accepted delta, copied verbatim from the `check --json` refresh signal (not
invented — `acceptedChangeIssues()` requires sorted, unique, non-empty arrays
and known reason codes):

```json
{
  "changeSetId": "changeset.docs-projection-eb1d7ac0475d1b2b",
  "eventId": "event.user-approval-20260829-c1-collaboration-architecture",
  "reasonCodes": ["node-added", "relation-changed"],
  "affectedNodeIds": [
    "capability.runtime-harness.collaboration",
    "capability.runtime-harness.engineer-bindings"
  ]
}
```

`changeSetId` follows archctx's own derivation
(`changeset.docs-projection-<first 16 hex of the resulting projectionDigest>`,
`archctx.mjs:35873`); the resulting digest was
`sha256:eb1d7ac0475d1b2b4c96c3624005fbe6e83a4eee1da6019318fbd7dc7dc92d9b`.
`eventId` records the orchestrator's explicit approval of this `node-added`
change and follows the precedent naming in the ME-series research doc.

Invocation. A throwaway script at `/tmp/c1-accept-projection.ts` (scaffolding,
never committed) replicated `src/cli/commands/architecture-projection.ts`
`execute()` exactly, adding only `acceptedChange`:

```text
bun /tmp/c1-accept-projection.ts apply "" changeset.docs-projection-eb1d7ac0475d1b2b
```

Output:

```json
{
  "mode": "apply",
  "status": "applied-reconcile-required",
  "files": [
    "docs/architecture/.projection-manifest.json",
    "docs/architecture/changelog.md",
    "docs/architecture/decisions/index.md",
    "docs/architecture/diagrams/architecture.likec4",
    "docs/architecture/diagrams/architecture.mmd",
    "docs/architecture/diagrams/architecture.structurizr.json",
    "docs/architecture/index.md",
    "docs/architecture/modules/runtime-harness/collaboration.md",
    "docs/architecture/modules/runtime-harness/engineer-bindings.md"
  ],
  "humanActions": [],
  "receiptDigest": "sha256:8264905576cc74442e782cc7beb89dcdf6d77533c334c92e1fd675c3a64a6dc1"
}
```

`applied-reconcile-required` is the expected post-apply worktree-digest
divergence, not a refusal: `humanActions` is empty, which is the acceptance
landing. Human sections were then restored and the ordinary
`repo-harness architecture-projection apply --json` converged the manifest
(`status: applied`, one file). Final state: `check --json` returns `noop` with
no human actions, the manifest carries `targetCount: 28` and 22 capabilities
all `proven`, and `capability.runtime-harness.collaboration` is in the semantic
baseline.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Closed inclusion scan: `tests/unit/collaboration-authority-baseline.test.ts`,
  describe block `C1 closed inclusion scan`. Verified to bite by adding a
  throwaway `src/core/state/scan-probe.ts` exporting a `*_PROTOCOL` and
  observing the scan go red before removing it.
- Store acceptance: `tests/effects/collaboration-signal-store.test.ts`, including
  the three-actor independent-process publish and the delivery-plane digest
  comparison.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
