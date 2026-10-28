# Git and PR execution

Worker reference. Confirm branch, HEAD, dirty paths and worktree ownership.
Consume recorded checks and required review. Do not rerun passing suites without
changed inputs or an uncovered risk. Self-review before commit.
Commit only owned files. Push and open a PR only within task authorization.
For contract worktrees, use `repo-harness run ship-worktrees` when that lifecycle
is the assigned scope. Ordinary branches use Git and `gh pr create` directly.
Read back the PR state after creation. A create timeout requires readback before retry.
After merge readback confirms the PR number and merge SHA, notify the worktree owner
from the primary checkout, before sweep:

```sh
repo-harness run contract-worktree notify-merged --worktree <canonical-path> --branch <branch> --owner <pane-id> --pr <number> --merge <confirmed-merge-sha>
```

Use the pane ID in the dispatch or PR worker attribution as owner identity.
The existing Herdr workspace binding owns routing to that worktree. The command
checks that a live agent occupies that pane in that workspace at the exact checkout path.
Its root pane is not necessarily the worker. The active-worktree marker records
a path, not an agent identity. Do not guess an owner or add an ownership record.
If attribution or binding is unavailable, retain and report the unknown state.
`notified` confirms submission only. Read the owner's closeout result.
`retained` means inspect the reported uncertainty. Never replay unknown delivery.

The owner checks changes, untracked files and commits outside the merged PR.
Keep and report remaining content, locks or unknown state. Gitignored files do
not count as content. Do not auto-commit. Preserve important content on another
branch or PR only with existing commit/push authority.
For merged, clean, unlocked work, hand closeout to the orchestrator in the primary
checkout. Use the existing `contract-worktree cleanup --slug <slug> --target <branch>`
path. It closes the runtime before it releases the marker and removes Git state.
When the owner returns `owner_gone`, the orchestrator uses that same cleanup path.
Notification is not a deletion prerequisite or a new grant. Keep and report any
cleanup refusal. Sweep still preserves unknown or open runtime state.

Then run `repo-harness run contract-worktree sweep` from the primary checkout.
Only merged, clean, unlocked worktrees qualify for automatic cleanup.
Retain dirty, locked or unmerged work. Never use reset, clean or stash to hide it.

An external PR or a `tasks/lessons.md` change needs the owner's GO. Its merge uses
`gh pr merge <pr> --squash --match-head-commit <reviewed-sha>`.
Default publication opens a PR. Do not commit to or fast-forward main.
Find an existing open PR for this branch before creation; reuse it.
Do not publish when required checks or required review evidence are missing
or failed. For contract work, consume its subject-bound acceptance evidence.
