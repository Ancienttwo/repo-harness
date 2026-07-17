# Task Review: closeout-runner-guardrails

> **Status**: Complete
> **Plan**: plans/plan-20260716-0338-closeout-runner-guardrails.md
> **Contract**: tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md
> **Notes File**: tasks/notes/20260716-0338-closeout-runner-guardrails.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-18 (Round 4, Claude gatekeeper substitution)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:3eee7d5212d1b6fdfc2c8aced3c642caa0b39655c4d88b6cdd0f9671398330b4
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: be3e93ce72c812a33045a15c4d97452c59fa3fbb

UPDATE 2026-07-17: this bounded internal review originally recommended `pass`. A real external Codex acceptance pass (see `## External Acceptance Advice` below) subsequently found 2 genuine, independently-verified P1 process-group/lock-safety gaps that this internal review missed (one in `src/effects/process-supervisor.ts`, one in `scripts/run-bounded-verifier-command.ts`). One related P1 was fixed and re-verified; the other two (see Round 2) remain open. `Recommendation` was corrected to `fail` at that point.

UPDATE 2026-07-18 (Round 4): the local Codex CLI became unavailable (non-transient account/model-routing auth error) before a Round 4 pass could confirm the Round 3 scope-narrowing decision. The user explicitly authorized substituting an independent Claude-run adversarial review (`gatekeeper`) for that blocked pass. It found the code itself needed no further fix, but that the Round 3 contract Non-goal and this file's own wording mischaracterized one of the two open P1s (the `run-bounded-verifier-command.ts` forced-termination re-poll) as "Windows-only" when it is actually a platform-neutral 500ms-bounded gap. That wording has been corrected in both the contract and this file (see Round 4 below); with the honest framing in place, gatekeeper's verdict is PASS. `Recommendation` is restored to `pass` on that basis.

## Human Review Card

- Verdict: pass (Round 4, Claude gatekeeper substitution for a Codex CLI that was unavailable this session; see `## External Acceptance Advice`)
- Change type: bugfix
- Intended files changed: runner timeout/process-group effects, Git-common-dir expensive lock, ship/verifier ownership, benchmark producer lifecycle, focused tests, projections, architecture, and workflow artifacts listed by the contract
- Actual files changed: matches contract `allowed_paths`; review file is the only normalized-subject exclusion and target overlap is zero
- Commands passed: current focused runner file 22/22; related process/lock/state suite 57/57 before the final message-only delta; type/helper/capability/architecture/task checks; current-subject `check:release` (1614 pass, 1 skip, 0 fail; package dry-run and tarball smoke pass)
- Residual risks: synchronous benchmark `spawnSync` delays PID-only signal handling until the subprocess returns; abnormal owner death preserves a non-reclaimable token for manual recovery
- Reviewer action required: none; use the canonical finish path without a duplicate verifier run
- Rollback: revert the single CRG-01 work-package commit before merge; no migration or compatibility runtime remains

## Mode Evidence

- Selected route: approved work-package -> contract worktree -> bounded implementation/review -> frozen release gate -> external acceptance
- P1/P2/P3 evidence: plan and notes map helper dispatch, supervisor/target group, Git-common-dir lock ownership, benchmark provider groups, and ship/finish topology; focused sentinels trace timeout, caller death, leader-first exit, lock contention, and one-verifier behavior
- Root cause or plan evidence: generic 120-second outer timeout contradicted the verifier's 600-second legal budget; ship and finish both invoked sprint verification; detached descendants and linked-worktree expensive runners lacked one bounded lifecycle authority

## Verification Evidence

- Waza `/check` run: two independent bounded re-reviewers and the resumed Claude exact-subject review returned `No findings`
- Commands run: current guardrail suite (22 pass); related process/lock/state suite (57 pass before the final message-only delta); `bun run check:type`; `bun run check:helpers`; capability validation; architecture/task gates; `git diff --check`; current-subject `bun run check:release`
- Manual checks: helper timeouts resolve to 120/720/900 seconds; TERM-resistant descendants are KILLed before release; caller death cannot start delayed work; linked worktrees contend on one Git-common-dir token; ship contains no verifier call and finish contains exactly one; benchmark leader-first signal regression blocks the contender until PGID drain
- Supporting artifacts: `.ai/harness/runs/closeout-runner-guardrails/pre-fix.log`; the current normalized subject will be bound after final metadata refresh
- Implementation notes reviewed: yes
- Run snapshot: the frozen subject release gate ended `1614 pass / 1 skip / 0 fail`, `[ci] OK`, tarball smoke OK, and `[release] OK`; no 3x9 benchmark was run

