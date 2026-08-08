> **Archived**: 2026-08-08 10:33
> **Related Plan**: plans/archive/plan-20260808-0924-global-runtime-env-basedrop.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260808-1033

# Implementation Notes: global-runtime-env-basedrop

> **Status**: Active
> **Plan**: plans/plan-20260808-0924-global-runtime-env-basedrop.md
> **Contract**: tasks/contracts/20260808-0924-global-runtime-env-basedrop.contract.md
> **Review**: tasks/reviews/20260808-0924-global-runtime-env-basedrop.review.md
> **Last Updated**: 2026-08-08 09:24
> **Lifecycle**: notes

## Design Decisions

- **Falsifier discharged, and it moved the fix.** `commandEnv` has exactly one caller
  (`global-runtime.ts:650`) and exactly one sink: `bindBunRuntimeEnv(...)`. No consumer
  reads the return directly, so nothing depends on "minimal record" semantics and basing
  on `process.env` is safe. The same enumeration showed the plan's `bindBunRuntimeEnv`
  question is not inert: it returns a **non-optional** record, so `commandEnv`'s `undefined`
  never reaches an undefined-aware consumer here — `bindBunRuntimeEnv` materializes it into
  `{ PATH }`, a one-key environment. It is the effective base-dropper on this surface, and
  it was fixed to `...(env ?? process.env)` alongside `commandEnv`.
- **The unmasked sink is a single line.** Every `homeDir(env)` helper in this file resolves
  `env?.HOME ?? process.env.HOME ?? homedir()`, so it re-reads `process.env` and masks the
  drop. The one consumer with no `process.env` step is the first use of the record,
  `readInstalledProfile(env)` -> `installProfileStatePath(env)`
  (`src/cli/installer/install-profile.ts:502`, `env.HOME ?? homedir()`). Since Bun caches
  `homedir()` at process start, a dropped base silently resolved install-state against the
  operator's real home. That is the only guardable observable, and it is what the guard pins.
- **Guard fires before any side effect.** The profile read is `global-runtime.ts:651`, ahead
  of `ensureSupportedBunRuntime` and every spawn/write, so the regression guard drives no
  process and touches no filesystem outside its tmp fixture on either code path.
- **Legacy protocol-1 state as the probe.** Seeding a valid protocol-2 state would require
  a `ownership_manifest` that satisfies `validateManagedSurface`, coupling the guard to the
  install-profile schema. A protocol-1 file makes `readInstalledProfile` fail closed with the
  resolved path in the message, which is exactly the datum under test. Deterministic RED in
  all three real-home shapes: no state file (falls through, later throws on the catalog with
  a different path), a valid state (no throw), a legacy state (throws with the *real* home path).

## Deviations From Plan Or Spec

- The plan framed `bindBunRuntimeEnv` as "fix or verified-inert report". Enumeration proved
  it is not inert but load-bearing, so it was fixed. That is within Goal and Allowed Paths
  (`src/cli/commands/global-runtime.ts`), and it is why the regression guard covers the
  non-npx source path too — on that path `commandEnv` returns `undefined` untouched and
  `bindBunRuntimeEnv` alone owns the drop.
- Contract named `tests/cli/global-runtime.test.ts`; the file did not exist (only
  `global-runtime-init.test.ts`). Created as named, under the allowed `tests/cli/` prefix.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Fix `commandEnv` only, report `bindBunRuntimeEnv` as inert | Rejected | It is the sole sink and returns a non-optional record; leaving it would keep the non-npx path dropping the base and leave the class shape in place |
| Assert on `install agent fleet` step status (minimal vs full profile) | Rejected | Requires a schema-valid protocol-2 state file and false-passes if the operator's real home happens to hold a minimal-profile state |
| Change `commandEnv`'s signature to drop `undefined` | Rejected | Pre-adjudicated in the plan; `undefined` is well-defined in every consumer and the record, not the option type, was the bug |

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
