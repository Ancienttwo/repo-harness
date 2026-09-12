# Implementation Notes: fixture-template

> **Status**: Active
> **Plan**: plans/plan-20260912-1948-fixture-template.md
> **Contract**: tasks/contracts/20260912-1948-fixture-template.contract.md
> **Review**: tasks/reviews/20260912-1948-fixture-template.review.md
> **Last Updated**: 2026-09-12 19:48
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:e865a8acd82b5529483307bdff50915ffe5b7e9f2cd437a53ff504972b86983a`

## Design Decisions

- **Restore in place, do not clone to a new path.** `repoHarnessRepoIdFor`
  (`src/effects/repo-registry.ts:105`) hashes the repository root path verbatim, and that
  id is sealed into the program authorization, the campaign intent, the
  `registered-repos.json` entry, the work envelope and the publication receipt.
  `readRegisteredRepos` fails closed when a stored id does not re-derive from the
  canonical path, so a template copied to a fresh directory is rejected by the first
  authority read. `fixtureTemplate` therefore deletes the fixture's own `root` and `home`
  and rewrites them from a pristine snapshot taken right after the builder returned. Each
  test still gets unshared bytes; only the path is reused, and the tests are sequential
  within a file.
- **No origin/clone rewrite was needed.** `createAdoptionRepository`
  (`tests/helpers/campaign-adoption-repository.ts:21`) builds a single `git init`
  repository with no remote, so there is no remote URL to re-point after a copy. The git
  worktrees that `installHistoricalBoundDispatch` creates live under `home` and are
  registered in `root/.git`, and both are replaced together by the restore, so no stale
  registration survives.
- **The template boundary is the expensive builder, not the whole per-test setup.**
  `installHistoricalBoundDispatch` and the closeout budget step stay per test: they are
  in-process, they mint a fresh `randomUUID` claim, and the suites assert on the lease
  generations they produce.
- **Keyed by the builder's argument list.** `campaign-closeout.test.ts` uses three distinct
  argument tuples and `campaign-authoring-resume.test.ts` five, so one template per file
  would have been wrong; `JSON.stringify(args)` keeps the variants separate and builds each
  exactly once.
- **Templates are materialized lazily inside the first test that needs them, and every call
  site already builds its fixture before installing any spy or clock seam**, so no template
  is ever built under a mocked module.
- **`cpSync` uses `verbatimSymlinks`** so a symlink in the snapshot is restored as a
  symlink rather than being dereferenced into a copy; file modes are preserved by `cpSync`
  itself. Timestamps are deliberately *not* preserved, so a restored tree looks as freshly
  written as a rebuilt one.

## Deviations From Plan Or Spec

- `tests/effects/campaign-closeout.test.ts:313` keeps its direct `historicalPlanningFixture`
  call. That argument tuple has exactly one consumer, so templating it would pay a snapshot
  copy for no reuse.
- `tests/helpers/collaboration-delegation-fixture.ts` is not converted. Its builder
  `createCollaborationDelegationFixture` is synchronous, so it cannot use the async
  `materialize`; it names its workspace `repoRoot` rather than `root`; and it pushes into
  the caller's `roots` array from inside the builder. Converting it needs a synchronous twin
  of `fixtureTemplate` plus a workspace-path selector, which is a second mechanism for a
  single consumer. Left as the next slice.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Clone the template to a fresh path per test | Rejected | The fixture's repository id is a hash of its root path and is sealed into records that cannot be rewritten. |
| Classify read-only tests and share one fixture among them | Rejected | Needs a per-test audit that rots on the next edit, and it is only necessary when an in-place restore does not work. |
| Restore the snapshot into the fixture's own paths | Chosen | Keeps every path-bound digest valid while still giving each test unshared bytes. |
| Template the whole per-test setup including the bound dispatch | Rejected | The dispatch mints a fresh claim id and the suites assert on the lease generations it produces. |

## Open Questions

- None.

## Measured Cost

Same machine, same session, `bun test --timeout 180000` per file. The absolute numbers are
much higher than CI's because the machine was loaded; the ratio is the subject.

| File | Before | After | Delta |
|------|--------|-------|-------|
| `tests/effects/campaign-closeout.test.ts` | 199.62s | 133.80s | -33.0% |
| `tests/effects/brc10-lifecycle.test.ts` | 199.19s | 109.34s | -45.1% |
| `tests/effects/campaign-authoring-resume.test.ts` | 159.17s | 94.21s | -40.8% |
| `tests/effects/campaign-worker.test.ts` | 63.07s | 51.59s | -18.2% |
| All four in one `bun test` process | 676.33s | 376.25s | -44.4% |

Zero test loss: the JUnit `testcase name` multisets of the combined before/after runs are
identical (171 entries), and both runs report 77 pass / 4 skip / 0 fail / 493 expect() calls
across 81 tests.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
