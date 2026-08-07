> **Archived**: 2026-08-08 02:49
> **Related Plan**: plans/archive/plan-20260808-0054-init-command-env-basedrop.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260808-0249

# Implementation Notes: init-command-env-basedrop

> **Status**: Active
> **Plan**: plans/plan-20260808-0054-init-command-env-basedrop.md
> **Contract**: tasks/contracts/20260808-0054-init-command-env-basedrop.contract.md
> **Review**: tasks/reviews/20260808-0054-init-command-env-basedrop.review.md
> **Last Updated**: 2026-08-08 00:55
> **Lifecycle**: notes

## Design Decisions

- The defect is not on the spawn path. `runProcess`/`runBoundedProcess`
  (`src/effects/process-runner.ts:136,232`) re-merge `process.env` unless
  `inheritEnv === false`, so a child process still sees PATH/HOME. The base drop
  bites where `commandEnv` is consumed as an *environment record*:
  `runInit` -> `runAdoptionApply({env: commandEnv})`
  (`src/cli/commands/adoption-plan.ts:151`) -> `registerRepoHarnessRepo` ->
  `repoHarnessHome(env)` (`src/effects/repo-registry.ts:60`), which resolves
  `env.REPO_HARNESS_HOME ?? env.HOME ?? homedir()`. With a one-key record both
  levers are absent and the registry write lands on the OS account home. That is
  the observable that the regression guard asserts on.
- Measured, not assumed: Bun caches `os.homedir()` at process start, so mutating
  `process.env.HOME` inside a test does **not** redirect the `homedir()`
  fallback (probe: `HOME=/tmp/probe-a bun -e '... process.env.HOME="/tmp/probe-b"'`
  returns `/tmp/probe-a` both times). Consequence: the RED run of the guard wrote
  a temp-path entry into the operator's real `~/.repo-harness/registered-repos.json`
  — a live reproduction of the leak this contract exists to close. The entry was
  removed after the artifact capture; the GREEN run leaves zero entries. The
  guard therefore keys on `REPO_HARNESS_HOME` (the lever that is actually
  threaded), not on a relocated `HOME`.
- Falsifier cleared: `initCommandEnv` has exactly one caller
  (`src/cli/commands/init.ts:573`). Its guard clauses return the caller env
  untouched for non-npx sources and for an env that already carries the flag, and
  `{...env, FLAG}` is unchanged when the caller passes an env, so only the
  `env === undefined` npx branch changes shape. No caller depends on a sanitized
  minimal environment.

## Deviations From Plan Or Spec

- Class sweep verdicts (anti-pattern 19). Fixed, same file and same
  `commandEnv` blast radius:
  - `src/cli/commands/init.ts:197` `initCommandEnv` — the contracted root cause.
  - `src/cli/commands/init.ts:588` `commandEnv = {...(commandEnv ?? {}), REPO_HARNESS_BRAIN_ROOT}`
    — live defect of the same class on the non-npx path: `--brain-root` with no
    caller env manufactured a one-key record and threaded it into the same
    registry write.
  - `src/cli/commands/init.ts:771` `verifyEnv` — same shape; inert today (only
    reaches `runProcess`, which re-merges), fixed as one word to stop the shape
    from propagating.
- Reported, deliberately not changed: `src/cli/commands/global-runtime.ts:124`
  (`bindBunRuntimeEnv`) and `:272` (`commandEnv`) form the same base-dropping
  shape on the `repo-harness setup global` surface, and there it is
  *unconditional* — `bindBunRuntimeEnv` always returns a constructed record, so
  with no caller env the downstream sees `{PATH}` alone. One consumer does read a
  key without a `process.env` fallback: `readInstalledProfile(env)` ->
  `installProfileStatePath` (`src/cli/installer/install-profile.ts:503`,
  `env.HOME ?? homedir()`). It does not currently produce wrong behavior because
  in production `homedir()` equals the process-start `HOME`, and every other
  consumer either re-merges at spawn or falls back per key. Left alone because
  the fix flips whether `commandEnv` may return `undefined` on a command surface
  outside this contract's Scope line, and the contract's Goal permits "fixed or
  reported".
- Seventh member of the timeout-sweep class, not of the env class:
  `tests/continuation-conformance.test.ts:775` (the chat-memoryless driver case)
  carried the sweep's uniform 30s positional budget but measures 41s under full
  suite load and 62s in isolation on a loaded machine (load ~17, real concurrent
  sessions), so the budget was under water regardless of this slice. Raised to
  `90_000` (measured 62s plus headroom), the same shape as the sweep's earlier
  factor-factory 15s -> 45s adjustment. Proven independent of this contract's
  change: the case fails identically with `src/cli/commands/init.ts` stashed
  (baseline `2 pass / 1 fail / 61.29s`), and the file imports no init surface.
- Not this class, checked and skipped: `src/cli/commands/init-hook.ts:701`
  (`doctorEnv` is only handed to `withProcessEnv`, an overlay onto `process.env`,
  where extra keys are never deleted, so a thin record is inert);
  `src/effects/process-runner.ts:136,232`, `src/cli/commands/init-hook.ts:563`,
  `src/cli/runtime/helper-runner.ts:359` (all already `{...process.env, ...}`);
  every remaining `?? {}` hit in `src/` is a config/record default, not an
  environment base.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Guard via a spawned child's observed env | Rejected | `runProcess` re-merges `process.env`, so the child sees the marker with or without the fix — the assertion could not go RED |
| Guard via relocated `HOME` + `homedir()` fallback | Rejected | Bun caches `os.homedir()`; the unfixed path would write to the operator's real home instead of the fixture, which is a leak, not a test |
| Guard via `REPO_HARNESS_HOME` + registry write target | Chosen | The only lever actually threaded through `commandEnv` into `repoHarnessHome`, and it is the exact production symptom in the contract's repro field |
| Also fix `global-runtime.ts` base drops | Deferred | Same shape, no demonstrated user-visible defect, and the fix changes that function's `undefined` return contract on a surface outside Scope |

## Open Questions

- Whether `commandEnv` in `src/cli/commands/global-runtime.ts:272` should keep
  returning `undefined` at all, or always return a `process.env`-based record.
  Answering it is the bounded next slice for the `setup global` surface.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
