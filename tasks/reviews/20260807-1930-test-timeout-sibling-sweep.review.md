# Task Review: test-timeout-sibling-sweep

> **Status**: Complete
> **Plan**: plans/plan-20260807-1930-test-timeout-sibling-sweep.md
> **Contract**: tasks/contracts/20260807-1930-test-timeout-sibling-sweep.contract.md
> **Notes File**: tasks/notes/20260807-1930-test-timeout-sibling-sweep.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-07 22:05
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

The two `pending` header fields above are rubric metadata only. The
authoritative reviewed-subject hash and target revision for this review are
the ones recorded in the Acceptance Receipt Projection below, which the
receipt tooling writes from the receipt itself; they are deliberately not
hand-copied here, because editing this file after the receipt is recorded
would invalidate the recorded subject hash.

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: timeout declarations in `tests/**` only, per contract Goal — the a2381159 positional `30_000` shape on every subprocess-spawning test lacking an explicit bound, plus `tests/factor-factory.test.ts` raising its existing `FACTOR_FACTORY_SMOKE_TIMEOUT_MS` from `15000` to `45_000`.
- Actual files changed: 97 files under `tests/` (750 changed lines, +751 -751 including the ledger header), plus `tasks/todos.md` (`Updated` header timestamp only) and the four new plan/contract/review/notes workflow artifacts. Nothing outside the contract `allowed_paths`; no `src/` file appears in the diff.
- Commands passed: `bun test` standalone (2217 pass / 1 skip / 0 fail, 177 files, 502.57s, exit 0); `bun run check:type` (exit 0); `repo-harness run verify-sprint --prepare-acceptance` (`[ContractVerify] total=8 failed=0 status=Fulfilled`, including its own contended `bun test` at 518810ms and `tests/continuation-attempt.test.ts` at 27038ms); `repo-harness run verify-sprint` (exit 0, acceptance finalized).
- Residual risks: see Residual Risks / Follow-ups
- Reviewer action required: none
- Rollback: revert the single sweep commit; every test returns to bun's 5000ms default (or its prior explicit bound). No production code, no runner config, no adapter surface involved.

## Mode Evidence

- Selected route: acceptance gate review of the full working-tree diff against contract Goal / Scope / Allowed Paths / Exit Criteria, weighted toward mechanical change purity because the slice is test-only and mass-applied.
- P1/P2/P3 evidence: P1 — the surface is `tests/**` per-test timeout arguments only; the timeout authority is bun's third positional argument to `test()`/`it()`, and the pressure surface is verify-sprint's `bun test`, which runs the suite while the harness process itself contends for the same machine. P2 — traced the failure mode end to end: `repo-harness run verify-sprint` invokes `bun test` as a child of the already-running harness, so wall-clock per test inflates; a test whose real cost is 4.5s of `spawnSync` fixture work crosses bun's 5000ms default and is reported as a timeout, not an assertion failure. That is why every blocked round named a different test and every named test passed 3/3 standalone. P3 — a positional per-test bound was the right instrument over a global `bunfig` default: the 5000ms fence still guards the assertion-only majority (where a 5s test really is a regression), while the subprocess class gets a bound generous enough for contention but still short enough to catch a genuine hang at 30s instead of removing hang detection entirely.
- Root cause or plan evidence: contract Task Profile is `code-change`, so the Root Cause Evidence block is not required and was left as-is. The class evidence is in the plan Problem section and the notes `Sweep Result` table.

## Verification Evidence

- Waza `/check` run: not run as a separate skill; the contract's exit-criteria commands were run directly and are listed below.
- Commands run:

| Command | Result |
|---|---|
| `bun test` (standalone) | 2217 pass / 1 skip / 0 fail, 177 files, 502.57s, exit 0 |
| `bun run check:type` | exit 0 |
| `repo-harness run verify-sprint --prepare-acceptance` | `[ContractVerify] total=8 failed=0 status=Fulfilled`, exit 0; contended `bun test` green at 518810ms |
| `repo-harness run verify-sprint` | exit 0, `Sprint acceptance finalized` |

