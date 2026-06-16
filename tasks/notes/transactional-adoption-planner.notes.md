# Transactional Adoption Planner Notes

> **Status**: Done
> **Sprint**: `plans/sprints/20260616-architecture-upgrade-sprint.md`

## Phase 1 Evidence

- Added the adoption operation model under `src/core/adoption/` with stable operation IDs, mode typing, plan summaries, `.gitignore` managed block planning, and JSON/text renderers.
- Added the safe operation applicator subset under `src/effects/` for `mkdir`, `writeFile ifMissing`, and `appendManagedBlock`.
- Wired only `repo-harness adopt --dry-run --json` to the TypeScript planner. Default apply and human-readable dry-run still go through the existing `runInit()` / `scripts/migrate-project-template.sh` compatibility path.
- Added fixture-backed tests and a CLI smoke test in `tests/cli/adoption-plan.test.ts`.

## Verification

```bash
bun test tests/cli/adoption-plan.test.ts
```

Result: pass, 9 tests.

```bash
bun test
```

Result: pass, 763 tests.

```bash
bash scripts/check-ci.sh
```

Result: pass; CI ran install, `bun test --timeout 60000 --max-concurrency 4`,
workflow checks, repository inspection, migration dry-run, and package dry-run.

```bash
bun src/cli/index.ts adopt --repo . --dry-run --json
```

Result: pass; source entrypoint emitted `protocol: 1`, `command: "adopt"`, and
`apply: false` without writing repo files.

## Documentation

- Added `docs/architecture/transactional-adoption-planner.md` covering protocol
  v1, safe operation support, `.gitignore` block handling, compatibility
  invariants, and the next migration path.
- Updated `docs/CHANGELOG.md` under Unreleased.

## Decisions

- The JSON dry-run output redacts operation content and exposes `contentHash` plus a short preview so stdout stays reviewable and does not dump large generated templates.
- Self-host mode records a skipped `runCheck` operation plus warning instead of migrating hooks/helpers in this sprint, preserving the self-host source repo boundary.
- The first `.gitignore` planner step uses a single `repo-harness generated-runtime` managed block and supports replacing the legacy `claude-runtime-temp` block.
- Existing HOME target validation is reused before the new planner path, so
  `adopt --dry-run --json` does not bypass the previous safety guard.

## Environment Caveat

- `which repo-harness` currently resolves to `/Users/kito/.bun/bin/repo-harness`
  at version `0.5.3`, and that global package still emits the previous
  `runInit()` JSON shape. The sprint code is verified through the source
  entrypoint and will become the plain `repo-harness` behavior after the local
  CLI is refreshed from this branch or the package is published.

## Checklist Closeout

- Updated `plans/sprints/20260616-architecture-upgrade-sprint.md` checkboxes to
  reflect the verified sprint implementation, DoD, review checklist, PR test
  checklist, and minimal executable checklist.
- Left section 12, "下一 sprint 预留 backlog", unchecked because those items are
  intentionally deferred migration candidates rather than completed work in
  this sprint.

## Follow-up Slice: Workflow Contract Planning

- Added a TypeScript adoption operation for `.ai/harness/workflow-contract.json`
  in `standard` and `self-host` modes. The operation reads the canonical
  `assets/workflow-contract.v1.json` asset and marks the runtime copy as
  `skipped` when it already matches.
- Kept `minimal` mode unchanged and did not change default `adopt` apply
  behavior; shell migration remains the compatibility apply engine.
- Ran the requested tooling update commands. CodeGraph updated to `1.0.1` and
  verified as up to date. Waza's `skills update` command reported "All global
  skills are up to date", but `repo-harness setup check --target codex
  --check-updates --json` still reports `tooling.waza.update` as
  `needs_agent`.

## Follow-up Slice: Manifest-Driven Bootstrap Templates

- Added `adoptionTemplates.files` to the workflow contract manifest and synced
  the self-host runtime copy. The entries now own the `docs/spec.md` and
  `tasks/current.md` bootstrap template bodies plus their planner reasons.
- Moved the spec/current template rendering out of `plan.ts` into
  `src/core/adoption/manifest-templates.ts`. The planner still emits
  `writeFile ifMissing` operations and still leaves `tasks/todos.md` plus
  `tasks/lessons.md` on the existing local templates.
- Added tests for manifest field coverage and template rendering from the
  workflow contract.

## Follow-up Slice: Helper Wrapper Planning

- Added standard-mode helper wrapper planning from `helpers.scripts`; an empty
  downstream dry-run now emits 42 `writeFile ifMissing` helper wrapper
  operations.
- Added generated helper wrapper entries to the `.gitignore` managed block for
  ordinary downstream targets.
- Preserved self-host source repos and `harness.helper_source = "repo"` as
  shell-only in this slice; current source repo dry-run still emits 0 helper
  wrapper operations.
- Verification: `bun test tests/cli/adoption-plan.test.ts`; empty downstream
  CLI smoke reported 42 helper wrappers; current source repo CLI smoke reported
  0 helper wrappers; full `bash scripts/check-ci.sh` passed.
- Follow-up gates: `git diff --check`, `bash scripts/check-task-sync.sh`,
  `bash scripts/check-task-workflow.sh --strict`, and
  `bash scripts/ensure-codegraph.sh --sync` passed. `repo-harness setup check
  --target codex --check-updates --json` reported no warn/fail and one existing
  Waza update `needs_agent` action.

## Follow-up Slice: Atomic Applicator Writes

- Added `atomicWriteFile` under `src/effects/fs-transaction.ts` and routed
  `writeFile ifMissing` plus `appendManagedBlock` safe-applicator writes through
  it.
- The writer acquires a target-local `.repo-harness.lock`, writes through a temp
  file, fsyncs the file, renames over the target, fsyncs the parent directory,
  and stores existing target content under
  `.ai/harness/backups/fs-transaction/`.
- Added `.ai/harness/backups/` to the managed `.gitignore` block because these
  backups are runtime evidence, not tracked deliverables.
- Added tests for backup creation, lock cleanup, existing lock failure, and
  preserving user content on lock failure.
- Verification: targeted adoption/workflow/bootstrap/scaffold tests passed, and
  full `bash scripts/check-ci.sh` passed with 767 tests.
- Follow-up gates passed: `git diff --check`,
  `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`,
  and `bash scripts/ensure-codegraph.sh --sync`.
- Tooling residual: the bounded Waza update command completed with "All global
  skills are up to date", but setup check still reports one Waza
  `needs_agent` action and no warn/fail.

## Follow-up Slice: Text Dry-Run Renderer

- Routed ordinary `repo-harness adopt --dry-run` text output through
  `runAdoptionPlan()` and `renderAdoptionPlanText()` so text and JSON dry-runs
  share the same TypeScript planner source of truth.
- Preserved default `repo-harness adopt` apply behavior on the shell migrator.
- Left `--reclaim-runtime` / `--compact` dry-runs on their existing runtime
  reclaim path because they report a different operation surface.
- Verification: `bun test tests/cli/adoption-plan.test.ts`; text and JSON CLI
  smoke runs both reported planner output and did not create repo files.
- Full verification: targeted adoption/init/workflow/bootstrap/scaffold tests
  passed, and `bash scripts/check-ci.sh` passed with 768 tests.
- Follow-up gates passed: `git diff --check`,
  `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`,
  and `bash scripts/ensure-codegraph.sh --sync`.
- Setup residual: `repo-harness setup check --target codex --check-updates --json`
  reports no warn/fail and one Waza update `needs_agent` action. A transient
  CodeGraph attention result cleared after the index sync settled.
