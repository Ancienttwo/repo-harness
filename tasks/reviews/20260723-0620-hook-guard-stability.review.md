# Task Review: hook-guard-stability

> **Status**: Reviewed
> **Plan**: plans/plan-20260723-0620-hook-guard-stability.md
> **Contract**: tasks/contracts/20260723-0620-hook-guard-stability.contract.md
> **Notes File**: tasks/notes/20260723-0620-hook-guard-stability.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-23
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: bugfix
- Intended files changed: `src/effects/state/resolve-effective-state.ts` (stability-set partition), `src/cli/hook/runtime.ts` (typed resolution outcome + bounded retry), `src/cli/hook/mutation-guard.ts` (distinct residual-instability diagnostic), new `tests/state/effective-state-stability.test.ts`, package plan/contract/review/notes, todos timestamp projection, gitignored run evidence under `.ai/harness/runs/hook-guard-stability/`
- Actual files changed: exactly that set — verified by gatekeeper (`git diff bd461142 --stat`; forbidden paths sweep over locking/, circuit-breaker, scripts/, assets/, package.json, skill-surface, installer all empty; `tasks/todos.md` diff is one `Updated:` timestamp line from the worktree projection machinery)
- Commands passed: regression guard 2 pass/0 fail; `tests/state/` 126 pass; `tests/cli/` 378 pass/1 pre-existing skip; `check:type` clean; full `bun test` 1850 pass/1 skip/0 fail (no state-concurrency flake this run); `contract-run preflight` preflight_pass
- Residual risks: the stability-throw message string is duplicated between `runtime.ts:247` and `resolve-effective-state.ts:636,666` (no shared constant) — drift would downgrade the distinct diagnostic to the generic banner, still fail-closed, and the state-concurrency tests pin the message; flagged for a future cleanup, not fixed here (smallest-change discipline)
- Reviewer action required: none further — single gatekeeper round, verdict PASS
- Rollback: revert the single PR; the guard returns to the collapse-and-block behavior; no state artifacts or installed surfaces migrated either way

## Mode Evidence

- Selected route: bugfix (root-cause-first)
- P1/P2/P3 evidence: root-cause-prover diagnosis (DIAGNOSIS: CONFIRMED, 2026-07-23) — mechanism reproduced 30/30 under sustained git churn vs 0/200 baseline; probes archived at `.ai/harness/runs/hook-guard-stability/diagnosis-probes/`
- Root cause or plan evidence: contract Root Cause Evidence four-field block; pre-fix artifact `.ai/harness/runs/hook-guard-stability/pre-fix-regression.log` with `PRE_FIX_EXIT=1` showing the exact diagnosed throw on unfixed code

## Verification Evidence

- Waza `/check` run: one gatekeeper review (fresh context, read-only), verdict PASS with independent byte-parity re-verification (scratch clone at `bd461142` vs fixed worktree, three scenarios, `cmp` byte-identical)
- Commands run: see Human Review Card; executed in the contract worktree on base `bd461142`
- Manual checks: see Manual Check Evidence below
- Supporting artifacts: `.ai/harness/runs/hook-guard-stability/pre-fix-regression.log`; `.ai/harness/runs/hook-guard-stability/diagnosis-probes/` (FINDINGS-summary, probe scripts, probe JSON results)
- Implementation notes reviewed: yes — authority-set membership decision, retry-count choice, diagnostic wording, both-call-site partition rationale
- Run snapshot: `.ai/harness/runs/hook-guard-stability/`

## Manual Check Evidence

- [x] Regression guard proves both directions: non-authority churn no longer blocks; a real plan-contract conflict still blocks with today's exact message and exit code
  - Evidence: `tests/state/effective-state-stability.test.ts` direction (a) red on unfixed code (pre-fix artifact) and green post-fix; direction (b) asserts today's exact stdout/stderr strings and exit code 2 through the real guard, green on both unfixed and fixed code; blocker/unsupported-profile branches byte-unchanged in the diff (gatekeeper ruling c).
