> **Archived**: 2026-08-20 16:17
> **Related Plan**: plans/archive/plan-20260528-1652-codegraph-readiness.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1617

# Sprint Contract: codegraph-readiness

> **Status**: Fulfilled
> **Plan**: plans/plan-20260528-1652-codegraph-readiness.md
> **Owner**: ancienttwo
> **Capability ID**: verification-codegraph-readiness
> **Architecture Domain**: verification
> **Architecture Module**: docs/architecture/modules/verification/codegraph-readiness.md
> **Last Updated**: 2026-05-28 18:57 +0800
> **Review File**: `tasks/reviews/codegraph-readiness.review.md`
> **Notes File**: `tasks/notes/codegraph-readiness.notes.md`

## Goal

Make CodeGraph readiness part of the `agentic-dev` CLI and doctor surface without overloading the host-hook installer target model.

The planned product boundary is:

- `agentic-dev install --target codex|claude|both` remains host-adapter installation only.
- `agentic-dev tools ensure codegraph` owns CodeGraph dependency, index, and local readiness mutation.
- `agentic-dev doctor` reports CodeGraph readiness read-only and prints remediation commands.
- The existing `scripts/check-agent-tooling.sh` CodeGraph detector is migrated or wrapped so there is one authoritative readiness implementation.

## Scope

- In scope:
  - Vendor `@colbymchenry/codegraph` for this repo as a dev dependency.
  - Add a `tools ensure codegraph` CLI path and thin `scripts/ensure-codegraph.sh` adapter.
  - Preserve local-first resolution: `node_modules/.bin/codegraph` before global fallback.
  - Keep MCP config mutation out of default `ensure` and all `doctor` flows.
  - Update generated policy/template/test surfaces so they either reflect vendored CodeGraph for this repo or explicitly preserve non-vendored downstream defaults.
  - Add tests for local/global/missing/drift/offline/index/MCP non-mutation paths.
- Out of scope:
  - Auto-writing Codex or Claude MCP config to a repo-local CodeGraph binary.
  - Vendoring gbrain, sentrux, Waza, gstack, or other tools.
  - Removing or killing global CodeGraph installs or daemons.
  - Changing `agentic-dev install --target` semantics.
  - Starting hook-global-runtime Phase 1 CLI implementation from this contract.

## Workflow Inventory

- Source plan: `plans/plan-20260528-1652-codegraph-readiness.md`
- Todo projection: `tasks/todo.md`
- Review file: `tasks/reviews/codegraph-readiness.review.md`
- Notes file: `tasks/notes/codegraph-readiness.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass and the review recommend pass.

## Allowed Paths

```yaml
allowed_paths:
  # Plan / task artifacts
  - plans/plan-20260528-1652-codegraph-readiness.md
  - tasks/todo.md
  - tasks/research.md
  - tasks/contracts/codegraph-readiness.contract.md
  - tasks/notes/codegraph-readiness.notes.md
  - tasks/reviews/codegraph-readiness.review.md

  # Package and CLI surface
  - package.json
  - bun.lock
  - bunfig.toml
  - tsconfig.json
  - scripts/ensure-codegraph.sh
  - scripts/check-agent-tooling.sh
  - src/cli/

  # Hook/helper reuse
  - .ai/hooks/lib/codegraph-bin.sh
  - assets/hooks/lib/codegraph-bin.sh

  # Generated policy/template surfaces that currently encode CodeGraph readiness
  - .ai/harness/policy.json
  - assets/workflow-contract.v1.json
  - assets/templates/helpers/check-agent-tooling.sh
  - scripts/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - scripts/create-project-dirs.sh

  # Tests
  - tests/cli/
  - tests/tooling/
  - tests/check-agent-tooling.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - tests/migration-script.test.ts

  # Docs / architecture / root agent guidance
  - docs/architecture/index.md
  - docs/architecture/domains/verification.md
  - docs/architecture/modules/public-surface/root-router.md
  - docs/architecture/modules/verification/codegraph-readiness.md
  - docs/reference-configs/external-tooling.md
  - assets/reference-configs/external-tooling.md
  - .ai/context/capabilities.json
  - CLAUDE.md
  - AGENTS.md
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - tasks/contracts/codegraph-readiness.contract.md
    - tasks/notes/codegraph-readiness.notes.md
    - tasks/reviews/codegraph-readiness.review.md
    - scripts/ensure-codegraph.sh
    - src/cli/tools/codegraph.ts
    - src/cli/commands/tools.ts
    - docs/architecture/modules/verification/codegraph-readiness.md
  files_contain:
    - path: package.json
      contains: "@colbymchenry/codegraph"
    - path: src/cli/tools/codegraph.ts
      contains: "resolveCodegraph"
    - path: src/cli/tools/codegraph.ts
      contains: "ensureCodegraph"
    - path: src/cli/commands/doctor.ts
      contains: "checkCodegraph"
  tests_pass:
    - path: tests/cli/codegraph.test.ts
    - path: tests/cli/codegraph-resolver.test.ts
    - path: tests/tooling/codegraph-integration.test.ts
    - path: tests/check-agent-tooling.test.ts
    - path: tests/create-project-dirs.runtime.test.ts
    - path: tests/migration-script.test.ts
  commands_succeed:
    - bun install --frozen-lockfile
    - bash scripts/ensure-codegraph.sh --check --json
    - bun test tests/cli/codegraph.test.ts tests/cli/codegraph-resolver.test.ts tests/tooling/codegraph-integration.test.ts tests/check-agent-tooling.test.ts
    - bash scripts/check-agent-tooling.sh --host both --strict-readiness --json
    - bun test tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
```

## Acceptance Notes (Human Review)

- Functional behavior: `agentic-dev tools ensure codegraph` owns CodeGraph lifecycle mutation; `agentic-dev doctor` reports CodeGraph readiness through `checkCodegraph()` without mutating dependencies, index state, daemon state, or MCP config.
- Edge cases: local binary wins over global fallback; global fallback is reported with remediation; stale/missing index and MCP gaps remain explicit remediation states.
- Regression risks: any future tool readiness command must keep `agentic-dev install --target` host-only and reuse the shared tooling detector rather than introducing a second CodeGraph readiness model.
- Manual acceptance covered by tests/review: doctor read-only behavior, default ensure MCP non-mutation, local-first binary resolution, and downstream global-CodeGraph compatibility.

## Rollback Point

- Commit / checkpoint: current working tree before the CodeGraph readiness closeout commit.
- Revert strategy: revert the closeout commit; dependency + detector slice from `ff139b2` can remain independently valid if CLI registration must be backed out.
