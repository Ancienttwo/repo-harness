> **Archived**: 2026-07-13 12:39
> **Related Plan**: plans/archive/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260713-1239

# Task Contract: agent-fleet-worker-routing-telemetry

> **Status**: Fulfilled
> **Plan**: plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: workflow-engine-contract-assets
> **Last Updated**: 2026-07-13 12:37
> **Review File**: `tasks/reviews/20260712-2103-agent-fleet-worker-routing-telemetry.review.md`
> **Notes File**: `tasks/notes/20260712-2103-agent-fleet-worker-routing-telemetry.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The Agent Fleet routing refactor (four named, model-pinned subagent profiles: explorer/fast-worker/deep-reasoner/gatekeeper) left contract-run.ts's generic `parent`/`explorer`/`worker`/`verifier` role labels with no deterministic binding to those profiles, and no way to record or escalate a worker-role execution beyond the default fast-worker/Sonnet tier. Without this, delegation-contract manifests can't tell which concrete model actually executed a role, and there is no supported path to a higher-capability single-shot execution when a worker task warrants it.

## Goal

Deterministically resolve contract roles to the four fleet profiles in the run manifest (`delegation_plan.role_profiles`), add a record-only worker-role fallback/escalation path to a Sol-High (Opus + High effort) single-shot identity driven by the existing `RunnerContract.preferred`/`fallback` dispatch labels, add a matching `--effort` telemetry flag, and document the resulting architecture — without changing `RunnerContract`'s existing dispatch-mechanism vocabulary or `contract-run.ts`'s established record-only philosophy (it never itself selects/spawns/degrades a runner).

## Scope

- In scope: `scripts/contract-run.ts` (Options/parseArgs/usage/manifest construction), `tests/contract-run.test.ts` (regression coverage), `assets/templates/helpers/contract-run.ts` (synced mirror, via `bun run sync:helpers`), `.ai/context/capabilities.json` (extend `workflow-engine-contract-assets.prefixes`), `docs/architecture/modules/workflow-engine/contract-assets.md` (dated closeout section).
- Out of scope: `docs/architecture/index.md` (drift-hook-generated only, `scripts/contract-run.ts` is not in `architecture-queue.sh`'s severity whitelist — confirmed empirically, not hand-authored here), the pre-existing `check-task-sync.sh` repo-wide dirty-tree failure (predates this work), `.claude/agents/*.md`/`.codex/agents/*.toml` (fleet profile definitions, already implemented in an earlier slice of this session), `RunnerContract`'s type/parser (reused as-is, no field renaming), `runChild`/run-mode control flow (no auto-degrade added).
- Taste constraints: additive manifest fields only; no existing field renamed or repurposed; no new abstraction beyond the one Sol-High fallback path.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

What observable evidence would prove this task's direction wrong, and the cheapest proof point to check first. Leave as-is if not applicable.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260712-2103-agent-fleet-worker-routing-telemetry.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260712-2103-agent-fleet-worker-routing-telemetry.review.md`
- Notes file: `tasks/notes/20260712-2103-agent-fleet-worker-routing-telemetry.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260712-2103-agent-fleet-worker-routing-telemetry.contract.md
  - tasks/reviews/20260712-2103-agent-fleet-worker-routing-telemetry.review.md
  - tasks/notes/20260712-2103-agent-fleet-worker-routing-telemetry.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - scripts/contract-run.ts
  - tests/contract-run.test.ts
  - assets/templates/helpers/contract-run.ts
  - docs/architecture/modules/workflow-engine/contract-assets.md
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
    - docs/architecture/modules/workflow-engine/contract-assets.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260712-2103-agent-fleet-worker-routing-telemetry.notes.md
  tests_pass:
    - path: tests/contract-run.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
    - bun scripts/sync-helper-sources.ts --check
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: `delegation_plan.role_profiles` resolves parent/explorer/worker/verifier to orchestrator/explorer/fast-worker-or-sol-high/gatekeeper; `runner_usage.path`/`effort` record which path and tier the worker used; `--effort` flag validated against low/medium/high/xhigh/max. Verified via `tests/contract-run.test.ts` (preferred path, `main-thread` fallback, `codex-exec` pass-through, `--effort xhigh` override, invalid `--effort` rejection).
- Edge cases: `RunnerContract.fallback === null` (no fallback declared) never classifies as worker_fallback; `codex-subagent`/`codex-exec` dispatch passes through unchanged rather than being coerced into fast-worker/sol-high, since Codex is a separate provider.
- Regression risks: full suite re-verified at 1116 pass / 1 skip / 0 fail after both the code change and the helper-sync mirror fix, matching the pre-change pass count plus the one newly-fixed test — no other test moved. `check-task-sync.sh` still fails but was independently confirmed pre-existing (fails identically on a clean baseline before this task's edits).

## Rollback Point

- Commit / checkpoint: not yet committed as of contract creation; working-tree diff on `scripts/contract-run.ts`, `tests/contract-run.test.ts`, `assets/templates/helpers/contract-run.ts`, `.ai/context/capabilities.json`, `docs/architecture/modules/workflow-engine/contract-assets.md`.
- Revert strategy: `git checkout -- <file>` per file above (all additive changes, no renamed/removed fields); or revert the eventual commit wholesale since this task's diff is self-contained and does not touch `RunnerContract`'s type/parser or `runChild`.
