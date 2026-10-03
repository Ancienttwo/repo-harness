# Task Contract: brc1415-strict-admission

> **Status**: Active
> **Plan**: plans/plan-20260908-2235-brc1415-strict-admission.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-08 22:35
> **Review File**: `tasks/reviews/20260908-2235-brc1415-strict-admission.review.md`
> **Notes File**: `tasks/notes/20260908-2235-brc1415-strict-admission.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The temporary supervision refusal blocks BRC14/BRC15 despite the subsequently accepted independent Docker runtime. Restoring admission must preserve all existing authority validation.

## Goal

Prepare a reviewable strict-admission restoration with positive and negative real-store regression evidence. Owner delegated the AiphaBee target and budget on 2026-09-08. Use the isolated canary branch, one group, at most two active Issues, parallel limit two, and a total forty provider calls/ninety minutes across shadow and active grants. Keep manual merge.

## Scope

- In scope: obsolete unconditional refusal, real-store regression expectations, durable evidence boundary, the frozen capability-source selection defect, and the observed BRC14 prompt/resource mismatch affecting both revision observation and final audit.
- Out of scope: activation policy changes, live provider operations, grants, stopped campaigns, package release.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A caller reaching an unsupervised worker path, or invalid evidence reaching side effects, falsifies restoration. Trace current Docker preparation and retain refusal regressions.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260908-2235-brc1415-strict-admission.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260908-2235-brc1415-strict-admission.review.md`
- Notes file: `tasks/notes/20260908-2235-brc1415-strict-admission.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"target-protection-regression","kind":"deterministic_test","paths":["src/effects/automation/campaign-protection.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - .github/workflows/ci.yml
  - .ai/harness/campaign-protection.json
  - tests/fixtures/repair-campaign/protected-capabilities.json
  - tests/characterization/repair-campaign-authority-freeze.test.ts
  - src/effects/automation/
  - tests/state/fixtures/loop-semantics/characterization.json
  - tests/unit/campaign-revision-evidence.test.ts
  - src/effects/automation/gpt-pro-issue-authoring.ts
  - src/cli/commands/campaign.ts
  - src/effects/external-sources/github.ts
  - src/effects/automation/issue-batch-observer.ts
  - src/core/automation/campaign-revision-evidence.ts
  - src/effects/automation/campaign-revision-observation.ts
  - src/effects/automation/campaign-fresh-audit.ts
  - src/effects/automation/campaign-worker.ts
  - src/effects/automation/campaign-revision-admission.ts
  - src/effects/automation/campaign-capability-registry.ts
  - tests/effects/
  - tests/helpers/
  - tests/effects/campaign-revision-observation.test.ts
  - docs/researches/20260908-brc14-provider-history-evidence.md
  - docs/architecture/
  - plans/
  - tasks/
  - AGENTS.md
  - CLAUDE.md
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
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260908-2235-brc1415-strict-admission.notes.md
```

## Verification Plan

```json

{
  "protocol": 1,
  "checks": [
    {
      "id": "target-protection-regression",
      "kind": "command",
      "command": "bun test --timeout 60000 tests/effects/campaign-capability-registry.test.ts tests/effects/campaign-planning.test.ts tests/effects/campaign-revision-observation.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "The eight-file adoption/acquisition/fresh-audit and characterization baseline passed at71792662 in run-20260909T031328-26791; only assessment declaration lacked the oracle binding. Final delta validates selected inventory membership, typed policy/planning errors and active pre-provider refusals. Unchanged source protection bytes and other runtime behavior retain baseline evidence.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "typecheck",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required integrity or unchanged runtime evidence binding.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "runtime-unchanged",
      "kind": "command",
      "command": "git diff --exit-code cc2fbc48 -- src/core/automation/ ':(exclude)src/core/automation/campaign-revision-evidence.ts' src/effects/automation/campaign-runtime.ts src/effects/automation/campaign-container.ts scripts/contract-run.ts assets/templates/helpers/contract-run.ts deploy/campaign-container/ .codex/agents/ tests/effects/campaign-runtime-container.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required integrity or unchanged runtime evidence binding.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "deploy-order",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required integrity or unchanged runtime evidence binding.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "architecture-sync",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required integrity or unchanged runtime evidence binding.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=0b0c0a60 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required integrity or unchanged runtime evidence binding.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required integrity or unchanged runtime evidence binding.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "project-state",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required integrity or unchanged runtime evidence binding.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "adoption-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required integrity or unchanged runtime evidence binding.",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

This is the sole executable verification authority. Use `baseline_with_delta`
only when a referenced immutable baseline plus named current delta checks prove
the intended coverage; do not infer that choice from paths or command text.

## Acceptance Notes (Human Review)

- Integration-only CI repair: main Herdr cutover introduced real Herdr tests but did not install Herdr in CI. Run34269496496 passes BRC tests and fails only claude-review/herdr-transport with missing executable. Install pinned upstream0.9.0 Linux binary with verified SHA256 before CI gate. This is the single directly blocking out-of-scope fix; no runtime/test behavior changes. Frozen14/14 run-20260909T032622-41208 retains its source scope; validate CI YAML and required integrity checks, then use mandatory remote CI for the Linux runtime.

- Current delta: CI run 34254078294 passed all BRC suites and failed only loop-semantics-characterization. Main commit fe35f0a9 adds architecture-drift-cascade.json persistence; update its three golden Stop touched-path lists. No BRC source or runtime input changes after accepted subject sha256:6b807c6b42cfb4d8208ca03a15aa9e282bbe6cc5b24a543e8bb965b430466516 (14/14 run-20260909T005135-27777). Final acceptance uses the isolated snapshot regression plus required integrity checks; the prior full CI remains evidence for its original candidate, not a green result for this head.

- Runtime scope: the source-equality check excludes campaign-revision-evidence.ts because its shared URL derivation is this tested delta, not the Docker containment implementation. Docker runtime, launch inputs and every other core automation file remain compared to cc2fbc48.
- Baseline: run-20260908T230034-3349 retains its original 86-case source subject. The subsequent delta changes only revision-resource prompt construction and its two callers. Final coverage names observation, fresh audit and evidence decoder suites; no full-suite trigger.
- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
