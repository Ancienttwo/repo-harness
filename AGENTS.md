# repo-harness

## Workflow
- For non-trivial work, follow the global Progressive Due Diligence rule (P1 map, P2 trace, P3 decision) before design decisions or code edits.
- Keep root CLAUDE.md and AGENTS.md as standalone regular files; repeat shared rules in both and keep host-specific guidance separate.
- Read the current request and repo-local agent context, work on a branch, make bounded commits, verify once, then report the PR outcome.
- Finish the main task first. Fix a small problem found on the way directly. For a large problem, open a GitHub issue before you work on it.
- Write output text (docs, PR descriptions, commit messages, reports) in ASD-STE100 Simplified Technical English: short sentences, one idea per sentence, active voice, approved-dictionary words; write Chinese output the same way, with short sentences and one idea per sentence.
- Ordinary tasks use the PR description: goal, scope, changes, verification, risk and rollback. No mandatory plan/contract/review/notes chain; notes are only for non-obvious decisions.
- Keep four hard boundaries: main publication, deletion, credentials/permissions, and release/production operations.
- Only when the current task explicitly authorizes main publication may a model squash-merge after automated checks pass and GitHub has no outstanding change requests or unresolved review threads; an explicit no-merge instruction always wins. Push/tag still require task authorization; credentials/permissions, other deletion and release/production retain their separate approval boundaries. Record authorized publication, the provider-confirmed merge SHA and parent SHA, `git revert <squash-commit>`, and the daily report. Do not create rollback tags.
- Default task worktrees use `/tmp/<repo>-wt-<slug>` on POSIX. Native Windows uses `os.tmpdir()` as the root. Stored downstream templates stay unchanged. Commit or push work before a reboot or age-based tmp cleanup, such as `systemd-tmpfiles`. These cleaners can remove checkouts. Missing entries are pruned. The sweep saves missing registration identities before global prune. Later batches finish deferred branch cleanup. Unmerged branches remain.
- Closeout removes a merged, clean checkout and its branch. It releases only that checkout's own canonical marker after merge proof under the topology lock. The sweep keeps dirty, locked, marked or leased worktrees. It keeps branch reflogs without a commit-creation message and missing or unreadable reflogs. Fast-forward, target-only automatic merges, reset and rebase-finish messages do not count. Dispatch must establish an unmerged commit or keep the worktree dirty, marked or leased. A merged, clean, unowned branch with its own commits can be swept.
- `start` recovers only a real target directory registered by this clone on the expected branch, under the topology lock, with no lock or other owner. Recovery requires a current-user-owned checkout directory without group or other write access, a regular owned Git pointer, its matching admin backpointer, and the original directory identity saved by start. Git metadata can be group-writable but must not be other-writable. Start still creates a checkout when uid is unavailable; recovery then refuses. Exact removal retires the identity after Git readback. Missing identity or a replacement directory blocks recovery. Files, symlinks, unregistered paths and other branches are refused. Cleanup refuses a registered worktree whose branch is missing. MCP cleanup also refuses active markers. Sweep reports name processed paths. Deferred entries are reported as counts. `kept` excludes deferred entries. A command timeout sends SIGTERM to the direct child only. A grandchild can briefly extend the deadline. No detached cleanup process starts. Herdr notifications accept registered default task worktrees and paths inside them. Other temporary paths and `rh-herdr-` labels stay filtered.
- Automatically delete only merged, clean worktrees/branches; ask the user for every other deletion. Credentials/permissions (including confirmation bypass) and release/production operations require user approval.
- Use gatekeeper/cross-model review for large changes, security/permissions, or unresolved model uncertainty; ordinary steps record diagnostics without approval loops.
- When you delegate, investigate first, then split work by write ownership. Give each parallel writer its own worktree from a clean source. Implementation sub-agents edit only their scope. They do not run build, typecheck or tests. They commit early in their own worktree and return early. In a shared checkout they do not commit; the parent commits. Evidence roles run the named check that is their task and do not commit. The parent agent owns task management, conflict resolution, build, typecheck, tests and integration. After integration, the parent removes each sub-agent worktree and branch whose commits are in the task branch and whose checkout is clean. It also removes the intermediate build output and temporary files that the work created. Other deletion still needs the user.
- Model division and cross-model dispatch/review follow [Herdr Dispatch](docs/reference-configs/external-tooling.md#herdr-dispatch).
- GitHub operations (PRs, reviews, merges, labels, releases, comments) go only through the gh/git CLI or the GitHub API. Never use simulated browser clicks on github.com: the account can be banned.
- When one PR changes both test assertions and implementation code, run one read-only review focused on tests bent to fit a bug (on-demand, not a restored gate; dispatch per the herdr guide).
- `.archcontext/model/` owns architecture boundaries; read `docs/architecture/` on demand and update only real responsibility changes. Architecture diagnostics do not block work or author nested agent instructions.
- When a branch changes a capability's responsibility, entrypoints, relations or flows, run `repo-harness architecture-projection check --json` before review and follow `repo-harness-architecture` (`assets/skill-commands/repo-harness-architecture/references/worker.md`).
- Preserve `agents/fleet/`, release checklists and downstream `assets/templates` / `assets/partials*`. `.ai/harness/workflow-contract.json` is the opt-in marker. `assets/workflow-contract.v1.json` is the contract.
- `_ops/` is ignored private operations state: never commit or agent-edit it. `_ref/` is an ignored reference cache; cite influential revisions. Follow deploy SQL policy, otherwise use ascending 4-digit files under `deploy/sql/`.

## GitHub Issue Claims
- Before an agent starts work on a GitHub issue, read its current state, assignees and all comments through `gh` or the GitHub API. Use pagination for comments. Check existing work claims, linked PRs and handoff notes.
- An active claim is an assignee other than the current task owner, an open PR that links the issue, or an active claim comment that no later status comment released. If another agent or person has an active claim, do not start duplicate work. Coordinate with that owner within the authorized task scope. Take over only after an explicit handoff or user instruction. Silence, an old timestamp or a disconnected session does not release a claim.
- When taking an unclaimed issue or an approved handoff, post a claim comment before edits, tests or worker dispatch. Use `gh issue comment <issue-url> --body-file <file>`. This rule authorizes claim and status comments for an issue within the user's task scope. It grants no other GitHub write authority.
- Start the comment with `repo-harness issue claim`. Include `Status: active`, the agent kind and unique session or task ID, the branch, the work scope and any prior claim comment URL for a handoff. Use this identity in later status comments. A shared GitHub login is not an agent identity. Do not include secrets or private host paths.
- Read the issue comments again after posting. Confirm the published comment URL and body. If a competing claim appeared, stop duplicate work and resolve ownership before continuing. For simultaneous claims without an explicit assignment or handoff, the earliest GitHub comment wins; break timestamp ties by comment ID. These comments coordinate agents; they are not an atomic lock and do not replace canonical task claims or leases.
- On resume, check the current claim before continuing. Reuse the same active claim instead of posting it again. If a read or post fails, or delivery is uncertain, stop and report the failure. Read back before retrying an uncertain post.
- Post a status comment that links the claim when the work is blocked, ready for review, complete or released. Keep a blocked or review-pending claim active. Include the PR or result when available. Release ownership explicitly on cancellation or handoff. Do not close the issue unless the task authorizes closure.

## Code Optimization Principles
- Identify observable conditions, controllable inputs, the invariant and the actual pressure point before changing structure.
- Keep one source of truth for each datum; other representations are deterministic projections with drift checks.
- Do not add steady-state compatibility code, dual authority, semantic fallbacks, aliases or shadow parsers; one-shot migrations fail closed and remove the retired path.
- Share components only for observed reuse or a cross-module invariant. Use an existing workspace only for independently meaningful consumers; do not convert this single-package repo without that boundary.
- Prefer platform/standard-library features, then installed dependencies, and the smallest direct implementation; shrink obsolete code before adding layers.
- Never satisfy a requirement with a substitute that only looks compliant (mocks, hard-coded values, images posing as the real thing); say what cannot be done and flag the deviation in the PR.
- Self-review before committing: remove dead code, empty branches and debug leftovers, and split functions by responsibility instead of one large block.

## Testing
- Run `bun run check:type` for code changes and tests covering the changed behavior once after the implementation is stable. Development-time debugging can run focused checks before that final verification.
- For a bug fix, prefer a focused failing regression before the fix. Run only the reproducer during RED. Record a reproduction gap when the environment cannot produce it; ordinary tasks do not require RED artifacts.
- A diff's size, a new test file, a new agent or a rebase does not by itself require a full run.
- Use `bun run test:files <affected tests> --timeout 60000 --max-concurrency 1`; extend existing coverage before creating a new test file.
- Select tests by observable risk and owning runtime boundary, including error/recovery paths when affected.
- Mechanical prose changes need link/scope validation, not new product tests; do not test incidental formatting or that deleted files stay deleted.
- Reviewers consume the recorded command, result, revision and environment; they do not rerun passing checks to claim ownership.
- Changed inputs or a new uncovered failure justify affected delta checks; an old pass is only historical evidence for its old subject.
- Run the full suite daily; a failure opens an automatic repair task and appears in the daily report.
- Isolate mutable HOME, repositories and process state; use real synchronization signals and preserve complete failure output.
- Report failed, timed-out, incomplete or omitted coverage explicitly; do not manufacture receipts, waiver files or pre-fix logs.
- Never modify or delete test assertions just to make tests pass; justify every necessary test change item by item in the PR description.

## Handoff
- Create a checkpoint only when context/session rollover or unresolved work needs it; ordinary completion stays in the PR description.
- Read files named in the current request before recovery context.
- Record the goal, branch/worktree/HEAD, decisions, touched files, verification results, blockers and one exact next command.
- Keep temporary checkpoints under ignored `.ai/harness/handoff/`; historical snapshots are not current execution authority.
- Include evidence paths and actual command outcomes; distinguish observed state from inference.
- Never include secrets, tokens or real environment files in handoff text.
- On resume, verify the live checkout and source artifacts before reusing a result; `tasks/current.md` is an optional local read model.
- Preserve dirty work and other workers' edits; hand back an ownership conflict instead of discarding their changes.

## Codex
- Own backend implementation and testing; Claude owns frontend implementation and interaction, and the parent coordinates scope and integration.
- User-level `~/.codex/hooks.json` hooks invoke `repo-harness-hook`; its typed route registry selects one in-process handler. Repo-local hook adapters are retired. Operator helpers run from the package through `repo-harness run <helper>`; no shell operator library exists.
- Use `~/.codex/skills` as the runtime skill source; `~/.agents/skills` is staging/cache only. Keep `think`, `hunt`, `check` and `health` updates verified before runtime use.
- The Codex automation profile requires runtime-provided `health`, `check` and `mermaid`; do not vendor their bodies.
- Treat auto-compact as a fallback; prepare ignored `.ai/harness/handoff/current.md` and `resume.md` when long-task rollover is needed.
- Keep this file short; load [development flow](docs/reference-configs/agentic-development-flow.md) and [external tooling](docs/reference-configs/external-tooling.md) only when needed.
