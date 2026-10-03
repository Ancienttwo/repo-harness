# Implementation Notes: projection-late-write-receipt

> **Status**: Active
> **Plan**: plans/plan-20260909-2248-projection-late-write-receipt.md
> **Contract**: tasks/contracts/20260909-2248-projection-late-write-receipt.contract.md
> **Review**: tasks/reviews/20260909-2248-projection-late-write-receipt.review.md
> **Last Updated**: 2026-09-09 22:48
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:bf11b2d73857bd90c3b57eb25a7627799b07ae2daf2e4d0a14120593366e8a10`

## Design Decisions

- Receipt representation: `result` stays the provider's verbatim answer and the receipt
  gains a derived `declaredWrites`. Merging prior committed applies into `result.files`
  would forge the provider's answer and break `assertProjectionResult(receipt.result)` in
  `restamp-publication.ts`, which re-validates `receiptDigest` over that exact body.
- `projectionDeclaredWrites` in `src/core/architecture/projection.ts` is the only mapping
  from the provider shape to what consumers gate on, so an upstream shape change has one
  consumer edit.
- `unchanged` files are excluded from declared writes: the result contract makes their
  preimage and output digests equal, so they are not writes. This matches what the
  materialization reader already filtered for.
- Ordering: a path claimed by this attempt's own result wins over any earlier apply, and
  among earlier applies the newest `committedAt` wins, because the latest statement about
  a path describes the current state. Output is sorted by path so the projection is
  deterministic regardless of the provider's array order.
- The decoder mirrors the landed upstream contract (arch-context PR #151, head a411517:
  `packages/contracts/src/projection.ts` and `schemas/runtime/projection-result.schema.json`)
  exactly rather than approximating it: `applyId`/`lookupKey` are optional and
  both-or-neither, uniqueness and canonical wire order are keyed by `changeSetId`, files
  are sorted and unique by path, the field is omitted rather than `[]`, `committedAt`
  allows at most millisecond precision, and `hash` is a SHA-256 body digest except for a
  delete, which carries the literal `missing`.
- Provenance on a declared write is `changeSetId` plus `committedAt`, with `applyId`
  carried through only when present. A plain drift-repair apply -- the incident shape --
  commits without a `ProjectionApplyIdentityV1`, so `applyId` cannot be the identity a
  consumer keys on, and half an identity is rejected rather than filled in.
- `src/effects/refactor/materialization.ts` fails closed rather than consulting declared
  writes: prior committed applies carry `hash`, not the `outputDigest` that transaction
  verifies bytes against, so it cannot faithfully reproduce them.

## Deferred: capability feature handshake

The upstream capabilities flag `projection-prior-committed-applies-v1` is deliberately not
added to `ARCHCTX_REQUIRED_FEATURES`, and the archctx pin stays at 0.5.8. The field is
optional and absent under 0.5.8, so the receipt correctly declares nothing there (covered
by the guard's third case). Add the required-feature entry and raise the pin in the same
slice that pins the upstream version; requiring the feature before that version exists
would fail every projection closed. The deferred goal is recorded in `tasks/todos.md`
with its tradeoff and revisit trigger.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Merge prior applies into `result.files` | Rejected | Forges the provider's verbatim answer and breaks the receipt-digest revalidation in restamp publication |
| Receipt-level `declaredWrites` projection | Chosen | Keeps one source of truth with a recomputable projection consumers can gate on |
| Infer the late write from the working tree | Rejected | Projection-owned paths are excluded from every snapshot repo-harness captures, and a local derivation would be a second authority |

## Open Questions

- None. The upstream shape landed as arch-context PR #151 (head a411517) and this consumer
  was realigned to it in the same branch; the divergence from the pre-landing sketch was
  the optional both-or-neither apply identity, which the guard now covers on both shapes.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
