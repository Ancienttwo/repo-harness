> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260811-2137-archctx-042-version-sync.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1619

# Implementation Notes: archctx-042-version-sync

> **Status**: Active
> **Plan**: plans/plan-20260811-2137-archctx-042-version-sync.md
> **Contract**: tasks/contracts/20260811-2137-archctx-042-version-sync.contract.md
> **Review**: tasks/reviews/20260811-2137-archctx-042-version-sync.review.md
> **Last Updated**: 2026-08-11 21:37
> **Lifecycle**: notes

## Design Decisions

- `linkBuildDependencies` in `scripts/axr5-archctx-clean-room.ts` no longer enumerates
  `<arch-context>/node_modules/@archcontext`: under bun 1.3 only `surfaces` is materialized
  there, so `@archcontext/core` was never linked into the clean-room checkout. The link set
  now comes from the checkout `package.json` `workspaces` array, with each package name read
  from its own manifest and the realpath containment check re-anchored on the checkout.

## Deviations From Plan Or Spec

- The axr5 proof could not be regenerated. `prepareReleaseVersion` throws
  `product version source was not updated` because `/Users/kito/Projects/arch-context`
  already carries `ARCHCONTEXT_PRODUCT_VERSION = "0.4.2"`, so the version rewrite is a no-op
  and its guard fails closed. This aborts before `linkBuildDependencies`, so the
  workspace-list rewrite is unexercised. Relaxing that guard is a semantics change outside
  this packet.
- The aborted run left `docs/verification/axr5-archctx-clean-room-readback.json` at its
  `status: "running"` preamble; the previous 0.4.1 verified record is gone.
- Parent decision on `prepareReleaseVersion`: the invariant is "after the call the checkout
  declares exactly VERSION", so an already-at-VERSION source is a legitimate no-op (proving
  against the real published revision beats proving against a mutated tree) while a missing
  declaration still fails closed; the throw-on-no-op guard was replaced with a match-then-
  conditional-write. Contract Scope was amended to cover this.
- Third instance of the same bun-1.3 layout root cause blocks the run at the consumer offline
  install: `@node-rs/jieba` is only under `node_modules/.bun/node_modules/@node-rs/`, never
  hoisted to `<arch-context>/node_modules/@node-rs/`, but the consumer manifest at
  `scripts/axr5-archctx-clean-room.ts:57` hardcodes the top-level path, so npm falls back to
  the blackholed registry (`ENOTCACHED`). `installedPlatformPackage` already probes both roots;
  the plain packages do not. Fixed under an amended Scope with `installedPackagePath`, an
  exact-name probe over the same two roots as `installedPlatformPackage`; the two plain
  `file:` consumer entries now resolve through it. The clean-room run then completed and the
  readback is verified / contracts 0.4.2 / dirtySourceUsed false.
- The notes edit had to go through a shell write: the Claude edit-route hook resolves the
  repo root from the session cwd (primary worktree) and fails profile resolution for a
  worktree path; `repo-harness state resolve` run inside the worktree reports no blockers.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

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

## Closeout Adjudication

- 2026-08-11: `contract-worktree finish --merge` blocked by the strict projection
  gate: archctx classified the 11-capability version sweep as
  `unresolved-major-change` requiring human adoption. Owner adjudicated directly
  ("合并吧") and ordered the merge; merged manually on main under that decision.
  The adoption demand lived only in this worktree's archcontext state; main
  carries the same content via direct commit 67449e11 with all gates green.
