> **Archived**: 2026-06-12 12:38
> **Related Plan**: plans/archive/plan-20260612-1224-loop-engine-04-contract-kappa-fields.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260612-1238

# Implementation Notes: loop-engine-04-contract-kappa-fields

> **Status**: Active
> **Plan**: plans/plan-20260612-1224-loop-engine-04-contract-kappa-fields.md
> **Contract**: tasks/contracts/20260612-1224-loop-engine-04-contract-kappa-fields.contract.md
> **Review**: tasks/reviews/20260612-1224-loop-engine-04-contract-kappa-fields.review.md
> **Last Updated**: 2026-06-12 12:32 +0800
> **Lifecycle**: notes

## Design Decisions

- Added `## Delegation Contract` as a separate YAML block before `## Exit Criteria` instead of extending `exit_criteria`. `verify-contract.sh` already finds the first YAML block that contains `exit_criteria:`, so a separate block gives row 5 a stable metadata surface without changing verification semantics.
- Kept defaults non-enforcing: `budget` values are `null`, `permission_scope.mode` inherits `allowed_paths`, and roles are labels. This avoids pretending delegation limits exist before `contract-run` implements enforcement.
- Updated both self-host and distributed surfaces: `.claude/templates/contract.template.md`, `assets/templates/contract.template.md`, `scripts/plan-to-todo.sh`, `assets/templates/helpers/plan-to-todo.sh`, `scripts/ensure-task-workflow.sh`, `assets/templates/helpers/ensure-task-workflow.sh`, and `scripts/lib/project-init-lib.sh`.
- Documented field semantics in both `docs/reference-configs/sprint-contracts.md` and `assets/reference-configs/sprint-contracts.md` so migration output and repo-local docs stay aligned.

## Deviations From Plan Or Spec

- None. `contract-run` remains out of scope; this slice only creates the schema/projection surface.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add fields under `exit_criteria` | Rejected | Would make verifier parsing and enforcement ambiguous. |
| Build a TypeScript parser now | Rejected | Row 4 only needs stable projection and compatibility; row 5 can add parser/enforcement when it consumes the fields. |
| Set hard default budgets | Rejected | Would create enforcement claims before the runner exists. |

## Open Questions

- Row 5 must decide whether `contract-run` treats `budget.tokens/tool_calls/wall_time_minutes` as hard limits or preflight estimates first.

## Evidence Links

- Focused generation/parser tests: `bun test tests/helper-scripts.test.ts --test-name-pattern 'plan-to-todo should archive previous todo|verify-contract should ignore allowed_paths|verify-contract should ignore delegation metadata'`
- Scaffold parity: `bun test tests/scaffold-parity.test.ts`
- Contract verification: `bash scripts/verify-contract.sh --contract tasks/contracts/20260612-1224-loop-engine-04-contract-kappa-fields.contract.md --strict`

## Promotion Candidates

- Promote enforced budget/permission semantics only after `loop-engine-05-contract-run-pilot` proves the runner contract.
