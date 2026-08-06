# Task Review: verifier-failure-log-retention

> **Status**: Complete
> **Plan**: plans/plan-20260807-0014-verifier-failure-log-retention.md
> **Contract**: tasks/contracts/20260807-0014-verifier-failure-log-retention.contract.md
> **Notes File**: tasks/notes/20260807-0014-verifier-failure-log-retention.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-07 00:30
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

The two `pending` header fields are rubric metadata only; the authoritative
values are written into the Acceptance Receipt Projection below by the receipt
tooling. Hand-copying them here would invalidate the recorded subject hash on
the next edit.

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: the retention helper plus its two call sites in `scripts/verify-contract.sh` and its byte-identical projection `assets/templates/helpers/verify-contract.sh`; one new regression test
- Actual files changed: exactly that, plus the `tasks/todos.md` ledger header. 3 modified (+69 -1) and 5 new files (`tests/unit/verifier-failure-log-retention.test.ts` and the plan/contract/notes/review artifacts). All inside `allowed_paths`. `scripts/run-bounded-verifier-command.ts` is untouched, as the contract requires.
- Commands passed: `bun run check:type`; `cmp scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh`; `bash scripts/check-task-sync.sh`; `bun test tests/unit/verifier-failure-log-retention.test.ts tests/unit/helper-projection-drift.test.ts` (7 pass / 0 fail)
- Residual risks: see Residual Risks / Follow-ups
- Reviewer action required: none
- Rollback: revert the single commit; both helper copies return to the pre-retention text and the regression test disappears. No state migration, and previously retained logs are gitignored runtime files.

## Mode Evidence

- Selected route: acceptance gate review of the full working-tree diff against the contract, with two targeted probes for the properties the diff cannot prove by inspection alone.
- P1/P2/P3 evidence: P1 - the verifier round writes each criterion's output through `run_bounded` into a log under the round's `mktemp -d`, which the EXIT trap destroys (`scripts/verify-contract.sh:632-633`); the run snapshot keeps only `exit_code`, so the shell helper is the only place that can retain attribution without touching the bounded runner. P2 - traced one failing criterion end to end in a fixture: bounded run writes `$log_path` -> `bounded_exit` is nonzero -> `record_timed_result … false …` records the failure -> `retain_failure_log "$log_path" "$cmd"` copies the log to `.ai/harness/runs/<run-id>-<slug>.log` -> the file survives the EXIT trap and carries the failing command's own stdout. P3 - the ordering is the load-bearing design decision: retention runs strictly after the verdict is recorded and always returns success, so it is a pure consumer of an already-final result and can only lose diagnostics, never change a verdict.
- Root cause or plan evidence: Task Profile is `code-change`, so the Root Cause Evidence block is not required. The motivating failures are first-hand: two in-round `bun test exit=1` rounds on the bundle shipment (698160ms on 2026-08-06, 777566ms on 2026-08-06/07) each produced only `exit_code: 1` and named nothing.

## Verification Evidence

- Commands run:

| Command | Result |
|---|---|
| `bun run check:type` | exit 0 |
| `cmp scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh` | exit 0, identical |
| `bash scripts/check-task-sync.sh` | exit 0 |
| `bun test tests/unit/verifier-failure-log-retention.test.ts tests/unit/helper-projection-drift.test.ts` | 7 pass / 0 fail, 18 expect() calls |

- Manual checks:
  - Projection parity proven at the strongest available level: `git hash-object` returns the same blob `c836ff42b5c9cdc8f1bde3fd8c553ebd65bb7d2e` for both copies, so they are the same object, not merely similar. The drift guard added in the budget work-package also covers this pair.
  - `scripts/run-bounded-verifier-command.ts` absent from the diff - the bounded runner's contract is unchanged and retention is confined to the shell helper.
  - Retention fires only on a nonzero criterion exit: both call sites sit in the `else` arm of `if [[ "$bounded_exit" -eq 0 ]]` (`:982-987` for `tests_pass`, `:1020-1024` for `commands_succeed`), after the failure has been recorded. The passing arm calls nothing.
  - `${run_id}` is bound where it is used: `run_id="$(resolve_run_id)"` at `:618` precedes both call sites (`:986`, `:1023`). Under this script's `set -euo pipefail` an unbound reference there would have aborted the round on the first failing criterion; it cannot.
  - `log_check` (`:474-483`) is a `quiet`-gated `echo` with no counter side effects - `total`/`failed` are only mutated by `pass()`/`fail()` - so the new `log_check "LOG" …` line cannot perturb the round's tallies.
