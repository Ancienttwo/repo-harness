# Implementation Notes: lsc-05-stable-state-version-allocation

> **Status**: Active
> **Plan**: plans/plan-20260718-2119-lsc-05-stable-state-version-allocation.md
> **Contract**: tasks/contracts/20260718-2119-lsc-05-stable-state-version-allocation.contract.md
> **Review**: tasks/reviews/20260718-2119-lsc-05-stable-state-version-allocation.review.md
> **Last Updated**: 2026-07-18 21:19
> **Lifecycle**: notes

## Design Decisions

- **Pre-existing acceptance (base `42b77aa0`, already pinned by tests, untouched by this
  package).** Most of the row-5 acceptance line already held before this work started:
  - Version allocation happens strictly after the stability loop:
    `resolveEffectiveState` (`src/effects/state/resolve-effective-state.ts:557-...`, now
    inside `resolveAndCommitEffectiveState`) calls `resolveStableEffectiveState` and only
    then `commitStateVersionAfter`.
  - Failed cache/owner transactions consume no observable version: the four fault-path
    tests in `tests/state/state-effects.test.ts:218-264` (`cache-temp`, `cache-publish`,
    `owner-temp`, `owner-publish`) assert byte-identical owner/cache, zero temp files, and
    the next success consumes exactly `first.state_version + 1`.
  - Continuous source mutation exhausts the stability loop with no version-owner file ever
    created: `tests/state/state-concurrency.test.ts:388-455` ("continuous
    capability-registry mutation overlaps resolution and fails without a partial cache").
  These three guarantees are unmodified by this package and re-verified green (see
  Evidence Links below) with all four literal-`state_version:1` fixtures and the frozen
  `loop-semantics-characterization.test.ts` passing byte-for-byte.

- **The remaining gap this package closes.** Nothing previously re-checked the source
  snapshot between `resolveStableEffectiveState`'s final confirming read (executed
  *before* the version lock is even acquired) and `commitStateVersionAfter` consuming
  `confirmed.state_revision` inside that lock. The state lock
  (`.ai/harness/state/effective.lock`) only serializes concurrent *resolvers*; it never
  stops an external writer from touching `plans/`, `tasks/contracts/`, `.ai/harness/policy.json`,
  etc. in that window. A mutation landing there got a version allocated (or, worse, silently
  *reused* via the same-revision fast path) against an already-stale revision, with no error
  and no signal.

