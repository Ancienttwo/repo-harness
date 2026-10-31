# repo-harness

## Workflow
- Multi-agent work follows `repo-harness-issue-flow` (`assets/skills/repo-harness-issue-flow/SKILL.md`): roles, claims, handoff, dispatch, acceptance and merge.
- `docs/architecture/archimap.html` is the single architecture entry. It links each module to its archctx-projected capability doc in `docs/architecture/modules/`. Change boundaries only through `repo-harness-architecture`; do not hand-write other architecture docs.
- Keep four hard boundaries: main publication, deletion, credentials/permissions, and release/production operations.
- Only when the current task explicitly authorizes main publication, and `publication.acceptance_merge` is `on` in the policy on the PR base, is publication allowed; the skill defines who merges. Push/tag need task authorization. Deletion, credentials/permissions and release/production need user approval. An explicit no-merge instruction always wins.
- The diff's [Review by risk](docs/reference-configs/agentic-development-flow.md#review-by-risk) tier selects independent review; the skill defines the reviewers and their model families. Changing implementation and test assertions together does not raise the tier.
- Create task worktrees only at `/tmp/<repo>-wt-<slug>` (Windows: `os.tmpdir()`) with `repo-harness run contract-worktree start --issue <number>`, or `git worktree add` with that path. Never create one beside the main checkout (`../`). Commit or push before a reboot or a tmp cleanup. Closeout and sweep remove only merged, clean and unowned worktrees; to keep one, give it an unmerged commit, keep it dirty, or mark or lock it.
- For non-trivial work, follow the global Progressive Due Diligence rule (P1 map, P2 trace, P3 decision) before design decisions or code edits.
- Keep root CLAUDE.md and AGENTS.md as standalone regular files; repeat shared rules in both and keep host-specific guidance separate.
- Read the current request and repo-local agent context, work on a branch, make bounded commits, verify once, then report the PR outcome. Finish the main task first. Fix a small problem found on the way directly; for a large problem, open a GitHub issue before you work on it.
- Read `tasks/lessons.md` at session start and apply its active lessons. Current repo state and evidence override a lesson.
- Ordinary tasks use the PR description: goal, scope, changes, verification, risk and rollback. No plan, contract, review, notes or approval artifact is mandatory. Record a one-time decision in the issue.
- GitHub operations (PRs, reviews, merges, labels, releases, comments) go only through the gh/git CLI or the GitHub API. Never use simulated browser clicks on github.com: the account can be banned.
- Preserve `agents/fleet/`, release checklists and downstream `assets/templates`. `.ai/harness/workflow-contract.json` is the opt-in marker. `assets/workflow-contract.v1.json` is the contract. `_ops/` is ignored private operations state: never commit or agent-edit it. `_ref/` is an ignored reference cache; cite influential revisions. Follow deploy SQL policy, otherwise use ascending 4-digit files under `deploy/sql/`.

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
- Test budget per PR: added test lines divided by added product lines must not exceed 2:1, and the PR adds at most one test file. A PR that adds no product lines records the exception for any added test. Measure with `git diff --numstat main...HEAD -- tests` and `git diff --numstat main...HEAD -- src scripts`; above either cap, add a `Test budget exception` PR section with the counts and why an existing test cannot cover the behavior.
- Select tests by observable risk and owning runtime boundary, including error/recovery paths when affected.
- Mechanical prose changes need link/scope validation, not new product tests; do not test incidental formatting or that deleted files stay deleted.
- Reviewers consume the recorded command, result, revision and environment; they do not rerun passing checks to claim ownership.
- Changed inputs or a new uncovered failure justify affected delta checks; an old pass is only historical evidence for its old subject.
- Run the full suite daily; a failure opens an automatic repair task and appears in the daily report.
- Isolate mutable HOME, repositories and process state; use real synchronization signals and preserve complete failure output.
- Report failed, timed-out, incomplete or omitted coverage explicitly; do not manufacture receipts, waiver files or pre-fix logs.
- Never modify or delete test assertions just to make tests pass; justify every necessary test change item by item in the PR description. Remove a redundant test only when the PR names the retained test that covers the same behavior.
- Before you write or change tests, load the `repo-harness-test` skill (`assets/skills/repo-harness-test/SKILL.md`).
- When a local check and CI disagree, CI is the authority. Reproduce the failure with `bash scripts/check-ci.sh <lane>` before you change code; a global `repo-harness` or `repo-harness-hook` on `PATH` can hide a missing test setup.

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

## Claude Code
- Use Claude Code's available tools within granted permissions; changes to tool grants, hooks or confirmation bypass require approval of the exact change.
- User-level `~/.claude/settings.json` hooks invoke `repo-harness-hook`; its typed route registry selects one in-process handler. Operator helpers run from the package through `repo-harness run <helper>`.
- Write comments, commits and PR text from the final diff; comments explain non-obvious reasons, and PRs describe final behavior and material rationale.
- Keep this file short; load [development flow](docs/reference-configs/agentic-development-flow.md) and [external tooling](docs/reference-configs/external-tooling.md) only when needed.
