> **Archived**: 2026-08-24 23:41
> **Related Plan**: plans/archive/plan-20260824-2126-me0a-engineer-profile-binding.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260824-2341

# Implementation Notes: me0a-engineer-profile-binding

> **Status**: Active
> **Plan**: plans/plan-20260824-2126-me0a-engineer-profile-binding.md
> **Contract**: tasks/contracts/20260824-2126-me0a-engineer-profile-binding.contract.md
> **Review**: tasks/reviews/20260824-2126-me0a-engineer-profile-binding.review.md
> **Last Updated**: 2026-08-24 23:39
> **Lifecycle**: notes

## Design Decisions

- The dedicated capability requires explicit ArchContext relation and flow records in addition to the planned capability/component nodes. The projection compiler otherwise reports `semantic-edge-missing` and `flow-missing`; these records describe the already-planned `buildEngineerCommand` to `bindEngineer` boundary and add no product authority.
- The formal accepted-change reference is bound to the Approved work-package (`changeset.plan-20260824-2126-me0a-engineer-profile-binding`) and archived external ME-0A approval (`event.review-20260824-2050-persistent-module-engineer-me0a-approval`).
- “Tracked” is enforced by one batched `git ls-files -z` index read, not by filesystem presence. Capability revision hashes the complete schema-valid selected ArchContext node after the canonical registry parser proves the capability identity; this keeps Git and ArchContext as the only authorities without a shadow parser.
- The idempotency fingerprint contains client-authored request fields and expected fences but excludes the server-derived target contract revision. An existing event therefore freezes its original revision and can complete a crash window after Profile evolution; bootstrap remains fail-closed until a new-key replace/retire aligns current with the new Profile revision.
- A `replace` event is the retirement fact for `previous_binding_id` at `created_at` and publication fact for the next binding. Historical event bindings remain immutable state-at-event snapshots, so no second retired snapshot is added to the wire schema.
- Engineer locking opts into recovery of an empty lock directory older than the shared 30-second stale boundary. Reclamation revalidates ancestor and directory inode, emptiness, then uses `rmdir` as the fence; a paused creator must still win the ordinary single-token ownership check before it can run. The shared primitive defaults to preserving ownerless locks for every other caller.
- The new capability raises the deterministic self-host projection from 11 to 12 capability/component/relation/flow records and from 17 to 18 projection targets; the two existing count guards now assert the new canonical totals.
- Change Assessment binds the four novel source modules to the focused deterministic suite and the exercised operator CLI readback. These are review-selection declarations over existing evidence, not new runtime authorities.
- Reprojecting on the landed PRD baseline crosses the existing `workflow-engine/contract-assets` source-set scale bucket from `20k–50k` to `50k–100k`, because that capability already owns `.archcontext/model/nodes/**`. Its generated architecture module is therefore an explicit Allowed Path; no contract-assets runtime behavior changed.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Implicit component parent only | Reject | ArchContext requires an explicit relation and ArchitectureFlowV1 for proven P1/P2 output. |
| Explicit relation + flow | Use | It makes the existing runtime path machine-verifiable without changing its behavior. |
| Hash only the registry projection | Reject | It would omit schema-owned capability fields such as summary, responsibilities and entrypoints from contract revision. |
| Include derived target revision in the operation fingerprint | Reject | A crash after event durability would become unrecoverable when the Profile evolves before retry. |
| Reclaim every empty shared lock | Reject | Other callers may require operator-only recovery; ME-0A opts in explicitly and proves its paused-creator semantics. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Full repository suite: `3009 pass`, `2 skip`, `0 fail` across 236 files; the two skips are Windows-only fixtures.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
