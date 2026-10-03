# Task Contract: campaign-preparation-retry

> **Status**: Active
> **Plan**: plans/plan-20260910-2258-campaign-preparation-retry.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-11 03:30
> **Review File**: `tasks/reviews/20260910-2258-campaign-preparation-retry.review.md`
> **Notes File**: `tasks/notes/20260910-2258-campaign-preparation-retry.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`prepareChild` persists the preparation planning record before it calls `prepareCampaignCodexInvocation`, and re-entry rejected that record unconditionally. A first attempt that dies inside the provider's initial context inspection — a missing or misconfigured Docker executable is the observed case — therefore leaves an acquired campaign task with a preparation record, no container journal, and no legal next move: the record blocks the retry, and reconciliation has nothing to reconcile against. The live dispatch found in this state holds a claim, a lease and a budget reservation that nothing releases, so the wedge costs a whole acquisition. Skipping the fix means every controller-side environment fault before journal creation converts into a stranded task.

## Goal

`prepareChild` retries against an existing preparation record when that record's attempt provably produced no effect, and rejects otherwise. The retry must reuse the stored preparation unchanged: same identity, same `deadline_ms`. A caller bound may narrow the retry but may never replace or extend the original effect window, and an already-expired stored deadline rejects. Retry is refused outright once any later evidence exists — non-worker role, launch, final, either child record, verifier preparation, any downstream phase record, an attempt reservation, or a container journal for either the version probe or the workload identity.

## Scope

- In scope: the retry admission window in `prepareChild` (`src/effects/automation/campaign-worker.ts`); `assertCampaignPreparationRetryable` as the exclusive pre-create journal fence (`src/effects/automation/campaign-runtime.ts`); the retry, preserved-deadline, journal-blocked, later-effect, identity and refusal cases in `tests/effects/campaign-worker.test.ts`.
- Out of scope: retry after launch; resetting or re-charging budget; reconstructing or deleting a container request; adding a provider or carrier; changing the immutable record, the contract/claim validation, or the lower `mkdirSync` exclusive fence; restarting the stopped campaign or reusing an old grant.
- Taste constraints: the stored record stays the single authority for the effect window — the retry path reads it and never rewrites it. <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a failure inside `prepareCampaignCodexInvocation` can reach the runtime before the container journal exists — then "no journal" would no longer imply "no effect", and retry would have to become reconciliation. Cheapest proof point: the journal-blocked cases in `tests/effects/campaign-worker.test.ts` assert `prepareCampaignCodexInvocation` was called exactly once and the pre-created directory survives, so a second provider call or a mutated journal falsifies the fence directly. The second falsifier is deadline drift: `calls` must equal `[deadline, deadline]` across a retry issued with a wider caller bound; any other pair means the effect window was renewed.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/effects/automation/campaign-worker.ts:182` (pre-fix, `origin/main`) rejected re-entry whenever `readPlanningRecord(root, intent, runtimeKey(role, 'preparation'))` returned a record, so a first attempt that threw before any container journal was created could never be retried.
- repro: `bun test tests/effects/campaign-worker.test.ts --test-name-pattern 'pre-journal preparation failure can retry'` on the unfixed code — the second `prepareChild` call throws `campaign preparation already admitted; reconciliation required` instead of reaching the provider.
- regression_guard: tests/effects/campaign-worker.test.ts
- pre_fix_failure_artifact: tasks/evidence/campaign-preparation-retry-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260910-2258-campaign-preparation-retry.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260910-2258-campaign-preparation-retry.review.md`
- Notes file: `tasks/notes/20260910-2258-campaign-preparation-retry.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/effects/automation/campaign-worker.ts
  - src/effects/automation/campaign-runtime.ts
  - tests/effects/campaign-worker.test.ts
  - tasks/evidence/campaign-preparation-retry-pre-fix.log
  - plans/plan-20260910-2258-campaign-preparation-retry.md
  - tasks/contracts/20260910-2258-campaign-preparation-retry.contract.md
  - tasks/reviews/20260910-2258-campaign-preparation-retry.review.md
  - tasks/notes/20260910-2258-campaign-preparation-retry.notes.md
  - tasks/todos.md
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

This block contains only non-executable artifact requirements. Define every
executable check once in the canonical Verification Plan below. Each check must
state its phase, cost, evidence policy, necessity, and input environment; a
missing or malformed plan fails closed.

