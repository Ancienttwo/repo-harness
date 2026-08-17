# Implementation Notes: worktree-backlog-notice

> **Status**: Active
> **Plan**: plans/plan-20260818-0526-worktree-backlog-notice.md
> **Contract**: tasks/contracts/20260818-0526-worktree-backlog-notice.contract.md
> **Review**: tasks/reviews/20260818-0526-worktree-backlog-notice.review.md
> **Last Updated**: 2026-08-18
> **Lifecycle**: notes

## Design Decisions

- **Batch entrypoint, not a per-branch one.** `scripts/worktree-merge-lib.sh`
  gained `worktree_merge_lib_main` plus a `[[ "${BASH_SOURCE[0]}" == "$0" ]]`
  guard. One spawn classifies the whole scan; a per-branch entrypoint would put
  the scan's cost back at N spawns for no gain. Argument parsing fails closed:
  a missing `--target` and an unknown option both exit 2 with nothing on stdout,
  so a caller can never read a partial classification as a complete one.

- **`$0`/`BASH_SOURCE` guard rather than a separate wrapper script.** A wrapper
  would be a second file whose only content is a call into this one. The guard
  keeps sourcing side-effect free, which both existing consumers depend on and
  which `tests/helper-scripts.test.ts` now asserts directly (sourcing with
  `--target ...` as positional parameters still produces no output).

- **Merged worktrees split on cleanliness into two labelled lists.** The first
  pass reported merge state only and disclaimed dirtiness in prose. The gate
  falsified both of that pass's reasons, and the measured consequence was worse
  than the contract's own falsifier anticipated — see "Corrected: dirty-merged
  is a batch blocker" below. `worktreeBacklogSessionContent` now reads
  `git status --porcelain=v1 --untracked-files=all` once per merged candidate
  (at most 24) and renders "Blocking the batch" before "Cleanable now". Dirty
  ones stay visible — they are the reason the rest cannot be cleaned — but are
  never in the list the operator is invited to act on.

- **Why the status read is not a second authority.** `worktree_merge_mode`
  *decides*: ancestry or tree-equivalence, fail-closed, a predicate that drifts
  if either implementation changes. `git status --porcelain` *observes*: git
  reports whether a working tree has changes, nothing is derived. The existing
  consumers already read it independently twice
  (`dirty_paths_for_worktree` in `ship-worktrees.sh`,
  `worktree_status_for_cleanup` in `contract-worktree.sh`), so a TS read is not
  even a new class of duplication. This is the same line the Out of scope
  section draws for `git worktree list --porcelain`.

- **A prunable registration is withheld from both lists.** Directory deleted by
  hand, worktree still registered: the status read fails,
  `contract-worktree cleanup` dies on an unhandled `cd` at
  `contract-worktree.sh:1846`, and `ship-worktrees --cleanup-merged --slug`
  exits with "linked worktree status unavailable after repair attempt". Neither
  list is the place to invite `git worktree prune`, so it is dropped —
  fail-closed, matching this file's existing catch→null style.

- **Silent inside a linked worktree.** Both cleanup entrypoints refuse when not
  run from the primary worktree (`is_linked_worktree` in `ship-worktrees.sh`,
  the primary-worktree check in `contract-worktree.sh`). The section compares
  the repo root against the first `git worktree list --porcelain` entry and
  returns null when they differ, so it never names a command that cannot run
  where it is read. This is the falsifier's invariant, not an extra feature.

- **Accepting modes enumerated, never `!== 'unmerged'`.** Same reasoning as the
  `cleanup_merged` branch in `ship-worktrees.sh`: a mode this reader does not
  recognize must land on the silent side, not in a list the operator is invited
  to act on.

- **`actionable: true`.** `budgetSessionContext` drops the entire payload when
  no section is actionable, so an informational-only flag would mean the notice
  never reaches a session. `mandatory` stays false — an unnoticed backlog is
  untidy, not unsafe.

- **Revised scan cost, flagged rather than re-tuned.** The contract derived the
  cap of 24 from `merge-tree` alone (~22ms each, "near 0.5s"). The cleanliness
  read adds one `git status --porcelain=v1 --untracked-files=all` per *merged*
  candidate — measured 0.02-0.05s on this 2529-file worktree — so the
  pathological case (24 scanned, all merged) is roughly 24 x (22ms + ~35ms)
  ≈ 1.4s, not 0.5s. The steady state is unchanged, since the status read only
  fires for worktrees already proven merged. The cap is contract-specified at
  24 and was not re-tuned here; if 1.4s at SessionStart is unacceptable the
  decision is a lower cap, not dropping the cleanliness split.

