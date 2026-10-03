# Implementation Notes: auto-campaign-template

> **Status**: Active
> **Plan**: plans/plan-20260913-0144-auto-campaign-template.md
> **Contract**: tasks/contracts/20260913-0144-auto-campaign-template.contract.md
> **Review**: tasks/reviews/20260913-0144-auto-campaign-template.review.md
> **Last Updated**: 2026-09-13 01:44
> **Lifecycle**: notes

## Design Decisions

- The template boundary stops at the install: the builder keeps `git init`, the empty
  commit, the CLI shim and `scripts/sync-codex-installed-copies.sh`, while `draft()` still
  spawns a real `prepare-grant.ts` child process on every call because that spawn is the
  behaviour the file asserts on.
- One workspace path (`value.dir`) is snapshotted rather than a `{ root, home }` pair. The
  fixture's mkdtemp directory is simultaneously `HOME`, the parent of `REPO_HARNESS_HOME`,
  and the parent of `CODEX_SKILLS_ROOT` / `CLAUDE_SKILLS_ROOT`; `sync-codex-installed-copies.sh`
  writes only to those two skill roots, so nothing the fixture produces lives outside it.
- Registration for `afterEach` removal moved from the builder into the `fixture()` wrapper,
  because on a cache hit the builder never runs. This mirrors the existing consumer in
  `tests/effects/collaboration-contribution-collector.test.ts`.
- The template key is the install profile, so `full` is built once for two tests and
  `minimal` keeps its own build. Three builds become two.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Share one template across both install profiles | Rejected | The profile is exactly what the install output differs by; the third test asserts `minimal` installs nothing. |
| Also template the `draft()` child process | Rejected | `prepare-grant.ts` sealing and minting is the behaviour under test, not fixture cost. |
| Snapshot `repo` and the skill roots separately | Rejected | They share one mkdtemp parent that is also `HOME`; snapshotting the parent is both simpler and complete. |

## Open Questions

- None.

## Measured Effect

Paired runs in this worktree, `bun test --timeout 180000 tests/auto-campaign-skill.test.ts`:

| Run | Before | After |
|-----|--------|-------|
| pair 1 | 81.86s | 69.87s |
| pair 2 | 77.69s | 61.36s |

Co-resident with `tests/effects/campaign-worker.test.ts`: 18 pass, 0 fail, 98.36s.
JUnit `<testcase name>` multiset is byte-identical before and after (three names).

Part of the saved rsync and Bun-startup cost returns as the snapshot directory copy, which
carries two full package installs; the net win is the removed duplicate `full` build.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
