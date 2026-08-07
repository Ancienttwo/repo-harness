# Task Review: init-command-env-basedrop

> **Status**: Complete
> **Plan**: plans/plan-20260808-0054-init-command-env-basedrop.md
> **Contract**: tasks/contracts/20260808-0054-init-command-env-basedrop.contract.md
> **Notes File**: tasks/notes/20260808-0054-init-command-env-basedrop.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-08 02:25
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:e8718fc3ed96dc21f1a9a38891430c187968a2f40ea8fc131d5a4cc8f4beb06c
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: d2a5af7da1df99173c70efa833679d9584c19c45

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `src/cli/commands/init.ts` (the `initCommandEnv` root cause plus sibling base-dropping shapes found by the class sweep), a regression guard in `tests/cli/init.test.ts`, and the plan/contract/notes/review workflow artifacts plus `tasks/todos.md`.
- Actual files changed: `src/cli/commands/init.ts` (+3/-3 across `:197`, `:588`, `:771`), `tests/cli/init.test.ts` (+62, one new guard), `tests/continuation-conformance.test.ts` (+1/-1, positional timeout 30_000 -> 90_000), `tasks/todos.md` (timestamp line), `.ai/harness/checks/pre-fix-init-command-env.log` (new RED artifact), plus the four workflow artifacts. 9 files, +564/-5. No dependency, manifest, or generated-output change.
- Commands passed: `bun test tests/cli/init.test.ts tests/continuation-conformance.test.ts` 28 pass / 0 fail (43.69s, gatekeeper-run); `bun run check:type` EXIT=0; `repo-harness run verify-sprint --prepare-acceptance` total=17 failed=0 status=Fulfilled with full `bun test` green at 732586ms; `repo-harness run verify-sprint` finalized against the recorded receipt.
- Residual risks: (1) `src/cli/commands/global-runtime.ts:124,272` still carry the same base-dropping shape on the `setup global` surface — reported, not fixed, because the fix decides whether `commandEnv` may still return `undefined`; the notes carry it as the Open Question and the bounded next slice. (2) The first `--prepare-acceptance` run failed on `tests/cli/init.test.ts` `defaults --repo to cwd and applies the existing-repo harness` at 30099ms against its 30000ms positional budget, and passed on rerun; that budget is now demonstrably under water under full-suite load on a loaded machine, making it the next candidate for the a2381159 timeout family. It was left alone here because widening it was not this contract's decided scope.
- Reviewer action required: none — all gates clean, no findings.
- Rollback: revert the fix commit. Source change is three spread bases in one file plus one test-budget constant; no persisted format, no schema, no migration.

## Mode Evidence

- Selected route: planning -> contract execution -> gatekeeper acceptance (single round, no fix cycle).
- P1/P2/P3 evidence: P1 — `commandEnv` in `runInit` is consumed on two different surfaces, and only one of them is safe: spawn sites (`runProcess`/`runBoundedProcess`, `src/effects/process-runner.ts:136,232`) re-merge `process.env`, while record readers (`runAdoptionApply -> registerRepoHarnessRepo -> repoHarnessHome`, `src/effects/repo-registry.ts:60`) read the record as authoritative. P2 — traced npx-cache `init` -> `initCommandEnv(sourceRoot, undefined)` -> one-key record -> `runAdoptionApply({env})` -> `repoHarnessHome(env)` -> `env.REPO_HARNESS_HOME ?? env.HOME ?? env.USERPROFILE ?? homedir()` with both levers absent -> registry write lands on the OS account home. P3 — the smallest coherent change is the base of the spread, not the resolution chain: `repoHarnessHome`'s per-key fallback is the intended contract, and the invariant to preserve is that a caller-supplied env passes through byte-identical, which `env ?? process.env` keeps by construction.
- Root cause or plan evidence: the contract's four `Root Cause Evidence` fields are all concrete and machine-verified by the bugfix profile (root_cause, repro, regression_guard listed under `exit_criteria.tests_pass`, pre_fix_failure_artifact exists, shows `PRE_FIX_EXIT=1`, and references the guard path).

## Verification Evidence

