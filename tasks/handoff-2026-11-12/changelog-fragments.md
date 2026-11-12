# Changelog conflict class: one fragment file for each PR (JD E design)

Advisor draft, 2026-11-12T10:50Z. State read at `origin/main` b33d57bb4. Evidence: `probe/changelog-design/a/` (readers and writers of the file), `probe/changelog-design/b/` (history and open PRs), two `git merge-tree` runs of mine at 10:43Z.

## Proposal

Each PR writes its changelog text in a new file, `docs/changelog.d/<issue>.<category>.md`. `docs/CHANGELOG.md` holds released sections only and loses `## [Unreleased]`. The release prep runs one command that builds `## [x.y.z] - <date>` from the fragments and deletes them in the same commit.

Two branches conflict in a path only when both change that path. Two PRs for two issues write two different paths, so the changelog cannot make a PR `CONFLICTING`, at any number of open PRs.

## Pressure point

- 29 of the last 80 commits on main change `docs/CHANGELOG.md`: 23 of the 33 `feat` and `fix` commits (70%).
- 12 of 22 one-entry inserts land at the top of a sub-heading of `## [Unreleased]`. Two open PRs that insert at the same position conflict when the first one merges.
- Open now: #2648, #2651 and #2654 all insert at the top of `### Fixed`. `git merge-tree --write-tree --merge-base=origin/main fb279775a 3d489ca64` gives `CONFLICT (content): Merge conflict in docs/CHANGELOG.md`. The same run for #2638 against #2648 is clean (one unchanged line between the two inserts). These three PRs need at least 2 rebases before the last one merges.
- Cost of one such rebase: a new head, so one CI run for the head, one delta row (JD E), one writer turn. The #2638 check also fails closed on a conflict in any path, so the PR is red until the rebase.
- Past cost: the 10:38Z handoff records one conflict today (#2638 after #2634 merged). A rebase leaves no trace in a squash history, so the explorer found no count for the last 3 days. The size of the class comes from the rate above, not from a measured total.

## Options

| Option | Removes the conflict | Cost | Verdict |
|---|---|---|---|
| `.gitattributes` `docs/CHANGELOG.md merge=union` | No. GitHub's server-side merge, mergeability check and Update branch do not read merge drivers from `.gitattributes` (community discussion 9288, open since 2021; sentry-cocoa PR 9416 reproduced it with a bare `git merge-tree`, which reads attributes only through `attr.tree` or `--attr-source`; StyleProof issue 1319 records `mergeable: CONFLICTING` on 2026-11-10 for a PR whose local union merge was clean). | 1 line | Rejected: it helps a local rebase only |
| A position rule (append at the bottom, or sort by issue number) | No. Two inserts with no unchanged line between them conflict. Open PRs have neighbouring issue numbers, so a sort puts them side by side. | 1 sentence | Rejected |
| No entry in a PR; the release prep writes the section from squash subjects and PR bodies (0.30.0 was written this way: 54 entries in the release commit) | Yes | 0 product lines | Rejected: the entry leaves the head that the reviewers accept. For 0.31.0, 24 of the 36 released lines were verbatim PR entries and 3 were reworded; this option moves all of that text to one cold write and one large review in the release PR |
| One fragment file for each PR | Yes, by construction | About 90 product lines, 3 test cases | Recommended |

## Contract

1. Path: `docs/changelog.d/<issue>.<category>.md`. `<issue>` is the issue number of the PR (digits). `<category>` is one of `breaking`, `added`, `changed`, `fixed`, `removed`, `documentation`, `tests`, `upgrade`, `rollback`: the sub-headings that released sections use today. A PR with entries in two categories adds two files.
2. Content: one or more `- ` bullet lines, the same text that a PR writes under `## [Unreleased]` today. The assembler copies the bytes; it adds no reference and rewrites nothing.
3. One module, `scripts/changelog-fragments.ts`, owns the path form and the parser. It has two consumers:
   - `assemble --version <x.y.z> --date <YYYY-MM-DD>`: inserts `## [x.y.z] - <date>` above the first `## [` heading, with `### <Category>` blocks in one constant order and the fragments of a block in issue order; deletes the fragment files. It fails when there is no fragment, when a fragment does not parse, or when the version section exists. It reads no clock.
   - the check that #2638 adds (`scripts/check-changelog-released-sections.ts`, lane `architecture-advisory` of `scripts/check-ci.sh`): on the merge result it fails when `docs/CHANGELOG.md` has a `## [Unreleased]` heading and when a path under `docs/changelog.d/` does not parse. The error names the path form. This error is the instruction that reaches a writer who follows the old practice.
4. Release prep: the writer runs `assemble`, then adds the release-level text (for 0.31.0 that was 9 lines: Removed, Upgrade, Rollback, Changed). `release_notes()` in `scripts/release-owner-steps.sh` reads `## [x.y.z]` at the release commit and needs no change. One sentence in `docs/reference-configs/release-deploy.md` and its `assets/` twin names the command.
5. Cutover in the same PR (one authoring path): move each entry that is under `## [Unreleased]` at that time into a fragment and delete the heading. Change the review sentence at `assets/skills/repo-harness-issue-flow/references/worker.md:221` and `orchestrator.md:273` from "CHANGELOG text" to the fragment. No written rule tells an author to add an entry today (the practice is carried by the existing entries), and this design adds none.
6. `src/core/board/attention.ts:512` (`R2_IGNORED_PATH = 'docs/CHANGELOG.md'`) exists only because every PR shared the file. Remove it and the assertion at `tests/board.test.ts:1596`; line 1597 then expects both paths. After the cutover, R2 reports two PRs on one fragment path, which means two PRs for one issue. The PR states this assertion change by item. The orchestrator may cut this item; the design does not depend on it.

Not in scope: `scripts/init-project.sh:215-226` writes a Keep a Changelog `## [Unreleased]` skeleton for a new downstream project. That is the downstream project's file and stays.

## Tests

Extend `describe('released CHANGELOG sections')` in `tests/check-ci-job-split.test.ts` (added by #2638). No new test file.

1. A merge result with `## [Unreleased]` fails, and the error names `docs/changelog.d/<issue>.<category>.md`.
2. A fragment with an unknown category or with no `- ` line fails.
3. `assemble` writes the section in category order and issue order above the newest released section, and the fragment files are gone.

## Dispatch facts

- Tier Medium: `scripts/`, one line of `src/core/board/`, docs and tests. No `.github/**`, no hook, no security item. One different-family row.
- Update 2026-11-12T12:17Z: #2638 is merged (999ab13bb), so the issue is ready now. #2650 (head fe3a31843) changes `docs/reference-configs/release-deploy.md` only from line 34 on and `tests/check-ci-job-split.test.ts` only at lines 733 and 736. Boundary for the writer: the sentence in `release-deploy.md` goes in the "Repo Role" part (above line 32, and the `assets/` twin); the tests go in `describe('released CHANGELOG sections')` (line 1296). No shared hunk with #2650.
- Merge order: after #2650, #2651 and #2654. A rebase of #2650 gives a new head and voids the owner's text approval of fe3a31843.
- Seat: a bounded script task with a written contract; the `simple_fast` route (worker-light) fits. Parent: #2624.
- Merge moment: every open PR that has an `## [Unreleased]` line when this PR merges conflicts once (its line sits in a deleted block) and moves the line to a fragment. Merge it when at most 2 such PRs are open; 7 are open now (#2629, #2638, #2640, #2648, #2650, #2651, #2654).
- New architecture path: the writer checks whether `docs/changelog.d/**` needs an owner in the archctx model next to `docs/CHANGELOG.md` (`.archcontext/model/nodes/capability.public-surface.root-router.yaml:13`); the `architecture-advisory` job answers it.

## Tradeoff and scale

- Cost: a reader of the unreleased work lists a directory, not one section. The release prep gains one command.
- At 10 times the PR rate the merge path does not change. The first limit is the review of one released section with 10 times the entries in the release PR.
- Prediction to test after the cutover: no PR turns `CONFLICTING` with `docs/CHANGELOG.md` or `docs/changelog.d/` as its only conflict path.

## Rollback

`git revert` of the squash commit restores `## [Unreleased]` and the entries that the cutover moved. Fragments added after the cutover are then moved back by hand in the revert PR.
