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

The paragraph above is the internal PR flow. Classify each PR with the
`repo-harness-check` reference `references/pr-verification.md`. An external PR
never uses the internal flow. It merges only with a current verification bundle,
passing automated checks and the owner's explicit GO for the reviewed head SHA.
An internal `tasks/lessons.md` change also needs that GO.
Auto-delete only merged, clean worktrees/branches. Ask for other deletion.
Return PR URL, head SHA, verification, risk and rollback.
