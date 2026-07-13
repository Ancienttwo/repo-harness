# Task Contract: remove-gstack-core

> **Status**: Fulfilled
> **Plan**: plans/plan-20260713-1305-remove-gstack-core.md
> **Task Profile**: migration
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: parent-agent
> **Capability ID**: root
> **Last Updated**: 2026-07-13 13:05
> **Review File**: `tasks/reviews/20260713-1305-remove-gstack-core.review.md`
> **Notes File**: `tasks/notes/20260713-1305-remove-gstack-core.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

gstack is embedded in canonical workflow semantics even though repo-harness does not own its lifecycle or interaction contract. That makes an advisory external tool a hidden planning authority: a host capability mismatch can block architecture work that the parent agent can complete. The clean target is one lifecycle owner: the parent agent uses `geju` to open the frame, completes P1/P2/P3 itself, and freezes the accepted direction into the plan and contract.

## Goal

Remove gstack completely from repo-harness active product, runtime, generated-policy, tooling-readiness, and current documentation surfaces. Product discovery and complex/design planning must route to the parent-agent path with `geju` pre-contract framing. Fresh init and canonical stale-policy adoption carrying the removed external complex-route declaration must produce the new route directly, with no aliases, fallback provider, deprecation branch, dual authority, or preserved gstack compatibility value.

## Scope

- In scope:
  - Replace canonical workflow-contract and policy planning routes with parent-agent ownership plus `geju` pre-contract framing.
  - Update managed adoption behavior so retired canonical planning-provider values do not survive a stale-policy adoption.
  - Update `repo-harness-plan`, generated root instructions, active architecture/reference docs, migration guidance, README translations, initializer copy, and exact parity tests.
  - Delete gstack detection, report output, host metadata, install/update probes, and commands from source and packaged tooling helpers.
  - Add focused regression coverage for fresh generation, stale adoption, tooling JSON/text output, and active-surface removal.
  - Preserve source/mirror equality for workflow contract, ensure-task-workflow, check-agent-tooling, and reference-config assets.
- Out of scope:
  - User-local installations under `~/.claude/skills/` or `~/.codex/skills/`; repository authority does not uninstall them.
  - Waza, gbrain, CodeGraph, hai-stack, `geju`, agent-fleet identity telemetry, or model/profile routing.
  - The independent `harness-kernel-optimization-phase2` worktree and its files.
  - Rewriting archived plans/tasks or dated research evidence that records historical decisions.
- Taste constraints: delete the provider concept instead of renaming it; keep parent-agent lifecycle ownership explicit; do not introduce compatibility code or a new provider abstraction.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if a current executable/public contract is discovered that can only satisfy acceptance through gstack; record the exact path and behavior before widening scope.

## Falsifier

A current executable repo-harness feature or public contract that can only satisfy its acceptance criteria through gstack, and cannot be expressed through parent-agent + `geju` + P1/P2/P3, would falsify the direction. The cheapest proof is the end-to-end generation/adoption/tooling trace: fresh init, a stale-policy adoption fixture, generated root instructions, and `check-agent-tooling --json` must all work without a gstack route or runtime probe.

## Root Cause Evidence

Not applicable: this is an approved breaking migration, not a bugfix profile.

## Workflow Inventory

- Source plan: `plans/plan-20260713-1305-remove-gstack-core.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260713-1305-remove-gstack-core.review.md`
- Notes file: `tasks/notes/20260713-1305-remove-gstack-core.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260713-1305-remove-gstack-core.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260713-1305-remove-gstack-core.contract.md
  - tasks/reviews/20260713-1305-remove-gstack-core.review.md
  - tasks/notes/20260713-1305-remove-gstack-core.notes.md
  - .ai/harness/policy.json
  - .ai/harness/workflow-contract.json
  - AGENTS.md
  - CLAUDE.md
  - SKILL.md
  - README.md
  - README.zh-CN.md
  - README.fr.md
  - README.es.md
  - README.ja.md
  - assets/workflow-contract.v1.json
  - assets/initializer-question-pack.v4.json
  - assets/partials/04-project-structure.partial.md
  - assets/partials/05-workflow.partial.md
  - assets/partials-agents/02-operating-mode.partial.md
  - assets/partials-agents/08-deep-docs.partial.md
  - assets/reference-configs/agentic-development-flow.md
  - assets/reference-configs/external-tooling.md
  - assets/reference-configs/harness-overview.md
  - assets/skill-commands/repo-harness-plan/SKILL.md
  - assets/templates/helpers/check-agent-tooling.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - assets/templates/helpers/workflow-contract.ts
  - scripts/check-agent-tooling.sh
  - scripts/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - scripts/workflow-contract.ts
  - src/cli/commands/init.ts
  - src/core/adoption/standard-plan.ts
  - docs/CHANGELOG.md
  - docs/architecture/index.md
  - docs/architecture/modules/public-surface/root-router.md
  - docs/architecture/requests/
  - docs/reference-configs/agentic-development-flow.md
  - docs/reference-configs/external-tooling.md
  - docs/reference-configs/harness-overview.md
  - references/migration-guide.md
  - tests/action-command-skills.test.ts
  - tests/agents-assembly.test.ts
  - tests/bootstrap-files.test.ts
  - tests/check-agent-tooling.test.ts
  - tests/cli/adoption-plan.test.ts
  - tests/cli/init-hook.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - tests/output-parity.test.ts
  - tests/readme-dx.test.ts
  - tests/retired-planning-provider.test.ts
  - tests/workflow-contract.test.ts
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260713-1305-remove-gstack-core.notes.md
  tests_pass:
    - path: tests/retired-planning-provider.test.ts
    - path: tests/check-agent-tooling.test.ts
    - path: tests/create-project-dirs.runtime.test.ts
    - path: tests/cli/adoption-plan.test.ts
    - path: tests/workflow-contract.test.ts
    - path: tests/agents-assembly.test.ts
    - path: tests/bootstrap-files.test.ts
    - path: tests/output-parity.test.ts
    - path: tests/readme-dx.test.ts
    - path: tests/action-command-skills.test.ts
  commands_succeed:
    - cmp assets/workflow-contract.v1.json .ai/harness/workflow-contract.json
    - cmp scripts/check-agent-tooling.sh assets/templates/helpers/check-agent-tooling.sh
    - cmp scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh
    - cmp scripts/workflow-contract.ts assets/templates/helpers/workflow-contract.ts
    - git diff --check
    - bun test --max-concurrency 4
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts adopt --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: parent agent owns product and complex/design planning; `geju` is used before capture; Waza/gbrain/CodeGraph lanes remain unchanged.
- Edge cases: a stale generated policy is cut over directly; user-local skill directories are untouched; historical evidence remains provenance only.
- Regression risks: source/mirror drift, adoption preserving retired managed values, translated README drift, or tooling JSON consumers expecting the deleted `tools.gstack` field.

## Rollback Point

- Commit / checkpoint: final work-package commit on `codex/remove-gstack-core`.
- Revert strategy: revert the single migration commit; no compatibility path is retained.