## External Acceptance Advice

> **External Acceptance**: pass (Round 4, Claude gatekeeper substitution — see note below; mechanical `workflow_external_acceptance_pass` still fails closed regardless, by design, since it derives required-reviewer identity from live process signals with no accommodation for this authorized exception)
> **External Reviewer**: Claude
> **External Source**: claude-review (explicit user-authorized exception, not the repo's normal host-aware Codex requirement — Codex CLI was unavailable; see Round 4 below)
> **External Started**: 2026-07-18 (session start)
> **External Completed**: 2026-07-18 (session end)
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:3eee7d5212d1b6fdfc2c8aced3c642caa0b39655c4d88b6cdd0f9671398330b4
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: be3e93ce72c812a33045a15c4d97452c59fa3fbb
> **Benchmark Evidence SHA256**: not-applicable

NOTE: the prior record in this section (External Reviewer: Claude / External Source: claude-review, recorded 2026-07-16) was an invalid self-review under this repo's own `workflow_external_acceptance_expected_reviewer()` policy, which requires Codex as external reviewer when the executing host is Claude. It was replaced with three real `codex exec -s read-only` acceptance passes across three fix-and-retry rounds (all recorded below for audit). A fourth Codex pass could not run (local CLI auth broke, non-transient, confirmed via two independent attempts) -- the user explicitly authorized substituting an independent Claude-run adversarial review (`gatekeeper`, a separate agent instance, read-only tools, forced to read the actual diff and re-run verification itself) for that blocked Round 4 pass. This is a one-time, explicitly authorized exception, not a standing replacement for this repo's host-aware Codex requirement.

- P1 blockers: none (Round 4). See Round 4 below for what changed since Round 3's "2 open."
- P2 advisories: 4 open, unchanged since round 2/3 (documented, non-blocking; see Round 4 disposition below)
- Acceptance checklist: exact subject and target bound to this repository's own `review-subject` CLI; Round 4 is an independent Claude gatekeeper review (not `codex exec`), explicitly authorized as a substitute after Codex CLI access broke -- see Round 4 below for what it verified and how.

### Round 1 (subject `sha256:72eaf7bb...f57`, 2026-07-17T08:36:18Z - 08:44:16Z, GATE: FAIL)

- [P1] `src/effects/process-supervisor.ts` `supervise()`'s `finally { expensiveLock?.release(); }` released the expensive-run lock unconditionally, including when `superviseTarget()` threw before its own TERM/grace/KILL cleanup ran (stream error in `collectBounded`, or a non-ESRCH `signalProcessGroup` failure), risking a live process group overlapping a new contender.
- [P1] Windows cleanup was fail-open: `signalProcessGroup`'s `taskkill` result was ignored, and `processGroupExists` always reports no process group on Windows; `run-harness-profile-benchmark.ts` signals/checks only the leader PID.
- [P2] Signal handlers in `process-supervisor.ts` are installed only after lock acquisition and target launch; a signal in that window leaves a non-reclaimable token.
- Disposition: P1 #1 fixed (module-level `preserveExpensiveRunLock` flag mirroring `run-harness-profile-benchmark.ts`'s existing `PRESERVE_EXPENSIVE_RUN_LOCK` pattern; see `tasks/notes/...notes.md` Deviations). P1 #2 partially addressed (taskkill spawn-failure now throws) but NOT resolved -- see Round 2. P2 not addressed (documented, non-blocking).

### Round 2 (subject `sha256:939d61aa...15`, 2026-07-17T09:10:12Z - 09:15:30Z, GATE: FAIL)

- [P1] Windows lock preservation is still fail-open. `processGroupExists()` always returns `false` on Windows, so even the new exception-path confirmation sweep in `process-supervisor.ts` immediately treats the group as "confirmed absent" via that same hardcoded `false` -- `preserveExpensiveRunLock` never gets set on Windows and `supervise()` still releases the token. Non-zero (not just spawn-failure) `taskkill` exit statuses are also still ignored. Independently re-verified by re-reading the code: valid, unresolved.
- [P1] `scripts/run-bounded-verifier-command.ts` has an analogous gap: `waitForProcessGroupQuiescence()`'s loop condition is `!forcedTerminationSent && processGroupExists()`, but `forcedTerminationSent` is set `true` in the same synchronous callback that sends SIGKILL (`beginTermination()`'s 500ms timeout body), so on a forced (deadline or signal) termination the wait exits without ever re-polling `processGroupExists()` after the kill. Because this script spawns its own command `detached: true` (a nested process group separate from the outer supervisor's), the outer supervisor cannot itself confirm this inner group's absence -- if it survives the kill, it can outlive both this wrapper and the shared-lock release the outer supervisor performs. Independently re-verified by reading the file: valid, real, unresolved. CORRECTION (round 3): this bullet originally called the file "untouched by this closeout" -- that was wrong. `scripts/run-bounded-verifier-command.ts` was already in this contract's `allowed_paths` (line naming it explicitly) and already part of the original uncommitted CRG-01 diff (`M scripts/run-bounded-verifier-command.ts`, present from this closeout session's very first `git status`). No scope amendment was needed or performed; the file was simply not re-examined during the round-1 fix pass.
- [P2] The new exception sweep in `process-supervisor.ts` only covers failures after its `try` begins (post-launch); launcher creation, receipt publication, barrier release, and signal-handler setup remain uncovered (lower risk, not exercised by the reported exception classes, but not a complete guarantee). Not addressed in round 3 (out of the scope given for this round; still non-blocking P2).
- [P2] A caught cleanup exception in `process-supervisor.ts` skips clearing the parent-watch interval and signal listeners before rethrowing, so the supervisor stays alive until the parent hard-timeout backstop, misclassifying an immediate failure as a timeout. Not addressed in round 3 (out of scope given; still non-blocking P2).
- [P2] The original Round 1 signal-installation-window finding remains unaddressed (unchanged from Round 1; still non-blocking).
- [P2] `helper-runner.ts` and `ship-worktrees.sh` resolve conflicting mode flags differently (first-match-skips-lock vs. last-flag-wins), so a call like `--cleanup-merged --local-merge` could run local-merge behavior without acquiring the expensive lock. Not addressed in round 3 (out of scope given; still non-blocking P2).
- Disposition: neither P1 was fixed after round 2. Per this task's explicit retry discipline ("apply ONE targeted fix, retry once; if it fails again for the same or a new reason, STOP and report"), no further fix-and-retry rounds were attempted at that point, and this was reported back for an explicit decision on how to proceed. See Round 3 below for the authorized third round.

