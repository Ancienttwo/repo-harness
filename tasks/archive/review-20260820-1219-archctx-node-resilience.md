> **Archived**: 2026-08-20 12:19
> **Related Plan**: plans/archive/plan-20260820-0515-archctx-node-resilience.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-1219

# Task Review: archctx-node-resilience

> **Status**: Complete
> **Plan**: plans/plan-20260820-0515-archctx-node-resilience.md
> **Contract**: tasks/contracts/20260820-0515-archctx-node-resilience.contract.md
> **Notes File**: tasks/notes/20260820-0515-archctx-node-resilience.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-20 12:20
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:831a68a5327834df534809c5bd4f5459786ef22503da9dfbf93217e773816fbe
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 089f9dbe01c07ef968f1ed41c48ea28ad4291d3a

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: the contract `allowed_paths` set - `src/effects/runtime/node-candidates.ts` (new shared module), `src/cli/runtime/helper-runner.ts`, `src/effects/architecture/archctx-provider.ts`, `tests/architecture-projection-provider.test.ts`, plus plan/contract/review/notes and the `tasks/todos.md` row deletion
- Actual files changed: exactly those 9 files (+629 -42). No `scripts/`, `assets/`, template, `package.json`, or lockfile change; `scrubHarnessEnv()` and `ARCHCONTEXT_NODE_RANGE` untouched
- Commands passed: `bun test` 2706 pass / 1 skip / 0 fail; `bun run check:type` exit 0; `bash scripts/check-architecture-sync.sh` exit 0 both standalone under a scrubbed env and inside the bounded verifier; `bun scripts/check-state-boundaries.ts` OK on 168 files; `bun test tests/architecture-projection-provider.test.ts` 19/0; `bun test tests/architecture-projection-orchestration.test.ts` pass; helper mirror `cmp` identical
- Residual risks: one P3 style note (bare `'fs'`/`'path'` specifiers in the moved module, inherited verbatim). The new tier executes candidate binaries from fixed system paths plus `$HOME/.nvm`, which is the same trust set `helper-runner` already used, and it is only reachable after the explicit and PATH tiers both miss
- Reviewer action required: none; acceptance recorded
- Rollback: additive tier plus one module move in a single publication commit; one revert restores prior behavior. `REPO_HARNESS_NODE_BIN` environments are unaffected either way

## Mode Evidence

- Selected route: gatekeeper acceptance review of a completed work-package (T1-T4), followed by an orchestrator-ordered ship execution
- P1/P2/P3 evidence: P1 - the resolution boundary is `resolveCompatibleNodeRuntime()` in `src/effects/architecture/archctx-provider.ts`, with `src/cli/runtime/helper-runner.ts` as the second consumer and `scripts/check-state-boundaries.ts` as the placement authority. P2 - traced `check-architecture-sync.sh:219` -> `bun $repo/src/cli/index.ts architecture-projection status --json` -> provider handshake -> `resolveCompatibleNodeRuntime()` -> tier scan, confirming the gate exercises worktree source rather than the global 0.16.0 CLI. P3 - the pre-existing shape is PATH-only because the explicit `REPO_HARNESS_NODE_BIN` authority was assumed present; the bounded verifier's whole-prefix scrub removes that assumption, so the smallest coherent change is a third tier behind the existing two, not a change to the scrub
- Root cause or plan evidence: `plans/plan-20260820-0515-archctx-node-resilience.md` T1-T4 and the deleted `tasks/todos.md` ledger row

## Verification Evidence

