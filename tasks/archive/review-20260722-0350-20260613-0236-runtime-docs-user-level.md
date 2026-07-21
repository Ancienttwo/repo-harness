# Sprint Review: runtime-docs-user-level

> **Status**: Complete
> **Plan**: plans/plan-20260613-0236-runtime-docs-user-level.md
> **Contract**: tasks/contracts/20260613-0236-runtime-docs-user-level.contract.md
> **Notes File**: tasks/notes/20260613-0236-runtime-docs-user-level.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-06-13 03:18
> **Recommendation**: pass

## Mode Evidence

- Selected route: approved Waza `/think` plan executed in isolated worktree.
- P1/P2/P3 evidence: runtime docs are package-level reference material;
  `.ai/harness/*` and `.ai/context/*` remain repo-local runtime state.
- Root cause or plan evidence: captured plan
  `plans/plan-20260613-0236-runtime-docs-user-level.md`.

## Verification Evidence

- Waza `/check` run: not invoked; full local verification passed.
- Commands run:
  - `bun test tests/cli/docs.test.ts tests/workflow-contract.test.ts tests/bootstrap-files.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts tests/readme-dx.test.ts`
  - `bash scripts/check-deploy-sql-order.sh`
  - `bash scripts/check-architecture-sync.sh`
  - `bash scripts/check-task-sync.sh`
  - `bash scripts/check-task-workflow.sh --strict`
  - `bun scripts/inspect-project-state.ts --repo . --format text`
  - `bash scripts/migrate-project-template.sh --repo . --dry-run`
  - `bun test`
- Manual checks: inspected final diff/status; self dry-run reports
  `upgrade_plan: (none)`.
- Supporting artifacts: `.ai/harness/workflow-contract.json`,
  `assets/workflow-contract.v1.json`, CLI docs command tests.
- Implementation notes reviewed: yes.
- Run snapshot: terminal verification in current worktree.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: local verification
> **External Source**: focused tests, full test suite, workflow gates
> **External Started**: 2026-06-13 02:46
> **External Completed**: 2026-06-13 03:18

- P1 blockers: none.
- P2 advisories: CodeGraph index is not initialized in this temporary worktree;
  unrelated to docs externalization and full tests passed.
- Acceptance checklist:
  - `repo-harness docs list|path|show` covered by CLI tests.
  - Scaffold/migration stubs covered by runtime and migration tests.
  - Repo-local `.ai/` artifacts preserved by workflow contract and full tests.

## Behavior Diff Notes

- Adds `repo-harness docs` resolver over `assets/reference-configs`.
- Generated/migrated repos receive pointer stubs under `docs/reference-configs`.
- Retires non-runtime `AGENTS.md`/`CLAUDE.md` entries from reference docs and
  removes duplicate `docs/reference-configs/` from npm package files.

## Residual Risks / Follow-ups

- Package consumers now use the CLI resolver for runtime docs; callers expecting
  packaged `docs/reference-configs/` must switch to `repo-harness docs`.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Acceptance paths covered and full suite passed. |
| Product depth | 8/10 | Boundary is explicit; source repo docs remain available for maintainers. |
| Design quality | 9/10 | Minimal CLI resolver, deterministic stubs, no `.ai` runtime relocation. |
| Code quality | 9/10 | Tests cover CLI, scaffold, migration, policy, contract, and retirement. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test`
- Re-check: `bash scripts/check-task-workflow.sh --strict`

## Summary

- Pass. The implementation satisfies the approved plan and keeps repo-local
  runtime artifacts under `.ai/`.
