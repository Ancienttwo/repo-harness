# Task Review: hrd-03-pre-edit-one-decision-cutover

> **Status**: Complete
> **Plan**: plans/plan-20260720-0419-hrd-03-pre-edit-one-decision-cutover.md
> **Contract**: tasks/contracts/20260720-0419-hrd-03-pre-edit-one-decision-cutover.contract.md
> **Notes File**: tasks/notes/20260720-0419-hrd-03-pre-edit-one-decision-cutover.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-20 (Round 2: gate FAIL -> fix -> re-gate PASS; external slot per standing chain instruction)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:9ea859d16889f7f49a35ef70fda8a7f3cfbd5de06853fba03447712dcce8eb55
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 13a11d08baabd47dce9f434ef0da9d856413b37e

## Human Review Card

- Verdict: pass
- Change type: code-change (runtime-shape cutover; guard semantics parity-locked)
- Intended files changed: one in-process mutation-guard handler replacing
  the `PreToolUse.edit` script chain, HRD-02 collector extension, both
  edit-guard scripts retired, tests migrated, two goldens re-frozen under
  strict delta policies, retirement ripple (installer, sync tool, emitters,
  live docs) closed, and the envelope.
- Actual files changed: 30+ paths across two commits (`da4cc786` cutover,
  `13a11d08` gate round-1 fixes), all within the amended Allowed Paths
  (27 original + 8 ripple + 1 install-profiles + 9 doc/emitter). Net
  −497 lines in the main cutover. `src/core/loop/loop-event-protocol.ts`
  untouched; other routes' script-spawn path untouched; public route tuple
  byte-stable with `PreToolUse.edit` scripts `[]`.
- Commands passed: contracted suites 297 pass / 0 fail (14 files); FULL
  `bun test` 1717 pass / 1 pre-existing win32 skip / 0 fail (132 files) —
  in the worker session and independently in both gate sessions;
  `check:type` / `check:hooks` (23 files) / `check:helpers` (49) /
  `check:state-boundaries` (111) green; root required checks
  (task-sync, architecture-sync, deploy-sql-order, inspect-project-state,
  adopt --dry-run) green; real `repo-harness install` projection exit 0
  with the new guardPaths.
- Residual risks: (1) failure-log override now honored uniformly — old
  `worktree-guard.sh` writes were hardcoded by a sourcing accident; the
  merged handler honors `.harness.failure_log_file` for every guard
  (round-2 gate confirmed uniformity-over-accident as the right parity
  reading; only override configs see the log-path unification).
  (2) `run-hook.sh` codex stderr-routing keeps separate coverage; the
  tripped-circuit stdout behavior matches bash's own early return.
  (3) The three legacy status lists' convergence stays ledgered.
- Reviewer action required: none for the reviewed subject; ship as the
  independent HRD-03 PR against `main` from base `c6504231`.
- Rollback: revert the single PR; handler, route script list, both
  goldens, migrated tests, installer/sync/docs ripple restore as one unit.

## Mode Evidence

- Selected route: `Task Profile=code-change`, independent contract worktree
  from exact execution base `c6504231` (post-P0 close), sequenced after the
  P0 package per the sprint's baseline-movement discipline.
- P1/P2/P3 evidence: contract pins parity-as-criterion, both golden delta
  policies, falsifier-first port order, and six dated amendments recording
  every scope widening (ripple files, ninth fixture path, doc sweep, 3b
  adjudication).
- Root cause or plan evidence: falsifier-first — worktree refusal +
  SpecGuard ported behind a test-only entry and proven
  observable-identical without a subprocess before the remaining guards
  were ported.

## Verification Evidence

- Waza `/check` run: orchestrator session 2026-07-20; runtime dispatch
  diff and handler read directly; scope on target across all rounds.
- Commands run: full battery in worker + two independent gate sessions.
  Round-1 gate ran nine differential parity probes (old bash from base SHA
  vs new handler, identical fixtures): exit codes, stdout, stderr,
  structured-error JSON, failure-log records byte-identical in every
  scenario, plus a 3-attempt circuit-trip probe; circuit-entry key deltas
  proven fixture noise. Round-2 gate verified the fix delta, re-ran the
  full suite (1717/1/0), and adjudicated 3b on primary evidence.
- Manual checks: see Manual Check Evidence below.
- Supporting artifacts: `tests/mutation-guard.test.ts` (falsifier fixtures,
  guard matrix, ≤1-resolution counting probes for single-file and 3-file
  apply_patch batch), 21/21 plan-status gate fixtures, per-field golden
  delta tables in the notes file.
- Implementation notes reviewed: yes — guard-by-guard port table, golden
  deltas, ripple resolution table (9 rows), gate round-1 resolution table
  with the 3b counter-evidence writeup.
- Run snapshot: `.ai/harness/checks/latest.json` (verify-contract, this
  worktree).

## Manual Check Evidence

