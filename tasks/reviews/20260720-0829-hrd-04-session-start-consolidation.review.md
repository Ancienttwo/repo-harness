# Task Review: hrd-04-session-start-consolidation

> **Status**: Complete
> **Plan**: plans/plan-20260720-0829-hrd-04-session-start-consolidation.md
> **Contract**: tasks/contracts/20260720-0829-hrd-04-session-start-consolidation.contract.md
> **Notes File**: tasks/notes/20260720-0829-hrd-04-session-start-consolidation.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-20 (Round 2: gate FAIL -> fix -> delta re-gate PASS; external slot per standing chain instruction)
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:37537e887e5abf91ac8f343ce17600ed496f7a825cf6634d6af96d02d42470f9
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: e62f80600ade9bab47601e0697a8e95974049ff2

## Human Review Card

- Verdict: pass
- Change type: code-change (runtime-shape cutover; session content parity-locked)
- Intended files changed: one in-process session-context builder replacing
  the three SessionStart scripts, runtime/route wiring, retirement +
  eleven-group ripple (approved in a single pre-enumerated amendment
  round), test migration, HRD-01 golden single-cell re-freeze, and the
  gate round-1 fixes (resume newline parity, event-log rotation port,
  detached tooling populate).
- Actual files changed: two commits (`3a08872d` consolidation,
  `e62f8060` gate fixes); 37+3 paths, all inside the amended Allowed
  Paths. Net ~−1100 lines. `PreToolUse.edit`/mutation-guard surfaces
  untouched; public route tuples byte-stable with SessionStart scripts
  `[]`.
- Commands passed: contracted + ripple suites all green; FULL `bun test`
  1749 pass / 1 pre-existing win32 skip / 0 fail (worker + both gate
  sessions); `check:type` / `check:hooks` (20 files) / `check:helpers`
  (49) / `check:state-boundaries` (112) green; golden 5×+2× repeat runs
  zero drift; round-1 gate ran a 7-scenario base-SHA bash differential
  (6/7 byte-identical, S5 caught and fixed), round-2 re-ran S5
  byte-identical (1039B both sides) and cmp-verified the rotation port on
  both logs and both boundary sides.
- Residual risks: (1) rotation divergence only on corrupted input (no
  trailing newline): bash silently loses one line, TS keeps it — strictly
  safer, noted. (2) 60s stale-lock recovery on the async populate is a
  documented adjudicated deviation — bash's failure mode was a permanently
  wedged lock; worst case now is a benign duplicate populate
  (last-writer-wins JSON cache). (3) SYNC=1 branch keeps its two-tier
  subprocess (adjudicated sound: a real test needs the PATH-interception
  seam; contributes zero to the golden's counts).
- Reviewer action required: none for the reviewed subject; ship as the
  independent HRD-04 PR against `main` from base `ab5f7cad`.
- Rollback: revert the single PR; three scripts, route list, golden,
  migrated tests, ripple docs/emitters restore as one unit.

## Mode Evidence

- Selected route: `Task Profile=code-change`, independent contract
  worktree from exact execution base `ab5f7cad` (post-HRD-03).
- P1/P2/P3 evidence: contract pins content parity, frozen budget surface
  (1500 cap, fail-closed overflow, dedupe, ordering), single-resolution
  invariant, and the pre-enumeration requirement that landed the whole
  ripple in one amendment round.
- Root cause or plan evidence: falsifier-first — the two small scripts
  ported and byte-diffed before the 641-line main script; the ripple
  enumeration ran before any code and stopped the package correctly.

## Verification Evidence

- Waza `/check` run: orchestrator session 2026-07-20; scope on target;
  the fix-round delta read directly.
- Commands run: full battery in worker + two independent gate sessions;
  round-1 gate built its own 7-scenario differential harness and runHook
  probes (dedupe via real CLI, overflow fail-closed, lock lifecycle);
  round-2 gate re-ran the S5 differential, rotation cmp probes (2001-line,
  2000-boundary, byte-threshold), detached-populate lock lifecycle, and
  the full suite.
- Manual checks: see Manual Check Evidence below.
- Supporting artifacts: `src/cli/hook/session-context.ts` (builder +
  rotation port + detached populate, 1040+399 lines),
  `tests/session-context.test.ts` (32 tests incl. exact-join S5 fixture,
  rotation boundary fixtures, lock lifecycle), notes with section port
  table, ripple application table, golden delta, and corrected Deviations.
- Implementation notes reviewed: yes — including the two porting bugs
  found-and-fixed (heredoc blank line, HOME leak; both proven parity
  corrections by byte-match), the FR README catch-up recorded as an
  HRD-03 sweep miss, and the three non-live residuals.
- Run snapshot: `.ai/harness/checks/latest.json` (verify-contract, this
  worktree).

## Manual Check Evidence

- [x] Golden delta is confined to the SessionStart cell's runtime-shape fields with a per-field before/after record
  - Evidence: `git diff ab5f7cad..e62f8060 -- tests/fixtures/loop-runtime/characterization.json` is exactly one 8-line hunk in `SessionStart.default`: scripts_run `["session-start-context.sh","minimal-change-context.sh","security-sentinel.sh"]`→`["session-context"]`, git 23→22, bun_cli 3→0; stdout/stderr/write_set/exit_code/reason unchanged; no other cell moved; per-field table in the notes; stability proven by 5×+2× repeat runs and an empty fix-round diff.
- [x] Zero live references to the three retired scripts outside historical records
  - Evidence: round-1 gate's `rg -uu` sweep — only historical records, retirement comments, deliberate fixtures, and three adjudicated non-live residuals (prompt-guard comment, self-host policy.json baked string to refresh post-merge, already-stale references/hooks-guide.md); all five locale READMEs zero hits with the FR PreToolUse.edit catch-up landed; route pins `scripts: []`; builder keeps retired names only as stable section ids (adjudicated correct for budget-output stability).

## External Acceptance Advice

> **External Acceptance**: waived (user standing instruction for the continuous chain run, 2026-07-20)
> **External Reviewer**: none — Codex quota remains exhausted until 2026-08-16; no second AI host available
> **External Source**: user waiver (actor: kito; standing in-session instruction 2026-07-20; precedent: `5b3a2693`, HRD-01/02, P0, HRD-03). Substitute internal evidence: two independent fresh-context Claude gatekeeper rounds (full audit FAIL→fix→delta re-gate PASS) including a self-built 7-scenario base-SHA differential harness, plus merge-gate and CI at the ship boundary
> **External Started**: 2026-07-20
> **External Completed**: 2026-07-20 (waiver recorded; not a Codex review)
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:37537e887e5abf91ac8f343ce17600ed496f7a825cf6634d6af96d02d42470f9
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: e62f80600ade9bab47601e0697a8e95974049ff2
> **Benchmark Evidence SHA256**: not_applicable

- P1 blockers: none after round 1's two findings (S5 newline; dropped
  rotation) were fixed and independently re-verified byte-identically.
  Round-2 verdict PASS.
