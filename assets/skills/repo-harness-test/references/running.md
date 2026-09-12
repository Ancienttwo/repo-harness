# Running tests

Which coverage is sufficient is policy
(`docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards`).
This file records how to actually run and measure it here.

## Focused first

```bash
bun test tests/skill-surface/catalog.test.ts
bun test tests/skill-surface --timeout 60000
```

`bun test` accepts files and directories. `package.json`'s `test` script is
`bun test --timeout 60000`. Files may also use `setDefaultTimeout(ms)` or a
per-test timeout argument (see `references/authoring.md`); `bunfig.toml` defines
no timeout setting.

When timing a file locally, redirect instead of piping. A pipe swallows the
exit status, and a long silent pipe is what makes a background runner look
stalled:

```bash
bun test --timeout 180000 tests/sprint-claim-concurrency.test.ts > /tmp/rh.log 2>&1
echo "EXIT=$?"
```

## Selecting files the way CI does

`scripts/lib/ci-run-tests.sh` is the loop both `scripts/check-ci.sh` and the
workflow use. With `BUN_TEST_ISOLATE_FILES=1` it runs one `bun test` per file
and keeps going after a failure, then prints `[ci] failed test files (N):`.

- `BUN_TEST_FILES` is a space-separated explicit list (lines 165-173); no path
  may contain a space. Unset, it discovers sorted `*.test.ts` and `*.test.tsx` files under `tests/`.
- `BUN_TEST_JOBS` sets the bounded worker pool (151, 191). Each worker's log is
  replayed whole by the parent, so a file's `[ci] test <path>` header and its
  bun output stay contiguous.
- `BUN_TEST_TIMEOUT_MS` and `BUN_TEST_MAX_CONCURRENCY` feed the per-file
  `bun test` invocation (line 8).

## The three gate lanes

`scripts/check-ci.sh [all|governance|functional]` defaults to `all`. Hosted CI
invokes `governance` and `functional` as independent jobs; local and release
callers run `all`.

Only the `all` lane exports `REPO_HARNESS_TEST_EXPENSIVE=1` (line 73), which is
what unskips the real `npm pack`/install cases in
`tests/harness-benchmark-matrix.test.ts` and the real `herdr` review-session
cases in `tests/claude-review.test.ts`. So a green hosted `functional` run has
deliberately not exercised them; run `bash scripts/check-ci.sh` with no lane
argument before a release, and read the `[gate] ... unset` lines in any other
run as "not covered here" rather than "passed".

## Which CI lane a push or PR gets

`scripts/select-ci-coverage.ts#selectCoverage` picks one of three modes:

- `draft`: the PR is marked draft; testing is deferred until it is ready.
- `docs`: every changed path passes `isDocumentationPath` (lines 18-27).
- `full`: everything else, including any unclassified path, an invalid or
  unavailable diff, a checkout mismatch, and `workflow_dispatch`.

Replay the selector over recent history before claiming a lane split works:

```bash
bun scripts/replay-ci-coverage.ts --since 2026-08-01
```

It walks first-parent `origin/main` commits and prints, per commit, the mode,
the reason, and the paths that forced `full`, then a summary line with
`documentationHitRate`.

## Where the suite time actually goes

Pull per-file durations out of a finished run rather than guessing. The pool
prints `[ci] test <file>` before each file and bun closes with
`Ran N tests across 1 file. [<duration>]`:

```bash
gh run view <run-id> --log | awk '
/\[ci\] test tests\//{f=$0;sub(/^.*\[ci\] test /,"",f);next}
f&&/Ran [0-9]+ tests across 1 file\./{t=$0;sub(/^.*\[/,"",t);sub(/\].*$/,"",t);
m=t+0;if(t~/[0-9]s$/)m*=1000;printf "%9.0f ms  %s\n",m,f;f=""}' | sort -rn | head -20
```

## Do not re-run what is already proven

Evidence reuse follows the canonical policy and its subject/environment
checks. After a rebase, task-sync digest rebinding
(`references/verification-plan.md`) repairs the workflow binding; it does not
prove that the changed tree passed old tests. Preserve required PR and main-push
CI gates, and select any local delta verification from the actual change.