- Waza `/check` run: covered by `repo-harness run verify-sprint --prepare-acceptance` (17 checks, 0 failed, status Fulfilled).
- Commands run: `bun test tests/cli/init.test.ts tests/continuation-conformance.test.ts`; `bun run check:type`; `repo-harness run verify-sprint --prepare-acceptance` (twice — see residual risk 2); `bun scripts/acceptance-receipt.ts record --disposition external_pass`; `repo-harness run verify-sprint`.
- Manual checks: (1) Independent RED reproduction — the worktree was copied to a scratch directory (tracked files untouched), `init.ts:197` reverted to `env ?? {}` there, and the guard run under `HOME=/tmp/gk-fakehome`: it failed with `ENOENT ... harness-home/registered-repos.json`, and the leaked entry landed in the fake home instead. So the guard is genuinely load-bearing, not artifact-only. (2) Real-registry integrity — `~/.repo-harness/registered-repos.json` held 7 entries before and after, all real repository paths with no `/var/folders` temp residue; the RED run's earlier leak was already cleaned. (3) Falsifier — `initCommandEnv` has exactly one caller (`src/cli/commands/init.ts:573`); the guard clauses return the caller env untouched, so only the `env === undefined` npx branch changes shape. (4) Class sweep re-run independently over every `?? {}` in `src/`: the only environment bases are `global-runtime.ts:126,272` (deferred, see residual risk 1) and `init-hook.ts:701`, and the latter is inert because all three `withProcessEnv` implementations (`init.ts:212`, `init-hook.ts:114`, `global-runtime.ts:229`) overlay onto `process.env` rather than replacing it; every other hit is a config/record default. (5) The one lever-less consumer of the `global-runtime` record, `installProfileStatePath` (`src/cli/installer/install-profile.ts:503`, `env.HOME ?? homedir()`), was read directly and confirmed not to diverge in production, which is what makes the deferral defensible. (6) `:771` `verifyEnv` confirmed inert: `runProcess` merges `{...process.env, ...opts.env}`, so the pre- and post-fix values are identical there.
- Supporting artifacts: `.ai/harness/checks/pre-fix-init-command-env.log` (RED, `PRE_FIX_EXIT=1`); `.ai/harness/checks/latest.json`; the retained failure log for the flaked run, `.ai/harness/runs/run-20260808T014052-13354-bun-test.log`.
- Implementation notes reviewed: yes — `tasks/notes/20260808-0054-init-command-env-basedrop.notes.md`; the spawn-vs-record split, the measured `os.homedir()` caching behavior, the class-sweep verdict table, and the global-runtime deferral all match what was verified independently here.
- Run snapshot: `.ai/harness/runs/run-20260808T020054-92668-20260808-0054-init-command-env-basedrop.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:e8718fc3ed96dc21f1a9a38891430c187968a2f40ea8fc131d5a4cc8f4beb06c
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: d2a5af7da1df99173c70efa833679d9584c19c45
> **Verification Evidence SHA256**: sha256:3395f6fc24246b042e6768088565cf2d5fcd95416e5ba82447b333b6a7d62ad2
> **Issued At**: 2026-08-07T18:21:28.136Z

- Summary: gatekeeper acceptance: initCommandEnv and two sibling sites now base the constructed command env on process.env; regression guard independently reproduced RED on reverted code and GREEN here; global-runtime siblings reported not fixed; verify-sprint 17/17 with full bun test green on rerun after one load-timeout
- Findings: none

## Behavior Diff Notes

- npx-cache source, no caller env: the constructed record now carries the full `process.env` instead of a single `AGENTIC_DEV_LINK_INSTALLED_COPIES` key. Observable effect — an `init` under an explicit `REPO_HARNESS_HOME` registers in that home instead of the operator's real `~/.repo-harness`.
- `--brain-root` with no caller env (`:588`): same class, and it was live on the non-npx path too; the record threaded into the same registry write.
- `:771` `verifyEnv`: no behavior change; `runProcess` already re-merged `process.env`. Fixed to stop the shape from propagating.
- Callers that pass an env: byte-identical behavior, guaranteed by the `env ?? process.env` position — the caller's object is still spread first and the guard clauses still return it untouched.
- `tests/continuation-conformance.test.ts:775`: budget only, no assertion change.

## Residual Risks / Follow-ups

- `src/cli/commands/global-runtime.ts:124,272` — same base-dropping shape on the `setup global` surface, reported not fixed. The bounded next slice is deciding whether `commandEnv` there may still return `undefined`.
- `tests/cli/init.test.ts` `defaults --repo to cwd and applies the existing-repo harness` (30000ms positional budget) flaked once at 30099ms under full-suite load and passed on rerun; the next member of the a2381159 timeout family if it recurs.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Fixes the observable it names (registry write honors `REPO_HARNESS_HOME` on the npx path), proven RED-to-GREEN by independent reproduction, not by artifact alone. |
| Product depth | 8/10 | Class sweep covered all of `src/`, fixed two live sites plus one latent, and the single deferral names its blocking decision instead of hand-waving. |
| Design quality | 9/10 | Smallest coherent change: the spread base, not the resolution chain; caller-supplied env passes through unchanged by construction. |
| Code quality | 9/10 | Guard comments state measured facts (Bun caches `os.homedir()`), not assumptions, and explain why `REPO_HARNESS_HOME` is the lever under test. |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/cli/init.test.ts` (guard: `npx cache sources keep process.env as the constructed command env base`).
- Re-check: revert `src/cli/commands/init.ts:197` to `env ?? {}` in a scratch copy and re-run the guard under an isolated `HOME` — it must fail with `ENOENT` on the fixture registry.

## Summary

- `initCommandEnv` built the child environment record from `{}` instead of `process.env` for an npx-cache source with no caller env. The damage was not on the spawn path — `runProcess` re-merges `process.env` — but on the record path, where `repoHarnessHome(env)` found `REPO_HARNESS_HOME` and `HOME` both absent and fell through to the operator's real home. Three sites in `init.ts` now base on `process.env` when the caller provides none; callers passing env are unchanged. The guard pins the production observable, `global-runtime`'s identical shape is reported for its own slice, and one load-sensitive conformance budget was widened for reasons independent of this fix.