- Waza `/check` run: not used; acceptance ran through `repo-harness run verify-sprint --prepare-acceptance` (all 9 exit criteria green, `status=Fulfilled`) and the finalizing `repo-harness run verify-sprint`
- Commands run: see the Human Review Card `Commands passed` line; every command was executed in the review session with output captured
- Manual checks: repo-wide `rg` confirming a single candidate scanner; `cmp` on the `run-bounded-verifier-command.ts` helper mirror; direct machine node inventory (`/usr/bin/node` absent, `/usr/local/bin/node` v22.16.0, `/opt/homebrew/bin/node` v26.5.0, nvm v24.18.0)
- Supporting artifacts: `.ai/harness/checks/latest.json`; run snapshot `.ai/harness/runs/run-20260820T120311-81765-20260820-0515-archctx-node-resilience.json`
- Implementation notes reviewed: yes - `tasks/notes/20260820-0515-archctx-node-resilience.notes.md`; its stated machine inventory and boundary-checker evidence were independently reproduced and matched
- Run snapshot: `.ai/harness/runs/run-20260820T120311-81765-20260820-0515-archctx-node-resilience.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:831a68a5327834df534809c5bd4f5459786ef22503da9dfbf93217e773816fbe
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 089f9dbe01c07ef968f1ed41c48ea28ad4291d3a
> **Verification Evidence SHA256**: sha256:83b18ab7136540633cf49ef05d8249b0f1b3df24af73216730af6d453ba2ab72
> **Issued At**: 2026-08-20T04:15:33.502Z

- Summary: Gatekeeper acceptance for archctx-node-resilience (T1-T4). A scope: 9 files all within allowed_paths (+629 -42); zero scripts/assets/template changes; scrubHarnessEnv() and ARCHCONTEXT_NODE_RANGE untouched; helper mirror cmp identical; no package.json/lockfile/dependency change. B single authority: repo-wide rg confirms exactly one candidate scanner (src/effects/runtime/node-candidates.ts); helper-runner.ts imports it rather than copying; the move-enumeration-only tradeoff holds because helper-runner executes candidates through the bounded runProcess (protected PATH, inheritEnv:false) while the provider uses spawnSync with caller env, so merging execution would have moved a trust boundary; check-state-boundaries OK on 168 files with no suppression. C tier order: REPO_HARNESS_NODE_BIN still returns first (archctx-provider.ts:135) before any new code, so environments setting it see zero behavior change (the rollback promise); PATH tier unchanged; trusted tier only after both miss; every tier applies the ARCHCONTEXT_NODE_RANGE check; fail-closed preserved and extended, and the "(unset)" wording is only reachable when genuinely unset. D two independent before/after proofs: (1) the real gate inner command on worktree source returned state=ready version=0.4.4 while main 089f9dbe (pre-fix) returned state=error with the OLD message "no compatible node executable was found on PATH"; attribution verified since check-architecture-sync.sh:219 takes the bun $repo/src/cli/index.ts branch, not the global 0.16.0 CLI; (2) a production-code counterfactual through the injection seam under the scrubbed env: tier1+tier2-only THREW, default source RESOLVED ~/.nvm/versions/node/v24.18.0/bin/node. Machine inventory independently confirmed: /usr/bin/node absent, /usr/local/bin/node v22.16.0, /opt/homebrew/bin/node v26.5.0 (both out of range), nvm v24.18.0 in range. E deviations adjudicated: the rewritten fail-closed test is the intended semantic change, not masked regression (old test asserted exactly the semantics this contract changes; rewrite preserves intent and adds the extended-message assertion, with a new test covering the trusted tier fail-closed against a real scoped list); trustedNodeCandidateSource defaults to the real scan, production call site passes undefined, only tests set it, matching the existing RunArchctxProcess seam; trustedNodeCandidates(home) is byte-equivalent to the previous internal userInfo().homedir read. F test honesty: three new behavior assertions, no tautologies. Verification in this session: targeted provider suite 19/0; check-state-boundaries OK; check:type exit 0; scrubbed-env check-architecture-sync.sh exit 0 state=ready blocking=0; full bun test 2706 pass/1 skip/0 fail (baseline 2703 +3, exactly the new tests, no flake). prepare-acceptance ran all 9 exit criteria green including check-architecture-sync.sh INSIDE the bounded verifier (1133ms) which is this contract self-proof, and tests/architecture-projection-orchestration.test.ts passed clean at 5237ms without hitting the known timeout-flake class, so no isolation rerun was required.
- Findings: P3: src/effects/runtime/node-candidates.ts uses bare 'fs'/'path' imports while the consuming archctx-provider.ts uses node:-prefixed specifiers. Cosmetic inconsistency inherited verbatim from the helper-runner original, not introduced by this slice; deliberately not changed here to keep the move byte-identical. Fold into a future touch of this module, not a standalone fix.

## Behavior Diff Notes

- Before: with `REPO_HARNESS_NODE_BIN` stripped and no compatible Node on the protected PATH, `resolveCompatibleNodeRuntime()` threw and the projection provider reported `state=error` / `reason=archctx requires Node >=24 <26; no compatible node executable was found on PATH`, so every bounded-verifier gate reaching the architecture projection failed closed.
- After: the same scrubbed configuration resolves through the trusted-candidate tier to `~/.nvm/versions/node/v24.18.0/bin/node` and the provider reports `state=ready` / `version=0.4.4`.
- Unchanged: any environment that sets `REPO_HARNESS_NODE_BIN` returns from the first tier before reaching new code, and an incompatible explicit runtime still throws its own dedicated error rather than falling through.
- Fail-closed retained: with nothing compatible in any tier the call still throws, now naming all three scanned sources.

## Residual Risks / Follow-ups

- P3 (recorded in the AcceptanceReceipt): the moved module keeps bare `'fs'`/`'path'` specifiers while its consumer uses `node:`-prefixed ones. Inherited verbatim from the helper-runner original and deliberately left alone to keep the move byte-identical; fold into a future touch of this module.
- The `tests/architecture-projection-orchestration.test.ts` timeout-flake class remains open in `tasks/todos.md`. It did not trigger in this slice (passed at 5237ms), so no isolation rerun was needed and no ledger update was warranted.
- This slice ships no release; the fix rides the next scheduled version per the contract's non-goals.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | n/a | Acceptance here is contract-based, not scored: the pass condition is the contract's machine-verifiable exit criteria, all 9 green. A numeric score would add no constraint the exit criteria do not already state. |
| Product depth | n/a | Same; the goal authority is plan T1-T4 plus the deleted ledger row, each verified individually. |
| Design quality | n/a | Judged as named invariants instead: one candidate-scan authority, tier order preserving `REPO_HARNESS_NODE_BIN` primacy, version filtering on every tier, fail-closed retained. |
| Code quality | n/a | Judged by the state-boundary checker (OK, no suppression), the byte-identical helper-runner move, and the P3 finding above. |

## Failing Items

- None.

## Retest Steps

- Re-run: `repo-harness run verify-sprint --prepare-acceptance` (runs `bash scripts/check-architecture-sync.sh` inside the bounded verifier, which is this contract's self-proof).
- Re-check: reproduce the before/after directly with `env -i HOME=$HOME USER=$USER LOGNAME=$USER TMPDIR=/tmp LANG=en_US.UTF-8 PATH=/Users/ancienttwo/.bun/bin:/usr/bin:/bin:/usr/sbin:/sbin bash scripts/check-architecture-sync.sh` (expect exit 0; the same command on the pre-fix provider exits 1).

## Summary

- The delivery matches plan T1-T4 exactly, stays inside `allowed_paths`, and preserves the two invariants the contract named out of scope (`scrubHarnessEnv()` semantics and `ARCHCONTEXT_NODE_RANGE`).
- The fix is one shared authority rather than a second scanner, with version filtering deliberately left at each caller because the two callers execute candidates under different process authorities.
- The decisive proof is the contract's own sandboxed gate: `check-architecture-sync.sh` passing inside the bounded verifier, the exact configuration that had failed since 0.15.3, corroborated by a production-code counterfactual showing the pre-fix tier set still throws under the same env.
