# Sprint: PRD/Sprint hierarchy and helper runtime isolation

> **Status**: Done
> **Slug**: prd-sprint-runtime-isolation
> **Created**: 2026-06-12 23:46
> **Updated**: 2026-06-13 00:04
> **Source PRD**: (none yet)
> **Source Spec**: `docs/spec.md`
> **Goal Mode**: incremental

Program-level sprint container. The Source PRD summary and ordered backlog
decompose product intent into task-contract slices; each backlog row is a
long-task waypoint that must be expanded with `$think` before code edits.
`tasks/todos.md` stays the deferred-goal ledger and never carries this backlog.

## PRD

### Problem

- Generated repos currently risk colliding with their own application-level
  `scripts/` directory when repo-harness installs runtime helpers there.
- Sprint artifacts need a clear layer split: PRDs are upper-layer program
  intent, Sprints are long-task backlogs, and task contracts remain execution
  slices.
- Coding agents need a consistent hook-level reminder to expand Sprint backlog
  rows with `$think` before producing detailed implementation plans.

### Users

- Maintainers using repo-harness from Codex or Claude goal workflows.
- Downstream repos that already own `scripts/` for product code or operations.
- Coding agents that pick up long Sprint rows and need to turn them into
  decision-complete `plans/plan-*.md` artifacts.

### Success Criteria

- Fresh initialization creates `plans/prds/` and `plans/sprints/`.
- PRDs remain the upper planning layer; Sprints live only under
  `plans/sprints/*.sprint.md`.
- Generated/downstream helper runtime installs under `.ai/harness/scripts/`
  and no longer creates root `scripts/`.
- Sprint hooks and templates instruct coding agents to expand each backlog row
  with `$think` before code edits.
- Self-host source scripts keep working from root `scripts/`, while generated
  repos run the installed `.ai/harness/scripts/` copies.

### Acceptance Scenarios

- A new generated repo has no root `scripts/` directory after
  `create-project-dirs.sh`, but `.ai/harness/scripts/check-task-workflow.sh`
  passes strict mode.
- A repo maintainer can put product-owned scripts in root `scripts/` without
  repo-harness overwriting or competing with them.
- A Sprint row can be selected as a long-task waypoint and expanded through
  `$think` into a concrete `plans/plan-*.md` before the plan-to-contract flow.
- A legacy repo with sprint-shaped files in `plans/prds/` migrates those files
  into `plans/sprints/`.

### Non-goals

- Do not delete arbitrary existing root `scripts/*` in downstream repos.
- Do not make Sprint rows detailed implementation plans.
- Do not move this self-host repo's source helper implementation out of root
  `scripts/`.

## Architecture Notes

### Capabilities Touched

- `workflow-engine/contract-assets`
- `runtime-harness/hook-adapters`
- `public-surface/root-router`
- `verification/evals-checks`
- `workflow-engine/inspection-migration`

### Dependency Order

- Runtime-path isolation must land before generated repo smoke tests can
  become authoritative.
- PRD/Sprint catalog creation must land before hooks or helpers can rely on
  `plans/sprints/` as the Sprint source.
- Hook guidance for `$think` should stay advisory: it guides expansion, while
  plan approval remains the execution gate.

### Risks

- Existing generated repos may still have old repo-harness helper files under
  root `scripts/`; cleanup must be explicit and conservative.
- Installed helper normalization can break scripts that infer repo root from
  their own path; generated-repo smoke tests need to cover shell and TS helpers.
- Over-specific Sprint rows would recreate plan-level detail in the wrong
  layer; keep backlog rows coarse and acceptance-oriented.

## Backlog

Ordered execution queue; keep rows in dependency order. Mode `contract` runs
the full plan -> contract -> worktree flow; `inline` allows primary-tree
execution for small tasks. Every row needs a concrete acceptance line.

| # | Status | Task | Mode | Acceptance | Plan |
|---|--------|------|------|------------|------|
| 1 | [x] | prd-sprint-catalog-contract | contract | Init and migration create `plans/prds/` and `plans/sprints/`; sprint-shaped PRDs migrate to `plans/sprints/*.sprint.md`; task workflow strict check passes | current change set |
| 2 | [x] | sprint-agent-think-expansion | contract | Sprint templates, command docs, and hook/session context state that each backlog row must be expanded with `$think` before code edits; tests cover the rendered guidance | current change set |
| 3 | [x] | helper-runtime-under-ai | contract | Generated repos install repo-harness helpers under `.ai/harness/scripts/`, do not create root `scripts/`, and pass strict workflow checks from the installed helper path | current change set |
| 4 | [x] | self-host-source-fallback | contract | This self-host repo can keep source helpers under root `scripts/` while policy/contract paths point to `.ai/harness/scripts/`; strict checks accept the source+asset fallback | current change set |
| 5 | [x] | downstream-legacy-cleanup-policy | contract | Migration documents and tests conservative handling for old generated helper files under root `scripts/` without deleting app-owned scripts | `plans/plan-20260612-2351-downstream-legacy-cleanup-policy.md` |
| 6 | [x] | validation-and-release-surface | contract | `bun test`, required repo gates, generated-repo smoke, docs, changelog, and brain sync all pass with the new PRD/Sprint/helper-runtime contract | `plans/plan-20260612-2351-downstream-legacy-cleanup-policy.md` |

## Execution Log

Keep this section last; `.ai/harness/scripts/sprint-backlog.sh complete-task` appends rows here.

| When | Task | Plan | Result |
|------|------|------|--------|
| 2026-06-13 00:04 | prd-sprint-catalog-contract / sprint-agent-think-expansion / helper-runtime-under-ai / self-host-source-fallback | current change set | done: preceding helper-runtime implementation split PRDs and sprints, moved generated helpers to `.ai/harness/scripts/`, added `$think` expansion guidance, and added self-host source fallback checks |
| 2026-06-13 00:04 | downstream-legacy-cleanup-policy | `plans/plan-20260612-2351-downstream-legacy-cleanup-policy.md` | done: migration now removes legacy root repo-harness helpers only when generated ownership is identifiable, and preserves ambiguous app-owned `scripts/*` |
| 2026-06-13 00:04 | validation-and-release-surface | `plans/plan-20260612-2351-downstream-legacy-cleanup-policy.md` | done: full `bun test` passed; required gates and generated-repo smoke run after sprint closeout |