```yaml
exit_criteria:
  files_contain:
    - path: src/effects/automation/campaign-runtime.ts
      pattern: "assertCampaignPreparationRetryable"
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/evidence/campaign-preparation-retry-pre-fix.log
    - tasks/notes/20260910-2258-campaign-preparation-retry.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "campaign-worker-retry-regression",
      "kind": "package_test",
      "path": "tests/effects/campaign-worker.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root Cause Evidence regression_guard: covers the retry, preserved-deadline, journal-blocked, later-effect and refusal cases that define the changed admission window.",
      "inputs": { "env": [] }
    },
    {
      "id": "brc10-lifecycle",
      "kind": "package_test",
      "path": "tests/effects/brc10-lifecycle.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "prepareChild sits inside the supervised dispatch lifecycle; this proves the retry window did not move claim, lease or budget behavior.",
      "inputs": { "env": [] }
    },
    {
      "id": "campaign-containment",
      "kind": "package_test",
      "path": "tests/effects/campaign-containment.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "assertCampaignPreparationRetryable reads the container journal the containment model owns; this proves the new fence agrees with that owner.",
      "inputs": { "env": [] }
    },
    {
      "id": "typecheck",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Checks TypeScript contracts before behavioral verification.",
      "inputs": { "env": [] }
    },
    {
      "id": "hook-projection-drift",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository-integrity check: catches a hook projection edited without its authoring source.",
      "inputs": { "env": [] }
    },
    {
      "id": "helper-projection-drift",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository-integrity check: catches a helper projection edited without its authoring source.",
      "inputs": { "env": [] }
    },
    {
      "id": "task-workflow-strict",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository-integrity check: this contract's own plan/contract/review/notes set must stay internally consistent.",
      "inputs": { "env": [] }
    }
  ]
}
```

This is the sole executable verification authority. Use `baseline_with_delta`
only when a referenced immutable baseline plus named current delta checks prove
the intended coverage; do not infer that choice from paths or command text.

## Acceptance Notes (Human Review)

- Functional behavior: a `prepareChild` attempt that fails before any container journal exists can be retried against its stored preparation record. The retry reuses the stored `deadline_ms` verbatim, so a wider caller bound does not extend the effect window and a narrower bound below the stored deadline rejects. Everything else still refuses: verifier role, any launch/final/child/verifier-preparation/downstream-phase record, an attempt reservation, or a container journal for the version probe or the workload identity.
- Edge cases: an expired stored deadline rejects rather than retries; a non-safe-integer deadline on either side rejects; an identity or record-shape difference rejects before the journal fence is consulted; an empty or symlinked journal directory still counts as a journal, so it routes to reconciliation. Under concurrent retries the lower `mkdirSync` exclusive fence still admits at most one create.
- Regression risks: the retry path widens an admission window that used to be strictly single-shot, so the risk is a missed effect signal letting a second provider call through. The journal-blocked cases pin `prepareCampaignCodexInvocation` to exactly one call and assert the pre-created directory survives untouched; the retry case pins the deadline pair to `[deadline, deadline]` and asserts budget status and the launch/intent records are unchanged.
- Verification scope: coverage is the three focused test files declared above plus typecheck and the projection-drift checks. Also run once on this branch and green, but not declared as replayable criteria: `bash scripts/check-deploy-sql-order.sh` (no SQL in scope), `bash scripts/check-task-sync.sh` and `bash scripts/check-architecture-sync.sh` (both read live git and daemon state, so they belong to CI at the merge boundary rather than a frozen acceptance replay). A full suite is not justified: the change is two bounded functions in one module pair, and the admission window is covered by named positive and refusal cases.
- Environment note: `check-architecture-sync.sh` was red in this worktree until `bun install` brought its `node_modules` archctx from 0.5.9 up to the 0.5.10 the rebased `package.json` pins. That was stale worktree state, not a repository defect.

## Rollback Point

- Commit / checkpoint: `09e4a4d0` (merge-base with `origin/main`)
- Revert strategy: revert the single commit. The change is confined to two functions in `campaign-worker.ts` and `campaign-runtime.ts` and reverting restores the unconditional rejection; no data migration, and every live immutable preparation, grant, counter and runtime journal is untouched either way.
