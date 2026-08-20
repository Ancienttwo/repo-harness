> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

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

## Follow-up Slice: Experimental TS Apply

- Added `--experimental-ts-apply` for opt-in TypeScript safe-applicator
  execution.
- `--mode minimal` applies the supported safe subset and writes `docs/spec.md`
  plus the managed `.gitignore` block through the atomic writer.
- Standard mode preflights unsupported operations and fails before writes
  because workflow-contract install application is still outside this slice.
- Kept default `repo-harness adopt` on the existing shell migrator and rejected
  incompatible `--interactive`, `--reclaim-runtime`, and `--compact`
  combinations.
- Verification: focused adoption/init tests passed; CLI smoke confirmed minimal
  apply success and standard preflight failure without writes. Full
  `bash scripts/check-ci.sh` passed with 770 tests, and follow-up gates passed:
  `git diff --check`, `bash scripts/check-task-sync.sh`,
  `bash scripts/check-task-workflow.sh --strict`, and
  `bash scripts/ensure-codegraph.sh --sync`.
- Setup residual: `repo-harness setup check --target codex --check-updates --json`
  reports no warn/fail and one existing Waza update `needs_agent` action.

## Follow-up Slice: Rollback Metadata

- Added per-operation rollback metadata to the TypeScript adoption plan.
- Planned `mkdir` operations advertise `remove-empty-directory`, `writeFile
  ifMissing` advertises `delete-created-file`, and replacement/managed-block
  writes advertise `restore-or-delete-file` through runtime fs-transaction
  backups.
- Kept runtime backup paths in apply results because those paths are created
  only during mutation.
- Ran the bounded tooling update advisory commands. CodeGraph readiness cleared
  after sync; Waza still reports the existing `needs_agent` update action even
  though `npx -y skills update` reports all global skills are up to date.
- Verification: focused adoption/init/workflow tests passed, CLI dry-run JSON
  smoke confirmed every operation has rollback metadata, and full
  `bash scripts/check-ci.sh` passed with 771 tests.

## Follow-up Slice: Workflow Contract Apply

- Moved workflow-contract install/replacement into the experimental TypeScript
  safe applicator.
- `repo-harness adopt --experimental-ts-apply` can now apply the standard
  downstream plan, including `.ai/harness/workflow-contract.json`; default
  `repo-harness adopt` remains on the shell migrator.
- Kept unsupported preflight behavior by using self-host `runCheck` as the
  remaining unsupported operation boundary.
- Verification: focused adoption/init tests passed, standard CLI smoke applied
  workflow-contract through `--experimental-ts-apply`, self-host CLI smoke
  failed before writes on the unsupported manual review boundary, and targeted
  adoption/init/workflow/bootstrap/scaffold tests passed.
- Full verification: `bash scripts/check-ci.sh` passed with 773 tests. Follow-up
  gates passed: `git diff --check`, `bash scripts/check-task-sync.sh`,
  `bash scripts/check-task-workflow.sh --strict`, and
  `bash scripts/ensure-codegraph.sh --sync`.
- Setup residual: CodeGraph repair cleared after sync. Waza still reports one
  `needs_agent` action in setup check even though `npx -y skills update`
  reports all global skills are up to date.

## Follow-up Slice: Bootstrap Ledger Manifest Templates

- Moved the remaining initial bootstrap ledger templates,
  `tasks/todos.md` and `tasks/lessons.md`, into
  `assets/workflow-contract.v1.json#adoptionTemplates.files`.
- Kept planner behavior unchanged: both files still emit `writeFile ifMissing`
  operations with the same paths, reasons, and content; `plan.ts` now resolves
  them through `adoptionTemplateFile()` like `docs/spec.md` and
  `tasks/current.md`.
- Synced the runtime self-host manifest at `.ai/harness/workflow-contract.json`
  so self-host checks continue comparing the same canonical template body.
