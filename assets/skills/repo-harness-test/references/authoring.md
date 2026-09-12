# Authoring a test

Policy (when a case is admitted at all, and which layer owns it) lives in
`docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards`.
This file only records the mechanics that are specific to this repository.

## One owner per subject

Find the existing tests for the boundary before adding another file.
`tests/helper-scripts.test.ts` was split into script-owned suites in PR #420;
distinct unit and composition tests can still cover the same subject when
they protect different failures, as the canonical policy describes. Name files
for their behavior or boundary; keep issue numbers in provenance.
`tests/unit/issue-282-*` is five files (`-contention`, `-core`, `-e2e`,
`-prd-drift`, `-store`) whose names say nothing about what each one proves.

## Use the shared repository fixture

`tests/helpers/repo-fixture.ts` owns the temporary workspace, subprocess, and
git-setup lifecycle. Compare its semantics with the case before adding another
wrapper; specialized domain builders remain with their owning tests.

- `tmpWorkspace(prefix)` (32), `tmpWorkspaceIn(parent, prefix)` (36): a
  realpath-resolved temporary directory.
- `run(cmd, args, cwd, env)` (128) returns `spawnSync`'s result unmodified, with
  an explicit cwd, a sanitized environment (`sandboxEnv`, 122, strips the five
  `REPO_HARNESS_*` source-root variables), and a private HOME per cwd. It adds
  no process timeout: the test-level deadline stays authoritative.
- `initGitRepo(cwd)` (132), `commitAll(cwd, message)` (138).
- `withTempRepo(prefix, fn)` (144) cleans up on success and on a thrown
  assertion. `bunfig.toml`'s `preload = ["./tests/preload-home-isolation.ts"]`
  doubles the environment isolation.

## Expensive fixtures: template, restore in place

For a fixture whose construction dominates the file's runtime, build it once
per distinct argument list with `fixtureTemplate` (repo-fixture.ts:72-120) and
let every later case materialize a pristine copy.

`fixtureTemplate` restores the snapshot into the directories the fixture
already owns; it never copies to a fresh path. That is a hard requirement, not
a style choice: `repoHarnessRepoIdFor` (`src/effects/repo-registry.ts:105-107`)
hashes the repository root path verbatim, so a sealed authorization, registry
entry, campaign intent, or publication recorded inside a fixture is bound to
that exact path and is invalid anywhere else. Build the template once per file
and call `dispose()` when the file is done.

Worked examples: PR #421 (historical campaign fixture), #423 (collaboration
delegation fixture), #426 (auto-campaign skill fixture).

## In-process CLI cases with a proven completion signal

`runCliInProcess(args, cwd, env)` (`tests/helpers/cli-in-process.ts:57`) drives
`buildProgram()` and captures `status`/`stdout`/`stderr`. It temporarily replaces
process-global environment, cwd, output and exit handlers, then restores them.
Its completion barrier is specific to the tested `chatgpt` actions: their first
stdout write or recorded exit is terminal (helper lines 49-54, 80, 117).
A command with intermediate stdout could finish too early; a successful command
with only stderr or no output can wait for the 170-second settle deadline.
Before reusing it elsewhere, prove that command's completion semantics.

PR #424 converted 77 spawned calls in `tests/chatgpt-browser.test.ts` and kept
one real child for `Bun.which`: it resolves the process-start PATH, so a runtime
`process.env.PATH` write cannot represent that case. Signals, stdin, and exits
observed by a parent also need their actual process boundary.

## Gate real installs and real external programs

Existing opt-in cases use explicit environment gates for dependencies absent
from ordinary runs. For example, the container suites select cases with:

```ts
const gated = test.skipIf(!process.env.BRC_TEST_CONTAINER_IMAGE);
```

`REPO_HARNESS_TEST_EXPENSIVE` is the release-lane gate for real `npm pack`,
real install, and real `herdr` cases. `scripts/check-ci.sh:73` is its single
naming authority -- the `all` lane exports it, `functional` and `governance`
deliberately do not, and `tests/expensive-test-gate.test.ts` reads the exported
name back out of that script so a rename cannot strand a gated file. Declared
in `tests/harness-benchmark-matrix.test.ts:47-49` and
`tests/claude-review.test.ts:22-24`; release contract in
`docs/reference-configs/release-deploy.md:16`.

Narrower gates exist for their own dependency: `BRC_TEST_CONTAINER_IMAGE` for
Docker-backed cases (`tests/effects/campaign-container-live.test.ts:7`,
`tests/effects/brc10-lifecycle.test.ts:283`) and
`REPO_HARNESS_WINDOWS_PROTECTED_HELPER_SMOKE` for the platform smoke
(`tests/cli/windows-protected-helper-runtime-smoke.test.ts:14`). The expensive
suites print a skip line when the variable is unset so their missing coverage is visible.

## Carry an injected clock all the way down

A function that accepts an injected clock must hand that clock to every
downstream that reads time -- fetchers, deadline arithmetic, receipt
timestamps. Resolving `input.now` at the top and then letting a callee fall
back to `Date.now()` puts a fixture clock and real wall time on the same
observation, and the test only fails when the host is slow enough for the two
to disagree.

A serial pass can miss this race. `BUN_TEST_JOBS=4` (PR #425) loaded the
runner enough to expose two instances of the same defect back to back.

- `observeIssueBatch` (`src/effects/automation/issue-batch-observer.ts:136`)
  resolved `now` but called `fetchGithubIssues` without it, so a slow host
  tripped `deadline_ms` before the receipts were written. Fixed in the same PR
  that added the pool; the call now passes `() => now().getTime()` (line 151).
- `refreshExternalSource` (`src/effects/external-sources/refresh.ts:64`) had the
  identical gap against the same fetcher, fixed separately in PR #427 (line 78).

Assert on the injected clock's values, not on a tolerance window: a test that
needs a tolerance is usually reporting that some callee still reads real time.

## Timeouts and concurrency

`bunfig.toml` defines no timeout setting. Existing tests use CLI `--timeout`,
`setDefaultTimeout(ms)` at file scope, and the per-test third argument; choose
the applicable existing mechanism for the selected test.

CI runs every selected file in its own process (`BUN_TEST_ISOLATE_FILES=1`)
through a bounded pool (`BUN_TEST_JOBS=4`) with `BUN_TEST_MAX_CONCURRENCY=1`
(`.github/workflows/ci.yml:92-95`). Cross-file state is therefore never
shared, and `test.concurrent` buys nothing there. Do not enable concurrency on
tests sharing process-global state or one checkout.
