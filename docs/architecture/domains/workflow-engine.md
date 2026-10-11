# Architecture Domain: Workflow Engine

> **Source**: `repo-harness run capability-resolver`
> **Owner**: Inspection, migration, contract, template, policy generation, workflow state, and execution primitives.

## Purpose

The workflow engine is the repo mutation layer. It classifies the target repo,
archives or preserves legacy workflow surfaces, installs the tasks-first
contract, and writes the minimal file-backed harness that downstream repos can
verify without a live service. It also resolves the one Effective State
projection, owns the shared coordination plane, and provides the process, lock
and Git primitives that other capabilities share.

## Capabilities

- `workflow-engine-inspection-migration` -> `docs/architecture/modules/workflow-engine/inspection-migration.md`: inspects repository state and executes explicit initialization or migration plans.
- `workflow-engine-contract-assets` -> `docs/architecture/modules/workflow-engine/contract-assets.md`: owns the package workflow contract, the opt-in marker, templates, capability nodes and helper projections.
- `workflow-engine-workflow-state` -> `docs/architecture/modules/workflow-engine/workflow-state.md`: resolves the one Effective State projection and owns the shared coordination plane and the continuation ledger.
- `workflow-engine-execution-primitives` -> `docs/architecture/modules/workflow-engine/execution-primitives.md`: runs bounded child processes and provides the directory lock and Git common-dir and worktree topology reads. It holds no workflow policy.

## Stable Rules

- `assets/workflow-contract.v1.json` is the canonical contract asset.
- `.ai/harness/workflow-contract.json` is the opt-in marker. Its content does not select a contract version.
- Inspect reads the package contract. Adoption writes the marker and backs up replaced content.
- Shell scaffold scripts leave workflow attachment to `repo-harness init`.
- Migration deletes only manifest-owned `known_generated` surfaces.
- User-authored legacy docs are preserved or archived before template refresh.
- `_ref/`, `_ops/`, secrets, local env, and custom hooks are not product migration surfaces.

## Verification Surface

- `bun test tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts tests/workflow-contract.test.ts`
- `repo-harness init --repo . --dry-run`
- `bash scripts/check-task-workflow.sh`