- **Falsifier run against unmodified base `42b77aa0` (captured before any production edit).**
  Wrote the deterministic confirm-window test first
  (`tests/state/state-concurrency.test.ts`, "a source mutation exactly inside the
  version-allocation window is caught, retried once, and resolves against the new content
  with no version gap") plus the exhaustion variant, both written in terms of the
  POST-FIX contract (bounded retry succeeds against new content / exhausts to the existing
  error). Both use a real OS-level synchronization technique, not a timing guess: pre-hold
  the *version* lock (the exact lock path `commitStateVersionAfter` already acquires) with
  a live-pid owner file before calling `resolveEffectiveState`, so the main thread's call
  blocks *after* its stability loop already captured a confirmed snapshot but *before*
  `commitStateVersionAfter`'s critical section can run. A detached `sh` process then
  mutates `PLAN` and only afterwards releases the lock, landing the mutation inside the
  confirm-to-commit window on every run (this is the same empty-directory
  fail-closed mechanic already exercised by the existing "a delayed live creator in the
  aged empty pre-token window cannot overlap a contender" test, so no new locking
  behavior is being relied on -- only real, already-shipped semantics).

  Run against unmodified base (`bun test tests/state/state-concurrency.test.ts -t
  "confirm-window|version-allocation window|confirm-window check exhausts"`), both new
  tests failed, demonstrating the bug directly:
  ```
  (fail) ... a source mutation exactly inside the version-allocation window is caught,
  retried once, and resolves against the new content with no version gap [531.11ms]
    expect(result.state_version).toBe(first.state_version + 1);
    Expected: 2
    Received: 1
  ```
  Base did not merely commit a *new* version against stale content -- it silently
  reused the *same* version number (1) via the existing "same-revision reconstruction"
  fast path, because the pre-mutation snapshot it captured happened to match what was
  already on disk in the owner file. The mutation that landed a moment later, before the
  cache was ever published, was never observed at all: the published cache and returned
  state both carried the stale (pre-mutation) `source_hashes`/`state_revision` while the
  live file had already changed. This is the exact silent-staleness defect described in
  the contract's Why section, reproduced deterministically.
  ```
  (fail) ... a source mutation on every confirm-window check exhausts the bounded retry
  and leaves no version owner [552.26ms]
    expect(() => resolveEffectiveState(...)).toThrow('workflow authority changed
    repeatedly while resolving effective state');
    Received function did not throw
    Received value: { ..., state_version: 1, state_revision: "sha256:f12d15fb...", ... }
  ```
  Base has no retry/exhaustion concept at all for this window, so it returned a fully
  successful (but stale) state instead of failing closed. Full captured run output:
  `/private/tmp/claude-501/-Users-kito-Projects-repo-harness/af6e8101-ba11-42e5-938a-a72bd2089553/scratchpad/lsc05-falsifier-base-output.txt`
  (session-local; not part of the repo).

- **What the seam adds.** `commitStateVersionAfter`
  (`src/effects/state/git-state-version-store.ts`) gains an optional 5th parameter
  `confirmSnapshot?: () => boolean`, evaluated as the *first* statement inside the version
  lock's critical section -- before `readVersionRecord`, before the candidate `version` is
  computed, before `publishCache` is ever invoked. A `false` result throws the new
  `StateVersionConfirmMismatchError` (exported so `resolve-effective-state.ts` can
  recognize it by type; it is internal plumbing between these two sibling files and never
  reaches a caller of `resolveEffectiveState` on its own -- no new error vocabulary on the
  public surface). Because the throw happens before the existing try/block that wraps
  `publishCache`, the four existing fault paths' guarantees hold identically for this new
  failure mode: no owner read/write beyond the initial check, no `publishCache` call, no
  temp files.

  `resolveEffectiveState` now runs through a new private helper,
  `resolveAndCommitEffectiveState`, which performs one full stable-resolve + commit
  attempt and passes a `confirmSnapshot` closure that calls `resolveEffectiveStateUnlocked`
  once more (a single fresh read, not another stability loop) and compares
  `JSON.stringify(recheck.source_hashes)` against the attempt's own
  `confirmed.source_hashes`. `resolveEffectiveState` itself catches
  `StateVersionConfirmMismatchError` and retries the *entire* helper call exactly once;
  a second mismatch throws the pre-existing `'workflow authority changed repeatedly while
  resolving effective state'` error (byte-identical message, reused verbatim -- the same
  string `resolveStableEffectiveState`'s own internal 3-attempt loop already throws for a
  different reason). Any other error (including the four fault-path errors) propagates
  immediately without retry, since only `StateVersionConfirmMismatchError` is caught. Both
  attempts run inside the same single `withStateLock` hold as before -- no new lock, no
  second stability loop, matching the contract's taste constraint.

- **Irreducible residual (documented, not fixed).** The window is not eliminated, only
  bounded and made observable: `confirmSnapshot`'s re-read and the subsequent
  `readVersionRecord`/version computation/`publishCache` all execute inside the *same*
  single critical-section callback passed to `withExclusiveDirectoryLock` -- i.e. under
  one continuous hold of the version lock, with no yield point in between (synchronous,
  single-threaded JS). A source mutation landing in the sub-millisecond gap between the
  `confirmSnapshot()` call returning `true` and `publishCache` actually completing its
  write is not observable by any mechanism *this* lock provides, because that lock is
  exactly what serializes "decide to allocate" and "commit the allocation" into one
  atomic step for any single resolver. Closing that would mean re-checking *after*
  publication too, which just moves the same irreducible instant-of-decision problem one
  step later (and the contract's stop conditions forbid adding a new lock or a second
  stability loop to chase it further). This is acceptable because the snapshot is
  confirmed inside the same lock that serializes allocation: no other resolver can
  interleave a *conflicting allocation* in that instant (the version lock still excludes
  concurrent `commitStateVersionAfter` callers), so the residual is "a source changed in
  the same instant the version was committed" -- indistinguishable in practice from the
  mutation having landed a moment later, which the *next* resolve already handles
  correctly (fresh hashes, version + 1). It does not reintroduce the bug this package
  fixes: that bug was a window with *no* re-verification at all; this residual is a window
  bounded by a single lock hold with re-verification immediately before the write.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `confirmSnapshot` as a 5th positional param on `commitStateVersionAfter` vs. folding it into the existing `StateVersionWriteEffects` bag | Separate optional parameter | `StateVersionWriteEffects` is a write-only effects bag (writeTemp/publish/removeTemp); a read/check predicate is a different concern and keeping it separate avoids overloading that interface's contract for existing callers |
| Distinguish confirm-mismatch from other `commitStateVersionAfter` failures via a typed `Error` subclass vs. a marker property on a plain `Error` | Typed class (`StateVersionConfirmMismatchError`) | Avoids an `as any`/marker-property cast at the `instanceof` check site in `resolve-effective-state.ts`; stays internal to the `src/effects/state/` module pair and never reaches a public caller, so it does not count as new public error vocabulary |
| Test the seam via `resolveEffectiveState` timing tricks only vs. also unit-testing `commitStateVersionAfter` directly | Both: a direct unit test in `state-effects.test.ts` (deterministic, `confirmSnapshot: () => false`) plus real OS-lock-timed integration tests in `state-concurrency.test.ts` | The direct unit test mirrors the existing four fault-path tests exactly with zero timing dependency; the integration tests are the only way to prove the *wiring* (resolve-effective-state.ts's retry) actually fires from a real mutation, which is also what the falsifier requires |
| Exhaustion-variant lock handoff: keep the lock directory always non-empty (swap owner file in place) vs. a real release-then-reacquire cycle | Real release/reacquire with a deliberate ~100ms gap | The always-non-empty approach kept the first `commitStateVersionAfter` attempt blocked through *both* mutations (it only ever observed the combined result once), so the retry always saw a clean, already-mutated snapshot and never exhausted. A real release lets attempt 1 acquire, fail on mutation #1 alone, and release -- attempt 2 (the retry) cannot start until attempt 1's fail cycle fully completes (synchronous, sequential), so there is no risk of it racing into that same window; verified stable across 5 repeated runs |

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