- Updated the sprint follow-up backlog checkbox so
  `plans/sprints/20260616-architecture-upgrade-sprint.md` records the ledger
  template migration as completed alongside the earlier manifest-template work.
- Verification: targeted adoption/workflow/bootstrap/scaffold tests passed, CLI
  dry-run JSON smoke preserved both ledger `writeFile ifMissing` operations, and
  full `bash scripts/check-ci.sh` passed with 773 tests.
- Follow-up gates passed: `git diff --check`, `bash scripts/check-task-sync.sh`,
  `bash scripts/check-task-workflow.sh --strict`, and
  `bash scripts/ensure-codegraph.sh --sync`.
- Setup residual: Waza still reports one `needs_agent` update action in
  `repo-harness setup check --target codex --check-updates --json` even after
  the recommended `npx -y skills update` command reports all global skills are up
  to date; there are no warn/fail setup findings.

## Follow-up Slice: Mode Parity Guard and Planner Protocol Polish

- Added a fail-closed CLI guard for non-standard default apply and non-TS
  dry-run combinations: `repo-harness adopt --mode minimal|self-host` now exits
  2 unless it routes to ordinary TypeScript `--dry-run` or
  `--experimental-ts-apply`. This preserves the invariant that users do not see
  a TypeScript minimal/self-host plan and then silently run the standard shell
  migrator path.
- Kept the legacy shell migrator unchanged in this slice because real mode
  parity belongs either in the shell migrator itself or in a promoted
  TypeScript apply path; the guard is the smallest coherent behavior change.
- Minimal TypeScript adoption now plans and applies
  `.ai/harness/workflow-contract.json`, so minimal adoption still creates the
  hook opt-in marker.
- Normalized adoption target validation failures in dry-run/apply JSON paths to
  protocol v1 error output with `ok: false`, `errors`, empty `operations`, and a
  zero summary.
- Moved unsupported-operation preflight into `applyAdoptionPlan()` so exported
  callers cannot partially write supported operations before hitting an
  unsupported `runCheck` or future operation kind.
- Managed `.gitignore` updates now normalize CRLF marker lines while preserving
  the file's newline style, preventing duplicate managed blocks in CRLF files.
- Adoption plan summaries now include `byStatus`, `plannedTotal`,
  `skippedTotal`, and `failedTotal`; text dry-run output reports total/planned/
  skipped counts for reviewability.

## Follow-up Slice: Bounded CLI Process Runner

- Added `src/effects/process-runner.ts` as the shared child-process runner for
  CLI setup/adoption paths. It defaults to a 120s timeout, caps captured output
  at 64 KiB, redacts common bearer/API key/token/secret/password patterns in
  output and command args, and returns structured status/error/timedOut fields
  without throwing.
- Migrated `src/cli/commands/init.ts`,
  `src/cli/commands/global-runtime.ts`, and `src/cli/tools/codegraph.ts` to the
  shared runner while preserving their existing `InitStep`,
  `GlobalRuntimeStep`, and `CodegraphAction` output shapes.
- Kept hook runtime dispatch and generated helper wrappers out of this slice.
  Those paths have different host stdio/foreground semantics and need their own
  review before applying the shared runner.
- Verification: process-runner unit tests cover redaction, output capping, and
  timeout handling. Focused CLI suites passed for init, global runtime, and
  CodeGraph paths.

## Follow-up Slice: Helper Runner Process Boundary

- Extended `src/effects/process-runner.ts` with optional `stdio` passthrough and
  a separate spawn buffer ceiling so captured output can be clipped without
  failing otherwise successful helpers.
- Migrated `src/cli/runtime/helper-runner.ts` to the shared runner for repo root
  discovery and helper execution. Default `repo-harness run` behavior still
  inherits foreground stdio, while pipe-mode callers now get timeout, output cap,
  and common secret redaction.
- Kept `src/cli/hook/runtime.ts` out of scope. It owns host hook foreground
  dispatch and must preserve Codex/Claude stdout, stderr, and exit-code protocol
  behavior separately from helper dispatch.
