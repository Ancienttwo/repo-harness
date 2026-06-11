> **Archived**: 2026-06-12 05:19
> **Related Plan**: plans/archive/plan-20260612-0457-loop-engine-04-contract-kappa-fields.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260612-0519

# Implementation Notes: loop-engine-04-contract-kappa-fields

> **Status**: Active
> **Plan**: plans/plan-20260612-0457-loop-engine-04-contract-kappa-fields.md
> **Contract**: tasks/contracts/20260612-0457-loop-engine-04-contract-kappa-fields.contract.md
> **Review**: tasks/reviews/20260612-0457-loop-engine-04-contract-kappa-fields.review.md
> **Last Updated**: 2026-06-12 05:09
> **Lifecycle**: notes

## Design Decisions

- Add κ metadata under a `delegation` YAML block with nullable budget values, conservative permission defaults, and explicit parent/worker/verifier roles. These fields are metadata for row5 `contract-run`; they do not change `verify-contract.sh` scoring.
- Keep the same block in self-host templates, asset templates, and fallback inline templates so generated contracts do not drift when helpers run before installed templates exist.
- Update `contract_references_path` and `workflow_contract_allows_path` to select the YAML block containing `allowed_paths` instead of the first YAML block. This preserves existing scope gates after adding the earlier `delegation` metadata block.

## Deviations From Plan Or Spec

- Widened scope to `.ai/hooks/lib/workflow-state.sh` and `assets/hooks/lib/workflow-state.sh` after focused tests showed the new metadata block broke existing `contract-worktree finish` path checks.
- Claude external validation is skipped for this Goal by owner instruction and recorded as `manual_override`, not as a pass.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Make κ fields mandatory | Rejected | Would break old contracts and expand row4 beyond metadata scaffolding. |
| Teach `verify-contract.sh` new κ semantics now | Rejected | Row4 acceptance requires backward compatibility; row5 owns `contract-run` execution semantics. |
| Keep YAML readers on first block | Rejected | Adding a metadata block before `allowed_paths` broke scope checks in existing worktree finish tests. |
| Select the block containing `allowed_paths` | Accepted | Minimal compatibility fix that preserves current contract shape and old fixtures. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused tests: `bun test tests/helper-scripts.test.ts tests/scaffold-parity.test.ts tests/workflow-contract.test.ts`
- Workflow gate: `bash scripts/check-task-workflow.sh --strict`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