- [x] Golden delta is confined to PreToolUse.edit runtime-shape fields with a per-field before/after record
  - Evidence: round-1 gate field-by-field diff audit — HRD-01 golden: single hunk, `PreToolUse.edit` only; `scripts_run` `["worktree-guard.sh","pre-edit-guard.sh"]`→`["mutation-guard"]`, `failed_script` likewise, `child_invocations` 22 git/2 cli/6 generic → 21/0/0; decision/reason/exit_code/stdout/stderr/write_set unchanged context lines. LSC golden: exactly the 3 edit cells, only `entrypoint` + `side_effects` moved (ordering arrays unchanged — cleaner than authorized); both new side_effects traced to verified old-test-environment gaps. Per-field tables in the notes and PR body.
- [x] Zero live references to the two retired scripts outside historical records
  - Evidence: retirement grep across `src/ scripts/ tests/ assets/hooks/ .ai/hooks/` plus the five live docs after the round-1 sweep — every remaining hit is a retirement-rationale comment, a deliberate legacy fixture (`migrate.test.ts`, stale-script-ignored test), the `KNOWN` typo-catcher vocabulary, or the pre-existing dead `scripts/repo-harness.sh`; the five docs have zero hits (round-2 gate re-verified); `PreToolUse.edit` route pins `scripts: []` and `run-hook.sh` has no dispatch entry.

## External Acceptance Advice

> **External Acceptance**: waived (user standing instruction for the continuous chain run, 2026-07-20)
> **External Reviewer**: none — Codex quota remains exhausted until 2026-08-16; no second AI host available
> **External Source**: user waiver (actor: kito; standing in-session instruction 2026-07-20; precedent: `5b3a2693`, HRD-01/HRD-02, P0 package). Substitute internal evidence: two independent fresh-context Claude gatekeeper rounds (full audit FAIL→fix→delta re-gate PASS) with differential probes against base-SHA bash, plus merge-gate and CI at the ship boundary
> **External Started**: 2026-07-20
> **External Completed**: 2026-07-20 (waiver recorded; not a Codex review)
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:9ea859d16889f7f49a35ef70fda8a7f3cfbd5de06853fba03447712dcce8eb55
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 13a11d08baabd47dce9f434ef0da9d856413b37e
> **Benchmark Evidence SHA256**: not_applicable

- P1 blockers: none after round 1's live-doc finding was fixed and
  re-verified. Round-2 verdict PASS.
- P2 advisories: contract amendment prose vs kept 3b code — resolved by
  recording the final KEEP adjudication in the contract; notes header
  path-count prose miscount (cosmetic).
- Acceptance checklist: scope ✓ (all paths in amended allowlist), golden
  deltas clean ✓, guard drift none ✓ (nine byte-identical differential
  probes), fail-open none ✓ (every new error path blocks or crashes
  closed; P0 branches verified in-process and differentially), retirement
  complete ✓ (four files_not_exist proofs pass; no dual dispatch),
  install surface restored ✓, cost claim proven ✓ (21/0/0 vs 22/2/6;
  ≤1 resolution by counting probe).

## Behavior Diff Notes

- Runtime-shape change only: `PreToolUse.edit` decided in-process by
  `src/cli/hook/mutation-guard.ts` (970 lines replacing ~1180 lines of
  bash + dispatch); child invocations 22/2/6 → 21/0/0; exactly one
  Effective State resolution per event. Guard decisions, reason tokens,
  exit codes, output shapes, and write sets byte-identical to post-P0
  script behavior. Two documented environment-gap closures in the LSC
  golden (telemetry record now fires; strict.edit circuit record no longer
  silently lost). Uniform failure-log override honoring (was split by a
  sourcing accident).

## Residual Risks / Follow-ups

- Legacy status-list convergence (ledgered); HRD-09 telemetry sweep
  remains the final retirement backstop; the notes' prose miscount is
  cosmetic.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Full guard surface ported with differential byte-parity proof; install surface restored; cost target beaten |
| Product depth | 9/10 | Falsifier-first, nine differential probes, circuit-trip probe, counting probes, two-golden delta discipline |
| Design quality | 9/10 | One decision pipeline consuming the collector; retirement with zero dual dispatch; evidence-based pushback on a wrong advisory |
| Code quality | 8/10 | Clean handler; minor prose miscounts in notes; deferred convergence ledgered |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/mutation-guard.test.ts tests/plan-status-gate.test.ts tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/runtime-profile-enforcement.test.ts tests/hook-protocol.test.ts tests/harness-circuit-breakers.test.ts tests/install-profiles.test.ts tests/cli/hook.test.ts tests/cli/route-registry.test.ts tests/state/loop-semantics-characterization.test.ts tests/hook-runtime-characterization.test.ts && bun run check:type && bun run check:hooks && bun run check:helpers && bun run check:state-boundaries`
- Re-check: `bun src/cli/index.ts run verify-contract --contract tasks/contracts/20260720-0419-hrd-03-pre-edit-one-decision-cutover.contract.md --strict`

## Summary

- HRD-03 cuts `PreToolUse.edit` over to one in-process mutation-guard
  handler with byte-parity across the full guard surface (differentially
  probed against base-SHA bash), retires both edit-guard scripts with zero
  live references, restores the install surface, and lands the first real
  diet win (30 → 21 child processes, bun subprocesses eliminated, single
  state resolution). Two gate rounds: FAIL on live docs → fixed →
  delta re-gate PASS with the 3b parity adjudication recorded. Fit to ship
  as the independent HRD-03 PR from base `c6504231`.