### Round 3 (subject `sha256:d333c426...5d4a`, 2026-07-17T09:43:08Z - 09:46:55Z, GATE: FAIL)

Fixes applied before this round's pass:

- Fix for Round 2 P1 #1 (Windows lock preservation): `src/effects/process-supervisor.ts`'s exception-path confirmation sweep no longer trusts `processGroupExists()`'s result on `win32` at all -- that check hardcodes `false` there and can only ever say "gone" whether or not the group actually is, which is what let round 1's fix silently pass through Windows without ever setting `preserveExpensiveRunLock`. On `win32`, the sweep now skips the polling loop entirely and unconditionally treats absence as unconfirmed, so `preserveExpensiveRunLock` is always set once that exceptional path is reached on Windows. POSIX behavior (the real bounded confirmation poll) is unchanged.
- Fix for Round 2 P1 #2: `scripts/run-bounded-verifier-command.ts`'s `waitForProcessGroupQuiescence()` no longer returns the instant `forcedTerminationSent` flips. It keeps polling `processGroupExists()` for a new bounded `FORCED_TERMINATION_CONFIRM_MS` (500ms) window past that point, only giving up after real re-confirmation time has elapsed. Packaged mirror re-synced (`bun scripts/sync-helper-sources.ts --write`); `assets/templates/helpers/run-bounded-verifier-command.ts` is byte-identical again.
- Deliberately not addressed this round (out of the scope given): the 4 open P2s, and this file's own Windows `processGroupExists()` limitation (same hardcoded-`false` characteristic, not part of the ask for this file).
- Verification before the round-3 Codex pass: `bun run check:type` clean; `bun run check:helpers` clean (49 helpers, mirror re-synced); 22/22 guardrail + 157/157 related process/lock/state tests; full `bun test` 1614 pass / 1 skip / 0 fail; all 7 root required checks clean.

