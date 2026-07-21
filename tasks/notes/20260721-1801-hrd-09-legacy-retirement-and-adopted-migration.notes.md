# Implementation Notes: hrd-09-legacy-retirement-and-adopted-migration

> **Status**: Active
> **Plan**: plans/plan-20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.md
> **Contract**: tasks/contracts/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.contract.md
> **Review**: tasks/reviews/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.review.md
> **Last Updated**: 2026-07-21 20:13 +0800
> **Lifecycle**: notes

## Design Decisions

- `src/cli/hook/route-registry.ts` remains the public 11-tuple authority. Each tuple now names one typed handler; the retired `scripts` field and every host-event Bash dispatcher are deleted in the same cutover.
- `src/cli/hook/handler-registry.ts` is the exhaustive internal binding from handler ID to in-process implementation. Runtime telemetry is emitted once around that call; handlers do not create a second telemetry authority.
- Adoption retirement is an operator-invoked one-shot operation in the canonical `standard-plan` / `FsTransaction` path. A generated legacy file is removable only when its SHA-256 matches the frozen manifest; custom or mismatched bytes are preserved and reported.
- File/read/write telemetry stays unavailable when no explicit observer owns that boundary. `in_process` execution is not treated as evidence that unobserved filesystem counts are complete.
- Because HRD-09 replaces SubagentStart, it triggers the deferred same-scope writer revisit. Stop, SubagentStart, and advisor creation therefore share one delegation-state lock and one lock-internal read/merge/projection transaction. `spawned` and `fallback_used` are monotonic; Stop emits fallback only after a successful in-lock claim.

## Deviations From Plan Or Spec

- The original HRD-09 plan named `delegation-state.ts` as an allowed seam but did not explicitly require Stop to move in the same package. The deferred ledger's revisit trigger fired as soon as SubagentStart was replaced, and a deterministic two-process interleaving reproduced the inherited lost update. The contract was widened before editing `stop-handler.ts` and adding the concurrency fixture.
- The initial typed runtime marked all filesystem metrics complete with zero values. Focused tests exposed that as an evidence overclaim; the implementation now marks only explicitly observed boundaries complete.
- The first ship-gate pass found a second destructive migration authority in `project-init-lib.sh`: bootstrap deleted complete host `hooks` objects and wildcard-pruned top-level `.ai/hooks/*.sh`. The init/create entrypoints now only scaffold operator helpers and print the user-level adapter notice; all legacy retirement is confined to canonical adoption. Existing custom configs, modified legacy paths, and custom hook scripts are covered by active entrypoint regressions.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep Bash as a compatibility fallback | Rejected | It would preserve a second runtime authority after the terminal cutover. Missing/malformed typed state fails visibly instead of dispatching legacy semantics. |
| Retire legacy paths by basename only | Rejected | Path ownership is insufficient for destructive cleanup; exact generated fingerprints preserve user-owned modifications. |
| Add a migration-specific transaction executor | Rejected | Adoption already has one operation model and one rollback-capable filesystem executor; a second executor would drift. |
| Let Stop and SubagentStart lock independently | Rejected | Separate read/modify/write protocols still permit same-scope stale overwrite. One shared transaction protects the cross-module invariant. |
| Infer unavailable telemetry as zero | Rejected | Zero is a measurement result, not a safe fallback for missing observers. |
| Keep path-based cleanup in init/create for convenience | Rejected | Bootstrap cannot prove ownership. Only the adoption planner has the frozen fingerprints, managed-command parser, rollback manifest, and explicit operator boundary required to retire old runtime state. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Durable migration/runtime evidence: `docs/researches/20260721-hrd09-legacy-retirement-evidence.md`
- Integrated adopted fixture: `tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts`
- Cross-writer concurrency fixture: `tests/delegation-state-concurrency.test.ts`
- Final full suite: 1,670 pass, 1 Windows-only skip, 0 fail, 13,939 expectations across 140 files in 485.98 seconds.
- Final package proof: `repo-harness-0.10.1.tgz` installs from the packed worktree and both packaged CLI bins start.
- Environment falsifier: the only first full-run MCP failures were reproduced under forced `/tmp` and disappeared under the normal macOS `TMPDIR`; the seven-file rerun passed 75 tests with one platform skip. The genuine LSC source-marker drift was updated to the typed `claimDelegationFallback` boundary and passed in the final full suite.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
