# Task Review: global-runtime-env-basedrop

> **Status**: Complete
> **Plan**: plans/plan-20260808-0924-global-runtime-env-basedrop.md
> **Contract**: tasks/contracts/20260808-0924-global-runtime-env-basedrop.contract.md
> **Notes File**: tasks/notes/20260808-0924-global-runtime-env-basedrop.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-08 10:20
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:9578d30830f16661c330da7c92a664a6aeb2f15494091125a98cdf1d60880469
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 44072affa429baa8e826c3ee89c5d873eced6238

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `src/cli/commands/global-runtime.ts` (`commandEnv` plus the `bindBunRuntimeEnv` disposition), a regression guard at the contract-named path `tests/cli/global-runtime.test.ts`, the RED artifact, and the plan/contract/notes/review workflow artifacts plus `tasks/todos.md`.
- Actual files changed: `src/cli/commands/global-runtime.ts` (+5/-7 across `:126` and `:271-275`), `tests/cli/global-runtime.test.ts` (new, 86 lines, two guards), `.ai/harness/checks/pre-fix-global-runtime-env.log` (new RED artifact, `PRE_FIX_EXIT=1`), `tasks/todos.md` (timestamp line), plus the four workflow artifacts. 8 files, +581/-7. No dependency, manifest, or generated-output change.
- Commands passed: `bun test tests/cli/global-runtime.test.ts tests/cli/global-runtime-init.test.ts tests/cli/init.test.ts` 53 pass / 0 fail (24.09s, gatekeeper-run); `bun run check:type` EXIT=0; `bun test` full suite 2260 pass / 1 skip / 0 fail (567.34s, gatekeeper-run); `bun src/cli/index.ts init --repo . --dry-run` EXIT=0; `verify-sprint --prepare-acceptance` total=17 failed=0 status=Fulfilled with full `bun test` green at 571687ms; `verify-sprint` finalized against the recorded receipt.
- Residual risks: (1) `commandEnv` is now byte-identical to `initCommandEnv` (`src/cli/commands/init.ts:194-198`) in a second file. The duplication is deliberate and documented at `global-runtime.ts:54-61` as this file's existing pattern for init-shaped helpers, but the class now has two copies to keep in step if the npx flag convention changes. (2) On the npx-no-caller-env path the record now carries the full process environment into `withProcessEnv`, whose `finally` restores every key it set; that is a no-op today because no code under `runInstall` mutates `process.env` persistently (swept: the only `process.env` writers in `src/` are the three `withProcessEnv` implementations themselves).
- Reviewer action required: none — all gates clean, no findings.
- Rollback: revert the fix commit. Source change is two spread bases and one branch restructure in one file; no persisted format, no schema, no migration.

## Mode Evidence

- Selected route: planning -> contract execution -> gatekeeper acceptance (single round, no fix cycle).
- P1/P2/P3 evidence: P1 — `runGlobalRuntimeSetup` builds exactly one environment record (`global-runtime.ts:648`) and threads it into two classes of consumer: spawn sites, which are safe because `runBoundedProcess` re-merges `{...process.env, ...env}` (`src/effects/process-runner.ts:136,232`), and in-process record readers, which are safe only where they carry their own `process.env` step. P2 — traced setup-global with no caller env: `commandEnv(sourceRoot, undefined)` -> (npx) one-key record or (non-npx) `undefined` -> `bindBunRuntimeEnv` materializes either into a `{ PATH }`-shaped record -> the record's very first use, `readInstalledProfile(env)` (`:649`) -> `installProfileStatePath` (`src/cli/installer/install-profile.ts:503`, `env.HOME ?? homedir()`) with no `process.env` step -> install-state resolves against Bun's process-start `homedir()` cache, i.e. the operator's real home, whatever the caller passed. P3 — the smallest coherent change is the base of both spreads, not the resolution chains: `env ?? process.env` keeps caller-supplied env byte-identical by construction, and `commandEnv` keeps returning `undefined` on non-npx sources because that value is well-defined in every consumer.
- Root cause or plan evidence: the contract's four `Root Cause Evidence` fields are concrete and machine-verified by the bugfix profile (root_cause; repro; regression_guard listed under `exit_criteria.tests_pass`; pre_fix_failure_artifact exists, shows `PRE_FIX_EXIT=1`, and references the guard path).

## Verification Evidence

