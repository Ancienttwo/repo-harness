# Implementation Notes: closeout-runner-guardrails

> **Status**: Active
> **Plan**: plans/plan-20260716-0338-closeout-runner-guardrails.md
> **Contract**: tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md
> **Review**: tasks/reviews/20260716-0338-closeout-runner-guardrails.review.md
> **Last Updated**: 2026-07-16 06:17
> **Lifecycle**: notes

## Design Decisions

- Treat the inner 600-second verifier budget and outer helper budget as separate
  layers. The inner verifier remains unchanged; helper identity supplies a
  larger immutable envelope.
- `contract-worktree finish` is the sole sprint-verification owner. Ship does
  readiness checks and delegates finish, but never starts its own verifier.
- The expensive-run lock lives under the canonical Git common directory so all
  linked worktrees contend on one authority. It is not the ESA state-version
  lock and does not reuse repo-local lock placement.
- Move the existing state directory-token implementation into a neutral
  effects module and keep `state-lock.ts` as a single wrapper. This gives the
  release and state consumers one lock implementation without changing the
  established lock invariants.
- Keep the synchronous `runProcess`/`runHelper` API. A private launcher waits on
  fd 3 so target stdin semantics stay unchanged; the supervisor first publishes
  the launcher PGID, then releases that start barrier. The supervisor drains
  bounded output and owns normal target-group TERM/grace/KILL. If it stalls,
  the sync facade uses the already-published PGID for one final bounded cleanup.
- Let the supervisor acquire the expensive token and verify its exact caller
  PID before and after acquisition. Killing a synchronous facade, including
  while it waits for the lane, cannot orphan a live target or start delayed
  work after reparenting.
- Treat provider process-group absence, not provider-leader exit, as benchmark
  completion. Async signal cleanup is the sole release owner while terminating:
  it retains the PGID through TERM/grace/KILL and releases only after drain.

## Deviations From Plan Or Spec

- The first frozen subject was thawed after external review found that three
  benchmark lock tests used the real checkout lane, the supervisor lacked a
  hard outer backstop, and the shared lock wrapper had lost its final ownership
  barrier. A second bounded review then proved that killing a stalled
  supervisor alone orphaned its detached target group. The fix stayed within
  CRG-01: disposable Git fixtures, final `assertOwned()`, a launcher start
  barrier with early PGID publication, and parent-side fail-closed cleanup.
- The real Codex external acceptance pass (first run, subject
  `sha256:72eaf7bb...f57`) found 2 P1s the bounded internal review missed:
  1. `supervise()`'s `finally { expensiveLock?.release(); }` released the
     expensive-run lock unconditionally, including when `superviseTarget()`
     threw before its own TERM/grace/KILL cleanup (lines 304-319 at review
     time) ever ran -- e.g. a `collectBounded` stream `'error'`, or a
     non-ESRCH `signalProcessGroup` failure. Fixed by mirroring the exact
     `PRESERVE_EXPENSIVE_RUN_LOCK` pattern already reviewed and passing in
     `scripts/run-harness-profile-benchmark.ts`: a module-level
     `preserveExpensiveRunLock` flag, set only when an exception interrupts
     cleanup and a bounded best-effort SIGKILL+confirm sweep still cannot
     prove the group is gone; `supervise()`'s `finally` now releases only when
     that flag is clear. Existing 22 guardrail + 157 related process/lock/
     state tests stay green after the change (no dedicated fault-injection
     regression test was added for this exact exception path: the target
     functions are module-private, only reachable by spawning
     `process-supervisor.ts` as a real subprocess, and deterministically
     forcing a stream `'error'` or a non-ESRCH signal failure from outside
     that subprocess was judged higher-risk/slower to get right than the fix
     itself within this closeout's time budget -- left as a residual gap, not
     silently claimed as tested).
  2. Windows cleanup was fail-open: `signalProcessGroup`'s `taskkill` branch
     ignored the child result entirely, so a `spawnSync` failure (taskkill
     unreachable) was silently swallowed instead of surfaced. Fixed the
     narrow, verifiable part: a `spawnSync` `result.error` (the process could
     not even be launched) now throws, feeding the same
     `preserveExpensiveRunLock` path. Deliberately NOT changed:
     `processGroupExists`'s hardcoded `return false` on `win32`. That is not
     an oversight to patch blindly -- the normal-completion wait
     (`waitForProcessGroupQuiescence` inside `processGroupCompletion`) depends
     on `processGroupExists` resolving quickly once the leader exits, and
     Windows has no POSIX negative-PGID existence check to poll instead;
     making it "honest" (return true/unknown) without also redesigning the
     wait would deadlock every normal Windows completion, not just the
     exceptional path. A correct fix needs real Windows process-tree
     enumeration (e.g. leader-PID liveness at minimum, ideally descendant
     enumeration) verified on an actual Windows host, which is not available
     in this closeout's environment. This repo's own CI does not run this
     file's test suite on Windows either (`.github/workflows/ci.yml`'s `test`
     job, which runs `check:ci`/the guardrail tests, is `ubuntu-latest` only;
     the Windows leg of the separate `mcp-path-matrix` job covers unrelated
     MCP path-security tests). Left as an explicit, sharper-documented
     residual risk rather than an unverified platform-specific patch.
