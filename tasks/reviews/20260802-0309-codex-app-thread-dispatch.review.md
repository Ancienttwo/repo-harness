# Task Review: codex-app-thread-dispatch

> **Status**: Pending
> **Plan**: plans/plan-20260802-0309-codex-app-thread-dispatch.md
> **Contract**: tasks/contracts/20260802-0309-codex-app-thread-dispatch.contract.md
> **Notes File**: tasks/notes/20260802-0309-codex-app-thread-dispatch.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-02 04:40
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:0b8c795fab627290e94701c758029237e983a72bd48acac28a140a2ca1a0850b
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: d31f1134

## Human Review Card

- Verdict: pass (gate round 2; round 1 returned FAIL on two findings at `a6a50ee7`, both re-verified closed at `75bab837`)
- Change type: code-change
- Intended files changed: the contract's Allowed Paths — `.ai/harness/policy.json`, `src/cli/hook/subagent-handler.ts`, `src/cli/hook/session-context.ts`, the `docs/`+`assets/` `external-tooling.md` pair, `tests/subagent-handler.test.ts`, `tests/session-context.test.ts`, plus the round-2 additions `scripts/lib/project-init-lib.sh`, `scripts/ensure-task-workflow.sh`, `assets/templates/helpers/ensure-task-workflow.sh`, `tests/create-project-dirs.runtime.test.ts`, and this package's own plan/contract/notes/review/todos artifacts.
- Actual files changed: 16 paths in `git diff 7e7d9bc2..75bab837` (+619/-29), zero outside Allowed Paths. The round-2 fix commit is 11 paths (+51/-10).
- Commands passed: `bun test` full suite (2127 pass / 1 skip / 0 fail, 16224 expects, 168 files); `cmp scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh` (identical); `cmp docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md` (identical); `bash -c '! rg -q "gpt-5\.6" src/'` (exit 0); `repo-harness run check-task-workflow --strict` ([workflow] OK); `bun src/cli/index.ts init --repo . --dry-run` (0 operations); `bash scripts/check-task-sync.sh`; `bash scripts/check-architecture-sync.sh` (exit 0, advisory).
- Residual risks: whether the live `codex_app__create_thread` surface accepts a per-role `model`/`thinking` is unproven on this host — a declared post-merge runtime-readiness canary, per the contract Falsifier. This slice ships routing wording plus policy/seed values only; no thread-routing code path, hook route, or evidence field exists yet. Secondary: the no-contract delegation envelope emits the thread-lifecycle rules without a runner preamble, so its "on the SAME contract" phrasing is nominally loose (pre-existing shape, fails safe toward sequential execution).
- Reviewer action required: none.
- Rollback: revert the squash-merge commit; `preferred_runners`/`runner_rule` return to native-first and the advisor/standing-auth wording reverts with them. No runtime state outside the repo is touched.

## Mode Evidence

- Selected route: code-change (contract Task Profile `code-change`; Root Cause Evidence gate not applicable).
- P1/P2/P3 evidence: `plans/plan-20260802-0309-codex-app-thread-dispatch.md` (P1 map / P2 trace / P3 decision), with the P1 map amended after round 1 to correct the false "no assets seed" claim.
- Root cause or plan evidence: native MultiAgentV2 flat `spawn_agent` cannot select Luna, so a `fast-worker` dispatch silently inherits the parent model — falsified canary recorded in `plans/plan-20260711-0219-codex-native-role-model-override.md:52-54` (Blocked).

## Verification Evidence

- Waza `/check` run: gatekeeper acceptance rounds 1 and 2 in this worktree; round 2 verdict PASS at `75bab837`.
- Commands run: full `bun test`; the three targeted files (`tests/subagent-handler.test.ts`, `tests/session-context.test.ts`, `tests/create-project-dirs.runtime.test.ts`, 60 pass / 0 fail); both `cmp` parity pairs; the `gpt-5.6` literal scan; `check-task-workflow --strict`; `init --repo . --dry-run`; `check-task-sync.sh`; `check-architecture-sync.sh`; then the acceptance chain `verify-sprint.sh --prepare-acceptance` -> `acceptance-receipt.ts record --disposition external_pass` -> `verify-sprint.sh`.
- Manual checks: finding 1 (downstream seed skew) closed by decoding each seed's heredoc line as a JSON string and comparing to `.ai/harness/policy.json` — `runner_rule` is verbatim-equal at 975 chars and `preferred_runners` element-equal in all three seeds, with `rg -uu` finding zero surviving copies of the old native-first text. Heredoc safety checked per file: `ensure-task-workflow.sh:1018` uses a quoted `<<'POLICY_EOF'`, while `pi_write_harness_policy` uses an expanding heredoc, so the new string was scanned for `$`, backticks, and backslashes (none) — and `tests/create-project-dirs.runtime.test.ts` proves it at runtime by spawning the real scaffold script and `JSON.parse`-ing the generated policy. Finding 2 (asymmetric fail-closed) closed by reading both advisor surfaces end to end: the thread clause and the native clause share one criterion (can the live surface carry the role's exact model/effort) and one consequence (not adoptable as a role-routed worker, degrade and record), so a literal-minded orchestrator has no path to a model-less thread adopted as a role worker. Invariants re-proven rather than assumed: `EXECUTION_BOUNDARY` lines across `src`/`scripts`/`assets` hash to the same md5 at base `7e7d9bc2` and at `75bab837`.
- Supporting artifacts: run snapshots under `.ai/harness/runs/` (gitignored); evidence events `evt-01KYZGJ6WJHCP0HKQAN1HD46R1` (prepare) and `evt-01KYZGKARMNM1B9HTSJXV03T23` (finalize).
- Implementation notes reviewed: yes — `tasks/notes/20260802-0309-codex-app-thread-dispatch.notes.md`, including its "Round 2 (gate findings)" section.
- Run snapshot: `.ai/harness/runs/run-20260802T042809-56362-20260802-0309-codex-app-thread-dispatch.json`.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:0b8c795fab627290e94701c758029237e983a72bd48acac28a140a2ca1a0850b
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 876725fec5f9c344923e22ae798d0f450c05b01b
> **Verification Evidence SHA256**: sha256:928e4beb70518c8244ef053df468cf91834fc53426d64ef7ce67a7fb384b1a85
> **Issued At**: 2026-08-01T20:35:01.415Z

