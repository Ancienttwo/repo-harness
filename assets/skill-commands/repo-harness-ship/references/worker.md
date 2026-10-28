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
checkout. The owner acknowledges inspection, then exits the agent. The orchestrator
confirms exit and closes its dispatch-owned split pane with the existing Herdr
pane-close command. Leave the workspace root shell for runtime cleanup. Do not
close attached or unknown panes. Keep and report an ownership or cleanup refusal.

For a contract branch that matches the configured prefix and slug, use the existing
`contract-worktree cleanup --slug <slug> --target <branch>` path. For other branches,
use the existing exact runtime route below from the primary checkout. Freeze the
observed branch HEAD and local target OID after inspection. The exact removal
guard rechecks merge proof, dirty state, lock, branch/path and both OIDs.

```sh
repo-harness run contract-worktree-runtime cleanup --repo <primary> --worktree <canonical-path>
repo-harness run contract-worktree-runtime stop-architecture-daemons --repo <primary> --worktree <canonical-path>
repo-harness run contract-worktree-runtime remove-exact --repo <primary> --worktree <canonical-path> --branch <exact-branch> --head <observed-head> --target <local-target-ref> --target-oid <observed-target-oid> --merge <confirmed-merge-sha>
```

Stop on a failed runtime cleanup. Report a daemon-stop failure as the existing
cleanup path does. Runtime cleanup precedes marker release and Git removal.
When notification returns `owner_gone`, the orchestrator uses the same closeout.
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