- A second real Codex external acceptance pass (round 2, subject
  `sha256:939d61aa...15`) found the round-1 Windows fix was ineffective, plus
  a new P1 in a file this closeout had already modified but not re-examined:
  1. `processGroupExists()` hardcodes `false` on `win32`, so the round-1
     exception-path confirmation sweep in `process-supervisor.ts` immediately
     treated the group as "confirmed absent" via that same hardcoded `false`
     -- `preserveExpensiveRunLock` never actually got set on Windows. Fixed
     this round by no longer trusting `processGroupExists()`'s result on
     Windows for the lock-preservation decision at all: once the exception
     sweep is reached, Windows unconditionally sets
     `preserveExpensiveRunLock = true` (skips the polling loop entirely --
     polling a check that can only ever say `false` provides no evidence).
     POSIX behavior is unchanged (still does the real bounded confirmation
     poll). This directly closes the gap Codex reported: the exception path
     can no longer be fooled into releasing the lock on Windows.
  2. `scripts/run-bounded-verifier-command.ts` (already in this contract's
     `allowed_paths` and already part of the original CRG-01 diff -- an
     earlier status report to the coordinator incorrectly called this file
     untouched/out-of-scope; corrected here) has an analogous gap:
     `waitForProcessGroupQuiescence()`'s loop condition was
     `!forcedTerminationSent && processGroupExists()`, but
     `forcedTerminationSent` is set `true` in the same synchronous callback
     that sends SIGKILL (`beginTermination()`'s 500ms escalation timer), so a
     forced (deadline or signal) termination stopped waiting the instant the
     signal was *sent*, never re-polling `processGroupExists()` to confirm it
     actually took effect. Because this wrapper spawns its own command
     `detached: true` (a nested process group separate from whatever
     supervises this wrapper itself), a surviving descendant here is
     invisible to any outer process-group check and could outlive this
     wrapper's own exit. Fixed by adding a real bounded re-poll: once
     `forcedTerminationSent` is true, the wait loop keeps polling
     `processGroupExists()` for up to `FORCED_TERMINATION_CONFIRM_MS` (500ms)
     past that point before giving up, instead of returning on the very next
     check. `terminate()`'s blanket error-swallowing catch was deliberately
     left unchanged: the new poll independently re-verifies via
     `processGroupExists()` regardless of what `terminate()`'s SIGKILL call
     itself threw or swallowed, so tightening that catch was not required for
     correctness, and doing so risked a worse regression (an uncaught throw
     inside a `setTimeout`/signal-handler callback could leave
     `forceTermination`'s promise permanently unresolved, hanging the whole
     script, given the very limited ability to verify signal-handler-level
     exception propagation without a live adversarial-descendant rig in this
     environment). Packaged mirror re-synced via
     `bun scripts/sync-helper-sources.ts --write`
     (`assets/templates/helpers/run-bounded-verifier-command.ts` now
     byte-identical again). Neither this file's Windows limitation (same
     `processGroupExists()` hardcoded-`false` characteristic) was touched
     this round -- out of the scope the coordinator asked for this file, and
     the file was not the subject of the Windows-specific finding.
  22 guardrail + 157 related process/lock/state tests, full suite (1614/1/0),
  and typecheck all stay green after both round-3 fixes.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Raise the global timeout | Reject | Makes ordinary helpers less bounded and does not fix duplicate work or descendants |