- Waza `/check` run: covered by `verify-sprint --prepare-acceptance` (17 checks, 0 failed, status Fulfilled).
- Commands run: `bun test tests/cli/global-runtime.test.ts tests/cli/global-runtime-init.test.ts tests/cli/init.test.ts`; `bun run check:type`; `bun test` (full); `bun src/cli/index.ts init --repo . --dry-run`; `verify-sprint --prepare-acceptance`; `bun scripts/acceptance-receipt.ts record --disposition external_pass`; `verify-sprint`.
- Manual checks: (1) Independent RED reproduction — a detached scratch worktree was created at the base commit `44072aff` (tracked files in the delivery worktree untouched), the committed guard copied in, and run there: 0 pass / 2 fail, failure text matching the archived artifact line for line. (2) Mutation isolation — in that same scratch tree, fixing only `bindBunRuntimeEnv` left the npx guard failing (1 pass / 1 fail), and fixing only `commandEnv` left the non-npx guard failing (1 pass / 1 fail). Each test pins exactly one helper, so neither edit is guard-dead. (3) Falsifier, independently swept — `commandEnv` and `bindBunRuntimeEnv` are both module-private with exactly one call site each (`:648`), and no consumer of the record reads its key set semantically: `configureCodegraph` and `configureBrainRoot` use `env` only for HOME resolution and spawns and never serialize it into a config file, so nothing depends on the record being minimal. (4) Unmasked-sink sweep — every other consumer on this chain (`homeDir`, `isSelfManagedBun`, `bunGlobalPackageRoot`, `updateAvailableHint`, `expandHomePath`, `defaultBrainRootChoice`) carries an explicit `process.env` step and is masked either way; `installProfileStatePath` is confirmed as the only one that is not. (5) Class sweep re-run over the remaining `?? {}` env bases in `src/`: `helper-runner.ts:359`, `process-runner.ts:136,232`, and `init-hook.ts:563` already spread onto `process.env`, and `init-hook.ts:701` `doctorEnv` is inert because its only consumer is `withProcessEnv`, which overlays keys onto the live `process.env` rather than replacing it. No sibling of this class is left in `src/`. (6) Real-home integrity — `~/.repo-harness` was checksummed (494 files) before the test runs and again after both the GREEN and the scratch RED runs: byte-identical, no temp-path residue, so the guard's zero-side-effect claim holds and the RED path wrote nothing either.
- Supporting artifacts: `.ai/harness/checks/pre-fix-global-runtime-env.log` (RED, `PRE_FIX_EXIT=1`); `.ai/harness/checks/latest.json`.
- Implementation notes reviewed: yes — `tasks/notes/20260808-0924-global-runtime-env-basedrop.notes.md`; the Falsifier enumeration, the "bindBunRuntimeEnv is not inert" deviation, and the protocol-1 probe rationale all match what was verified independently here.
- Run snapshot: `.ai/harness/runs/run-20260808T095855-4946-20260808-0924-global-runtime-env-basedrop.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:9578d30830f16661c330da7c92a664a6aeb2f15494091125a98cdf1d60880469
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 44072affa429baa8e826c3ee89c5d873eced6238
> **Verification Evidence SHA256**: sha256:bb1f746456c4d1dd813674397e6509abd8fd8ef213af9f22970063fba6039f56
> **Issued At**: 2026-08-08T02:14:20.324Z

- Summary: gatekeeper acceptance: commandEnv and bindBunRuntimeEnv now base the constructed setup-global env on process.env; guard RED independently reproduced at the base commit and mutation-isolated so each test pins one helper; bindBunRuntimeEnv caller/sink enumeration confirmed no minimality dependence; verify-sprint 17/17 with full bun test 2260 pass / 0 fail
- Findings: none

## Behavior Diff Notes

- npx-cache source, no caller env: the constructed record now carries the full `process.env` plus the bound `PATH` instead of `{ AGENTIC_DEV_LINK_INSTALLED_COPIES, PATH }`. Observable effect — `setup-global` under an overridden `HOME` resolves install state under that home instead of the operator's real `~/.repo-harness`.
- Non-npx source, no caller env: `commandEnv` returns `undefined` exactly as before; the change is entirely in `bindBunRuntimeEnv`, which no longer materializes that `undefined` into a `{ PATH }`-only environment. Same observable.
- Caller-supplied env, either source: byte-identical behavior. The npx-with-flag and non-npx branches now return the caller's object by reference rather than a shallow copy, which is unobservable because the sole sink spreads it into a new record and never mutates it.
- Spawned children: no change on any path. `runBoundedProcess` already merged `{...process.env, ...env}`.

## Residual Risks / Follow-ups

- `commandEnv` is now a byte-identical twin of `initCommandEnv` in a second file; the duplication is deliberate and documented at `global-runtime.ts:54-61`, but both copies must move together if the npx flag convention changes.
- The guard asserts through `readInstalledProfile`'s fail-closed error on a protocol-1 state file. If protocol 1 is ever dropped from the reader, the probe needs replacing with a schema-valid protocol-2 fixture; the notes already record why that shape was rejected today.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Both base-droppers fixed, caller-supplied env provably unchanged, spawn paths unaffected |
| Product depth | 9/10 | Closes the class the #169 sweep opened and leaves no sibling shape in `src/` |
| Design quality | 8/10 | Exact #169 shape reused rather than reinvented; the cost is a second copy of the same four lines |
| Code quality | 9/10 | Net -2 lines, one branch structure replaced by three guard clauses, guard comments carry the reasoning |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/cli/global-runtime.test.ts` (both cases must pass), then `verify-sprint --prepare-acceptance`.
- Re-check: revert either `global-runtime.ts:126` or `:271-275` in a scratch tree and confirm the matching guard goes RED.

## Summary

- `commandEnv` and `bindBunRuntimeEnv` both based their constructed environment on `{}`, so a `setup-global` invocation with no caller env produced a one- or two-key record that `readInstalledProfile` -> `installProfileStatePath` read as the whole environment and silently resolved against the operator's real home. Both now base on `process.env` when the caller provides none. Enumeration confirmed no consumer depends on the record being minimal, the two guards are mutation-isolated to one helper each, RED was independently reproduced at the base commit, and the full suite, typecheck, init dry-run, and `verify-sprint` are green with zero writes to the real `~/.repo-harness`.
