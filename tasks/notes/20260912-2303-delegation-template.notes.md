# Implementation Notes: delegation-template

> **Status**: Active
> **Plan**: plans/plan-20260912-2303-delegation-template.md
> **Contract**: tasks/contracts/20260912-2303-delegation-template.contract.md
> **Review**: tasks/reviews/20260912-2303-delegation-template.review.md
> **Last Updated**: 2026-09-12 23:03
> **Lifecycle**: notes

## Design Decisions

- `materialize()` mirrors the builder instead of always returning a promise. The delegation
  fixture is a synchronous builder consumed by 35 synchronous test bodies; making the cache
  async would have forced every one of them to become `async` purely to reach a cache, which
  is a wider diff than the optimization it pays for.
- One mechanism, not a synchronous twin. Only one consumer needs the synchronous path, so
  `fixtureTemplate` got an overload pair and an optional `workspacePaths` selector rather
  than a parallel API. A second synchronous consumer would be the point to reconsider.
- `workspacePaths` is an explicit selector, not a widened `FixtureWorkspace` interface. The
  collaboration fixture names its repository `repoRoot`; teaching the template to accept
  either field name would make the snapshot set implicit, and the snapshot set is exactly
  what decides whether a restored fixture is complete.
- Cleanup ownership moved to the call site. `createCollaborationDelegationFixture` pushes
  its two directories into the caller's `roots` array, but on a cache hit the builder never
  runs. The call site passes a discarded array and `delegationFixture()` registers both
  paths itself, so every test — build or restore — registers exactly once and `afterEach`
  semantics are unchanged.
- The template boundary stops at the builder. `setWorkerStdout`, admission, dispatch and
  the collector transaction still run per test against unshared bytes restored into the
  fixture's own paths, because `repoHarnessRepoIdFor()` hashes the repository root
  verbatim and a copied-to-a-new-path fixture would fail closed.
- No spy or clock seam is installed before fixture construction anywhere in the suite, so
  the template needs no ordering treatment beyond what PR #421 established.

## Timings (this machine, isolate runs)

| File | Before | After |
|------|--------|-------|
| `tests/effects/collaboration-contribution-collector.test.ts` | 87s | 62s |
| `tests/cli/collaboration.test.ts` | 24s | 25s |
| `tests/effects/collaboration-context-delivery.test.ts` | 17s | 17s |
| `tests/effects/collaboration-dispatch-effect-fence.test.ts` | 12s | 10s |
| `tests/effects/collaboration-admission-bridge.test.ts` | 28s | 21s |
| `tests/effects/collaboration-dispatch-fence-composed.test.ts` | 9s | 8s |
| `tests/effects/collaboration-succession.test.ts` | 19s | 13s |
| `tests/effects/campaign-worker.test.ts` | 53s | 43s |

Only the first row is in the diff's blast radius; the rest import the delegation fixture
helper, whose signature and body are unchanged, and their movement is machine noise.

## Zero-loss Evidence

JUnit `testcase name` multisets over
`tests/effects/collaboration-contribution-collector.test.ts`, taken from the pre-change
file content and the post-change file: 35 names each, identical after sorting. Same-process
run of `tests/effects/collaboration-*.test.ts`: 137 pass / 0 fail / 915 expect() calls.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Move the template inside `createCollaborationDelegationFixture` so all seven importers benefit for free | Rejected | It would pull `bun:test` into `scripts/c9-collaboration-canary.ts` through the helper's import graph, and would hide cleanup ownership inside a helper that cannot see the caller's `afterEach`. |
| Add a separate `syncFixtureTemplate()` | Rejected | One consumer. A second mechanism would need its own drift check against the async one. |
| Make every test body `async` and reuse the existing async `materialize` | Rejected | 35 signature edits in a file whose bodies are otherwise untouched, for no behavioural gain. |

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