| Cache ship's first verifier result | Reject | Preserves two verification owners and creates freshness authority |
| One closeout owner plus fixed envelopes | Use | Removes duplicate authority and matches the legal inner budget |
| Policy-configurable timeouts | Reject | Lets repositories silently weaken the hard lifecycle bound |
| Flat lock file | Reject | Pathname unlink cannot conditionally prove token ownership across contenders |
| Git common-dir directory token | Use | Linked worktrees share one root and exact-token unlink fails closed |

## Residual Risks

- POSIX negative-PGID cleanup has a small process-group reuse window between
  TERM and KILL; removing it would require native pidfd-style support outside
  this package. Windows has no equivalent negative-PGID primitive: `taskkill
  /T` is sent, but `processGroupExists` cannot independently confirm the tree
  actually terminated on that platform (`processGroupExists` returns `false`
  unconditionally for `win32`, since there is no cheap existence probe to
  substitute; `run-harness-profile-benchmark.ts`'s equivalent checks only the
  leader PID, not descendants). As of round 3, `process-supervisor.ts`'s
  exception-path lock-preservation decision no longer trusts that
  unverifiable `false` on Windows: it unconditionally preserves the
  expensive-run lock (fails closed, requiring manual recovery) whenever that
  path is reached on `win32`, rather than risking a live group being treated
  as drained. The underlying inability to positively confirm Windows
  tree-termination is still real and still undetected by this repo's CI
  (`.github/workflows/ci.yml`'s `test` job, which runs the guardrail tests,
  is `ubuntu-latest` only) -- what changed is that this package now fails
  *safe* (over-preserves the lock, costing an occasional manual recovery)
  instead of *open* (silently releasing onto a possibly-live group) when it
  cannot verify. A full fix (real Windows process-tree enumeration) still
  needs validation on an actual Windows host, not available in this
  closeout's environment.
- `scripts/run-bounded-verifier-command.ts` has the same unverifiable-`false`
  characteristic on Windows in its own `processGroupExists()` (unchanged this
  round; not part of the scope given for this file). Its POSIX confirmation
  gap (forced termination not re-polled) is fixed -- see Deviations above.
- A lock token whose PID has been reused, or an empty pre-token directory, stays
  fail-closed and may require operator cleanup after verifying no live owner.
- Direct `bash scripts/<helper>.sh` execution bypasses canonical helper timeout
  and outer lock policy. Packaged Bash is internal/test plumbing; the supported
  entrypoint is `repo-harness run <helper>`.
- The existing benchmark subject-input list does not expand in CRG-01. Subject
  fingerprint redesign belongs to the later evidence package; this slice does
  not claim new 3x9 evidence.
- Benchmark setup and grading still contain synchronous `spawnSync` phases. A
  PID-only signal is queued until the current subprocess returns; if the owner
  instead dies abnormally, the expensive token is deliberately non-reclaimable
  and requires operator recovery after confirming no benchmark work survives.
  This is bounded cancellation latency/manual recovery, not a mutual-exclusion
  opening, and a broader provider-supervisor registry is outside CRG-01.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix sentinel: `.ai/harness/runs/closeout-runner-guardrails/pre-fix.log`
- Focused fix round after the provider-group correction: 23
  guardrail/verifier tests, 32 state-effect/concurrency tests, and 29
  benchmark/process-runner tests passed (84 total). The new leaderless-provider
  regression first reproduced early contender entry, then passed after
  PGID-drain ownership was fixed.
- Pre-thaw release gate: `bun run check:release` passed once with
  1610 tests passing, 1 platform skip, 0 failures; type, state boundaries,
  hook/helper parity, deploy SQL, architecture, task/workflow strict checks,
  repository inspection, adoption dry-run, package dry-run, and tarball install
  smoke all passed. That evidence belongs to the retired subject and is not
  claimed as final evidence for the current thaw. No 3x9 benchmark was run.
- Current thaw focused evidence: 57 related process/lock/state tests passed,
  including disposable benchmark-lock fixtures, lock-wait timeout
  classification, inherited stdio preservation, stalled-supervisor parent
  cleanup, and final lock ownership revalidation; type/helper checks passed.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