- **Over-cap wording is a report, not a truncation.** Above 24 the section
  states the unchecked count and points at
  `ship-worktrees --cleanup-merged --dry-run`. A section is also emitted when
  nothing in the first 24 is cleanable but some remain unchecked; silence there
  would be a claim the scan is not entitled to make.

## Deviations From Plan Or Spec

- None. The two rejected alternatives named in the contract (re-deriving
  `git merge-tree --write-tree` in TypeScript; parsing
  `ship-worktrees --cleanup-merged --dry-run` output) were not implemented.

## Falsifier Result

Contract falsifier: *if the section lists a worktree that
`contract-worktree cleanup` would refuse, the notice is worse than silence.*

Built a dirty, genuinely unmerged contract worktree (`codex/dirty-unmerged`,
one real commit main does not have, plus an uncommitted `wip.txt`) in a fixture
carrying the shipped helper projection:

```
=== 1. merge authority verdict ===
codex/dirty-unmerged	unmerged
=== 2. real contract-worktree cleanup ===
contract-worktree: branch codex/dirty-unmerged is not fully merged into main; refusing cleanup
cleanup exit=1
=== 3. section content for the same repo ===
content = null
```

Then added a squash-absorbed sibling to the same fixture, which is the shape
issue #196 accumulated:

```
=== authority ===
codex/absorbed	absorbed
codex/dirty-unmerged	unmerged
=== real cleanup dry-run for the absorbed one ===
[ContractWorktree] Merge check for codex/absorbed: absorbed into main (squash-equivalent tree)
[ContractWorktree] dry-run cleanup slug=absorbed target=main
[ContractWorktree] would remove worktree: /private/tmp/falsifier-196-wt-absorbed
[ContractWorktree] would delete branch: codex/absorbed
exit=0
=== section content ===
# Cleanable Contract Worktrees

- 1 contract worktree(s) already merged into `main`. Nothing was deleted.
  - `absorbed` at `/private/tmp/falsifier-196-wt-absorbed` (branch `codex/absorbed`)
- Deletion stays yours: review with `repo-harness run ship-worktrees --cleanup-merged --dry-run`, then run `repo-harness run ship-worktrees --cleanup-merged` from this worktree. A dirty worktree is still refused separately.
```

The section names exactly the worktree cleanup accepts and withholds the one it
refuses.

That fixture alone is not discriminating: the worktree is dirty **and**
unmerged, so `unmerged` excludes it on its own and the dirtiness dimension is
inert. The discriminating case is squash-absorbed **and** dirty — identical
merge state to the cleanable case, differing only in working-tree state —
covered by `tests/session-context.test.ts` → "FALSIFIER: a merged-but-dirty
worktree is named as the batch blocker, never offered as cleanable", which
asserts the dirty one appears only in the blocked block, the clean merged
sibling only in the cleanable block, and binds merge state to the lib's own
verdict (`codex/dirty-merged-demo\tabsorbed`) rather than to a second opinion
computed inside the test.

## Corrected: dirty-merged is a batch blocker, not a skipped row

The first pass listed merged-but-dirty worktrees indistinguishably from clean
ones and disclaimed it in prose with "A dirty worktree is still refused
separately". Both of its reasons were wrong, and the disclaimer described the
wrong failure.

The lib header's "collapsing them makes the dirty guard unreachable" describes
the cleanup *executor*, where the merge verdict decides whether control reaches
the dirty guard. A display filter guards nothing and executes nothing, so
nothing can become unreachable through it. The rule was applied across
scenarios it does not cover.

The measured consequence, on a fixture with three squash-absorbed worktrees
where the dirty one (`bravo`) is registered between two clean ones:

```
=== merge authority: all three absorbed ===
codex/alpha	absorbed
codex/bravo	absorbed
codex/charlie	absorbed

=== ship-worktrees --cleanup-merged --dry-run ===
[Ship] bash /private/tmp/gk196/scripts/contract-worktree.sh cleanup --slug alpha --target main --dry-run
ship-worktrees: dirty merged linked worktree: codex/bravo at /private/tmp/gk196-wt-bravo
ship-worktrees: dirty paths:
  - wip.txt
ship-worktrees: --discard-scaffold-only is blocked by non-scaffold paths:
  - wip.txt
dry-run exit=1
--- charlie still registered, never reached ---
/private/tmp/gk196-wt-charlie  f539b93 [codex/charlie]
```

