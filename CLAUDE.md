# repo-harness

## Workflow
- For non-trivial work, follow the global Progressive Due Diligence rule (P1 map, P2 trace, P3 decision) before design decisions or code edits.
- Keep root CLAUDE.md and AGENTS.md as standalone regular files; repeat shared rules in both and keep host-specific guidance separate.
- Read the current request and repo-local agent context, work on a branch, make bounded commits, verify once, then report the PR outcome.
- Write output text (docs, PR descriptions, commit messages, reports) in ASD-STE100 Simplified Technical English: short sentences, one idea per sentence, active voice, approved-dictionary words; write Chinese output the same way, with short sentences and one idea per sentence.
- Ordinary tasks use the PR description: goal, scope, changes, verification, risk and rollback. No mandatory plan/contract/review/notes chain; notes are only for non-obvious decisions.
- Keep four hard boundaries: main publication, deletion, credentials/permissions, and release/production operations.
- Only when the current task explicitly authorizes main publication may a model squash-merge after automated checks pass and GitHub has no outstanding change requests or unresolved review threads; an explicit no-merge instruction always wins. Push/tag still require task authorization; credentials/permissions, other deletion and release/production retain their separate approval boundaries. Record authorized publication, the provider-confirmed merge SHA and parent SHA, `git revert <squash-commit>`, and the daily report. Do not create rollback tags.
- Default task worktrees use `/tmp/<repo>-wt-<slug>`. Stored downstream templates stay unchanged. Commit or push work before a reboot or age-based tmp cleanup, such as `systemd-tmpfiles`. These cleaners can remove checkouts. Missing entries are pruned. Unmerged branches remain.
- Closeout removes a merged, clean checkout and its branch. It releases only that checkout's own canonical marker after merge proof under the topology lock. The sweep keeps dirty, locked, marked or leased worktrees. It keeps branch reflogs without a commit-creation message and missing or unreadable reflogs. Fast-forward, reset and rebase-finish messages do not count. Dispatch must establish an unmerged commit or keep the worktree dirty, marked or leased. A merged, clean, unowned branch with its own commits can be swept.
- `start` recovers only a real target directory registered by this clone on the expected branch, under the topology lock, with no lock or other owner. Recovery requires current-user ownership without group or other write access, a regular owned Git pointer, its matching admin backpointer, and the original directory identity saved by start. Missing identity or a replacement directory blocks recovery. Files, symlinks, unregistered paths and other branches are refused. Cleanup refuses a registered worktree whose branch is missing. MCP cleanup also refuses active markers and retained native verification evidence. Sweep reports name processed paths. Deferred entries are reported as counts. `kept` excludes deferred entries. A command timeout sends SIGTERM to the direct child only. A grandchild can briefly extend the deadline. No detached cleanup process starts.
- Automatically delete only merged, clean worktrees/branches; ask the user for every other deletion. Credentials/permissions (including confirmation bypass) and release/production operations require user approval.
- Use gatekeeper/cross-model review for large changes, security/permissions, or unresolved model uncertainty; ordinary steps record diagnostics without approval loops.
- Model division and cross-model dispatch/review follow [Herdr Dispatch](docs/reference-configs/external-tooling.md#herdr-dispatch).
- GitHub operations (PRs, reviews, merges, labels, releases, comments) go only through the gh/git CLI or the GitHub API. Never use simulated browser clicks on github.com: the account can be banned.
- When one PR changes both test assertions and implementation code, run one read-only review focused on tests bent to fit a bug (on-demand, not a restored gate; dispatch per the herdr guide).
- `.archcontext/model/` owns architecture boundaries; read `docs/architecture/` on demand and update only real responsibility changes. Architecture diagnostics do not block work or author nested agent instructions.
- Preserve `agents/fleet/`, release checklists and downstream `assets/templates` / `assets/partials*`. `.ai/harness/workflow-contract.json` is the opt-in marker. `assets/workflow-contract.v1.json` is the contract.
- `_ops/` is ignored private operations state: never commit or agent-edit it. `_ref/` is an ignored reference cache; cite influential revisions. Follow deploy SQL policy, otherwise use ascending 4-digit files under `deploy/sql/`.

## Code Optimization Principles
- Identify observable conditions, controllable inputs, the invariant and the actual pressure point before changing structure.
- Keep one source of truth for each datum; other representations are deterministic projections with drift checks.
- Do not add steady-state compatibility code, dual authority, semantic fallbacks, aliases or shadow parsers; one-shot migrations fail closed and remove the retired path.
- Share components only for observed reuse or a cross-module invariant. Use an existing workspace only for independently meaningful consumers; do not convert this single-package repo without that boundary.
- Prefer platform/standard-library features, then installed dependencies, and the smallest direct implementation; shrink obsolete code before adding layers.
- Never satisfy a requirement with a substitute that only looks compliant (mocks, hard-coded values, images posing as the real thing); say what cannot be done and flag the deviation in the PR.
- Self-review before committing: remove dead code, empty branches and debug leftovers, and split functions by responsibility instead of one large block.

## Testing
- Run `bun run check:type` plus tests covering the changed behavior once after the implementation is stable.
- Use `bun run test:files <affected tests> --timeout 60000 --max-concurrency 1`; extend existing coverage before creating a new test file.
- Select tests by observable risk and owning runtime boundary, including error/recovery paths when affected.
- Mechanical prose changes need link/scope validation, not new product tests; do not test incidental formatting.
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

## Claude Code
- Own frontend implementation and interaction; Codex owns backend implementation and testing, and the parent coordinates scope and integration.
- Use Claude Code's available tools within granted permissions; changes to tool grants, hooks or confirmation bypass require approval of the exact change.
- User-level `~/.claude/settings.json` hooks invoke `repo-harness-hook`; its typed route registry selects one in-process handler. Repo-local hook adapters are retired. Operator helpers use the package path from `repo-harness hook-lib path`. This source repo keeps `.ai/hooks/lib/workflow-state.sh` for self-hosting.
- Write comments, commits and PR text from the final diff; comments explain non-obvious reasons, and PRs describe final behavior and material rationale.
- Keep this file short; load [development flow](docs/reference-configs/agentic-development-flow.md) and [external tooling](docs/reference-configs/external-tooling.md) only when needed.
