> **Archived**: 2026-06-12 05:27
> **Related Plan**: plans/archive/plan-20260612-0519-loop-engine-05-contract-run-pilot.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260612-0527

# Implementation Notes: loop-engine-05-contract-run-pilot

> **Status**: Active
> **Plan**: plans/plan-20260612-0519-loop-engine-05-contract-run-pilot.md
> **Contract**: tasks/contracts/20260612-0519-loop-engine-05-contract-run-pilot.contract.md
> **Review**: tasks/reviews/20260612-0519-loop-engine-05-contract-run-pilot.review.md
> **Last Updated**: 2026-06-12 05:25
> **Lifecycle**: notes

## Design Decisions

- Implement `contract-run` as an explicit runner adapter: the parent command packages contract state, then invokes the configured child runner once as `worker` and once as `verifier`.
- Keep child execution out of the parent process. The parent role remains `narrate_only`; implementation and verification authority are represented in the generated package roles.
- Use the contract's `exit_criteria` YAML block as the verifier package rubric via `verifier_rubric_source: contract.exit_criteria`.
- Enforce `delegation.budget.tool_calls` before any child process starts. A worker+verifier run requires two tool calls; budgets below two abort with no child invocation.
- Require the verifier phase to write a review whose recommendation is `pass`; otherwise `contract-run` exits non-zero.

## Deviations From Plan Or Spec

- Real Claude/Codex child execution is not introduced in this row. The command accepts a runner executable so child-agent adapters can be added without hiding supervision or auto-approval.
- Claude external validation is skipped for this Goal by owner instruction and recorded as `manual_override`, not as a pass.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Directly shell out to Claude/Codex | Rejected | Would couple row5 to host-specific auth/session state and conflict with the owner instruction to skip Claude validation in this Goal. |
| Runner adapter with JSON task packages | Accepted | Keeps parent orchestration deterministic and testable while preserving the worker/verifier child boundary. |
| Enforce all budget fields now | Rejected | Token and wall-clock accounting need real adapter telemetry; row5 only enforces the deterministic `tool_calls` limit. |
| Let parent write the review | Rejected | Acceptance requires the verifier child to produce the review file. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Contract-run pilot log: `.ai/harness/runs/contract-run-row5-pilot.log`
- Contract-run pilot packages: `.ai/harness/runs/contract-run-row5-pilot/`
- Focused tests: `bun test tests/unit/loop-engine-05-contract-run-pilot.test.ts`
- CLI smoke: `bun src/cli/index.ts contract-run --help`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