- Summary: Gate review round 2 PASS. Code subject verified at 75bab837 (ledger-only commit d31f1134 adds Task Breakdown ticks): full bun test 2127 pass / 1 skip / 0 fail; downstream delegation seeds in scripts/lib/project-init-lib.sh, scripts/ensure-task-workflow.sh and assets/templates/helpers/ensure-task-workflow.sh carry preferred_runners/runner_rule verbatim-equal (975 chars) to .ai/harness/policy.json:220,223 with zero stale copies repo-wide; symmetric thread-path fail-closed clause present and coherent in subagent-handler.ts sharedRules + contract sentence and session-context.ts standing-auth block; EXECUTION_BOUNDARY md5 unchanged vs base 7e7d9bc2; cmp parity holds for ensure-task-workflow.sh and external-tooling.md pairs; no gpt-5.6 literals under src/.
- Findings: none

## Behavior Diff Notes

- Codex-host delegation advice changes order and conditions: App Thread dispatch becomes the preferred accelerator, native `spawn_agent` becomes an evidence-gated fallback that is forbidden whenever the live spawn schema cannot carry the role's exact model/effort, and both paths now fail closed to codex-exec then sequential main-thread on the same contract with the degradation recorded.
- Downstream generated repos receive the same `preferred_runners`/`runner_rule` values as this repo instead of the old native-first pair.
- No executable routing behavior changed: these are policy values and injected-context strings; no hook route, CLI helper, or evidence field was added.

## Residual Risks / Follow-ups

- Post-merge runtime canary: confirm on a live Codex host whether `codex_app__create_thread` accepts per-role `model`/`thinking`. If it does not, thread-first dispatch cannot honor per-role models either and the direction — not just the wording — needs revisiting.
- `codex-app-thread` now appears in `preferred_runners` but no runner-label enumeration exists under `src/` (verified by grep), so no validation surface needed updating this slice. If a `--runner` label whitelist is ever added, it must include this label.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 8/10 | Wording and policy values are correct and internally consistent; runtime acceptance of per-role thread models is still unproven by design. |
| Product depth | 8/10 | Closes the actual failure (silent parent-model inheritance) on both dispatch paths rather than only the preferred one. |
| Design quality | 9/10 | Fail-closed and symmetric; no compatibility shim, no new abstraction, degradation must be recorded. |
| Code quality | 9/10 | Seeds copied verbatim from the single source of truth, mirror produced by the sanctioned sync script, pins added at the runtime-generated layer. |

## Failing Items

- None outstanding. Round 1 raised two blocking findings — downstream delegation seeds still carrying the old native-first values, and a thread path that lacked the native path's fail-closed clause — both fixed in `75bab837` and re-verified closed here.

## Retest Steps

- Re-run: `bun test`; `bash scripts/verify-sprint.sh --prepare-acceptance`.
- Re-check: `cmp scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh`; `cmp docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md`; `bash -c '! rg -q "gpt-5\.6" src/'`; verbatim equality of the three seeds' `preferred_runners`/`runner_rule` against `.ai/harness/policy.json`.

## Summary

- Accepted. The Codex-side runner preference now points at App Thread dispatch with the role's exact model and reasoning effort, native `spawn_agent` is demoted to an evidence-gated fallback that is forbidden when it cannot carry that model/effort, and both paths degrade fail-closed on the same contract with the degradation recorded. Downstream seeds match this repo's policy verbatim, the advisor and standing-authorization surfaces state the rule symmetrically, and the full suite passes at 2127/0. Runtime readiness is explicitly not claimed.
