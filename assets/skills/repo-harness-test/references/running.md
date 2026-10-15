# Running tests

Which coverage is sufficient is policy
(`docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards`).
This file records how to actually run and measure it here.

## Focused first

```bash
bun run test:files tests/skill-surface/catalog.test.ts --timeout 60000 --max-concurrency 1
```

Use the isolated launcher. Direct `bun test` can fail the HOME/cache startup guard.
`test:files` accepts explicit file paths. Keep the timeout and concurrency visible.
Files may also set a per-test timeout (see `references/authoring.md`).

When timing a file locally, redirect instead of piping. A pipe swallows the
exit status, and a long silent pipe is what makes a background runner look
stalled:

```bash
bun run test:files tests/sprint-claim-concurrency.test.ts --timeout 180000 --max-concurrency 1 > /tmp/rh.log 2>&1
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

## The gate lanes

`scripts/check-ci.sh [affected|all|governance|functional|architecture]` defaults to `affected`.
PR checks select affected tests. Daily CI selects `governance`, `architecture`
and `functional` as separate jobs. The release gate selects `all`, which runs
all three.

The `architecture` lane runs `repo-harness architecture-projection check --json`
and fails when the status is not `noop`. When `ARCHITECTURE_SUMMARY` names a
file, the lane writes the JSON summary there. The daily report puts it in the
repair issue. `architecture-advisory --base <ref>` is the PR lane. It runs
`repo-harness state owed --json --base <ref>`. When a capability is owed, it runs
the check and prints `::warning::` lines. It always exits 0, and its job is not
part of `Required / CI`.

Only the `all` lane exports `REPO_HARNESS_TEST_EXPENSIVE=1`, which is
what unskips the real `npm pack`/install cases in
`tests/harness-benchmark-matrix.test.ts`. Generic review domain fixtures are
zero-model, with existing task-agent lifecycle coverage. A green hosted `functional` run has
deliberately not exercised them; run `bash scripts/check-ci.sh all`
before a release, and read the `[gate] ... unset` lines in any other
run as "not covered here" rather than "passed".

## Which CI lane a push or PR gets

`scripts/select-ci-coverage.ts#selectCoverage` picks the mode:

- `affected`: a pull request. CI runs typecheck and the affected test files.
  Three `verify` shards split the files by recorded duration
  (`CI_SHARD=<index>/<total>`). Shard 0 also runs typecheck.
- `report`: a push to `main`. CI records the result and runs no tests.
- `daily`: the schedule or `workflow_dispatch` on `main`. CI runs the full
  suite and the native matrices.

An invalid or unavailable diff, or a checkout mismatch, fails selection.

`selectAffectedTests` follows imports and AST path values for code paths.
Exact file references propagate. Directory reads select direct consumers only.
Directory execution propagates through imports. Product paths must be anchored
to the module checkout; `process.cwd()` in product code names the target repo.
Old changed-file sources retain removed imports. A deleted closure needs evidence
of a deleted test before it can be retired without a live test.
Dependency manifests select every test. They do not hide other unknown paths.
Daily script exceptions come from commands in `check-ci.sh`, not a skip list.
They report deferred coverage; a PR consumer test does not prove daily execution.
An unknown path without a consumer fails selection. A path that passes
`isDocumentationPath` selects only the tests that
`scripts/ci-documentation-consumers.ts` finds. Platform jobs have separate outputs: `home_isolation` and `native_oar`.
The HOME matrix uses its workflow test imports and the configured test preloads.
The macOS native OAR job uses the full local import closure of its workflow
tests (tests, src and scripts), configured preloads, shell scripts, and the OAR host bundle inputs. Selection builds the
hosts with the package scripts and reads their metafiles. CI implementation
changes trigger both jobs. A job skips only when its output is `false`.
Required / CI accepts a skip only with that exact output. Daily runs both jobs.
Documentation paths select scanned consumers and usually skip both platform jobs.

Replay the selector over recent history before claiming a lane split works:

```bash
bun scripts/replay-ci-coverage.ts --commits 120 --ref <main-sha> --baseline <old-selector-sha>
```

Fetch enough history first. The baseline must export a self-contained selector.
Each row uses that commit's source tree and its parent's changed-file sources.
Documentation consumers also come from that commit. Historical source is parsed,
not executed. Rows report selected tests, unknown paths, deferred daily inputs,
retired closures and tests removed from the baseline selection.
The summary records immutable revisions and the code-commit median.
A completed replay is not acceptance: require median at most 200, no unknown
paths, and a reviewed removed-edge reason for every dropped test. A
`requires-review` classification blocks acceptance.

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
