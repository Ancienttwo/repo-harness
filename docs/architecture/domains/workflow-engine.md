# Architecture Domain: Workflow Engine

> **Source**: `.ai/context/capabilities.json`
> **Owner**: Inspection, migration, contract, template, and policy generation.

## Purpose

The workflow engine is the repo mutation layer. It classifies the target repo,
archives or preserves legacy workflow surfaces, installs the tasks-first
contract, and writes the minimal file-backed harness that downstream repos can
verify without a live service.

## Capabilities

- `workflow-engine-inspection-migration` -> `docs/architecture/modules/workflow-engine/inspection-migration.md`
- `workflow-engine-contract-assets` -> `docs/architecture/modules/workflow-engine/contract-assets.md`

## Stable Rules

- `assets/workflow-contract.v1.json` is the canonical contract asset.
- `.ai/harness/workflow-contract.json` is the installed runtime copy.
- Migration deletes only manifest-owned `known_generated` surfaces.
- User-authored legacy docs are preserved or archived before template refresh.
- `_ref/`, `_ops/`, secrets, local env, and custom hooks are not product migration surfaces.

## Verification Surface

- `bun test tests/migration-script.test.ts tests/create-project-dirs.runtime.test.ts tests/workflow-contract.test.ts`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
- `bash scripts/check-task-workflow.sh --strict`
