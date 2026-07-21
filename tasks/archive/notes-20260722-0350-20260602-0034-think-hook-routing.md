# Implementation Notes: think-hook-routing

> **Status**: Implemented
> **Plan**: plans/plan-20260602-0034-think-hook-routing.md
> **Contract**: tasks/contracts/20260602-0034-think-hook-routing.contract.md
> **Review**: tasks/reviews/20260602-0034-think-hook-routing.review.md
> **Last Updated**: 2026-06-02 01:35 +0800
> **Lifecycle**: notes

## Design Decisions

- Kept `$think` inside the existing `UserPromptSubmit.default -> prompt-guard.sh` path. The route registry is a host adapter contract, so adding a new route would create unnecessary adapter/trust churn.
- Put `is_think_plan_start_intent` ahead of the generic agent workflow `/health` hint in `emit_waza_route_hint`. This preserves explicit user skill intent when the subject text also contains `hook`, `workflow`, `Codex`, or `Claude`.
- Left Draft creation and pending orchestration unchanged. `maybe_start_plan_workflow` still creates only a Draft plan and `.ai/harness/planning/pending.json`; execution still requires Approved capture and `plan-to-todo.sh`.
- Expanded Stop completeness guidance instead of adding another planning gate. Stop already owns the one-shot self-review prompt for pending planning output.

## Deviations From Plan Or Spec

- The isolated branch's strict workflow blocker was resolved by landing the brain-root/docs WIP first as `58133cf`, then merging `codex/think-hook-routing` into main. After main became the authority, the three repo-to-brain reference docs were synchronized from main before the final strict workflow check.
- Two full-suite attempts were discarded as verification evidence because they ran concurrently with focused hook tests and produced hook subprocess timeouts under contention. The final focused and full suites were run alone and passed.

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
- Focused verification after merge: `bun test tests/hook-contracts.test.ts tests/hook-runtime.test.ts tests/cli/prompt-guard-decision.test.ts` -> 122 pass, 0 fail.
- Full verification after merge: `bun test` -> 549 pass, 6 skip, 0 fail.
- Required checks passing after merge: `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, `bash scripts/migrate-project-template.sh --repo . --dry-run`.
- Brain sync before strict verification: `bash scripts/sync-brain-docs.sh --changed docs/reference-configs/agentic-development-flow.md`, `bash scripts/sync-brain-docs.sh --changed docs/reference-configs/harness-overview.md`, and `bash scripts/sync-brain-docs.sh --changed docs/reference-configs/external-tooling.md`.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
