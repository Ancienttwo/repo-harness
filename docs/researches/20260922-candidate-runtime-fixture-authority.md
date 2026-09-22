# Candidate runtime fixture timeout authority

The candidate-bound reconciliation fixture builds an old runtime B (Stop timeout 30 seconds) and a distinct candidate C (150 seconds), then invokes the real update/reconciliation CLI inside disposable HOME directories. Production timeout ownership moved in baseline `d52f9a9b` from the installer ternary to `src/core/hook-work-budget.ts#MANAGED_STOP_TIMEOUT_SECONDS`, but the fixture still attempted to rewrite the old ternary.

PR #434 [CI run 35629594177](https://github.com/Ancienttwo/repo-harness/actions/runs/35629594177) exposed two setup failures in `tests/unit/candidate-bound-global-runtime-reconciliation.test.ts`. An isolated pre-fix run reproduced **6 pass, 2 fail**, with `PRE_FIX_EXIT=1` and `fixture requires the managed Stop timeout authority` at `copyRuntimeFixture`. The actual candidate reconciliation assertions were never reached. This is separate from the historical intermittent failure documented in the September 5 ledger closeout.

The fixture now changes the existing constant in copied runtime B only. Candidate C retains the source value 150; the fail-closed source assertion and all end-to-end reconciliation assertions remain. No old-expression fallback, production timeout change or real runtime installation is introduced.

The authoritative regression guard is the existing test file, not a new source-text test. Verification and independent acceptance are recorded in this slice's contract/review. Full hosted CI is separate; a passing local fixture does not prove all stage PR checks passed. Stage branches require the repair to be integrated before their known baseline failure can be considered fixed.
