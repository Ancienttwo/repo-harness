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

- The lib lives at `scripts/worktree-merge-lib.sh`, not `scripts/lib/`.
  `scripts/lib/` is the "internal, deliberately not projected downstream"
  tier: `helpers.scripts` carries 54 entries with zero path separators,
  `scripts/lib/project-init-lib.sh` is absent from it, and the packaged
  runtime directory is `package:assets/templates/helpers`. This lib must be
  projected -- the installed `contract-worktree.sh` sources it -- so it belongs
  to the packaged tier by definition. The flat-inventory assertion at
  `tests/helper-scripts.test.ts:580-583` was left alone: it guards projection
  completeness, and editing it would have been making room for a
  misclassification.
- Both consumers fail closed when the lib is absent (`worktree merge library
  is unavailable`, exit 1) rather than falling back to the old inline
  ancestry check. A fallback would have quietly restored the exact two-authority
  split this contract exists to remove.
- `scripts/ship-worktrees.sh` branches on `!= "unmerged"` rather than listing
  `ancestor|absorbed`. The lib's contract is that only those two values mean
  merged, and negating the single refusal keeps the batch filter from silently
  ignoring a future fourth value: an unrecognized mode would be treated as
  unmerged, which is the safe side.

## Falsifier Verification

Ran by hand against `worktree_merge_mode` in a throwaway repo (source the lib,
build each shape, print the mode):

| Case | Expected | Observed |
|------|----------|----------|
| A squash-absorbed branch | `absorbed` | `absorbed` |
| B squash tree + one extra commit main lacks | `unmerged` | `unmerged` |
| C plain `--no-ff` merged branch | `ancestor` | `ancestor` |
| D divergent branch conflicting on README | `unmerged` | `unmerged` |
| E nonexistent target ref | `unmerged` | `unmerged` |

Case B is the contract's falsifier and it holds: extraction relocated the
determination without widening it. Case A's ancestry check was confirmed to
answer "no" in the same run, so `absorbed` really did come from the merge-tree
predicate and not from ancestry.

## Deviations From Plan Or Spec

- Execution first stopped at the contract's Stop Condition (two required paths
  were outside `allowed_paths`); the parent adjudicated both, widened
  `allowed_paths`, moved the pre-fix artifact to `tasks/notes/`, and directed
  the flat lib placement. Implementation landed on that amended contract.
- Four test fixtures needed the new lib added to their helper copy lists
  (`tests/contract-worktree-closeout-journal.test.ts`,
  `tests/contract-worktree-single-publication.test.ts`,
  `tests/archive-evidence-gates.test.ts`,
  `tests/continuation-conformance.test.ts`). They enumerate the helpers each
  scenario installs, and the lib is now a hard load-time dependency of
  `contract-worktree.sh` and `ship-worktrees.sh`. This was not foreseen in the
  plan; 26 tests failed on the first full run for exactly this reason.
- One closeout-journal case sourced `contract-worktree.sh` through
  `bash -c "$predicate" complete-effect "$dir"`, so `$0` was the label
  `complete-effect` and `helper_dir` resolved to the repo root instead of
  `scripts/`. The fixture now passes `scripts/contract-worktree.sh` as `$0`.
  The predicate reads `$1` before `set -- help`, so nothing else shifted.
  Worth naming: `helper_dir` was already wrong in that call, but nothing
  consumed it there until the lib made it load-bearing.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Land the lib and regenerate `assets/templates/helpers/` anyway | Rejected | `assets/` is absent from this contract's `allowed_paths`, and `scripts/verify-contract.sh` / `scripts/contract-worktree.sh:429` enforce that list on the changed-path set |
| Put the lib flat at `scripts/worktree-merge-lib.sh` to fit the packaged helper inventory | Deferred to the parent | Contradicts the contract's mandated `scripts/lib/worktree-merge-lib.sh` path, and still requires the `assets/workflow-contract.v1.json` inventory entry |
| Ship the RED guard alone and hand back | Chosen for round 1 | The guard is fully inside `allowed_paths`, the pre-fix artifact the gate requires must be captured before the fix anyway, and the remaining decision is a packaging-surface call |
| Relax the lib when the file is missing instead of failing closed | Rejected | Restores the two-authority split silently, which is the bug |
| Rewrite `tests/helper-scripts.test.ts:580-583` to tolerate a `lib/` subdirectory | Rejected by the parent | The assertion protects projection completeness; the misclassified path was the thing to move |

## Open Questions

- None open. The two blockers below were adjudicated by the parent and are
  retained as the record of why the contract was amended mid-execution:
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
  Blocker 2 was a judgment call, not a mechanical one: it turns the plan's
  claimed "+1 internal entity, public surface delta +0" into a change to the
  versioned workflow-contract manifest that downstream repos consume. The
  parent resolved it as a reclassification rather than a surface addition --
  the lib is packaged because its consumers are packaged -- and the plan's
  entity-delta line was updated accordingly.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