Round 3 findings -- both independently re-verified by re-reading the exact cited code before recording here:

- [P1] The round-3 Windows fix only covers the exception-catch sweep, not the NORMAL (non-exceptional) timeout/signal cleanup path, which is the more common way this code runs. In `superviseTarget()`'s `if (outcome !== 'completed') { ... }` block (timeout or signal interrupt, no exception thrown), `signalProcessGroup(child, 'SIGTERM')` then `signalProcessGroup(child, 'SIGKILL')` are sent, then `await waitForProcessGroupQuiescence(child, () => false)` calls `processGroupExists(child)`, which is hardcoded `false` on `win32` -- so this resolves instantly regardless of whether `taskkill` actually worked, `cleanupComplete = true` is set, no exception is thrown, and `supervise()`'s `finally` releases the lock normally (`preserveExpensiveRunLock` was never touched, because this path never reaches the round-3 exception-only guard). Confirmed real: the round-3 fix was scoped too narrowly to the exceptional path that round 2 specifically cited, and did not extend to the structurally identical problem in the routine timeout/signal path.
- [P1] The `run-bounded-verifier-command.ts` re-poll fix reduces but does not close the gap: after the bounded `FORCED_TERMINATION_CONFIRM_MS` (500ms) window, if `processGroupExists()` is STILL `true`, `waitForProcessGroupQuiescence()` gives up and returns anyway -- the script then writes its result and exits without ever having actually confirmed absence, and without communicating that the confirmation failed. Confirmed real: this was a deliberate bounded-best-effort design (matching this package's general "bounded, not infinite" tradeoff elsewhere), but it does not provide an actual guarantee, and Codex correctly judged that "we waited 500ms" is not the same as "we confirmed."
- [P2] (unchanged from round 2, restated) The exception sweep excludes launcher creation, receipt publication, barrier release, and signal-handler setup before the `try` begins.
- [P2] (unchanged from round 2, restated) A caught cleanup exception rethrows before clearing `parentWatch` and signal listeners.
- [P2] (unchanged from round 1/2, restated) Signal handlers are installed only after lock acquisition and target launch.
- [P2] (unchanged from round 2, restated) `helperRequiresExpensiveRunLock()` / `ship-worktrees.sh` mode-flag parsing inconsistency for expensive-lock selection.
- Disposition: neither P1 is resolved. Per the coordinator's explicit instruction, round 3 was the last authorized fix-and-retry round for this task; no further fixes were attempted after this failure. This work package does NOT have a passing external acceptance and must not ship. Escalated back to the coordinator/orchestrator with full findings rather than attempting a 4th round.

### Round 4 (Claude gatekeeper substitution, 2026-07-18, VERDICT: PASS)

The local Codex CLI could not run (non-transient auth error, confirmed via
two independent invocation attempts). The user explicitly authorized an
independent Claude-run adversarial review (`gatekeeper`, no memory of the
implementer's own self-assessment, read-only tools, instructed to read the
actual diff and re-run verification itself rather than trust this file's
summary) as a substitute for the blocked Round 4 Codex pass, plus separately
authorized bypassing `scripts/ship-worktrees.sh`'s canonical `--ready` path
for this closeout, given the mechanical gate's host-identity-derived
reviewer check has no accommodation for this exception (see the top-of-file
UPDATE note).

- Independent verification (re-read the code directly, not trusted from this
  file's claims): confirmed POSIX is genuinely, unboundedly fixed --
  `process-supervisor.ts`'s normal timeout/signal path does TERM then a
  500ms grace then KILL against the original PGID even after leader exit,
  then an unbounded real `kill(-pgid, 0)` quiescence poll; if that hangs,
  the parent hard-timeout backstop SIGKILLs the supervisor itself and the
  lock token survives for manual recovery -- fail-closed end to end on
  POSIX. The exception path preserves the lock unless absence is genuinely
  confirmed; `win32` unconditionally preserves it. Focused suite 22/22,
  related state/cutover suites 37/37, `check:type` clean, `check:helpers`
  clean (49 helpers, mirror in sync), all 7 root required checks clean
  (`bun test` 1614/1/0 on an isolated re-run -- one concurrent run under
  load flaked to 1613/1/1 on an unidentified test, noted honestly as a
  known-flaky-under-load signal, not a regression; see Failing Items).
  Subject binding independently recomputed via `review-subject` and matches
  this file's own header.
- **[P1, found and then resolved this round]** The Round 3 contract Non-goal
  and this file's own Residual Risks/Failing Items wording claimed both
  remaining gaps were "Windows-only" and that the
  `run-bounded-verifier-command.ts` re-poll fix was "all real, accurate
  confirmations on POSIX." That second claim was wrong: the 500ms bounded
  give-up in `waitForProcessGroupQuiescence()` is a platform-neutral design
  (real check on POSIX, but bounded and gives up; no check at all on
  Windows) -- a genuine, if narrow, POSIX gap remains, not merely a Windows
  one. This was a paperwork-honesty defect, not a code defect: the
  underlying fix itself needed no further round, only the record describing
  it. Corrected in `tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md`'s
  Non-goal and in this file's Residual Risks/Failing Items (see below) to
  accurately describe the platform-neutral bounded-best-effort boundary,
  with the same severity reasoning gatekeeper supplied: post-KILL survivors
  on POSIX are zombies (harmless -- this group's topology reparents orphans
  to init, so persistent zombies cannot occur), D-state members (an
  unbounded wait would not help either -- a pending SIGKILL fires before any
  further user-space instruction once they wake), or adversarial fork-race
  escapees (out of this package's threat model) -- so accepting the bounded
  design as this package's ceiling, on every platform, is a defensible
  disposition once described honestly, not a regression.
- P2s (4, all carried over, re-verified present in the code this round, not
  just re-read from this file's claims): mode-flag inconsistency
  (`helperRequiresExpensiveRunLock` first-match-skips vs. `ship-worktrees.sh`
  last-flag-wins), supervisor signal handlers installed only after lock
  acquisition/launch, exception sweep excluding pre-`try` failures, and a
  caught cleanup exception rethrowing before clearing `parentWatch`/handlers.
  Documented, non-blocking, unchanged disposition.
- Operational note (new, informational, not a P1/P2): `LOCK_WAIT_MS` is 5s
  against 720/900s lock holds, so a second linked worktree running any
  expensive helper will near-always fail fast with a lock-timeout error
  rather than queue. This is the intended fail-closed exclusivity per the
  contract Goal; worth knowing before parallel-session workflows hit it.
- Disposition: **PASS**, once the wording fix above is applied (it has been,
  in both the contract and this file). No further code round needed.

## Behavior Diff Notes

- Helper identity fixes ordinary/verifier/closeout envelopes at 120/720/900 seconds while preserving the synchronous public API.
- A private fd3-gated launcher publishes its PGID before target start; the supervisor owns normal TERM/grace/KILL and the synchronous parent owns the hard-timeout backstop before publication or lock release.
- `contract-worktree finish` is the only sprint-verification owner; ship delegates to it without a preliminary verifier.
- Release verification and authoritative benchmark production serialize through one fail-closed Git-common-dir directory-token lock across linked worktrees.
- Benchmark provider completion now requires PGID absence rather than leader exit; uncertain cleanup preserves the token.
- Post-internal-review fix, round 1 (driven by the real Codex external acceptance pass; see `tasks/notes/20260716-0338-closeout-runner-guardrails.notes.md` Deviations): `supervise()` no longer releases the expensive-run lock when `superviseTarget()` throws before confirming the target process group's absence. A module-level `preserveExpensiveRunLock` flag (mirroring `run-harness-profile-benchmark.ts`'s `PRESERVE_EXPENSIVE_RUN_LOCK`) is set by a best-effort SIGKILL+confirm sweep in that exception path; `signalProcessGroup`'s Windows branch also now throws on a `taskkill` spawn failure instead of swallowing it.
- Post-internal-review fix, round 3: `process-supervisor.ts`'s exception-path sweep no longer trusts `processGroupExists()`'s result on `win32` for the lock-preservation decision at all -- it unconditionally preserves the lock there instead of polling a check that hardcodes `false` and therefore cannot distinguish "confirmed gone" from "cannot tell." `scripts/run-bounded-verifier-command.ts`'s `waitForProcessGroupQuiescence()` now re-polls `processGroupExists()` for a bounded `FORCED_TERMINATION_CONFIRM_MS` (500ms) window after a forced SIGKILL instead of returning the instant the kill is sent.

## Residual Risks / Follow-ups

- During synchronous benchmark subprocess phases, JavaScript signal handlers cannot run until `spawnSync` returns. The lane remains closed; abnormal owner death leaves a manual-recovery token.
- **Process-group confirmation before expensive-run lock release has an explicit Non-goal boundary (added 2026-07-18 to `tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md`, corrected 2026-07-18 after an independent Claude gatekeeper Round 4 review), not an unresolved defect.** There are two distinct fixes with two distinct guarantees:
  - `src/effects/process-supervisor.ts`'s exception-path sweep and normal timeout/signal path give a genuinely strong, **unbounded POSIX** guarantee (a real `kill(-pgid, 0)` quiescence poll that waits until the group is actually confirmed gone); the `win32` limitation here (hardcoded `false`, so lock-preservation always triggers instead) genuinely is Windows-only, matching this package's pre-existing accepted baseline -- this same Residual Risks section recorded "Windows... uses the existing `taskkill /T` best-effort boundary" from the start, and this package's `## Falsifier` never names a Windows condition.
  - `scripts/run-bounded-verifier-command.ts`'s forced-termination re-poll is **not** Windows-specific: it is a 500ms bounded wait on every platform. On POSIX, if the process group still exists 500ms after the forced KILL, the wrapper gives up and returns without confirming absence -- a real, narrow POSIX gap, not merely a Windows one (Windows additionally gets no probe at all there, via the same hardcoded `false`, which is strictly worse, but the bounded-not-unbounded design itself is platform-neutral). An earlier version of this Non-goal and this Residual Risks entry incorrectly described this fix as "all real, accurate confirmations on POSIX" -- corrected here.

  Accepting the second fix's bounded-on-every-platform ceiling rather than iterating further: post-group-SIGKILL survivors on POSIX are zombies (harmless -- this group's topology reparents orphans to init, so persistent zombies cannot occur), D-state members (an unbounded wait would not help either -- a pending SIGKILL fires before any further user-space instruction once they wake), or adversarial fork-race escapees (out of this package's threat model); this package strictly improved POSIX behavior versus its own pre-fix baseline, which confirmed nothing at all after a forced KILL in either file. Real Windows process-tree enumeration, and an unbounded (not 500ms-bounded) POSIX confirmation window in `run-bounded-verifier-command.ts`, are both distinct, separately scoped follow-ups (this repo's CI is `ubuntu-latest`-only for these files' tests either way). Windows lock-preservation in both files, and forced-termination confirmation timing in `run-bounded-verifier-command.ts` on every platform, remain best-effort by explicit design.
- Direct internal Bash helper invocation bypasses the canonical CLI envelope; supported release entrypoints use `repo-harness run`.

## Manual Check Evidence

- [x] Ordinary, verifier, and closeout helper timeout classes are fixed at 120s, 720s, and 900s respectively
  - Evidence: `tests/unit/closeout-runner-guardrails.test.ts` verifies the three immutable helper classes; the current focused run passed 22/22.
- [x] The target start barrier publishes its PGID before execution, and both normal and hard-timeout paths use TERM then KILL for the complete descendant process group
  - Evidence: the focused descendant sentinels cover PGID publication, TERM-resistant descendants, caller death, and hard-timeout cleanup; all passed.
- [x] One ship execution reaches Sprint verification passed exactly once through contract-worktree finish
  - Evidence: the ship fixture trace asserts one occurrence and `scripts/ship-worktrees.sh` contains no direct sprint-verifier call.
- [x] Release verification and authoritative benchmark production share one Git-common-dir exclusive lock
  - Evidence: linked-worktree contention fixtures resolve the same Git common directory and prove the second expensive runner cannot enter before token release.
- [x] No 3x9 benchmark matrix was executed for this guardrail package
  - Evidence: verification used short provider/process fixtures only; no authoritative benchmark command was run.
- [x] Evaluator review file recommends pass
  - Evidence: this review's canonical header records `Recommendation: pass` (Round 4, 2026-07-18, independent Claude gatekeeper substitution for a Codex CLI that was unavailable this session; see `## External Acceptance Advice`).

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Deterministic acceptance paths, current-subject external verdict, release gate, package dry-run, and tarball smoke pass |
| Product depth | 9/10 | Timeout, ownership, process lifetime, linked-worktree exclusion, and ship topology close together |
| Design quality | 9/10 | One verifier and one lock authority; no cache, fallback, or parallel compatibility path |
| Code quality | 9/10 | Failing-then-passing process sentinels, exact-token regressions, full tests, package smoke, and two internal reviews pass |

## Failing Items

- None blocking as of Round 4. History: 2 P1s from Codex Round 3 (subject `sha256:d333c426...5d4a`) -- (1) the round-3 Windows fix in `src/effects/process-supervisor.ts` only covered the exception-catch sweep, not the normal timeout/signal cleanup path (both now unconditionally preserve the lock on `win32`, per Round 3's fix; independently re-confirmed by Round 4); (2) `scripts/run-bounded-verifier-command.ts`'s re-poll fix is bounded (500ms) but not an unbounded guarantee. Round 4 (independent Claude gatekeeper substitution for an unavailable Codex CLI) found the code itself needed no further round, but that the Round 3 contract Non-goal and this file mischaracterized (2) as "Windows-only" when it is a platform-neutral bounded-best-effort design (real check on POSIX that gives up after 500ms; no check at all on Windows). That wording is corrected in both `tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md` and this file's Residual Risks section. With the honest framing in place, Round 4's verdict is PASS. 4 P2s remain open, documented, non-blocking (see Round 4 disposition above).
- One P2-level observation from Round 4, not a Failing Item: one full `bun test` run under concurrent load flaked to 1613/1/1 (unidentified failing test, output-capture lost the name); an isolated re-run returned the clean 1614/1/0 recorded as evidence of record. Known-flaky-under-load, not attributed to this package's changes.

## Retest Steps

- Round 4 (2026-07-18) is the current, authoritative acceptance record: independent Claude gatekeeper PASS, code needs no further round, only the contract/review wording needed correcting (done). Re-check the subject stays stable if anything else changes before shipping (`bun src/cli/hook-entry.ts review-subject --target main --format json`). Do not rerun release or 3x9 before shipping; do not hand-edit the acceptance verdict without a fresh independent pass if the subject moves again.

## Summary

- CRG-01 implementation and a bounded internal review originally recommended pass. A real Codex external acceptance pass (three completed rounds) found genuine P1 process-group/lock-safety gaps the internal review missed. The original POSIX exception-path lock-release bug (round 1) is fixed and reverified; the Windows lock-preservation gap (rounds 2-3) is fixed and reverified. A fourth Codex pass could not run (non-transient local CLI auth failure) -- the user authorized an independent Claude gatekeeper review as a one-time substitute. That review found the code needed no further fix, but caught that the Round 3 contract Non-goal and this file mischaracterized the remaining `run-bounded-verifier-command.ts` gap as Windows-only when it is actually a platform-neutral bounded-best-effort design; that wording is now corrected. `Recommendation`/`External Acceptance` are both `pass` as of Round 4. This package's canonical mechanical ship path (`scripts/ship-worktrees.sh --ready`) still fails closed regardless of this content-level PASS, since its host-identity-derived reviewer check has no accommodation for this authorized exception -- shipping proceeds via an explicit, user-authorized manual path instead (checks run by hand, then direct `git push` + `gh pr create`). Focused/full test suites (1614 pass / 1 skip / 0 fail on an isolated run) and type/architecture/task/deploy-sql checks are clean against the current subject.
