# adopt handoff refresh notes

## Context

- Downstream `repo-harness adopt` could fail after a successful repo refresh when `.ai/harness/handoff/current.md` became newer than `.ai/harness/handoff/resume.md`.
- The failure surfaced as both `apply repo harness` and `verify repo harness` failures because migration apply has an internal strict workflow verify, and `runInit` has an outer strict verify.

## Decisions

- Refresh Codex handoff/resume inside `scripts/migrate-project-template.sh` immediately before its internal strict workflow verification.
- Refresh Codex handoff/resume again in `runInit` before the outer adopt verification when migration succeeded.
- Keep the fix scoped to workflow artifact freshness; do not relax `check-task-workflow.sh --strict` or remove the stale-resume guard.
- Add downstream `.gitignore` entries only for repo-harness generated helper wrappers, including exact `scripts/<helper>` compatibility wrapper paths and `scripts/repo-harness/` fallback wrappers.
- During migration, untrack only helper wrappers identifiable as repo-harness generated while preserving tracked app-owned scripts with the same names.
- Keep development records trackable: do not ignore `tasks/notes/`, `docs/researches/`, `plans/`, or deployment/runbook documentation surfaces.

## Verification

- `bun test tests/cli/init.test.ts`
- `bun test tests/migration-script.test.ts`
- `bun test tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts tests/cli/init.test.ts`
- `bun test`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `bash scripts/prepare-codex-handoff.sh --reason adopt-handoff-refresh-ignore-fix && bash scripts/check-task-workflow.sh --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
