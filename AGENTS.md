# repo-harness

## Workflow
- Keep root CLAUDE.md and AGENTS.md as standalone regular files; repeat shared rules in both and keep host-specific guidance separate.
- Read the current request and repo-local agent context, work on a branch, make bounded commits, verify once, then report the PR outcome.
- Ordinary tasks use the PR description: goal, scope, changes, verification, risk and rollback. No mandatory plan/contract/review/notes chain; notes are only for non-obvious decisions.
- Keep four hard boundaries: main publication, deletion, credentials/permissions, and release/production operations.
- Once automated checks pass, a model may squash-merge unless the user says otherwise; tag the publication and record `git revert <squash-commit>` plus the daily report.
- Automatically delete only merged, clean worktrees/branches; ask the user for every other deletion. Credentials/permissions (including confirmation bypass) and release/production operations require user approval.
- Use gatekeeper/cross-model review for large changes, security/permissions, or unresolved model uncertainty; ordinary steps record diagnostics without approval loops.
- Model division and cross-model dispatch/review follow [Herdr Dispatch](docs/reference-configs/external-tooling.md#herdr-dispatch).
- When one PR changes both test assertions and implementation code, run one read-only review focused on tests bent to fit a bug (on-demand, not a restored gate; dispatch per the herdr guide).
- `.archcontext/model/` owns architecture boundaries; read `docs/architecture/` on demand and update only real responsibility changes. Architecture diagnostics do not block work or author nested agent instructions.
- Preserve `agents/fleet/`, release checklists and downstream `assets/templates` / `assets/partials*`. Keep `assets/workflow-contract.v1.json` and `.ai/harness/workflow-contract.json` aligned.
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
- Use `bun test <affected tests> --timeout 60000 --max-concurrency 1`; extend existing coverage before creating a new test file.
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

## Codex
- Own backend implementation and testing; Claude owns frontend implementation and interaction, and the parent coordinates scope and integration.
- User-level `~/.codex/hooks.json` hooks invoke `repo-harness-hook`; its typed route registry selects one in-process handler. Repo-local hook adapters are retired; `.ai/hooks/lib/workflow-state.sh` is an operator helper.
- Use `~/.codex/skills` as the runtime skill source; `~/.agents/skills` is staging/cache only. Keep `think`, `hunt`, `check` and `health` updates verified before runtime use.
- The Codex automation profile requires runtime-provided `health`, `check` and `mermaid`; do not vendor their bodies.
- Treat auto-compact as a fallback; prepare ignored `.ai/harness/handoff/current.md` and `resume.md` when long-task rollover is needed.
- Keep this file short; load [development flow](docs/reference-configs/agentic-development-flow.md) and [external tooling](docs/reference-configs/external-tooling.md) only when needed.
