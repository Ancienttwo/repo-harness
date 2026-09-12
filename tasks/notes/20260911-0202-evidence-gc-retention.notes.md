# Notes: evidence-gc-retention

## Why retention identifies rather than excludes

The obvious rule for `.ai/harness/runs/*.json` is "keep the newest N". It is
wrong, and the reason is not visible from the runs directory: three writers share
it, and two of them produce durable evidence.

- `stop-handler.ts:436` writes `${runId}.json`, disposable session history, and
  `workflow_write_run_summary` (`assets/hooks/lib/workflow-state.sh:1314`) writes
  the identical shape. The shell writer is the larger producer by volume and is
  where the free-form `reason` values come from.
- `verify-sprint.sh:1009` freezes an acceptance snapshot whose exact path a
  checks projection records in `.run_file` and reads back at finalization
  (`verify-sprint.sh:913-937`). It shares Stop's `run-` prefix.
- `verification-execution.ts:919-921` writes an immutable
  `verification-${executionId}.json` that the ledger binds by sha256.
  `readValidRunResult:507-510` treats a missing file as an absent baseline, so
  `baselineResult:574-580` fails a `baseline_with_delta` criterion permanently --
  a rerun only mints a new execution id, and the only escape is editing the
  contract, which discards the whole `criterion_reuse` cache.

The first implementation protected only the second class, with a pin set read
from `.ai/harness/checks/*.json#.run_file`. That was wrong twice over: it never
reached the verification records at all, and it read only the top-level
`run_file`, missing the nested
`.contract.report.verification_evaluation.results[].run_file` that newer
verify-sprint projections emit.

The rule now runs the other direction. The sweep deletes only what it can
positively identify as Stop's own record, by the shape `stop-handler.ts:471-481`
writes: a `run_id` plus the four resolved projection paths (`checks_file`,
`handoff_file`, `policy_file`, `context_map_file`). Every field there is a
pointer the next Stop recomputes, which is what makes the record disposable;
the other two shapes carry results. Everything else -- including a shape a
fourth writer adds later -- belongs to its owner.

An earlier attempt keyed on `reason: "session-stop"` instead. Measuring this
repository's own runs directory killed it: `reason` is free-form operator text
with ~190 distinct values there (2373 records say `repo-harness-migration-verify`,
one says `C4 shipped via PR #226`), so that rule would have left 2670 run
summaries unreclaimable forever. Classified by shape, the same directory is 5898
run summaries, 33 verify-sprint traces, and 12 operator reports. This removes the pin set, the
dependency on the checks directory, and the failure mode where one corrupt checks
projection silently disabled retention (two of about twenty repositories on this
machine had one).

## Why the sweep is fail-open at the Stop call site but fail-closed in the helper

Stop already treats checkpoint publication as best-effort for the same reason:
reclaiming disk must never be the thing that fails a Stop. The helper is
operator-invoked, so it reports and exits non-zero instead.

## Deviations from the plan

- The module landed at `src/effects/run-summary-retention.ts`, not
  `src/effects/harness/...`, next to `hook-event-log.ts` -- the module that
  already owns retention for the other unbounded file in the same directory.
- The plan's pin set was replaced by positive identification, per the reasoning
  above. The plan's `Falsifier` named exactly this check ("grep every `runs_dir`
  / `run_file` consumer and confirm each is either a writer or the checks-pinned
  readback"); `verification-execution.ts:507` is a third kind, and running that
  grep properly is what produced the current rule.
- `scripts/evidence-gc.ts` no longer carries its own copy of the checkpoint
  directory naming rule; `checkpoint-store.ts` exports
  `isCheckpointDirectoryName` so the reporter cannot drift from the selection
  the store's own retention makes.

## Open questions

- `runs/hook-events.jsonl.archive` holds up to 256 MB per repository and was
  measured at 216 MB here. That is the declared bound working as designed, and
  the operator decided this round not to change it.
- `runs/verification-*.log` failure diagnostics have no retention owner. They are
  never candidates (not `.json`), so they accumulate. Left as-is: they are small
  and tied to failed checks, not to every Stop.
- `resolveInsideRepo` is purely lexical, so a `runs_dir` that is itself a symlink
  out of the repository would be traversed. `checkpoint-store.ts` has the same
  posture; changing one without the other would be inconsistent.

## Why the shell writer's jq-less branch changed

Making the shape the discriminator gives the record one contract, so the two
branches of `workflow_write_run_summary` had to agree. The fallback at
`assets/hooks/lib/workflow-state.sh:1355` emitted 5 of the 11 fields, omitting
`policy_file` and `context_map_file`, so on a host without jq every summary
would have been permanently unreclaimable -- and re-parsed on every Stop
forever. It fails safe (under-deletes), which is why it was not a blocker, but
leaving it would have meant two authoring contracts for one record shape.

`tests/workflow-state-lib.test.ts` covers both branches. The jq-less case runs
under a PATH holding only the coreutils the branch needs, with a probe asserting
`jq` is unreachable so the case cannot pass vacuously; reverting the fallback to
its 5-field form fails that test.

## Projection sources touched

`docs/reference-configs/` is generated from `assets/reference-configs/`
(`scripts/sync-reference-configs.ts`). The first cut wrote the new
`## Evidence Retention` section straight into the projection, which reddened the
governance gate and would have been silently deleted by the next
`bun run sync:reference-configs`. `check:reference-configs` is the third member
of the `check:hooks` / `check:helpers` family and was missing from the root
`Required Checks` block; it is now listed there in both `CLAUDE.md` and
`AGENTS.md`.

> **Substantive Change SHA256**: `sha256:80dd845324279a2cb1ce1620525c6d7bc058d79f884a67f1c66cc14e315d9539`
