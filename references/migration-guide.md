# Migration Guide (current repo-harness contract)

This guide upgrades an existing repository to the current `repo-harness`
tasks-first contract. The canonical public entrypoint is `repo-harness adopt`.

## Current Contract Surface

- **Contract ID**: `tasks-first-harness-v1` in
  `assets/workflow-contract.v1.json`.
- **Version source**: `assets/skill-version.json`.
- **Action commands**: public command skills are the `repo-harness-*` facades
  under `assets/skill-commands/`.
- **Typed hook runtime**: host adapters call `repo-harness-hook`; the route
  registry invokes exactly one typed handler for each route.
- **User-level host adapters**: `~/.claude/settings.json` and
  `~/.codex/hooks.json`; repo-local adapter files are user-owned inputs for
  manual review.
- **Operator helper projection**: `.ai/hooks/lib/workflow-state.sh` is the only
  hook helper documented for workflow-state inspection. It is not a dispatcher.
- Stable product truth lives in `docs/spec.md`.
- `plans/` is the timestamped plan catalog; `.ai/harness/active-plan` selects
  the active plan.
- Sprint done definitions live in `tasks/contracts/` and `tasks/reviews/`.
- Structured verification and resumable state live in
  `.ai/harness/checks/latest.json` and `.ai/harness/handoff/current.md`.
- `tasks/todos.md` is the deferred-goal ledger; durable progress lives in
  `tasks/workstreams/` and release history in `docs/CHANGELOG.md`.
- `scripts/check-task-sync.sh` and `scripts/check-task-workflow.sh` enforce the
  repo-local task and workflow contracts.
- Helper commands are installed from `assets/workflow-contract.v1.json`,
  including plan, sprint, contract-worktree, handoff, verification, capability,
  and architecture helpers.
- External Waza/CodeGraph tooling is advisory and never auto-installed by adopt.
- `_ref/` and `_ops/` remain local surfaces; migration does not vendor, rewrite,
  or delete them.

## Automated Migration

```bash
# Preview only
repo-harness adopt --repo /path/to/project --dry-run

# Apply migration
repo-harness adopt --repo /path/to/project
```

## What the Transaction Does

1. Writes the workflow contract and projects the declared operator helper
   library into `<repo>/.ai/hooks/lib/`.
2. Removes retired generated hook entry files by exact manifest ownership while
   preserving user-owned files outside that manifest.
3. Preserves project-level host adapter configuration for explicit manual review;
   user-level adapter setup remains a separate install operation.
4. Archives legacy plan, todo, progress, contract, review, and handoff files in
   the transaction before retiring their old paths.
5. Ensures `docs/spec.md`, `tasks/`, `plans/`, `.ai/context/`,
   `.ai/harness/`, `docs/architecture/`, and `docs/reference-configs/` exist.
6. Merges missing policy defaults while preserving explicit repo overrides.
7. Uses the workflow contract manifest for cleanup ownership.
8. Copies the current shared reference configs and external-tooling guidance.
9. Injects task-sync and task-workflow checks into `package.json` when present.
10. Returns a structured transaction manifest and post-apply verification steps.
11. Never auto-installs or auto-upgrades Waza and never enables MCP automatically.

## External Tooling Safety Contract

Use `bash scripts/check-agent-tooling.sh` for advisory checks only. The detector
is read-only; it may inspect installed skill metadata and, when
`--check-updates` is set, fetch upstream Waza sources. The migration flow never
treats mutating update commands as probes.

## Manual Follow-up

1. Review the user-level Claude/Codex adapter entries for project-specific
   command exceptions and trust the Codex settings entry.
2. Confirm `.ai/hooks/lib/workflow-state.sh` exists as the operator-helper
   projection and that no retired dispatcher entry files remain.
3. Confirm `.claude/settings.local.json` contains only personal overrides.
4. Confirm `docs/spec.md`, `tasks/reviews/`, and `.ai/harness/` match the live
   workflow contract.
5. Confirm generated `.claude/hooks/` shims were removed while custom user-owned
   hooks were preserved.
6. Confirm `.ai/harness/policy.json` retains the expected external-tooling
   profile and explicit repo overrides.
7. Review the transaction manifest and any post-apply verification failure.
8. Run `bash scripts/check-agent-tooling.sh --host both --check-updates` for a
   fresh advisory snapshot when needed.
9. Run project smoke checks, `check:task-sync`, and `check:task-workflow`.
10. Run `bash scripts/prepare-handoff.sh migration` if active task state changed.
11. Run `bash scripts/verify-sprint.sh` when an active sprint review exists.
12. Commit the migration as one isolated change-set.

## Rollback

- Restore `*.bak.<timestamp>` files created by the migration transaction.
- Or revert the migration commit.
