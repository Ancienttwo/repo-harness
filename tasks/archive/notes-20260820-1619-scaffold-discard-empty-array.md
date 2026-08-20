> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260817-2327-scaffold-discard-empty-array.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1619

# Implementation Notes: scaffold-discard-empty-array

> **Status**: Active
> **Plan**: plans/plan-20260817-2327-scaffold-discard-empty-array.md
> **Contract**: tasks/contracts/20260817-2327-scaffold-discard-empty-array.contract.md
> **Review**: tasks/reviews/20260817-2327-scaffold-discard-empty-array.review.md
> **Last Updated**: 2026-08-17 23:27
> **Lifecycle**: notes

## Design Decisions

- Reused the `${arr[@]+"${arr[@]}"}` idiom already present twice in the same
  file (`scripts/ship-worktrees.sh:1085`, `:1105`) rather than introducing a
  third empty-array pattern (`[[ ${#arr[@]} -gt 0 ]]` guard or `set +u` window).
  The loop body, the tracked branch, and `set -euo pipefail` are untouched.
- The new test fixture commits every scaffold path into the base repo before
  `git worktree add`, then rewrites those same paths inside the worktree. That
  makes `git ls-files --error-unmatch` succeed for all dirty paths, so
  `untracked_paths` is empty — the exact shape that reached the defect. An
  explicit assertion that `git status --porcelain=v1 --untracked-files=all`
  contains no `??` entries pins the fixture so a future edit cannot silently
  reintroduce an untracked path and hollow out the regression guard.
- The test asserts `stderr` does not contain `unbound variable` in addition to
  `status === 0`. Without that assertion the failure message would only say
  "expected 0, got 1", which does not name the defect.
- The mixed tracked + untracked case stays covered by the pre-existing
  "can discard scaffold-only dirty merged worktree" test at
  `tests/helper-scripts.test.ts:1886`; it still passes, which is the in-fixture
  proof that the guard did not change non-empty behavior.

## Deviations From Plan Or Spec

- None to the change itself. One environment step outside the diff: this
  worktree had no `node_modules`, so `bun run check:type` failed with
  `Cannot find module .../typescript/bin/tsc`. Ran `bun install` (115 packages,
  no lockfile change) and re-ran; typecheck is clean.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `${untracked_paths[@]+"${untracked_paths[@]}"}` | Chosen | Already the file's local idiom; preserves quoting for elements containing spaces |
| Wrap the loop in `if [[ ${#untracked_paths[@]} -gt 0 ]]` | Rejected | Restructures the loop and adds a second pattern for the same problem in one file |
| Seed the array with a sentinel / relax `set -u` | Rejected | Explicitly out of scope; weakens the failure mode the script relies on |

## Falsifier Result

Contract falsifier (`Falsifier` section) — the guard must not change iteration
for a non-empty array, in particular must not split an element with a space:

```
$ /bin/bash -c 'set -euo pipefail; a=("p q" r); for x in ${a[@]+"${a[@]}"}; do echo "[$x]"; done'
[p q]
[r]
```

Two iterations, `p q` intact. Not `[p]` `[q]` `[r]`. Empty case reaches the end:

```
$ /bin/bash -c 'set -euo pipefail; a=(); for x in ${a[@]+"${a[@]}"}; do echo "[$x]"; done; echo REACHED_END'
REACHED_END
```

Pre-fix evidence: `tasks/notes/20260817-scaffold-discard-empty-array.pre-fix.log`
(`PRE_FIX_EXIT=1`, `ship-worktrees.sh: line 787: untracked_paths[@]: unbound variable`).

## Out Of Scope / Future Work

- `bash --version` on this machine is 3.2.57, and `scripts/ship-worktrees.sh:7`
  defaults `BASH_BIN` to `/bin/bash`, so the test suite exercises bash 3.2 by
  accident of the host rather than by contract. A repo running its helper tests
  on a bash 4.4+ host would not have caught this defect. Not fixed here —
  `BASH_BIN` resolution is explicitly out of scope.
- Not audited: whether other `"${arr[@]}"` expansions elsewhere in the helper
  set can be reached with an empty array. Only the contracted site changed.

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
