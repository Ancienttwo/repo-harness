# Notes: HE-07 Delegation Contract Kappa v2

> **Status**: Complete
> **Plan**: `plans/plan-20260616-HE-07-delegation-kappa-v2.md`
> **Contract**: `tasks/contracts/20260616-HE-07-delegation-kappa-v2.contract.md`
> **Review**: `tasks/reviews/20260616-HE-07-delegation-kappa-v2.review.md`

## Decisions

- Delegation roles are now nested `mode`/`purpose` objects for parent, explorer, worker, and verifier.
- `contract-run` records `delegation_plan` in the manifest and writes prompts that preserve worker/verifier boundaries.
- The verifier rubric remains exactly the contract `exit_criteria`.

## Tradeoffs

- `tool_calls` is enforceable in the current runner; token and wall-time budgets are documented as advisory until the runner can enforce them.
- This slice keeps real child execution command-based and explicit. It does not auto-spawn hidden agents.

## Open Questions

- Future delegation work can add a real read-only explorer command, but parent approval should remain the checkpoint owner.