- Targeted probe for the non-fail-closed branch (the specific concern raised at dispatch): ran the real `scripts/verify-contract.sh --strict --read-only` in an isolated fixture whose `.ai/harness/runs` was deliberately made a regular file, so `mkdir -p` inside `retain_failure_log` fails. Result: exactly one `[ContractVerify] WARN: could not retain failure log` on stderr, the criterion still recorded `{"passed": false, "exit_code": 7}`, and the round still exited 1. The warn-and-continue path demonstrably cannot mask a criterion failure.
- Supporting artifacts: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`
- Implementation notes reviewed: `tasks/notes/20260807-0014-verifier-failure-log-retention.notes.md` - the naming scheme, the failure-path-only placement, and the observed fixture filename all match what I reproduced independently.

## Judgment On The Two Declared Calls

1. **Non-fail-closed retention branch (warn and continue).** Accepted, and now backed by the sabotage probe above rather than by reasoning alone. Three independent properties make it safe: retention runs after `record_timed_result` has already recorded the failure; it always returns 0, so `set -e` cannot abort the round through it and its value is never consumed; and its only output helper is a counter-free `echo`. The direction of the exception also matters - this branch *produces* evidence rather than consuming it, so degrading it can lose a diagnostic but can never manufacture a pass. This is a correct place for the repo's fail-closed default to yield.
2. **Test asserts the criterion's recorded result, not the round exit status.** Accepted, and it is the stricter choice, not a weakened one. In a bare fixture cwd the round exits 1 anyway because an unrelated round-level check fails there - I reproduced exactly that in my own probe (`failed_count=2` with a single declared criterion). Asserting round exit would therefore pass whether or not retention worked, i.e. it would assert the fixture's environment. Asserting `results[].passed`/`exit_code` plus the retained log's existence, exact filename, and content is what actually distinguishes working retention from none.

## Behavior Diff Notes

- A failing criterion now leaves `.ai/harness/runs/<run-id>-<criterion-slug>.log` containing that command's own output, correlated by run id with the round's snapshot in the same directory. Passing criteria retain nothing.
- Timed-out criteria are covered without special handling: a timeout is a nonzero `bounded_exit`, which was previously the most evidence-starved failure mode of all.
- Retained logs land in `.ai/harness/runs/`, gitignored at `.gitignore:61`, so no tracked surface is affected.
- No verdict, gating, budget, or bounded-runner behavior changes.

## Residual Risks / Follow-ups

- A failing full-suite criterion retains the entire `bun test` output, which can be multi-MB. That is bounded to failing rounds and is the point of the change, but `.ai/harness/runs/` has no retention/pruning policy, so logs accumulate until something prunes them. Worth a bounded follow-up if runs/ growth becomes noticeable.
- The slug derives from the raw criterion text capped at 80 chars, so two very long criteria sharing an 80-char prefix within one round would collide and the second copy would overwrite the first. Not reachable with this repo's current criteria (all far shorter), and the run-id stem keeps rounds separate.
- Observation carried over from the notes, out of scope here: the fixture behavior shows the `evidence_requirements` check is effectively unrunnable outside a provisioned repo root. That is a pre-existing property of the gate, not something this diff introduces.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | End-to-end retention proven against the real script, including the sabotage case |
| Product depth | 9/10 | Fixes the diagnostic dead end that made two 12-minute rounds teach nothing |
| Design quality | 9/10 | Retention hangs off the existing failure arm; no new gating, no bounded-runner change |
| Code quality | 9/10 | Deterministic bounded slug, comments explain why the non-fail-closed branch is correct here |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/unit/verifier-failure-log-retention.test.ts tests/unit/helper-projection-drift.test.ts`; `bun run check:type`; `cmp` the two helper copies
- Re-check: force a failing criterion in a fixture contract and confirm `.ai/harness/runs/<run-id>-<slug>.log` appears with the command's output; sabotage `.ai/harness/runs` and confirm the criterion still records failed.

## Summary

PASS. The diff is exactly the contract Goal: a bounded slug helper, a diagnostic retention helper, and two call sites on the existing failure arm, mirrored into a byte-identical projection - `git hash-object` gives both copies the same blob `c836ff42…`, and the bounded runner is untouched. I verified the three properties that inspection alone cannot settle: retention fires only on nonzero criterion exit, `${run_id}` is bound before both call sites so `set -u` cannot abort a failing round, and `log_check` has no counter side effects. The one deliberate non-fail-closed branch was probed directly by making the retention target unwritable: the round warned once, still recorded the criterion failed with exit 7, and still exited 1 - so it can lose a diagnostic but cannot mask a failure, which is the correct direction for an exception. The test's choice to assert the recorded criterion rather than the round exit is likewise the stricter reading, since a bare fixture cwd exits nonzero regardless. Recommendation: pass.
