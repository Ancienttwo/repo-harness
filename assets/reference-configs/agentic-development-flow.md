# Agentic development flow

## Daily Flow
1. Read the current request and `AGENTS.md`; load architecture or worker techniques only when relevant.
2. Open a branch; isolate a worktree when concurrent edits overlap. Preserve unrelated work.
3. Make small, bounded commits. Ordinary tasks live in the PR description: goal, changes, verification, risk and rollback.
4. Freeze the candidate and verify once: typecheck plus affected tests. Reviewers and closeout consume the same evidence.
5. A model may squash-merge into main only when the current task explicitly authorizes main publication, automatic checks pass, and GitHub has no outstanding change requests or unresolved review threads. An explicit no-merge instruction always wins. Record the GitHub merge SHA and parent SHA. Record `git revert --no-edit <squash-commit>`. Do not create rollback tags.
6. Run the full suite daily, automatically open a repair task on failure, and produce the daily merge/check/rollback report.

## Four operation boundaries
- Main merge requires explicit current-task authorization, current automated checks, no outstanding change requests or unresolved review threads, exact head/base and conflict safety.
- Only merged, clean, inactive worktrees/branches may be deleted automatically; other deletion requires the user.
- Credentials, permissions, sandbox/write grants and confirmation-bypass settings require user approval of the exact change.
- Release and production effects require user approval of the exact artifact and operation.

## Bot and worker
The bot selects scope, worker and verification by risk. Use independent gatekeeper/cross-model review for large changes, security/permissions or model uncertainty; do not rerun a passing check or require multiple re-gates.
A worker gets Goal, Scope, Verify, Rollback and a timebox, then loads concrete techniques on demand. Do not put routing catalogs or every technology guide in its brief.

The bot measures progress by side effects only: commits, pushes, evidence events and PR or check changes. It does not resume a worker to check liveness. A worker past its timebox with no new side effect is stalled; stop it or ask the user.
Retry by failure mode. Reduce scope after a limit or out-of-memory stop. Move a tool error to another model. A network drop or an unknown failure gets one retry only for a read-only or idempotent call. For a call that can change remote state, check the original request and the provider receipt first; do not retry an unknown effect. After two failures of one task, stop and ask the user.
Clear PR blockers in this order: conflicts, review threads, then CI. Classify a CI failure before a retry. A suspected flake gets one fresh build; an identical second failure is not a flake.
Stop and ask the user when a command reports `reconciliation_required`, `task_agent_delivery_unknown`, `launch-unknown`, `cleanup_pending`, `liveness_unproven` or `publication_recovery_required`; when a result reports `side_effects=unknown`; when a lease directory is empty or malformed; before a third review round; when a review thread concerns security, authentication, data or migrations; or when a written rule conflicts with observed state.

Architecture docs remain references. Update them only when responsibilities or boundaries change; no per-edit drift queue, workstream sync or automatic agent-context block. Ordinary work has no plan/contract/review/notes or promote/archive prerequisite. Notes are optional for non-obvious decisions; PRDs are for real new products.