- [x] Pre-fix failure artifact shows the regression guard red on unfixed code with non-zero PRE_FIX_EXIT
  - Evidence: `.ai/harness/runs/hook-guard-stability/pre-fix-regression.log` — `PRE_FIX_EXIT=1`, failing assertion is exactly `workflow authority changed repeatedly while resolving effective state` at `resolveStableEffectiveState`, regression-guard path string present (gatekeeper verified shape).
- [x] state resolve --json output on a quiescent repo is byte-identical before and after the fix
  - Evidence: worker stash-based capture (both 4312 bytes, raw diff exit 0) independently re-verified by gatekeeper via scratch clone at `bd461142` vs fixed worktree on an identical-path fixture across three scenarios (blocked 5105 B, no-risk-input 4376 B, clean edit 6098 B) — all `cmp` byte-identical with matching exit codes.
- [x] Residual-instability diagnostic is distinct, names concurrent-write instability and the bounded retry, and still fails closed
  - Evidence: `[WorkflowResolutionUnstableGuard]` one-line diagnostic naming sustained concurrent-write instability and exhausted bounded retries; end-to-end trace `runtime.ts:268-291` (3 attempts, re-throw) → `mutation-guard.ts:272-289` catch → `exit(2)` — no code path admits the edit on unresolved state (gatekeeper ruling b: the catch is load-bearing and present).
- [x] Diagnosis probe artifacts copied into the package run snapshots
  - Evidence: `.ai/harness/runs/hook-guard-stability/diagnosis-probes/` contains FINDINGS-summary.txt, probe.ts/probe2.ts/probe3.ts, baseline and churn JSON results (gitignored runtime evidence; durable conclusions recorded here and in the notes).

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:2aa299cbc34e4ec089c1d9db542b9602bd068e4ffdde55006d4ec666a6d2e978
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: bd461142c7b74a5be73b0eac5fe1b632b4d1a121
> **Verification Evidence SHA256**: sha256:c341d4b7d2d068868dd4159d68e026ffc7302e906ebef10253f51a3a0290ccfe
> **Issued At**: 2026-07-22T23:35:35.753Z

- Summary: Gatekeeper PASS: stability-set partition proven red-first; genuine-blocker parity byte-identical; quiescent state-resolve byte-parity independently re-verified; no fail-open path
- Findings: none

## Behavior Diff Notes

- Quiescent-repo resolution output: byte-identical (proven three ways).
- Concurrent non-authority churn (working-tree diff, checks/latest, tasks/current, handoff/resume): previously aborted resolution after 4 unstable reads and blocked the edit with the generic banner; now resolves from the single coherent snapshot and proceeds.
- Sustained authority churn (plan/contract/markers/policy): still throws and still blocks — now after 3 bounded wrapper retries, with the distinct `[WorkflowResolutionUnstableGuard]` diagnostic instead of the misleading generic banner.
- Lock-timeout throw: now typed into the same bounded-retry path instead of an instant generic block.

## Residual Risks / Follow-ups

- Message-string coupling between `runtime.ts:247` and the resolver throw sites (gatekeeper MEDIUM, non-blocking): fold into the next package touching these files.
- The stale global CLI (`repo-harness-0.10.1-epc07-9ea195b9`) still carries the old collapse-and-block behavior until refreshed post-merge (operator action, out of contract scope).

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Both directions proven red-first; byte-parity held |
| Product depth | 8/10 | Truthful diagnostics restore guard trust; heredoc bypass incentive removed |
| Design quality | 8/10 | Partition at both call sites; typed outcomes; message coupling flagged |
| Code quality | 9/10 | +103/-12 across three files; zero existing tests touched |

## Failing Items

- none

## Retest Steps

- Re-run: `bun test tests/state/effective-state-stability.test.ts && bun test tests/state/ && bun run check:type`
- Re-check: quiescent byte-parity via `bun src/cli/index.ts state resolve --json` against a scratch clone at the base SHA

## Summary

- Transient WorkflowProfileGuard false blocks are fixed at the diagnosed root: non-authority churn no longer aborts effective-state resolution, throws are typed with bounded retry, residual instability blocks with a truthful distinct diagnostic, and genuine blockers behave byte-identically. Red-first regression guard + independent gatekeeper verification (PASS) bind the claim.