- P2 advisories: rotation corrupted-input divergence is strictly safer
  and noted; notes wording slightly overstates quirk parity there (LOW);
  self-host policy.json rule string refresh post-merge; stale doc
  residuals ride the next package touching those files.
- Acceptance checklist: scope ✓, golden single-cell delta ✓ (repeat-run
  stable), content parity ✓ (7-scenario differential + S5 closure at
  1039B byte-identity), retirement ✓ (files_not_exist proofs, zero live
  refs), single resolution + single budget pass ✓, rotation fidelity ✓
  (cmp-identical on well-formed cases, both boundary sides), detached
  populate lock lifecycle ✓, install/docs ripple ✓ (one amendment round).

## Behavior Diff Notes

- Runtime-shape change: SessionStart assembled in-process
  (`session-context` builder), child invocations 23 git / 3 cli → 22 / 0;
  three scripts retired. Session-visible content byte-identical (S5 fixed;
  differential-proven). Restored-vs-base improvements, each documented:
  event-log rotation preserved (was silently dropped in round 1),
  cross-session tooling-advisory TTL refresh restored via detached
  populate, 60s stale-lock recovery (bash could wedge forever),
  corrupted-input rotation keeps the partial line (bash lost it).

## Residual Risks / Follow-ups

- Self-host `.ai/harness/policy.json` generated-rule string refresh via
  `ensure-task-workflow` after merge (advisory); stale narrative docs ride
  later packages.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Content parity differential-proven; both gate findings closed byte-identically; ripple landed in one round |
| Product depth | 9/10 | 7-scenario differential, boundary-side rotation probes, lock lifecycle probes, golden repeat-stability |
| Design quality | 9/10 | Pure section emitters over collector facts; verbatim rotation port; adjudicated deviations documented not hidden |
| Code quality | 8/10 | Clean; one LOW notes-wording overstatement; SYNC subprocess kept for a sound test-seam reason |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/session-context.test.ts tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/hook-protocol.test.ts tests/hook-runtime-characterization.test.ts tests/cli/hook.test.ts tests/cli/route-registry.test.ts tests/cli/doctor.test.ts tests/create-project-dirs.runtime.test.ts tests/sprint-backlog.test.ts tests/readme-dx.test.ts && bun run check:type && bun run check:hooks && bun run check:helpers && bun run check:state-boundaries`
- Re-check: `bun src/cli/index.ts run verify-contract --contract tasks/contracts/20260720-0829-hrd-04-session-start-consolidation.contract.md --strict`

## Summary

- HRD-04 consolidates SessionStart into one in-process builder with
  differential-proven content parity, retires three scripts with a
  single-round pre-enumerated ripple, and lands the second diet win
  (26 → 22 children, bun subprocesses eliminated). Two gate rounds closed
  a real 1-byte parity break and restored a silently-dropped housekeeping
  behavior — plus three strict improvements over base bash, each
  documented. Fit to ship as the independent HRD-04 PR from base
  `ab5f7cad`.
