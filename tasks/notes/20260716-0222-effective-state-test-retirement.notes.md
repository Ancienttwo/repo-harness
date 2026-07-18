# Implementation Notes: effective-state-test-retirement

> **Status**: Active
> **Plan**: plans/plan-20260716-0222-effective-state-test-retirement.md
> **Contract**: tasks/contracts/20260716-0222-effective-state-test-retirement.contract.md
> **Review**: tasks/reviews/20260716-0222-effective-state-test-retirement.review.md
> **Last Updated**: 2026-07-16 02:54
> **Lifecycle**: notes

## Design Decisions

- The twelve golden and adapter-parity scenarios now share
  `EFFECTIVE_STATE_SCENARIOS`; each suite still executes its own public path and
  every golden JSON remains the byte authority.
- Removed assertions were retired only where a surviving focused owner exists:
  pure projection in `project-effective-state`, effects and publication faults
  in `state-effects`, lock/version races in `state-concurrency`, CLI rendering
  in `cli/state-command`, public hook smoke in `cli/state-snapshot`, full
  characterization in the twelve goldens, and cross-adapter behavior in
  `adapter-parity`.
- Ordinary fixtures no longer manufacture the retired `.claude/.active-plan`;
  migration and characterization cases opt in explicitly so the public
  one-shot migration contract and frozen Git/source hashes remain covered.
- Tests now import canonical capability/state types from `src/core` instead of
  adapter/helper re-export paths. The existing `src/` package exports remain
  intact because `src/` ships in the npm package and deleting them would widen
  this test-retirement slice into a public deep-import compatibility decision.
- The unreferenced one-time `tests/state/benchmark-effective-state.ts` harness
  was deleted after a repository-wide caller and package-script sweep. Durable
  ESA benchmark reports were not changed or rerun.

## Deviations From Plan Or Spec

- `bun test` took 603.36 seconds, longer than `verify-contract`'s fixed
  600-second total budget before its other criteria. It was therefore produced
  exactly once on the frozen implementation subject and retained as exact
  manual evidence instead of being duplicated inside `commands_succeed`; the
  acceptance criterion itself was not removed.
- Removing the standalone capability resolver's exported types initially broke
  its generated-helper contract. The change was restored, and
  `sync-helper-sources --check` now passes. Adapter/helper exports were retained;
  only test import paths moved to their canonical Core owner.
- The first bounded retirement audit found two assertions whose surviving pure
  owner was weaker than the removed integration case: a well-formed but wrong
  checks subject and independent resume task/revision/hash mismatches. Both were
  added to `project-effective-state.test.ts`; no integration suite was restored.
- An attempted export deletion was reverted before final review. Besides the
  package-boundary risk, any `src/cli` change would invalidate the existing ESA
  benchmark subject and force an out-of-scope 3x9 rerun. The final diff has no
  runtime source change.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Delete broad suites wholesale | Rejected | Public migration, path-security, risk, and policy fail-closed branches still need integration owners. |
| Keep all old assertions | Rejected | Duplicate owners are the source of the maintenance growth being corrected. |
| Share scenario data but keep independent public executions | Chosen | Removes setup duplication without turning injected state into false end-to-end parity evidence. |

## Open Questions

- The existing ESA benchmark report is already non-fresh on current `main`:
  `validate-harness-profile-benchmark.ts --require-authoritative` reports
  `benchmark subject changed at benchmark_subject_sha256` even though this
  cleanup's final diff has no runtime/package input change. This slice will not
  rewrite the report or rerun 3x9; strict `verify-sprint` closeout must therefore
  surface that pre-existing harness-evidence blocker rather than hide it.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused state/capability matrix: 122 pass, 0 fail, 1,324 assertions.
- Public adapter/projector follow-up: 31 pass, 0 fail; compatibility projector
  table: 9 pass, 0 fail.
- Full repository suite: `bun test` -> 1,563 pass, 1 skip, 0 fail, 13,945
  assertions across 123 files in 603.36 seconds. Runtime/source files remained
  frozen afterward; the only post-suite implementation delta is the focused
  projector regression test described above.
- Final projector follow-up after the bounded coverage audit: 10 pass, 0 fail,
  70 assertions; type and state-boundary checks also passed.
- Static gates: `bun run check:type`, `bun scripts/check-state-boundaries.ts`,
  and `bun scripts/sync-helper-sources.ts --check` passed.
- Golden authority: `git diff --exit-code origin/main -- tests/state/fixtures`
  passed; all twelve fixture files are byte-identical.
- Diff size before workflow-only closeout: 14 implementation/test paths,
  280 additions and 1,094 deletions (net -814 lines).

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
