# Review: isolated contract worktree readiness

> **Status**: Pending
> **Base Revision**: `1a9a5ae19167fd50ab0f0c650105ca8a9a2498eb`
> **Substantive Change SHA256**: `sha256:1cdae848e1f4c0e944af1b5acbcf46b81a33529fe3620b2477a99f7cb4bbdf41`
> **Review Scope**: eight source/test/fixture files; Waza check self-review

## Finding and change

Effective State previously treated a matching owner as an isolated worktree,
while StrictWorktreeGuard independently tested Git topology. A primary checkout
with a matching owner therefore reported edit readiness but failed the guard;
a linked checkout without an owner had the inverse disagreement.

The resolver now requires both current ownership and distinct real Git/common
directories for strict isolation. This observation participates in the authority
revision and its stable-read confirmation. The pure projector publishes the
requirement and StrictWorktreeGuard consumes it. Lite worktree-boundary ownership
semantics and contract/scope exemptions are unchanged.

No dependency, public setting, compatibility path, or production module was
added. The new internal boolean carries the single resolver-owned observation
across the existing effects/core boundary. This review file binds actual
verification evidence to the substantive diff required by task-sync.

## Evidence

- Actual pre-fix run of the four real Git primary/linked fixtures: 2 pass,
  2 fail; failures were primary/current-owner readiness and linked/missing-owner
  guard acceptance. Command: `bun test tests/mutation-guard.test.ts --test-name-pattern 'strict isolated worktree agreement' --timeout 60000`.
- Post-fix mutation-guard and pure-projector suites: 41 pass, 0 fail.
- Effective State, adapter parity, stability, loop characterization and hook
  protocol suites: 66 pass, 0 fail.
- `bun run check:type`: exit 0. `git diff --check`: exit 0.
- Same-shape sweep: the lease-ownership arming check, explicit
  `.claude/.require-worktree` guard, and prompt-side worktree routing implement
  different contracts; none computes the strict isolation requirement.
- `bun scripts/check-state-boundaries.ts`: 3 reverse-import violations in
  unchanged `src/effects/automation/gpt-pro-issue-authoring.ts:17-19`. The same
  command on the pinned baseline fails identically; logs compare byte-for-byte.
  This separate issue is not repaired by this diff.
- `bun run build:hook-bundle`: exit 0; the worktree bundle contains the changed
  hook source. The installed host package is a separate installation, not this
  checkout; it has not been updated by this slice.
- Full `bun test --timeout 60000`: exit 1, 4,186 pass, 4 skip, 2 fail,
  1 error across 4,192 tests / 349 files, 2,368.69 seconds. The runtime source
  remained frozen throughout the run. Its original substantive diff was
  `sha256:8e6749a9a28b3dd57021a1d33fcb0b6732b2d36b89784fc59f6119f17ebba073`.
- One full-run failure was the old strict-primary golden: its hash assertion
  omitted the new authority fact, and its readiness fixture still allowed the
  primary checkout. Only that assertion and fixture changed afterward; the
  expected isolation fact is independently false because these fixtures are
  primary Git checkouts. No production code changed and no golden normalizer
  or assertion was weakened.
- Final `bun test tests/state/cli-state-golden.test.ts tests/mutation-guard.test.ts tests/state/project-effective-state.test.ts --timeout 60000`:
  exit 0, 54 pass, 0 fail, 1,021 assertions, 33.20 seconds. Final typecheck
  and whitespace checks also pass.

## Fleet timeout and fixture root cause

The user approved the Fleet follow-up after the initial full-run failure.
The production Fleet collector and provider limiter are unchanged by this slice;
a different worktree owns their containment changes.

- **root_cause**: The fake provider wrote `provider-counter/active` and
  `provider-counter/maximum` inside the observed Git repo. A real provider call
  changed only `review_subject` among the 12 Effective State source hashes,
  changing `collectLocal`'s token and invalidating its stability comparison.
  Separately, Bun's outer test timeout does not cancel its async body, so a
  `finally` block alone cannot prevent late assertions or fixture use.
- **repro**: The source-hash probe is captured in
  `/tmp/fleet-token-source-hash-probe.log`. The durable regression command is
  `bun test tests/effects/fleet-board.test.ts --test-name-pattern 'bounds real readiness provider children' --timeout 60000`.
- **regression_guard**: The existing four-card, concurrency-two test now requires
  the complete Git review subject to remain unchanged across collection, while
  retaining its repository/card-count and maximum/active-provider assertions.
- **pre_fix_failure_artifact**: `/tmp/fleet-provider-subject-red.log`,
  `PRE_FIX_EXIT=1`: the new assertion failed on the old fixture layout, with only
  the subject hash changed. The test ran for 15.10 seconds.

