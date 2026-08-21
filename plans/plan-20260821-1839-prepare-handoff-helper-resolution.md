# Prepare Handoff Helper Resolution

> **Status**: Review
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Packaged-helper external-target regression, hook projection parity, strict workflow gate, and the original Salesko reproduction.
> **Rollback Surface**: Revert the workflow-state helper resolution and its regression test on `codex/fix-prepare-handoff-helper-resolution`.
> **Task Contract**: tasks/contracts/20260821-1839-prepare-handoff-helper-resolution.contract.md

## Goal

Make `repo-harness run prepare-handoff` use the recovery materializer from the same selected helper runtime when the target repository does not vendor `scripts/recovery-view-cli.ts`.

## P1: Architecture Map

- `src/cli/runtime/helper-runner.ts` selects the package or source helper runtime and exports the selected helper and workflow-library paths.
- `assets/templates/helpers/prepare-handoff.sh` runs in the target repository and sources the target's `.ai/hooks/lib/workflow-state.sh`.
- `assets/hooks/lib/workflow-state.sh#workflow_write_handoff` owns the operator handoff write and delegates recovery-view rendering to `recovery-view-cli.ts`.
- The target repository is state/output authority; the selected helper runtime is executable authority.

## P2: Concrete Trace

`repo-harness run prepare-handoff` selects packaged `prepare-handoff.sh`, changes cwd to the target repository, and sets `REPO_HARNESS_HELPER_SOURCE_PATH`. The sourced workflow library currently ignores that selected-runtime path and invokes target-relative `scripts/recovery-view-cli.ts`; an adopted repository without that newly introduced local helper fails before handoff materialization.

## P3: Design Decision

Bind `prepare-handoff.sh` to the workflow library from the same selected runtime, then resolve `recovery-view-cli.ts` beside the validated selected helper. Preserve target-local workflow state and `scripts/recovery-view-cli.ts` only for direct repo-local invocation. Fail closed if a selected executable is missing. This keeps one executable authority per invocation and avoids requiring an adoption refresh merely to run handoff recovery.

At 10x adoption scale, package/target version skew is the first pressure point. Binding dependent helpers to the already selected runtime prevents that skew from mixing executable generations.

## Task Breakdown

- [x] Add a regression fixture for an external target without local `recovery-view-cli.ts`.
- [x] Resolve the recovery materializer from the selected helper runtime.
- [x] Run focused tests, hook projection drift check, and repository workflow checks.
- [x] Re-run the failing Salesko handoff command against the fixed source runtime.

## Evidence Contract

- **State/progress path**: this plan and its task notes
- **Verification evidence**: focused Bun test, helper projection check, strict workflow check, external Salesko reproduction
- **Evaluator rubric**: external target succeeds without target-local recovery helper; direct repo-local path remains supported; missing selected helper fails closed
- **Stop condition**: regression test and Salesko command both succeed
- **Rollback surface**: one shell helper-library function plus its regression test

## Promotion Gate

- **Merge/PR unit**: helper-runtime resolution, deterministic hook projection, regression test, and workflow artifacts form one patch.
- **Rollback surface**: revert this branch's patch; no downstream state migration is required.
- **Verification boundary**: full helper-script test file, hook projection drift check, strict workflow check, and original downstream reproduction.
- **Review/acceptance boundary**: repository checks must pass on the exact branch diff before opening a draft PR.
- **High-risk surface**: helper source-path trust and mixed package/target executable generations.
- **Why not checklist row**: verification_boundary