Three layers, none of which "refused separately" conveys:

1. `guard_dirty_merged_worktree "$branch" "$path" || exit 1`
   (`ship-worktrees.sh:1146`) aborts the **whole batch**, not that row.
   `charlie` is never reached. One dirty merged worktree pins every worktree
   registered after it — that is the accumulation dynamic of #196 itself.
2. That guard runs *before* the `DRY_RUN` branch, so the `--dry-run` the
   section recommended as the safe first step exits 1 too.
3. The failure message (`ship-worktrees.sh:779`) says "rerun with
   `--discard-scaffold-only`" — the exact habit the contract's falsifier names
   as the thing this notice must not train.

A disclaimer that misdescribes the failure mode is worse than none: it builds
the mental model "run it, dirty ones get skipped" and delivers "nothing was
cleaned, and here is a flag that deletes your work".

Output after the fix, same fixture:

```
- Blocking the batch: 1 worktree(s) merged into `main` but dirty. `--cleanup-merged` exits at the first of these it reaches -- `--dry-run` included -- so nothing after it is cleaned, which is how a backlog accumulates. Commit or extract those changes first; `--discard-scaffold-only` deletes them rather than resolving this.
  - `bravo` at `/private/tmp/gk196-wt-bravo` (branch `codex/bravo`)
- Cleanable now: 2 worktree(s) merged into `main` and clean.
  - `alpha` at `/private/tmp/gk196-wt-alpha` (branch `codex/alpha`)
  - `charlie` at `/private/tmp/gk196-wt-charlie` (branch `codex/charlie`)
```

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Re-derive `merge-tree` in `session-context.ts` | Rejected | Restores the two-authority defect `b456121a` removed — the defect issue #196 actually was |
| Parse `ship-worktrees --cleanup-merged --dry-run` | Rejected | Couples a hook to a human-readable format with no stability contract; `run_cmd` only echoes under `--dry-run`, so the mode never appears there |
| Per-branch entrypoint | Rejected | N spawns per scan for no benefit over one batch call |
| Report merge state only, disclaim dirtiness in prose | Rejected after measurement | Both reasons were wrong and the disclaimer misdescribed the failure: dirty-merged aborts the entire batch, `--dry-run` included, and the error recommends `--discard-scaffold-only` |
| Drop dirty-merged worktrees silently | Rejected | They are the reason the rest cannot be cleaned; hiding them makes the backlog inexplicable |
| Split into "Blocking the batch" / "Cleanable now" | Chosen | Visible without being invited; the only shape that matches what `cleanup_merged` actually does |
| Stop-hook notice | Rejected (plan) | Stop fires per response; a scan up to 0.5s does not belong there |

## Open Questions

- SessionStart is the only notice point. A backlog that accrues mid-session
  waits for the next session start. Accepted: accumulation is chronic. If that
  proves wrong, the fix is registering the same section on another event, not
  redesigning the scan.

## Out Of Scope (observed, not fixed)

- `scripts/worktree-merge-lib.sh` is packaged in `assets/workflow-contract.v1.json`
  under `helpers`, but no `repo-harness run` alias exposes the new batch
  entrypoint. The section invokes `<repoRoot>/scripts/worktree-merge-lib.sh`
  directly, which is where both the self-host repo and the installed projection
  put it. Adding a runner alias is a new CLI surface and was out of scope here.
- `list_contract_worktrees` in `ship-worktrees.sh` and the porcelain reader in
  `session-context.ts` parse the same `git worktree list --porcelain` output in
  two languages. Not merged: the shell one is a four-line awk inside a bash-only
  loop, and the datum (which worktrees exist) is directly observable from git,
  unlike the merge verdict which is a derived predicate. The same line puts the
  `git status --porcelain` read on the observable side.
- `guard_dirty_merged_worktree` aborting the entire `--cleanup-merged` batch
  rather than skipping the offending worktree is arguably the more valuable fix
  for #196, since it is what pins every worktree registered after a dirty one.
  Not touched: `ship-worktrees.sh` is named out of scope by the contract, and
  changing an irreversible-write guard's control flow is its own work-package.
  This section reports the behavior instead.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
