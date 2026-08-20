> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# PRD and Sprint Skill Split Notes

> **Updated**: 2026-06-13
> **Branch**: codex/prd-sprint-skills

## Decision

- Add `repo-harness-prd` as the upper-layer product planning command that writes bounded PRDs under `plans/prds/`.
- Move sprint backlog artifacts to `plans/sprints/` and keep `repo-harness-sprint` focused on deriving ordered execution backlogs from PRDs or user-provided slices.
- Keep public helper commands at `scripts/*` while generated/installed projects place the real helper runtime under `.ai/harness/scripts/*`. The self-host repo keeps root `scripts/` as the source runtime (`helper_source=source-repo`); downstream installs use `helper_source=isolated-installed-copy`.

## Verification Surface

- PRD template parity is covered by `tests/sprint-backlog.test.ts`.
- PRD/sprint command routing is covered by `tests/action-command-skills.test.ts`.
- Eval coverage adds separate PRD generation and PRD-to-sprint fixtures in `evals/evals.json`.
- `scripts/check-task-workflow.sh --strict` rejects sprint-shaped files under `plans/prds/` and validates approved PRDs for quick-read, problem, and acceptance sections.
- `scripts/create-project-dirs.sh` and `scripts/migrate-project-template.sh --apply` install `.ai/harness/scripts/*` plus `scripts/*` wrappers; strict workflow checks validate both surfaces when policy declares an isolated helper runtime.
