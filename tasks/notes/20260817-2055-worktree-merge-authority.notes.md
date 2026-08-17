# Implementation Notes: worktree-merge-authority

> **Status**: Active
> **Plan**: plans/plan-20260817-2055-worktree-merge-authority.md
> **Contract**: tasks/contracts/20260817-2055-worktree-merge-authority.contract.md
> **Review**: tasks/reviews/20260817-2055-worktree-merge-authority.review.md
> **Last Updated**: 2026-08-17 20:55
> **Lifecycle**: notes

## Design Decisions

- The batch-path regression guard lands as two cases, not one. The positive
  case (`ship-worktrees --cleanup-merged` must clean a squash-merged worktree)
  is the issue #196 reproduction. The negative control (a branch carrying one
  commit main does not have must still print `Skipped unmerged branch:`) is the
  contract's falsifier applied at the batch entrypoint, and it is what keeps a
  future "fix" from widening the check into a deleter. The negative control
  already passes pre-fix, which is the point: it proves the positive case fails
  for the stated reason and not because the fixture is broken.
- Both new cases run non-dry-run. `run_cmd` in `scripts/ship-worktrees.sh:105`
  only echoes under `--dry-run`, so a dry-run assertion would test the echoed
  command string rather than the removal, and would not have caught the
  deletion half of the bug.

## Deviations From Plan Or Spec

- Implementation is not landed. Execution stopped at the contract's Stop
  Condition ("the change would require editing a path outside Allowed Paths").
  See Open Questions.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Land the lib and regenerate `assets/templates/helpers/` anyway | Rejected | `assets/` is absent from this contract's `allowed_paths`, and `scripts/verify-contract.sh` / `scripts/contract-worktree.sh:429` enforce that list on the changed-path set |
| Put the lib flat at `scripts/worktree-merge-lib.sh` to fit the packaged helper inventory | Deferred to the parent | Contradicts the contract's mandated `scripts/lib/worktree-merge-lib.sh` path, and still requires the `assets/workflow-contract.v1.json` inventory entry |
| Ship the RED guard alone and hand back | Chosen | The guard is fully inside `allowed_paths`, the pre-fix artifact the gate requires must be captured before the fix anyway, and the remaining decision is a packaging-surface call |

## Open Questions

- Two blockers sit outside `allowed_paths`, both proven, not inferred:
  1. `assets/templates/helpers/{contract-worktree,ship-worktrees}.sh` is a
     deterministic projection of `scripts/`. Any edit to either script trips
     `bun run check:helpers` (`[helpers] content drift: ...`), which
     `tests/helper-scripts.test.ts:568` asserts must exit 0 -- and that test is
     a named Exit Criterion of this contract. The two 20260731 predecessor
     contracts both listed `assets/templates/helpers/contract-worktree.sh` in
     `allowed_paths`; this contract omits `assets/` entirely.
  2. A new shared bash lib only reaches downstream repos if it is listed in
     `assets/workflow-contract.v1.json#helpers.scripts` (mirrored in
     `.ai/harness/workflow-contract.json`), because
     `scripts/sync-helper-sources.ts` projects the inventory and nothing else,
     and the packaged helper runtime dir is `package:assets/templates/helpers`.
     `tests/helper-scripts.test.ts:580-583` compares a **flat, non-recursive**
     `readdirSync` of that directory against the inventory, so a `lib/`
     subdirectory cannot be represented without rewriting that assertion.
  Blocker 2 is a judgment call, not a mechanical one: it turns the plan's
  claimed "+1 internal entity, public surface delta +0" into a change to the
  versioned workflow-contract manifest that downstream repos consume.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
