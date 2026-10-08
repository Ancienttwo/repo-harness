# Agentic development flow

- Default task worktrees use `/tmp/<repo>-wt-<slug>` on POSIX. Native Windows uses `os.tmpdir()` as the root. The stored default is `{{system_tmp}}/{{repo}}-wt-{{slug}}`. Runtime code resolves the temp token. Explicit stored templates stay unchanged. Commit or push work before a reboot or age-based tmp cleanup, such as `systemd-tmpfiles`. These cleaners can remove checkouts. Missing entries are pruned. The sweep saves missing registration identities before global prune. Later batches finish deferred branch cleanup. Unmerged branches remain.
- Closeout removes a merged, clean checkout and its branch. It releases only that checkout's own canonical marker after merge proof under the topology lock. The sweep keeps dirty, locked, marked or leased worktrees. It keeps branch reflogs without a commit-creation message and missing or unreadable reflogs. Fast-forward, target-only automatic merges, reset and rebase-finish messages do not count. Dispatch must establish an unmerged commit or keep the worktree dirty, marked or leased. A merged, clean, unowned branch with its own commits can be swept.
- `start` recovers only a real target directory registered by this clone on the expected branch, under the topology lock, with no lock or other owner. Recovery requires a current-user-owned checkout directory without group or other write access, a regular owned Git pointer, its matching admin backpointer, and the original directory identity saved by start. Git metadata can be group-writable but must not be other-writable. Start still creates a checkout when uid is unavailable; recovery then refuses. Exact removal retires the identity after Git readback. Missing identity or a replacement directory blocks recovery. Files, symlinks, unregistered paths and other branches are refused. Cleanup refuses a registered worktree whose branch is missing. MCP cleanup also refuses active markers and retained native verification evidence. Sweep reports name processed paths. Deferred entries are reported as counts. `kept` excludes deferred entries. A command timeout sends SIGTERM to the direct child only. A grandchild can briefly extend the deadline. No detached cleanup process starts. Herdr notifications accept registered default task worktrees and paths inside them. Other temporary paths and `rh-herdr-` labels stay filtered.

## Daily Flow
1. Read the current request and `AGENTS.md`; load architecture or worker techniques only when relevant.
2. Open a branch; isolate a worktree when concurrent edits overlap. Preserve unrelated work.
3. Make small, bounded commits. Ordinary tasks live in the PR description: goal, changes, verification, risk and rollback.
4. Freeze the candidate and verify once: typecheck plus affected tests. Reviewers and closeout consume the same evidence.
5. A model may squash-merge into main only when the current task explicitly authorizes main publication, automatic checks pass, and GitHub has no outstanding change requests or unresolved review threads. An explicit no-merge instruction always wins. Record the GitHub merge SHA and parent SHA. Record `git revert --no-edit <squash-commit>`. Do not create rollback tags.
6. Run the full suite daily, automatically open a repair task on failure, and produce the daily merge/check/rollback report.
7. Use the [Report SOP](#report-sop) for formal progress, phase and final reports to the user, including the daily user summary. Raw automated CI reports are evidence inputs; they do not replace that summary and do not require this format.

## Report SOP
- Give a Feynman report: explain the work to a reader who does not know this project. Use plain language. Explain the goal, user value, how it works, completed work and remaining gaps. Explain each technical term at first use.
- State the conclusion, changes, reasons, verification and remaining risks. Link each claim to its source or label it as an inference. Use observed results. Name failed, incomplete and omitted checks.
- Include a PlantUML progress diagram. Supply an editable `.puml` file or the complete PlantUML code. Use the same evidence snapshot for the report and diagram. State the snapshot date and relevant revision. Do not invent percentages or dates.
- Keep planned, dispatched, implemented, verified, merged and released states distinct. Mark unknown and failed states as such. A worker report or an Agent `done` signal is not proof of verification, merge or release.
- Render the diagram when a permitted renderer is available. If rendering fails or is unavailable, state the limit and keep the source. Do not upload private material to an external renderer without user authorization.
- Keep the report proportional to the work. Routine confirmations, short updates and tool logs do not require a full report. This SOP adds no approval gate or separate status store. Use existing task, PR and verification sources.

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
