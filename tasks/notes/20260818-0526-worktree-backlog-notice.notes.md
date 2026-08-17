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

- **The section reports merge state only; it does not re-derive dirtiness.**
  The lib's own header states the invariant: "dirty" and "unmerged" are separate
  refusals with separate remedies, and collapsing them makes the dirty guard
  unreachable. So `worktreeBacklogSessionContent` classifies through
  `worktree_merge_mode` and says plainly that a dirty worktree is still refused
  separately, instead of growing a second dirtiness authority in TypeScript.

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
refuses. Regression-guarded by
`tests/session-context.test.ts` → "FALSIFIER: a dirty, genuinely unmerged
worktree is never listed", which binds the expectation to the lib's own verdict
rather than to a second opinion computed inside the test.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Re-derive `merge-tree` in `session-context.ts` | Rejected | Restores the two-authority defect `b456121a` removed — the defect issue #196 actually was |
| Parse `ship-worktrees --cleanup-merged --dry-run` | Rejected | Couples a hook to a human-readable format with no stability contract; `run_cmd` only echoes under `--dry-run`, so the mode never appears there |
| Per-branch entrypoint | Rejected | N spawns per scan for no benefit over one batch call |
| Filter dirty worktrees out of the list too | Rejected | Would add a second dirtiness authority in TS and make the shell dirty guard unreachable through the notice; the section states the separate refusal instead |
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
  unlike the merge verdict which is a derived predicate.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
