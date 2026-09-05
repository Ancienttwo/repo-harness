# Effective-state golden refresh after 6c19234e

> **Substantive Change SHA256**: `sha256:920d49a1631e0956dc278fc6e75d696f22445dedc2b58574cfaa9be919034fc4`

`6c19234e` changed the lite-profile guidance text in `project-effective-state.ts` and the `runEditPlanGate` call shape in `mutation-guard.ts` without refreshing the characterization fixtures, so `main` failed at `tests/state/cli-state-golden.test.ts` and would fail next at `loop-semantics-characterization.test.ts`.

- The 11 effective-state goldens were regenerated with `UPDATE_EFFECTIVE_STATE_GOLDENS=1`; the only changed field is `guidance`.
- The `plan_gate` source-order marker now matches `runEditPlanGate(ctx, filePath, effective);`, and the loop-semantics matrix was regenerated with `UPDATE_LOOP_SEMANTICS_GOLDEN=1`; the only changed fields are the four `esa_goldens` `source_sha256` hashes.

Verification: `tests/state/` 131 pass / 0 fail locally; PR CI ran the full suite to completion before the task-sync gate.
