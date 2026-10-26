# repo-harness

## Workflow
- For non-trivial work, follow the global Progressive Due Diligence rule (P1 map, P2 trace, P3 decision) before design decisions or code edits.
- Keep root CLAUDE.md and AGENTS.md as standalone regular files; repeat shared rules in both and keep host-specific guidance separate.
- Read the current request and repo-local agent context, work on a branch, make bounded commits, verify once, then report the PR outcome.
- Read `tasks/lessons.md` at session start and apply its active lessons. Current repo state and evidence override a lesson.
- Finish the main task first. Fix a small problem found on the way directly. For a large problem, open a GitHub issue before you work on it.
- Ordinary tasks use the PR description: goal, scope, changes, verification, risk and rollback. No mandatory plan/contract/review/notes chain; notes are only for non-obvious decisions.
- Keep four hard boundaries: main publication, deletion, credentials/permissions, and release/production operations.
- Only when the current task explicitly authorizes main publication may a model squash-merge after automated checks pass and GitHub has no outstanding change requests or unresolved review threads; an explicit no-merge instruction always wins. Push/tag still require task authorization; credentials/permissions, other deletion and release/production retain their separate approval boundaries. Record authorized publication, the provider-confirmed merge SHA and parent SHA, `git revert <squash-commit>`, and the daily report. Do not create rollback tags.
- Create task worktrees only with `repo-harness run contract-worktree start --plan <plan-file>`. Never run `git worktree add` directly; the Claude Bash hook denies a target outside the managed root.
- Default worktrees are at `/tmp/<repo>-wt-<slug>` (Windows: `os.tmpdir()`). Commit or push before a reboot or a tmp cleanup.
- Closeout and sweep remove only merged, clean and unowned worktrees. To keep one, give it an unmerged commit, keep it dirty, or mark or lock it. Details: [agentic-development-flow](docs/reference-configs/agentic-development-flow.md).
- Automatically delete only merged, clean worktrees/branches; ask the user for every other deletion. Credentials/permissions (including confirmation bypass) and release/production operations require user approval.
- Select independent review by the diff's [Review by risk](docs/reference-configs/agentic-development-flow.md#review-by-risk) tier: none for low, one fresh-context review for medium, gatekeeper plus cross-model review for high; ordinary steps record diagnostics without approval loops.
- When you delegate, investigate first, then split work by write ownership. Give each parallel writer its own worktree from a clean source. Implementation sub-agents edit only their scope. They do not run build, typecheck or tests. They commit early in their own worktree and return early. In a shared checkout they do not commit; the parent commits. Evidence roles run the named check that is their task and do not commit. The parent agent owns task management, conflict resolution, build, typecheck, tests and integration. After integration, the parent removes each sub-agent worktree and branch whose commits are in the task branch and whose checkout is clean. It also removes the intermediate build output and temporary files that the work created. Other deletion still needs the user.
- Model division and cross-model dispatch/review follow [Herdr Dispatch](docs/reference-configs/herdr-notify.md#herdr-dispatch).
- GitHub operations (PRs, reviews, merges, labels, releases, comments) go only through the gh/git CLI or the GitHub API. Never use simulated browser clicks on github.com: the account can be banned.
- When one PR changes both test assertions and implementation code, run one read-only review focused on tests bent to fit a bug (on-demand, not a restored gate; dispatch per the herdr guide).
- `.archcontext/model/` owns architecture boundaries; read `docs/architecture/` on demand and update only real responsibility changes. Architecture diagnostics do not block work or author nested agent instructions.
- When a branch changes a capability's responsibility, entrypoints, relations or flows, follow `repo-harness-architecture` (`assets/skill-commands/repo-harness-architecture/references/worker.md`). Handle architecture debt in the model and human prose. The archctx rolling writer publishes generated regions and the projection manifest; do not apply and commit them in a feature PR.
- Preserve `agents/fleet/`, release checklists and downstream `assets/templates`. `.ai/harness/workflow-contract.json` is the opt-in marker. `assets/workflow-contract.v1.json` is the contract.
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
- Before you write or change tests, load the `repo-harness-test` skill (`assets/skills/repo-harness-test/SKILL.md`).
- When a local check and CI disagree, CI is the authority. Reproduce the failure with `bash scripts/check-ci.sh <lane>` before you change code; a global `repo-harness` or `repo-harness-hook` on `PATH` can hide a missing test setup.

## Handoff
- Create a checkpoint only when context/session rollover or unresolved work needs it; ordinary completion stays in the PR description.
- Read files named in the current request before recovery context.
- Record the goal, branch/worktree/HEAD, decisions, touched files, verification results, blockers and one exact next command.
- Keep temporary checkpoints under ignored `.ai/harness/handoff/`; historical snapshots are not current execution authority.
- Include evidence paths and actual command outcomes; distinguish observed state from inference.
- Never include secrets, tokens or real environment files in handoff text.
- On resume, verify the live checkout and source artifacts before reusing a result; `tasks/current.md` is an optional local read model.
- Preserve dirty work and other workers' edits; hand back an ownership conflict instead of discarding their changes.

## Writing
- Write output text (docs, PR descriptions, commit messages, reports, research notes) in ASD-STE100 Simplified Technical English: short sentences, one idea per sentence, active voice, approved-dictionary words. Write Chinese output the same way.
- Prefer high information density: evidence first, mechanisms and business effect explained, complex reasoning allowed, no explanatory repetition. Lead with the main finding, key number or key mechanism. State known facts and supported conclusions directly, without lead-ins such as "note that", "this shows to some extent" or "it must be stressed". Put the evidence grade in the wording, not in a separate caveat.
- Give time, subject, action, size and source in one sentence. Keep only the qualifiers that change the fact, the statistics or the inference. Keep text that explains a cause or mechanism, separates confounded causes, or builds a new classification.
- Delete: comments on your own process or work; a second explanation of a fact that already states its source, scope and meaning; "do not read this as" warnings; repeated disclaimers; step-by-step tutorials and hypothetical teaching examples; prose that repeats a comparison table; repeated summaries and claims about the importance of the result.
- A conclusion must add a cause, mechanism, constraint, testable prediction or business effect. A restatement of earlier facts is not a conclusion.
- Prefer real companies, products, contracts, prices and user behavior as examples. Use a table for multi-object or multi-metric comparison. Split sections by question; drop introductions, transitions and summaries that exist only for completeness.
- Paragraph deletion test: if removing a paragraph leaves the reader's understanding of facts, numbers, mechanism, cause, conditions and conclusion unchanged, remove it. Check first the paragraphs that start with "this shows", "note that", "therefore", "however" or "it must be stressed".

## UI
- Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.

## Codex
- Own backend implementation and testing; Claude owns frontend implementation and interaction, and the parent coordinates scope and integration.
- User-level `~/.codex/hooks.json` hooks invoke `repo-harness-hook`; its typed route registry selects one in-process handler. Operator helpers run from the package through `repo-harness run <helper>`.
- Use `~/.codex/skills` as the runtime skill source; `~/.agents/skills` is staging/cache only. Keep `think`, `hunt`, `check` and `health` updates verified before runtime use.
- The Codex automation profile requires runtime-provided `health`, `check` and `mermaid`; do not vendor their bodies.
- Treat auto-compact as a fallback; prepare ignored `.ai/harness/handoff/current.md` and `resume.md` when long-task rollover is needed.
- Keep this file short; load [development flow](docs/reference-configs/agentic-development-flow.md) and [external tooling](docs/reference-configs/external-tooling.md) only when needed.
