# Implementation Notes: expensive-test-gate

> **Status**: Active
> **Plan**: plans/plan-20260913-0250-expensive-test-gate.md
> **Contract**: tasks/contracts/20260913-0250-expensive-test-gate.contract.md
> **Review**: tasks/reviews/20260913-0250-expensive-test-gate.review.md
> **Last Updated**: 2026-09-13 02:50
> **Lifecycle**: notes

## Design Decisions

- Gate variable: `REPO_HARNESS_TEST_EXPENSIVE`. One name for both surfaces, declared inline in each test file the way `BRC_TEST_CONTAINER_IMAGE` already is in `tests/effects/brc10-lifecycle.test.ts` and `tests/effects/campaign-container-live.test.ts`. No shared helper module: the cross-file invariant is protected by an explicit guard test, which is cheaper than a third import surface.
- Release-path wiring: `scripts/check-ci.sh:70-74` exports the variable inside `if [[ "$lane" == all ]]`, before `run_bun_tests`. The `all` lane is what a bare `bash scripts/check-ci.sh` runs, and `scripts/check-npm-release.sh:43` calls exactly that in full mode, which is `bun run check:release`. So the release gate that executes tests is `check:release` -> `check-ci.sh` (no lane) -> `all`, and it picks up the variable without any second wiring point. `prepublishOnly` runs `check-npm-release.sh --prepublish`, which returns at `scripts/check-npm-release.sh:38` before the suite; it never ran tests and still does not, so nothing was attached there.
- `.github/workflows/ci.yml` Test job runs `bash scripts/check-ci.sh functional`, which leaves the variable unset. Hosted PR and `main` runs therefore skip the gated cases.
- Skip visibility: titles could not change (the JUnit `<testcase name>` multiset had to stay identical), so each gated file prints a single `[gate] REPO_HARNESS_TEST_EXPENSIVE unset: ...(release lane only, not a failure).` line at module load when the gate is closed. The skip therefore reads as a gate in the log, not as a silent omission.
- The guard test derives the variable name from `scripts/check-ci.sh` and asserts both gated files use that exact name, and that no second `test.skipIf(!process.env.X)` name appears in them. Both failure modes were mutation-checked before landing.

## Deviations From Plan Or Spec

- The dispatch brief pointed at `tests/harness-benchmark-matrix.test.ts:492` as a `bun add -g` site while also fixing the gated count at two and the remaining passing count at 29. Those are inconsistent: line 492 belongs to a third case ("rejects Git-clean install-profile mode drift"), which installs a generated three-file fixture directory, not the packed repository. The two/29 boundary was kept, so that case stays in the functional lane. Its cost is a local `bun add -g` of a trivial package, not an `npm pack` of the whole repo.
- `tests/claude-review.test.ts` is gated as a whole file, which the brief allowed. One case in it ("schema enums reject array coercion instead of accepting malformed provider data") is pure and loses hosted-lane coverage. Whole-file gating was chosen because `unstartedSession()` resolves `Bun.which('herdr')!` and every other case drives a real server or a spawned provider child, so a per-case split would have left one case behind a helper that still requires the runtime.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Shared `tests/helpers/expensive-gate.ts` vs inline `process.env` reads | Inline | Matches the existing `skipIf` precedent, keeps the gate readable at the point of skip, and the name invariant is already enforced by the guard test |
| `describe.skipIf` wrapper for the review file vs per-case `skipIf` | Per-case | A wrapping `describe` would prefix every JUnit `<testcase name>`, which the acceptance boundary forbids |
| Gate only the herdr cases vs the whole review file | Whole file | `unstartedSession()` needs the pinned `herdr` binary too; a partial gate would still fail without the runtime |
| Attach the variable to `prepublishOnly` as well | No | `check-npm-release.sh --prepublish` returns before the suite by design; attaching a test-cost variable there would imply a test run it does not perform |

## Open Questions

- `.github/workflows/ci.yml` still carries the "Install pinned Herdr runtime" step in its Test job. The hosted `functional` lane no longer needs it, because every `herdr` case is now gated out of that lane. It was deliberately left in place: this slice does not touch `ci.yml`. Remove it on the next change that already opens `ci.yml`, batched with the existing `tasks/todos.md` row "Harden the CI documentation lane after #415", whose own revisit trigger is "the next change touching `.github/workflows/ci.yml` or `scripts/*.ts`". Removing the step alone would burn a full hosted CI run for no coverage change.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Measured on this branch, `bun test --timeout 180000` per file: benchmark matrix 62.73s (31 pass) before, 2.57s (29 pass / 2 skip) gate off, 55.99s (31 pass) gate on. Claude review 38.98s (20 pass) before, 0.023s (20 skip) gate off, 39.22s (20 pass) gate on.
- JUnit `<testcase name>` multisets for both files are identical across baseline, gate-off and gate-on runs.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
