# Authoring a test

Policy (when a case is admitted at all, and which layer owns it) lives in
`docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards`.
This file only records the mechanics that are specific to this repository.

## One owner per subject

A script or module is exercised in one place: find the existing owner and
extend it, because a second file driving the same subject with a different
fixture is how two oracles start disagreeing. Name a file for the behavior or
boundary it owns; issue numbers, dates, and PR numbers belong in provenance.
`tests/unit/issue-282-*` is five files (`-contention`, `-core`, `-e2e`,
`-prd-drift`, `-store`) whose names say nothing about what each one proves.

## Use the shared repository fixture

`tests/helpers/repo-fixture.ts` owns the temporary workspace, subprocess, and
git-setup lifecycle. Do not hand-roll another `mkdtemp` or `spawnSync` wrapper.

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

## CLI cases run in process by default

`runCliInProcess(args, cwd, env)` (`tests/helpers/cli-in-process.ts:57`) drives
`buildProgram()` inside the test process and returns the `status`/`stdout`/
`stderr` shape CLI tests already assert on. It replaces `process.env` and
`process.cwd()` in place and restores them, converts commander's own exits to
thrown `CommanderError`s, and records a command body's own `process.exit`.

Spawn a real child only when the case actually needs the process boundary:

- `Bun.which` resolves against the environment the process started with, so a
  PATH-resolved assertion cannot observe a runtime `process.env.PATH` write.
- signals, stdin, or a real exit code as observed by a parent process.

PR #424 converted 77 spawned calls in one file and kept exactly one real child
for the `Bun.which` case.

## Gate real installs and real external programs

A case that runs a real package install, a real external binary, or a
container must be gated on an environment variable and skipped otherwise, so
the default local and hosted runs stay cheap and green:

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
(`tests/cli/windows-protected-helper-runtime-smoke.test.ts:14`). Print one skip
line when the variable is unset so a skipped case is visible, not silent.

## Carry an injected clock all the way down

A function that accepts an injected clock must hand that clock to every
downstream that reads time -- fetchers, deadline arithmetic, receipt
timestamps. Resolving `input.now` at the top and then letting a callee fall
back to `Date.now()` puts a fixture clock and real wall time on the same
observation, and the test only fails when the host is slow enough for the two
to disagree.

The race is invisible under a serial suite and is what the bounded CI job pool
surfaces: `BUN_TEST_JOBS=4` (PR #425) loaded the runner enough to expose two
instances of the same defect back to back.

- `observeIssueBatch` (`src/effects/automation/issue-batch-observer.ts:136`)
  resolved `now` but called `fetchGithubIssues` without it, so a slow host
  tripped `deadline_ms` before the receipts were written. Fixed in the same PR
  that added the pool; the call now passes `() => now().getTime()` (line 151).
- `refreshExternalSource` (`src/effects/external-sources/refresh.ts:64`) had the
  identical gap against the same fetcher, fixed separately in PR #427 (line 73).

Assert on the injected clock's values, not on a tolerance window: a test that
needs a tolerance is usually reporting that some callee still reads real time.

## Timeouts and concurrency

Give each file its own budget. `bunfig.toml` has no timeout key and Bun ignores
one; the only mechanisms are the CLI `--timeout`, `setDefaultTimeout(ms)` at
the top of the file (63 call sites across `tests/`), and the per-test third
argument.

CI runs every selected file in its own process (`BUN_TEST_ISOLATE_FILES=1`)
through a bounded pool (`BUN_TEST_JOBS=4`) with `BUN_TEST_MAX_CONCURRENCY=1`
(`.github/workflows/ci.yml:92-95`). Cross-file state is therefore never
shared, and `test.concurrent` buys nothing there. Do not enable concurrency on
tests sharing process-global state or one checkout.
