---
name: repo-harness-ship
description: Close out verified harness work only when the user explicitly asks to commit, push, open a PR, merge, or clean merged worktrees.
when_to_use: "repo-harness-ship"
disable-model-invocation: true
---

# repo-harness-ship

Bot entrypoint. Confirm the exact publication and cleanup authorization.
Assign Git/PR steps through `references/worker.md`. Consume the recorded checks,
revision and independent review when risk requires it. Preserve unrelated work.

Main publication, deletion, credentials/permissions and release/production
have separate boundaries. Merge only when this task authorizes main publication,
automated checks pass and GitHub has no change request or unresolved review thread.
An explicit no-merge instruction wins. Record the squash commit, its revert
command and the daily report after authorized publication.
Auto-delete only merged, clean worktrees/branches. Ask for other deletion.
Return PR URL, head SHA, verification, risk and rollback.
