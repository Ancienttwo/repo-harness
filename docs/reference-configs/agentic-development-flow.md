# Agentic development flow

## Daily Flow
1. Read the current request and `AGENTS.md`; load architecture or worker techniques only when relevant.
2. Open a branch; isolate a worktree when concurrent edits overlap. Preserve unrelated work.
3. Make small, bounded commits. Ordinary tasks live in the PR description: goal, changes, verification, risk and rollback.
4. Freeze the candidate and verify once: typecheck plus affected tests. Reviewers and closeout consume the same evidence.
5. A model may squash-merge into main when automatic checks pass, unless the user has reserved merging. Tag before/after and record `git revert --no-edit <squash-commit>`.
6. Run the full suite daily, automatically open a repair task on failure, and produce the daily merge/check/tag/rollback report.

## Four operation boundaries
- Main merge requires current automated checks, exact head/base and conflict safety.
- Only merged, clean, inactive worktrees/branches may be deleted automatically; other deletion requires the user.
- Credentials, permissions, sandbox/write grants and confirmation-bypass settings require user approval of the exact change.
- Release and production effects require user approval of the exact artifact and operation.

## Bot and worker
The bot selects scope, worker and verification by risk. Use independent gatekeeper/cross-model review for large changes, security/permissions or model uncertainty; do not rerun a passing check or require multiple re-gates.
A worker gets Goal, Scope, Verify and Rollback, then loads concrete techniques on demand. Do not put routing catalogs or every technology guide in its brief.

Architecture docs remain references. Update them only when responsibilities or boundaries change; no per-edit drift queue, workstream sync or automatic agent-context block. Ordinary work has no plan/contract/review/notes or promote/archive prerequisite. Notes are optional for non-obvious decisions; PRDs are for real new products.
