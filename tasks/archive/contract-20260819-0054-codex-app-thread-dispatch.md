> **Archived**: 2026-08-19 00:54
> **Related Plan**: plans/archive/plan-20260802-0309-codex-app-thread-dispatch.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260819-0054

# Task Contract: codex-app-thread-dispatch

> **Status**: Active
> **Plan**: plans/plan-20260802-0309-codex-app-thread-dispatch.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-02 03:09
> **Review File**: `tasks/reviews/20260802-0309-codex-app-thread-dispatch.review.md`
> **Notes File**: `tasks/notes/20260802-0309-codex-app-thread-dispatch.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The repo's Codex delegation surfaces name native MultiAgentV2 `spawn_agent` as the preferred runner, but the native flat V2 spawn schema cannot select Luna: a `fast-worker` (gpt-5.6-luna/max) dispatch silently inherits the parent model (falsified canary: `plans/plan-20260711-0219-codex-native-role-model-override.md:52-54`, Blocked). Until the preferred runner points at Codex App Thread dispatch, every Codex-side fast-worker run executes on the wrong model and the fleet's model routing is fiction.

## Goal

Re-point the Codex-side delegated-runner preference from native `spawn_agent` to Codex App Thread dispatch (`codex_app__create_thread` with the role's exact `model` + reasoning effort from the installed `~/.codex/agents/<role>.toml`), demote native spawn to an evidence-gated declared fallback (fail-closed: a role whose exact model/effort the native live spawn schema does not accept skips native and degrades to codex-exec → main-thread on the SAME contract, degradation recorded), and encode the thread-lifecycle rules (unique task id, pendingWorktreeId is not a thread id, materialization via official thread read, requested-vs-observed model separation, adopt results only after reading the final turn, archive threads one at a time, no worker re-derivation) in the advisor and standing-authorization surfaces. Execute exactly the plan body in `plans/plan-20260802-0309-codex-app-thread-dispatch.md` (## In scope / ## Out of scope / ## Exit Criteria are authoritative).

## Scope

- In scope: `.ai/harness/policy.json#delegation` (preferred_runners + runner_rule/rule prose); `src/cli/hook/subagent-handler.ts` `runDelegationAdvisor` sharedRules + runner-preference sentence; `src/cli/hook/session-context.ts` `codexDelegationAutoContext` standing-authorization block; `docs/reference-configs/external-tooling.md` + `assets/reference-configs/external-tooling.md` (byte-identical pair); `tests/subagent-handler.test.ts`, `tests/session-context.test.ts`. Round 2 (gate findings): downstream delegation seeds in `scripts/lib/project-init-lib.sh` + `scripts/ensure-task-workflow.sh` + `assets/templates/helpers/ensure-task-workflow.sh` synced to the new policy values with `tests/create-project-dirs.runtime.test.ts` pins updated; symmetric thread-path fail-closed clause in both hook files.
- Out of scope: any new hook route/CLI helper/evidence field for thread routing; the reference skill's RoutePlan/ledger Python tooling; `scripts/install-agent-fleet.sh` + assets mirror; `.codex/agents/*.toml` fixtures; `scripts/check-agent-tooling.sh`; cap changes; anything under real `~/.claude/` or `~/.codex/`; live create_thread canary.
- Taste constraints: no model-ID literals under `src/` (reference the role's installed TOML instead); keep the `# Delegation Standing Authorization` header and `spawn no more than ${maxAgents}` phrasing; do not disturb EXECUTION_BOUNDARY byte parity.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the Codex App `create_thread` surface on this host rejects an explicit `model`/`thinking` per thread (no such parameters in its live schema), thread-first dispatch cannot honor per-role models either and the direction is wrong. Cheapest proof point: the wording stays evidence-gated (requested vs observed model recorded from official thread reads), so a real canary thread on the user's Codex host is the post-merge check; this slice must not claim runtime readiness.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260802-0309-codex-app-thread-dispatch.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260802-0309-codex-app-thread-dispatch.review.md`
- Notes file: `tasks/notes/20260802-0309-codex-app-thread-dispatch.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260802-0309-codex-app-thread-dispatch.contract.md
  - tasks/reviews/20260802-0309-codex-app-thread-dispatch.review.md
  - tasks/notes/20260802-0309-codex-app-thread-dispatch.notes.md
  - .ai/harness/policy.json
  - src/cli/hook/subagent-handler.ts
  - src/cli/hook/session-context.ts
  - docs/reference-configs/external-tooling.md
  - assets/reference-configs/external-tooling.md
  - tests/subagent-handler.test.ts
  - tests/session-context.test.ts
  - scripts/lib/project-init-lib.sh
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - tests/create-project-dirs.runtime.test.ts
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
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
    - plans/plan-20260802-0309-codex-app-thread-dispatch.md
  artifacts_exist:
    - tasks/notes/20260802-0309-codex-app-thread-dispatch.notes.md
  tests_pass:
    - path: tests/subagent-handler.test.ts
    - path: tests/session-context.test.ts
  commands_succeed:
    - bun test
    - cmp docs/reference-configs/external-tooling.md assets/reference-configs/external-tooling.md
    - bash -c '! rg -q "gpt-5\.6" src/'
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: worktree base `7e7d9bc2` on branch `codex/codex-app-thread-dispatch`.
- Revert strategy: drop the branch / revert the reviewed diff; no state outside this worktree is touched until the orchestrator orders ship.
