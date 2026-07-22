# Plan: Init CLI External Skills

> **Status**: Archived
> **Created**: 2026-05-28 19:06
> **Slug**: init-cli-external-skills
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/init-cli-external-skills.contract.md`
> **Sprint Review**: `tasks/reviews/init-cli-external-skills.review.md`
> **Implementation Notes**: `tasks/notes/init-cli-external-skills.notes.md`

## Agentic Routing
- Selected route: direct implementation with local verification.
- Routing reason: user requested a concrete CLI/runtime workflow update, and the repo already has established init, migration, hook, and installed-copy surfaces.
- Due diligence:
  - P1 map: public CLI entrypoints, installed skill copies, hook adapters, migration helpers, docs, architecture notes, and tests.
  - P2 trace: `agentic-dev init` resolves a target repo, refreshes installed aliases, installs host adapters, applies the harness, bootstraps external skills, and runs verification.
  - P3 decision rationale: keep the new init path as an orchestrator over existing primitives instead of adding a parallel setup model.

## Workflow Inventory
- Active plan: `plans/plan-20260528-1906-init-cli-external-skills.md`
- Sprint contract: `tasks/contracts/init-cli-external-skills.contract.md`
- Sprint review: `tasks/reviews/init-cli-external-skills.review.md`
- Implementation notes: `tasks/notes/init-cli-external-skills.notes.md`
- Todo projection: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/init-cli-external-skills.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects this plan; `.claude/.active-plan` mirrors it for legacy callers.
- Execution isolation: this slice is already in the self-host working tree; unrelated dirty changes remain preserved.

## Approach
### Strategy
Add `agentic-dev init` as the operator-facing command for existing repo setup, retire `project-initializer` installed aliases, keep `agentic-dev-skill` as the compatibility alias, and align docs/tests with the new command.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Keep users composing helper scripts manually | Smallest code change | Keeps setup error-prone and hides external skill bootstrap | Rejected |
| Add `agentic-dev init` orchestration | One operator entrypoint, testable, aligns docs | Broader CLI surface and host-side side effects | Accepted |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `src/cli/commands/init.ts`, `src/cli/index.ts` | Add/modify | Register the init command and default repo target to cwd |
| `scripts/sync-codex-installed-copies.sh` | Modify | Refresh canonical installed aliases and remove retired `project-initializer` paths |
| `assets/templates/helpers/migrate-project-template.sh`, `scripts/lib/project-init-lib.sh` | Modify | Remove retired upstream fallback behavior |
| `README.md`, `SKILL.md`, `docs/spec.md`, architecture docs | Modify | Document `agentic-dev init` as the first-run path |
| `tests/**` | Modify/add | Cover init command, installed copy sync, migration, versions, evals, and workflow contract changes |

### Data Flow
`agentic-dev init` receives CLI options, resolves the repo root, optionally syncs installed skill copies, installs host adapters, invokes the existing migration/harness apply path, bootstraps Waza/diagram-design, then records verification results through the existing checks surface.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Init mutates host skill roots unexpectedly | Medium | Medium | Expose `--dry-run`, `--no-sync-skill`, `--no-host-adapters`, and `--no-external-skills` |
| Retired alias cleanup removes a still-needed path | Low | Medium | Keep `agentic-dev-skill` compatibility alias and cover cleanup in tests |
| Docs drift from test contract | Medium | Low | README DX test asserts the first-run path and hook trust signals |

## Task Contracts
- Contract file: `tasks/contracts/init-cli-external-skills.contract.md`
- Review file: `tasks/reviews/init-cli-external-skills.review.md`
- Implementation notes file: `tasks/notes/init-cli-external-skills.notes.md`
- Verification command: `bash scripts/check-task-workflow.sh --strict`

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `tasks/todo.md`, this plan, `tasks/contracts/init-cli-external-skills.contract.md`, `tasks/reviews/init-cli-external-skills.review.md`, and `tasks/notes/init-cli-external-skills.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json` plus the root required checks listed in `tasks/todo.md`
- **Evaluator rubric**: `tasks/reviews/init-cli-external-skills.review.md` must recommend pass after required checks complete
- **Stop condition**: required checks pass or a blocking host/runtime issue is recorded in the review
- **Rollback surface**: revert the CLI init command, installed-copy sync changes, docs/test updates, and this workflow artifact set

## Task Breakdown
- [x] Add `agentic-dev init` to the CLI and default the target repo to cwd when `--repo` is omitted.
- [x] Make init refresh installed aliases, install host adapters, apply the harness, bootstrap external skills, and verify the target repo.
- [x] Retire `project-initializer` installed aliases while preserving `agentic-dev-skill`.
- [x] Update docs, architecture notes, version wording, and tests.
- [x] Run targeted tests and full required checks.
- [x] Run installed-copy sync and local `agentic-dev init --target codex`.
- [ ] Commit the local update.
