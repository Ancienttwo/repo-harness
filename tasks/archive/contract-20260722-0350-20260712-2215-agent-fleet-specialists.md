# Task Contract: agent-fleet-specialists

> **Status**: Partial
> **Plan**: plans/plan-20260712-2215-agent-fleet-specialists.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: workflow-engine-contract-assets
> **Last Updated**: 2026-07-13 01:52
> **Review File**: `tasks/reviews/20260712-2215-agent-fleet-specialists.review.md`
> **Notes File**: `tasks/notes/20260712-2215-agent-fleet-specialists.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The repo-owned fleet has no specialist for the existing bugfix root-cause evidence contract or the existing harness/adoption evaluation surfaces. Adding those roles incorrectly could create a second gate or benchmark authority, broaden write permissions, mutate BDD2 evaluation state, or imply unsupported inheritance from host-native Explore.

## Goal

Ship exactly six repo-owned managed roles by adding `root-cause-prover` and `harness-evaluator`; generate deterministic Claude/Codex projections, preserve all-source fail-closed installation and local packaged drift checks, fold migration auditing into the evaluator's adoption profile, document native Explore as an informal runtime capability rather than an inheritable authority, and install/read back the verified six-role fleet in actual HOME.

## Scope

- In scope:
  - `agents/fleet/{root-cause-prover,harness-evaluator}.md` and their deterministic `.claude/.codex` projections.
  - Six-role installer/tooling/policy seeds, helper mirrors, docs, changelog, architecture/workflow artifacts, and focused tests.
  - `root-cause-prover` aligned to the existing four-field bugfix evidence contract without modifying the gate.
  - `harness-evaluator` with skills/adoption profiles that invoke existing surfaces only after a shared fail-closed disposable repo/HOME guard; migration audit is a profile.
  - Native Explore versus formal fleet explorer routing guidance with no alias, wrapper, prompt inheritance, or incremental merge.
  - Post-verification actual HOME installation and exact six-role readback.
- Out of scope:
  - `trust-boundary-auditor` and `release-operator` personas.
  - Changes to `scripts/contract-run.ts` or the parallel `agent-fleet-worker-routing-telemetry` work-package.
  - Changes to root-cause gate implementation, eval methodology, benchmark datasets, or `evals/bdd2/**`; a fail-closed disposable-boundary guard on the existing skill runner is in scope because it enforces the evaluator's execution boundary without changing scoring or cases.
  - Native subagent hook governance, host adapter changes, compatibility aliases, prompt inheritance, remote fallback, or dual authority.
- Taste constraints: one complete authored source per persona; explicit three-role writable set; no new evaluator/gate implementation; evaluator must return BLOCKED outside a complete disposable repo/HOME; absent host prompt content is forbidden authority, not a merge input.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If `root-cause-prover` cannot produce the existing four-field evidence shape without changing the gate, or `harness-evaluator` needs new benchmark logic rather than invoking existing commands, the persona boundary is wrong. Cheapest proof: map the current gate and evaluator/adoption entrypoints before editing any fleet file.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260712-2215-agent-fleet-specialists.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260712-2215-agent-fleet-specialists.review.md`
- Notes file: `tasks/notes/20260712-2215-agent-fleet-specialists.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260712-2215-agent-fleet-specialists.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260712-2215-agent-fleet-specialists.contract.md
  - tasks/reviews/20260712-2215-agent-fleet-specialists.review.md
  - tasks/notes/20260712-2215-agent-fleet-specialists.notes.md
  - tasks/workstreams/workflow-engine/contract-assets/
  - tasks/workstreams/workflow-engine/inspection-migration/
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
  - scripts/run-skill-evals.ts
  - assets/templates/helpers/install-agent-fleet.sh
  - assets/templates/helpers/check-agent-tooling.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - docs/reference-configs/external-tooling.md
  - assets/reference-configs/external-tooling.md
  - docs/reference-configs/agentic-development-flow.md
  - assets/reference-configs/agentic-development-flow.md
  - docs/CHANGELOG.md
  - docs/architecture/index.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - docs/architecture/modules/workflow-engine/inspection-migration.md
  - docs/architecture/requests/
  - tests/install-agent-fleet.test.ts
  - tests/check-agent-tooling.test.ts
  - tests/bootstrap-files.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - tests/run-skill-evals.test.ts
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
    - agents/fleet/root-cause-prover.md
    - agents/fleet/harness-evaluator.md
    - .claude/agents/root-cause-prover.md
    - .claude/agents/harness-evaluator.md
    - .codex/agents/root-cause-prover.toml
    - .codex/agents/harness-evaluator.toml
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260712-2215-agent-fleet-specialists.notes.md
  tests_pass:
    - path: tests/bootstrap-files.test.ts
    - path: tests/run-skill-evals.test.ts
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

- Functional behavior: exactly six roles install from `agents/fleet`; root-cause output matches the existing evidence fields; evaluator invokes existing surfaces; formal explorer routing uses the repo persona.
- Edge cases: any missing/malformed sixth source aborts before HOME mutation; only fast-worker, root-cause-prover, and harness-evaluator generate workspace-write; evaluator blocks outside disposable state; native Explore is never wrapped or aliased. Post-review fix (2026-07-13): `assertDisposableRootBoundary` now also rejects a disposable repo/HOME that is a descendant of, or an ancestor containing, the real HOME (previously only an exact-match real-HOME was rejected, so `$HOME/scratch/{repo,home}` silently passed as disposable); see notes file for full evidence.
- Regression risks: stale policy seeds, omitted package sources, real HOME drift, accidental BDD2 or parallel worker-routing changes.

## Rollback Point

- Commit / checkpoint: stacked branch `codex/agent-fleet-specialists` starts at verified repo-owned fleet commit `443039c`.
- Revert strategy: revert the specialist commit and rerun the prior four-role installer; no schema or external data rollback.
