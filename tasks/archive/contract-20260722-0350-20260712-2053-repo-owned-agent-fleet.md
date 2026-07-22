# Task Contract: repo-owned-agent-fleet

> **Status**: Fulfilled
> **Plan**: plans/plan-20260712-2053-repo-owned-agent-fleet.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-12 20:54
> **Review File**: `tasks/reviews/20260712-2053-repo-owned-agent-fleet.review.md`
> **Notes File**: `tasks/notes/20260712-2053-repo-owned-agent-fleet.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The fleet installer currently claims a remote Fable source while the accepted local fleet already contains an explorer role and model labels that source does not publish. A real install fails even though local fixture tests pass. Shipping this state would leave global Claude/Codex fleet installation broken and would make repo policy describe an authority that cannot produce the committed projections.

## Goal

Remove the Fable-agents runtime and policy dependency, establish `agents/fleet/*.md` as the only authored and npm-packaged fleet source, deterministically project the four Claude/Codex roles from it, keep gatekeeper structurally read-only, and close the related workflow and architecture drift without absorbing unrelated primary-worktree changes.

## Scope

- In scope:
  - Add `agents/fleet/{explorer,deep-reasoner,fast-worker,gatekeeper}.md` as the single source authority.
  - Make source and packaged installer/check helpers resolve only that authority, with no curl, remote fallback, or source override.
  - Rename active policy and tooling ownership from `external_tooling.fable_agents` to `external_tooling.agent_fleet` and synchronize all deterministic seeds.
  - Keep `.claude/agents/*.md` and `.codex/agents/*.toml` as deterministic projections/goldens for the four managed roles.
  - Preserve Sol/Luna family mapping and exact effort pass-through; remove gatekeeper commit/push/PR/merge execution claims from its read-only role.
  - Update focused tests, package/tarball smoke, documentation mirrors, changelog, capability context, architecture requests, and workflow artifacts.
- Out of scope:
  - The unrelated `archctx-contracts` dependency bump currently present in the primary dirty worktree.
  - New root-cause-prover, harness-evaluator, migration-auditor, trust-boundary-auditor, or release-operator personas.
  - Native-agent routing/governance changes owned by the active `native-role-capability-gate` worktree.
  - Compatibility aliases for `fable_agents`, remote-source fallback, alternate source directories, network fetching, or dual authority.
  - Changes under `evals/bdd2/**`.
- Taste constraints: one authority, no compatibility reader, no network dependency, no new generator abstraction, and no edits outside this contract.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If `npm pack --dry-run --json` omits any `agents/fleet/*.md`, or a packaged helper cannot resolve that directory from `REPO_HARNESS_HELPER_SOURCE_PATH` while running from a downstream repo, `agents/fleet` is not a valid package authority and implementation must stop before removing the remote source.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260712-2053-repo-owned-agent-fleet.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260712-2053-repo-owned-agent-fleet.review.md`
- Notes file: `tasks/notes/20260712-2053-repo-owned-agent-fleet.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260712-2053-repo-owned-agent-fleet.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/workstreams/workflow-engine/contract-assets/
  - tasks/workstreams/workflow-engine/inspection-migration/
  - tasks/contracts/20260712-2053-repo-owned-agent-fleet.contract.md
  - tasks/reviews/20260712-2053-repo-owned-agent-fleet.review.md
  - tasks/notes/20260712-2053-repo-owned-agent-fleet.notes.md
  - .ai/harness/policy.json
  - .ai/harness/handoff/
  - .ai/context/capabilities.json
  - .ai/context/capability-source-map.json
  - .ai/harness/capability-context/
  - agents/fleet/
  - .claude/agents/
  - .codex/agents/
  - assets/AGENTS.md
  - assets/CLAUDE.md
  - scripts/AGENTS.md
  - scripts/CLAUDE.md
  - scripts/install-agent-fleet.sh
  - scripts/check-agent-tooling.sh
  - scripts/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - assets/templates/helpers/install-agent-fleet.sh
  - assets/templates/helpers/check-agent-tooling.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - docs/reference-configs/external-tooling.md
  - assets/reference-configs/external-tooling.md
  - brain/repo-harness/references/external-tooling.md
  - docs/CHANGELOG.md
  - docs/architecture/index.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - docs/architecture/modules/workflow-engine/inspection-migration.md
  - docs/architecture/requests/
  - tests/install-agent-fleet.test.ts
  - tests/check-agent-tooling.test.ts
  - tests/bootstrap-files.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - tests/helper-scripts.test.ts
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
    - agents/fleet/explorer.md
    - agents/fleet/deep-reasoner.md
    - agents/fleet/fast-worker.md
    - agents/fleet/gatekeeper.md
    - .claude/agents/explorer.md
    - .codex/agents/explorer.toml
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260712-2053-repo-owned-agent-fleet.notes.md
  tests_pass:
    - path: tests/bootstrap-files.test.ts
  commands_succeed:
    - env -u REPO_HARNESS_HELPER_SOURCE_PATH bun test tests/install-agent-fleet.test.ts tests/check-agent-tooling.test.ts tests/bootstrap-files.test.ts tests/create-project-dirs.runtime.test.ts
    - bun run check:type
    - bun run check:helpers
    - cmp scripts/install-agent-fleet.sh assets/templates/helpers/install-agent-fleet.sh
    - cmp scripts/check-agent-tooling.sh assets/templates/helpers/check-agent-tooling.sh
    - cmp scripts/ensure-task-workflow.sh assets/templates/helpers/ensure-task-workflow.sh
    - npm pack --dry-run --json
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

- Functional behavior:
- Installer uses one packaged source and preserves no-force drift behavior.
- Edge cases:
- Missing/malformed source and unsupported model/effort fail closed before target mutation.
- Regression risks:
- Package helper path resolution from a downstream repo; seed policy drift; user-level target preservation.

## Rollback Point

- Commit / checkpoint: branch `codex/repo-owned-agent-fleet` before implementation.
- Revert strategy: revert the work-package commit and rerun the previous installer only if the old remote authority is intentionally restored.
