# Implementation Notes: c3-work-state-handoff-adoption

> **Status**: Active
> **Plan**: plans/plan-20260830-0120-c3-work-state-handoff-adoption.md
> **Contract**: tasks/contracts/20260830-0120-c3-work-state-handoff-adoption.contract.md
> **Review**: tasks/reviews/20260830-0120-c3-work-state-handoff-adoption.review.md
> **Last Updated**: 2026-08-30 01:20
> **Lifecycle**: notes

## Design Decisions

- **No second `*_PROTOCOL` for the collaboration plane.** `handoff.ts` and
  `adoption.ts` consume the frozen `COLLABORATION_PROTOCOL` exactly as C1's
  `signal.ts` does. The closed inclusion scan in
  `tests/unit/collaboration-authority-baseline.test.ts` ranges over `src/core/**`
  modules that *own* a protocol constant, so neither module enters its universe,
  the scan stays true unchanged, and `src/core/collaboration/common.ts` remains
  the single adjudicated exclusion covering the plane. The adjudication is
  asserted rather than assumed: `C3 protocol ownership and vocabulary` imports
  both modules and proves their namespaces carry no `*_PROTOCOL`. Minting a
  second wire version for one plane would have been a fabricated authority
  surface and a real `DELIBERATELY_EXCLUDED` edit for nothing.

- **`handoff_id` is redundant, so it gets a drift check.** The PRD freezes both
  `handoff_id` and `handoff_sha256` onto the receipt, and the digest already pins
  bytes that contain the id. The receipt identity is the frozen triple only, so
  the redundancy is real; the reconcile equality check is its drift check, and a
  persisted receipt naming a different handoff than its digest pins is an
  explicit `collaboration_conflict`. Without that check the conflict branch would
  have been unreachable code.

- **The receipt carries no id field.** The PRD's schema has none, so the store
  derives the identity from the persisted bytes and compares it with the filename
  it read them from. That is strictly stronger than a self-declared id field: a
  receipt cannot assert one identity while being filed under another.

- **Per-handoff lock for adoption, per-thread lock for publication.** Adopters of
  one handoff serialize so the existence read and the receipt write stay
  consistent, and they all still succeed because their identities differ.
  Adopters of different handoffs never contend.

## Deviations From Plan Or Spec

- **Store mechanics and actor derivation extracted from `signal-store.ts`.** With
  three record families the durable create-once publish protocol (staged write,
  fsync, `link`, the single-source staging-name builder and its matcher, the
  lstat ancestor walk, the 64-hex-before-`join()` rule) and the server-side actor
  derivation would have existed in three copies. Both were single-source review
  findings on C1, and a copy reopens each per copy. They now live in
  `src/effects/collaboration/record-store.ts` and `actor.ts`; `signal-store.ts`
  keeps its public surface, and `signalStagingName` binds the shared builder so
  C1's own lookalike test still proves the builder/matcher pair against the real
  producer. `tests/effects/collaboration-signal-store.test.ts` passes unchanged
  in substance (15/15) and is the regression guard for the rewire.

- **The generic reader hardens one case the signal store did not.**
  `readCollaborationRecord()` proves the shard is a real directory before opening
  a record inside it. C1's `readPersistedSignal()` checked the shard only on the
  `readCoordinationSignal()` entrypoint, so an internal source-reference read
  skipped it. This is a strengthening, not a behavior change any test asserted.

- **Content requirements are field-level, not row-level.** All four knowledge
  fields are required keys and every entry must be non-blank, but only
  `attempted_paths` and `next_actions` must be non-empty. `dead_ends` and
  `key_findings` may be empty arrays: a run that ruled nothing out is a real
  outcome, and forcing a row there buys the word "none" written into the
  successor's evidence slot, which is worse than an absent entry because the
  successor trusts it.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Copy the publish protocol into two new stores | Rejected | Three copies of a crash-safety protocol drift independently; the staging-name single-source rule was already a C1 review finding |
| Add `receipt_id` to the receipt schema | Rejected | The PRD schema is exact-key and frozen; deriving the identity from content is also the stronger check |
| Require every knowledge list to be non-empty | Rejected | Fabricated "none" entries are worse for the successor than honest empty arrays |
| Put `handoff_id` into the receipt identity preimage | Rejected | The PRD freezes identity as the triple; the redundancy gets a drift check instead |
| Add an `unadopted_handoff` projection here | Rejected | Projection and selection belong to C2/C6; C3 anchors the vocabulary with an assertion over its own surface instead |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
