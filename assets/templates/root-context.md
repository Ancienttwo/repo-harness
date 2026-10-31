# Repo Agent Context

This is the root routing contract for Claude Code and Codex. Load this before task-local artifacts.

## Workflow
- Multi-agent work follows the `repo-harness-issue-flow` skill (`~/.claude/skills/repo-harness-issue-flow/` or `~/.codex/skills/repo-harness-issue-flow/`): roles, claims, handoff, dispatch, acceptance and merge.
- `docs/architecture/archimap.html` is the single architecture entry when the architecture projection writes it. Change boundaries only through `repo-harness-architecture`; do not hand-write other architecture docs.
- Keep four hard boundaries: main publication, deletion, credentials/permissions, and release/production operations.
- Only when the current task explicitly authorizes main publication, and `publication.acceptance_merge` is `on` in the policy on the PR base, is publication allowed; the skill defines who merges. Push/tag need task authorization. Deletion, credentials/permissions and release/production need user approval. An explicit no-merge instruction always wins.
- The diff's Review by risk tier (`docs/reference-configs/agentic-development-flow.md#review-by-risk`) selects independent review; the skill defines the reviewers and their model families. Changing implementation and test assertions together does not raise the tier.
- Create task worktrees only at `/tmp/<repo>-wt-<slug>` (Windows: the OS temp directory) with `repo-harness run contract-worktree start --issue <number>`, or `git worktree add` with that path. Never create one beside the main checkout (`../`). Commit or push before a reboot or a tmp cleanup. Closeout and sweep remove only merged, clean and unowned worktrees; to keep one, give it an unmerged commit, keep it dirty, or mark or lock it.
- For non-trivial work, follow the global Progressive Due Diligence rule (P1 map, P2 trace, P3 decision) before design decisions or code edits.
- Read `tasks/lessons.md` at session start and apply its active lessons. Current repo state and evidence override a lesson.
- Ordinary tasks use the PR description: goal, scope, changes, verification, risk and rollback. No plan, contract, review, notes or approval artifact is mandatory. Record a one-time decision in the issue.
- Read the current request and repo-local agent context, work on a branch, make bounded commits, verify once, then report the PR outcome. Finish the main task first. Fix a small problem found on the way directly; for a large problem, open a GitHub issue before you work on it.
- GitHub operations (PRs, reviews, merges, labels, releases, comments) go only through the gh/git CLI or the GitHub API. Never use simulated browser clicks on github.com: the account can be banned.

## Code Optimization Principles
- Identify observable conditions, controllable inputs, the invariant and the actual pressure point before changing structure.
- Keep one source of truth for each datum; other representations are deterministic projections with drift checks.
- Do not add steady-state compatibility code, dual authority, semantic fallbacks, aliases or shadow parsers; one-shot migrations fail closed and remove the retired path.
- Share components only for observed reuse or a cross-module invariant. Do not convert a single-package repository into a workspace without an independently meaningful consumer boundary.
- Prefer platform/standard-library features, then installed dependencies, and the smallest direct implementation; shrink obsolete code before adding layers.
- Never satisfy a requirement with a substitute that only looks compliant; say what cannot be done and flag the deviation in the PR.

## Testing
- Run the repository type check and the affected tests once after the implementation is stable.
- Prefer a focused failing regression before a bug fix. For other work, select tests by observable risk and owning runtime boundary, including error and recovery paths.
- Use `bun run test:files <affected tests> --timeout 60000 --max-concurrency 1`; extend existing coverage before creating a new test file.
- Test budget per PR: added test lines divided by added product lines must not exceed 2:1, and the PR adds at most one test file.
- Never modify or delete a test assertion to make a test pass; justify every necessary test change item by item in the PR.
- Report failed, timed-out, incomplete or omitted coverage explicitly; do not manufacture receipts.

## Writing
- Write human-facing documents in the language set by `.ai/harness/policy.json#documentation.language`; keep section headers, field keys and technical terms in English.
- Write output text in ASD-STE100 Simplified Technical English: short sentences, one idea per sentence, active voice.
- Prefer high information density: evidence first, mechanism and business effect second. Delete process commentary, repeated summaries and transitions that exist only for completeness.
- A conclusion must add a cause, mechanism, constraint, testable prediction or business effect.

## UI
- Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.