The fixture now owns a workspace with `repo/`, provider script and telemetry as
siblings. `onTestFinished` owns cancellation, collection draining, environment
restoration and directory removal. The normal test deadline and collector
budget remain 30 seconds. The hook has a separate 35-second teardown budget,
covering the provider's existing termination grace and wait; this does not turn
an outer timeout into a pass. The async outcome is captured so a timed-out body
cannot emit a late rejection or assert after teardown starts.

Post-fix subject guard: 1 pass, 0 fail, 6 assertions, 13.46 seconds. This single
wall-time comparison is not evidence of a fixed speedup. The combined Fleet,
merge-readiness, golden, mutation-guard and projector run passed all 74 tests
(1,100 assertions, 58.38 seconds); its four-card test took 11.82 seconds.
Typecheck and whitespace checks pass.

A real-fixture copy with an intentionally shortened 8-second outer timeout
produced exactly 1 expected timeout failure and 1 next-test pass. Four provider
PIDs were actually started, zero remained alive after the hook, both environment
variables were restored, and the temporary root was removed before the next
test. There was no unhandled-between-tests error. Raw evidence:
`/tmp/fleet-lifecycle-oracle-8s-probe.log`. The outer timeout may kill a child
without running its shell trap, so a counter value after forced cancellation is
diagnostic only; actual PID liveness is the teardown oracle. This fault-injection
probe is supplementary evidence, not a passing full suite or a second benchmark.

Same-shape sweep: the provider-counter fixture and its trap occur only in this
one test. Other Fleet cancellation tests exercise injected dependencies or
pre-aborted signals and do not own real provider children. No product timeout,
limiter, teardown implementation, or public contract was changed for this fix.

## Final verification and delivery boundary

The final full suite ran against base
`1a9a5ae19167fd50ab0f0c650105ca8a9a2498eb` with frozen source/test patch SHA-256
`e8b4ff8f98835e31fe7a2860bd7410d9c156c1951b506bcac04a8c25f0bdb1a1`.
Raw log: `/tmp/isolated-worktree-fleet-full-final.log`. The exec session ended
with SIGTERM / exit 143 before Bun emitted its final summary or the wrapper's
exit footer. The partial log contains 3,315 passing test lines and one failure;
no process retained the log open afterward. The termination source is unknown.
This is an interrupted, non-green run. It had not reached the Fleet case, so
there is no claim that the original suite-context Fleet timeout is closed.

The observed failure was the unchanged
`tests/helper-scripts.test.ts:5165`,
`verify-sprint composes executed and reused criteria into frozen acceptance evidence`:
its first verification reported that source, target, contract, goal or toolchain
authority changed during execution. This run does not identify which authority
changed or prove a baseline defect. The main-worktree verification-scope task
also edits this case; this branch does not duplicate that work. Its failure,
the active-plan contract gate conflict below, and the interrupted full-run
boundary prevent acceptance. No second full run was started.

The final source/test patch was compared byte-for-byte with its frozen capture
and was unchanged.

The source worktree passes deploy SQL order, architecture sync, project
inspection and init dry-run (zero operations). Task-sync's new exact digest is
bound in this review and the checker passes. The active-plan workflow check still requires a separate
contract even for the standard profile; current higher-priority guidance permits
one plan and forbids additional contract/notes/todo scaffolding. This existing
conflict is recorded rather than bypassed by fabricating a contract.

Main has since received a separately verified review-boundary repair containing
the prior reverse-import fix. Another task still owns uncommitted guard/projector
changes in main. Preserve those writes and validate any integration seam before
claiming the candidate is merged or installed.

## Rebase verification (2026-09-05, onto 64953b6f)

Rebased onto main after the verification-scope repair (`6c19234e`), the
context-diagnostics patch (`be6e90f8`), and the golden refresh (#321). Two
conflicts resolved: the research note keeps both appended sections, and the
Fleet provider fixture keeps main's `omit_receipt_for` option together with this
branch's workspace-root isolation. `tests/state/fixtures/loop-semantics/characterization.json`
was regenerated because the resolver source hash it pins changed; the diff is
that single `source_sha256` line.

Focused run: `bun test tests/mutation-guard.test.ts tests/effects/fleet-board.test.ts tests/state/cli-state-golden.test.ts tests/state/project-effective-state.test.ts tests/state/loop-semantics-characterization.test.ts --timeout 60000`
→ 71 pass, 0 fail. `tsc --noEmit` clean. `check-task-workflow --strict` OK, so
the earlier active-plan contract gate conflict no longer applies. The full suite
runs once in PR CI; the earlier interrupted run is not reused as evidence.
