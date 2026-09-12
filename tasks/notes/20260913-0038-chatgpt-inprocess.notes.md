# Implementation Notes: chatgpt-inprocess

> **Status**: Active
> **Plan**: plans/plan-20260913-0038-chatgpt-inprocess.md
> **Contract**: tasks/contracts/20260913-0038-chatgpt-inprocess.contract.md
> **Review**: tasks/reviews/20260913-0038-chatgpt-inprocess.review.md
> **Last Updated**: 2026-09-13 00:38
> **Lifecycle**: notes

## Design Decisions

- The runner calls `buildProgram()` and applies `exitOverride()` to the whole command
  tree, so commander's own exits (`--help`, unknown option, missing required option)
  arrive as thrown `CommanderError`s after the text has been written.
- A command body's own `process.exit` is recorded instead of thrown. Throwing would leave
  an unhandled rejection, because every `chatgpt` action discards the work promise
  (`void runChatgptAction(...)`), and Bun's test runner fails a test on an unhandled
  rejection even when a `process.on('unhandledRejection')` listener consumes it. The only
  `process.exit` this command group reaches is the last statement of `runChatgptAction`'s
  error funnel, so recording and returning ends the action exactly where exiting did.
- The same discarded promise means commander resolves `parseAsync` before an action
  finishes, so the runner needs an explicit completion barrier. Each of the ten `chatgpt`
  actions ends by writing its result to stdout or by reaching that error exit, and nothing
  under `src/cli/chatgpt-browser/` writes to stdout, so the first stdout write or the
  recorded exit is the terminal step. Both run synchronously to the end of the action, so
  when the runner observes one, the action's remaining work has already run.
- `process.env` is replaced in place (including deletions) rather than passed as an
  argument: `oracle-provider.buildOracleEnv` and `secret-scan.scannerEnv` build their
  child environments from a `process.env` snapshot, and Bun 1.4.0 propagates runtime
  `process.env` mutation and deletion to bare `spawnSync` children, so the fake oracle and
  fake Gitleaks binaries observe exactly the variables a test sets. `process.cwd()` is
  changed and restored for `resolveRepoRoot`, which resolves relative paths against it.

## Deviations From Plan Or Spec

- One call site keeps a real child process: the `pathDoctor` doctor run inside `oracle
  rejects unsupported versions uniformly before consultation side effects`. It asserts
  `oracle.resolvedFrom === 'PATH'`, and the resolver uses `Bun.which('oracle')`, which
  resolves against the environment the process started with rather than a runtime
  `process.env.PATH` assignment. In-process the test resolved the machine's real
  `~/.bun/bin/oracle` instead of the fixture binary. `runChatgptSpawnedForPath` covers that
  one call; the other four CLI calls in the same test run in-process. Nothing else in the
  file depends on signals, stdin, `process.execPath`, or a real exit path.
- No test kept spawning for timing reasons. `oracle timeout kills its POSIX process group
  and cleans staged egress` asserts a wall-clock bound of 8 s; back-to-back A/B runs of the
  pre-change file and this one measured 7.05 s / 6.61 s and 6.98 s / 7.12 s, so the bound
  behaves the same either way. It does fail under heavy parallel machine load, which it
  also did before this change.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Throw a sentinel from the patched `process.exit` | Rejected | The action's discarded promise turns it into an unhandled rejection, which fails the test in Bun. |
| Detect completion by event-loop quiescence | Rejected | Bun returns an empty `process.getActiveResourcesInfo()` even with a live child process and a pending timer, and `async_hooks` promise tracking is a no-op. |
| Spawn a smaller test-only CLI entry instead of going in-process | Rejected | It keeps a process per call and stops covering how `src/cli/index.ts` wires the command group. |
| Fix `Bun.which` to read `process.env.PATH` | Rejected | That is a `src/` change made to suit a test; the one affected call site keeps a real child process instead. |

## Open Questions

- None.

## Measurements

| Run | Wall | CPU (user + sys) |
|-----|------|------------------|
| Before, `tests/cli/chatgpt-browser.test.ts` | 58.36 s | 40.27 s |
| After, same file | 39.54 s | 9.23 s |

77 CLI invocations became 76 in-process calls plus one retained child process. Measured in
isolation, 20 `spawnSync` CLI calls cost 4054 ms against 38 ms for 20 in-process calls after
a one-time 166 ms module import. Both suite numbers were taken while a parallel session was
running its own test load, so the wall-clock figures are noisy; the CPU drop is not.
Zero test loss: the JUnit `testcase name` multiset is identical at 55 entries, with 553
`expect()` calls before and after.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
