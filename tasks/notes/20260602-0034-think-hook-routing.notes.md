# Implementation Notes: think-hook-routing

> **Status**: Implemented
> **Plan**: plans/plan-20260602-0034-think-hook-routing.md
> **Contract**: tasks/contracts/20260602-0034-think-hook-routing.contract.md
> **Review**: tasks/reviews/20260602-0034-think-hook-routing.review.md
> **Last Updated**: 2026-06-02 00:58 +0800
> **Lifecycle**: notes

## Design Decisions

- Kept `$think` inside the existing `UserPromptSubmit.default -> prompt-guard.sh` path. The route registry is a host adapter contract, so adding a new route would create unnecessary adapter/trust churn.
- Put `is_think_plan_start_intent` ahead of the generic agent workflow `/health` hint in `emit_waza_route_hint`. This preserves explicit user skill intent when the subject text also contains `hook`, `workflow`, `Codex`, or `Claude`.
- Left Draft creation and pending orchestration unchanged. `maybe_start_plan_workflow` still creates only a Draft plan and `.ai/harness/planning/pending.json`; execution still requires Approved capture and `plan-to-todo.sh`.
- Expanded Stop completeness guidance instead of adding another planning gate. Stop already owns the one-shot self-review prompt for pending planning output.

## Deviations From Plan Or Spec

- `bash scripts/check-task-workflow.sh --strict` remains blocked by external brain vault drift. The vault copies for `agentic-development-flow.md`, `harness-overview.md`, and `external-tooling.md` match the dirty primary worktree, while this branch is based on clean `fdc82ec`; syncing from this worktree would overwrite that external state with older docs.
- Follow-up reconciliation checked `/Users/ancienttwo/Projects/agentic-dev` as the correct source worktree. Its default brain vault matches those dirty docs and `bash scripts/check-task-workflow.sh --strict` passes there, so the remaining blocker is integration order, not this hook slice.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add new hook route for Waza think | Rejected | Route tuples are public host adapter contracts and would require migration/trust churn. |
| Let generic `/health` keep priority for hook workflow prompts | Rejected | It contradicts an explicit `$think` invocation and loses the planning bridge. |
| Reuse existing `prompt-guard.sh` classifier | Accepted | Smallest change and matches current pending orchestration ownership. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused verification: `bun test tests/hook-contracts.test.ts tests/hook-runtime.test.ts tests/cli/prompt-guard-decision.test.ts` -> 122 pass, 0 fail.
- Full verification: `bun test` -> 545 pass, 6 skip, 0 fail.
- Required checks passing: `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-task-sync.sh`, `bun scripts/inspect-project-state.ts --repo . --format text`, `bash scripts/migrate-project-template.sh --repo . --dry-run`.
- Required check blocked by external state: `bash scripts/check-task-workflow.sh --strict`.
- Reconciliation evidence: `bash scripts/check-task-workflow.sh --strict` passes in `/Users/ancienttwo/Projects/agentic-dev`, where the default brain vault matches the currently dirty repo-to-brain docs.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
