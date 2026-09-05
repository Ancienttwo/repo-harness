> **Archived**: 2026-09-06 01:58
> **Related Plan**: plans/archive/plan-20260905-2354-ci-test-gate-aggregate-failures.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260906-0158
> **Archive Projection V1**: `plans/plan-20260905-2354-ci-test-gate-aggregate-failures.md` => `plans/archive/plan-20260905-2354-ci-test-gate-aggregate-failures.md`
> **Archive Projection V1**: `tasks/notes/20260905-2354-ci-test-gate-aggregate-failures.notes.md` => `tasks/archive/notes-20260906-0158-ci-test-gate-aggregate-failures.md`
> **Archive Projection V1**: `tasks/contracts/20260905-2354-ci-test-gate-aggregate-failures.contract.md` => `tasks/archive/contract-20260906-0158-ci-test-gate-aggregate-failures.md`
> **Archive Projection V1**: `tasks/reviews/20260905-2354-ci-test-gate-aggregate-failures.review.md` => `tasks/archive/review-20260906-0158-ci-test-gate-aggregate-failures.md`

# Implementation Notes: ci-test-gate-aggregate-failures

> **Status**: Active
> **Plan**: plans/archive/plan-20260905-2354-ci-test-gate-aggregate-failures.md
> **Contract**: tasks/archive/contract-20260906-0158-ci-test-gate-aggregate-failures.md
> **Review**: tasks/archive/review-20260906-0158-ci-test-gate-aggregate-failures.md
> **Last Updated**: 2026-09-05 23:54
> **Lifecycle**: notes

## Design Decisions

- The loop captures each file's status with `run_bun_test_file "$file" || status=$?` into a `local status` before use. The plan sketched `if ! run_bun_test_file ...; then failed+=("$file (exit $?)")`, where `$?` inside the `then` branch is the status of the `if` condition, not the test run; the captured-local form reports the real per-file exit code.
- Failures accumulate in a counter plus a newline-delimited string instead of a bash array: expanding `"${arr[@]}"` on an empty array — which is exactly what the summary-printing loop would do — fails with `arr[@]: unbound variable` under `set -u` in bash 3.2 (the default `/bin/bash` on macOS), and the gate runs `set -euo pipefail`. `BUN_TEST_FILES` is space-separated, so no path can contain a space.
- `scripts/lib/ci-run-tests.sh` reads `BUN_TEST_TIMEOUT_MS`/`BUN_TEST_MAX_CONCURRENCY`/`BUN_TEST_ISOLATE_FILES` through inline `${VAR:-default}` expansion rather than assigning defaults at source time, so sourcing stays side-effect free while `scripts/check-ci.sh` keeps its own default assignments unchanged.
- The guard resolves the library through `REPO_HARNESS_CI_RUN_TESTS_LIB` (default `scripts/lib/ci-run-tests.sh`) so the same assertions could be pointed at a verbatim copy of the pre-fix inlined functions to capture the RED artifact.
- The guard wraps the sourced call in `set -euo pipefail` because that is where the fail-fast came from; without it a plain `bash -c` would not reproduce the gate's behaviour and the pre-fix capture would be meaningless.

## Deviations From Plan Or Spec

- `scripts/check-ci.sh` is not a projected helper (`bun run check:helpers` reports the same 56 helpers before and after), so `assets/templates/helpers/` was left untouched as the plan allowed.
- The substantive-change digest only binds once the branch contains main's tip, because CI resolves the merge-base against the PR merge ref; locally `REPO_HARNESS_DIFF_BASE=origin/main` agrees with CI only while the branch point equals main's tip, so main had to be merged in before rebinding.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Aggregate in a bash array vs counter+string | counter+string | avoids the `set -u` empty-array error on bash 3.2 |
| Keep the loop inlined and test the whole gate vs extract a sourceable lib | extract the lib | the whole gate costs an install/typecheck/pack cycle; the lib makes the loop directly observable |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix RED capture: `.ai/harness/evidence/pre-fix/check-ci-isolate-aggregation.log`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