- Manual checks: mechanical purity was proved rather than sampled. All 750 diff hunks are single-line-for-single-line replacements (`git diff -U0 -- tests/` hunk headers are uniformly `-n +n` with no line counts). Normalizing each added line by deleting one `, 30_000` reproduces its removed line byte-for-byte in 749 of 750 cases; the one remainder is `tests/factor-factory.test.ts:16` `15000` -> `45_000`. Insertion-point correctness was checked structurally, not by eye: for every insertion the enclosing block opener at the same indentation is a `test(`/`it(` call — 744 close `});` -> `}, 30_000);` and 5 close the wrapped-callback form `}));` -> `}), 30_000);` in `tests/install-profiles.test.ts` (the `test(name, () => withHome(...), 30_000)` shape, timeout still the third argument of `test`). The single case the indentation heuristic could not resolve, `tests/run-skill-evals.test.ts:703`, was read by hand and closes the `test(` opened at line 631 (the heuristic tripped on a zero-indent line inside a shell template literal). The notes' claimed scanner false positive at `tests/state/loop-semantics-characterization.test.ts:808` was confirmed to be prose inside a comment, correctly left unpatched. Selectivity confirmed on both sides: `tests/ux-feature-guardrail.test.ts` had its `spawnSync` test swept while the adjacent assertion-only test was left at the default, and `tests/continuation-attempt.test.ts:238` was left alone because it already carries a more generous explicit `120_000` — no existing bound was removed or tightened.
- Supporting artifacts: `.ai/harness/checks/latest.json` (status pass, 2 source events); run snapshot below.
- Implementation notes reviewed: yes — `tasks/notes/20260807-1930-test-timeout-sibling-sweep.notes.md`. Counts independently reproduced from the diff: 749 added declarations across 96 files plus 1 widened constant = 97 files, 750 changed lines.
- Run snapshot: `.ai/harness/runs/run-20260807T215257-27977-20260807-1930-test-timeout-sibling-sweep.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:f6013e3b40410b1cb24d0a783c825279aabce50bcc4d796ba9ebb6aaa866674c
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 222efa1287b2792bb333795466bc5ae6d5c9a4e1
> **Verification Evidence SHA256**: sha256:e31ebde2a4ed583d1f3cefcbc0827403001102406ad3fc6b5839a595c98320e9
> **Issued At**: 2026-08-07T14:03:23.282Z

- Summary: Mechanical purity verified: all 750 diff hunks are 1-for-1 line replacements; 749 are pure ', 30_000' insertions at test/it declaration closers and 1 widens factor-factory's FACTOR_FACTORY_SMOKE_TIMEOUT_MS from 15000 to 45_000. No test logic changed, no timeout removed, nothing outside tests/ except the tasks/todos.md timestamp. Full bun test 2217 pass / 1 skip / 0 fail (502.6s standalone), bun run check:type clean, and verify-sprint's own contended bun test green at 518.8s - the downstream signal that was 0-for-3 before this sweep.
- Findings: none

## Behavior Diff Notes

- No behavior change in any product path. The only observable difference is the per-test deadline bun enforces: 749 tests move from the implicit 5000ms default to an explicit 30000ms, and `tests/factor-factory.test.ts` lifecycle moves from 15000ms to 45000ms.
- Hang detection is preserved, not removed: a swept test that genuinely deadlocks still fails, at 30s instead of 5s.
- Assertion-only tests are unchanged and keep the 5000ms fence, so a real performance regression in that majority still surfaces.

## Residual Risks / Follow-ups

- A regression that makes a swept test 6x slower now hides inside the 30s bound. Accepted deliberately: for subprocess-spawning tests the default measured machine load rather than correctness, which is what produced three consecutive false-negative acceptance rounds.
- Class membership came from a throwaway static scanner (transitive spawning-helper closure across `tests/**` and `scripts/**`). It is deliberately conservative — over-application to a few assertion-heavy tests in a file that also has spawning helpers is possible, and is harmless. Under-application is the risk that matters, and the falsifier for it is the next contended verify-sprint round.
- Helper propagation was deliberately not extended into `src/` (149 further tests). The notes record the reason: the name-based closure over `src/` produced demonstrable false positives (`profileEnablesCodegraph`, `currentStateVersion`), so widening on that basis would be unsound. If a future round trips on a test whose spawn happens inside a product function, that is the sweep's known boundary and the follow-up slice.
- Existing sub-30s bounds elsewhere (`SCAFFOLD_PARITY_TIMEOUT_MS`, `DOCTOR_CHECK_TIMEOUT_MS`, `state-concurrency`, `closeout-runner-guardrails`) were left as deliberate tighter fences. Only `factor-factory` had observed evidence of insufficiency.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Full suite green standalone and under verify-sprint contention; the downstream signal that was 0-for-3 is now green |
| Product depth | 9/10 | Closes the class a2381159 left open instead of patching the three newly observed instances, which is the failure mode being fixed |
| Design quality | 9/10 | Per-test positional bound over a global default keeps the 5000ms fence on the assertion-only majority and keeps hang detection at 30s |
| Code quality | 10/10 | Mechanically pure: 749 identical insertions plus 1 constant widening, proved by normalization rather than sampling; no logic change, no timeout removal, nothing outside `tests/` |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test` and `repo-harness run verify-sprint --prepare-acceptance`.
- Re-check: if a future contended round still trips a timeout, record which test and by how much before widening anything — per the contract Falsifier, a swept test exceeding 30s under normal load is a hang, not load sensitivity, and needs investigation rather than a larger bound.

## Summary

- Gatekeeper PASS. The slice closes the class `a2381159` opened: subprocess-spawning tests now carry an explicit generous per-test timeout, 749 new positional `30_000` declarations across 96 files plus one existing bound widened where it was observed insufficient (`tests/factor-factory.test.ts` lifecycle, 29.3s against 15000, now `45_000`). Purity was proved mechanically rather than sampled: all 750 hunks are 1-for-1 line replacements, normalizing away one `, 30_000` reproduces the removed line in 749 of them, and every insertion closes a `test(`/`it(` declaration — 744 in the plain `});` form and 5 in `install-profiles.test.ts`'s wrapped-callback `}), 30_000);` form where the timeout is still `test`'s third argument. The one indentation-ambiguous site, `run-skill-evals.test.ts:703`, was read by hand and closes the `test(` at line 631. Selectivity holds in both directions: the adjacent assertion-only test in `ux-feature-guardrail.test.ts` was left at the default, and `continuation-attempt.test.ts:238` kept its pre-existing, more generous `120_000` — no bound was removed or tightened. Nothing outside `tests/` changed except the `tasks/todos.md` header timestamp. Verification: standalone `bun test` 2217 pass / 1 skip / 0 fail in 502.57s, `bun run check:type` clean, and `verify-sprint --prepare-acceptance` at `total=8 failed=0 Fulfilled` with its own contended `bun test` green at 518810ms — that contended run is the acceptance signal this class had blocked three times running, each on a different threshold-marginal test, each green standalone.
