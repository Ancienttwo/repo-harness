# Git and PR execution

Worker reference. Confirm branch, HEAD, dirty paths and worktree ownership.
Consume recorded checks and required review. Do not rerun passing suites without
changed inputs or an uncovered risk. Self-review before commit.
Commit only owned files. Push and open a PR only within task authorization.
For contract worktrees, use `repo-harness run ship-worktrees` when that lifecycle
is the assigned scope. Ordinary branches use Git and `gh pr create` directly.
Read back the PR state after creation. A create timeout requires readback before retry.
Preview merged cleanup with `repo-harness run ship-worktrees --cleanup-merged --dry-run`.
Only merged, clean, unlocked worktrees qualify for automatic cleanup.
Retain dirty, locked or unmerged work. Never use reset, clean or stash to hide it.

Default publication opens a PR. Do not commit to or fast-forward main.
Find an existing open PR for this branch before creation; reuse it.
Do not publish when required checks or required review evidence are missing
or failed. For contract work, consume its subject-bound acceptance evidence.
