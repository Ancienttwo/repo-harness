# Implementation Notes: gitignore-dir-level-repo-harness

> **Status**: Active
> **Plan**: plans/plan-20260807-1128-gitignore-dir-level-repo-harness.md
> **Contract**: tasks/contracts/20260807-1128-gitignore-dir-level-repo-harness.contract.md
> **Review**: tasks/reviews/20260807-1128-gitignore-dir-level-repo-harness.review.md
> **Last Updated**: 2026-08-07 11:28
> **Lifecycle**: notes

## Design Decisions

- Falsifier ran first: `git ls-files .repo-harness/` returned empty, so nothing under `.repo-harness/` is intentionally tracked and the directory-level rule cannot hide a tracked file.
- This repo's `.gitignore` carried the per-file entries in three separate regions (inside the managed `claude-runtime-temp` block, in the `# Project-specific` region, and at the tail after `.claude/worktrees/`). All three collapsed into a single `.repo-harness/` line placed inside the managed block, so the repo's own file mirrors the generated managed-block content instead of duplicating it in unmanaged regions.
- `assets/templates/gitignore.template` carries no `.repo-harness` entries at all, so it needed no change.
- There are two independent authored sources of downstream gitignore content, not one: `src/core/adoption/gitignore-plan.ts` (TS adoption planner, `# Project-specific` section name) and `scripts/lib/project-init-lib.sh` heredoc `EOF_RUNTIME` (shell scaffold, `# Build artifacts` section name). Both had to collapse to `.repo-harness/` or the scaffold path would keep emitting the fail-open per-file shape. `scripts/lib/project-init-lib.sh` is not part of any projection pair — `bun scripts/sync-helper-sources.ts --check` (52 helpers, OK) and `bun scripts/sync-hook-sources.ts --check` (3 files, OK) both stay clean after the edit, and `find` confirms a single copy of the file. The two `assets/templates/helpers/*.sh` mentions of the path are classification lists, not content copies.
- Existing tests asserted `toContain(".repo-harness/chatgpt-browser.local.json")`. A bare `toContain(".repo-harness/")` would pass trivially against the old per-file lines (substring), so each updated site pairs the positive directory assertion with `not.toContain` on the retired per-file entry. Same shape in the new `tests/unit/gitignore-plan.test.ts`, which additionally splits the block on newlines and asserts the exact `.repo-harness/` line plus an empty set of residual per-file entries.

## Deviations From Plan Or Spec

- A fourth authored gitignore-projecting surface, `scripts/lib/project-init-lib.sh:76-77`, was initially outside `allowed_paths`. Work stopped there per the Stop Condition and handed back; the parent confirmed the file falls inside the contract Goal's "any other authored template that projects gitignore content" clause, treated the omission as an `allowed_paths` gap, and added it. The two lines then collapsed to `.repo-harness/` like the other surfaces, which turned the two red scaffold tests green.
- Observed but deliberately untouched (declared out of scope by the contract): `src/cli/chatgpt-browser/engine.ts:174-179` builds an `ignoreLines` array with the same two per-file paths. The array is currently inert — the surrounding `runBrowserSetup` reads `.gitignore` into a `void`ed binding and never writes, with an inline comment deferring mutation to a later phase. No behavior depends on it today.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep per-file entries and add the directory rule alongside | Rejected | Leaves dead lines that re-teach the fail-open shape; the contract asks for consolidation, not addition |
| Relax the failing scaffold assertions to keep `bun test` green | Rejected | `toContain(".repo-harness/")` passes as a substring of the old per-file lines, so a green suite would be a fake pass over an unfixed scaffold path |
| Edit `scripts/lib/project-init-lib.sh` before the parent widened scope | Rejected then applied | Outside `allowed_paths` at the time, so Stop Conditions required handing back; applied only after the parent added the path to the contract |

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
