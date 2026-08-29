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

- None.

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
