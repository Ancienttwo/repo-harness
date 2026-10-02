# Task Contract: retire-cross-review-herdr

> **Status**: Active
> **Plan**: plans/plan-20261003-0524-retire-cross-review-herdr.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-10-03 05:24
> **Review File**: `tasks/reviews/20261003-0524-retire-cross-review-herdr.review.md`
> **Notes File**: `tasks/notes/20261003-0524-retire-cross-review-herdr.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Merged #476 now owns generic Herdr/OAR review. The three obsolete direct advisory files and their live CLI/Skill/model consumers must retire together without resurrecting old launcher-specific receipt sources.

## Goal

Remove exactly3frozen runtime files and their CLI exposure, migrate consumers to existing review round/status/close in Herdr, and transfer the approved evals/checks anchors to existing verification execution. Deliver a Draft-only PR after typecheck and related tests.

## Scope

- In scope: approved3runtime deletion, current CLI/hints/Skill/catalog/docs/live fixture consumers, f0704semantic entities and necessary projection/AXR mappings, this workflow metadata.
- Out of scope: Grok/OAR PhaseD, dependency/runtime integration, upstream declarations, #474/#477/worktree-lifecycle files, other26semantic modules, scheduler/shared verification removal, merge/Ready/home mutation.
- Taste constraints: reuse merged Herdr review; no adapter/parser/legacy alias or receipt-source compatibility reader.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Retired command launches a provider or becomes a silent alias; generic review is unavailable; old anchors remain live; shared verification/Receipt owner changes; or excluded paths change.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20261003-0524-retire-cross-review-herdr.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20261003-0524-retire-cross-review-herdr.review.md`
- Notes file: `tasks/notes/20261003-0524-retire-cross-review-herdr.notes.md`
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
{"protocol":2,"reviewer":"Codex","source":"generic-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/cli/commands/cross-review.ts
  - src/core/review/cross-review.ts
  - src/effects/review/cross-review-runner.ts
  - src/cli/index.ts
  - src/cli/hook/prompt-handler.ts
  - assets/skill-commands/manifest.json
  - assets/skills/repo-harness-cross-review/SKILL.md
  - assets/skills/repo-harness-cross-review/references/codex-mode.md
  - assets/skills/repo-harness-cross-review/references/generic-review.md
  - tests/cli/cross-review.test.ts
  - tests/skill-surface/cross-review-package.test.ts
  - tests/skill-surface/catalog.test.ts
  - tests/bootstrap-files.test.ts
  - tests/prompt-handler.test.ts
  - tests/harness-circuit-breakers.test.ts
  - scripts/axr7-build-model-proposal.ts
  - scripts/axr7-build-selector-repair-proposal.ts
  - README.md
  - README.zh-CN.md
  - README.ja.md
  - README.fr.md
  - README.es.md
  - docs/reference-configs/external-tooling.md
  - assets/reference-configs/external-tooling.md
  - .archcontext/model/nodes/capability.verification.evals-checks.yaml
  - .archcontext/model/nodes/component.evals-checks.primary.yaml
  - .archcontext/model/relations/relation.evals-checks.primary.yaml
  - .archcontext/model/flows/flow.evals-checks.primary.yaml
  - docs/architecture/.projection-manifest.json
  - docs/architecture/changelog.md
  - docs/architecture/decisions/index.md
  - docs/architecture/diagrams/architecture.likec4
  - docs/architecture/diagrams/architecture.mmd
  - docs/architecture/diagrams/architecture.structurizr.json
  - docs/architecture/index.md
  - docs/architecture/modules/verification/evals-checks.md
  - plans/plan-20261003-0524-retire-cross-review-herdr.md
  - tasks/contracts/20261003-0524-retire-cross-review-herdr.contract.md
  - tasks/notes/20261003-0524-retire-cross-review-herdr.notes.md
  - tasks/reviews/20261003-0524-retire-cross-review-herdr.review.md
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
missing or malformed plan fails closed. Populate artifact requirements only
for deliverables this task actually owns; do not create a spec, notes or report
merely to fill this template.

```yaml
exit_criteria:
  files_exist: []
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
  {
    "id": "type",
    "kind": "command",
    "command": "bun run check:type",
    "cwd": ".",
    "phase": "verification",
    "cost": "normal",
    "evidence_policy": "current_exact",
    "necessity": "Owner required typecheck",
    "inputs": {
      "env": [
        "PATH"
      ]
    }
  },
  {
    "id": "related-1",
    "kind": "command",
    "command": "bun test tests/cli/cross-review.test.ts --timeout 60000 --max-concurrency 1",
    "cwd": ".",
    "phase": "verification",
    "cost": "normal",
    "evidence_policy": "current_exact",
    "necessity": "Direct removal consumer or retained generic review/receipt regression coverage",
    "inputs": {
      "env": [
        "PATH"
      ]
    }
  },
  {
    "id": "related-2",
    "kind": "command",
    "command": "bun test tests/skill-surface/cross-review-package.test.ts --timeout 60000 --max-concurrency 1",
    "cwd": ".",
    "phase": "verification",
    "cost": "normal",
    "evidence_policy": "current_exact",
    "necessity": "Direct removal consumer or retained generic review/receipt regression coverage",
    "inputs": {
      "env": [
        "PATH"
      ]
    }
  },
  {
    "id": "related-3",
    "kind": "command",
    "command": "bun test tests/skill-surface/catalog.test.ts --timeout 60000 --max-concurrency 1",
    "cwd": ".",
    "phase": "verification",
    "cost": "normal",
    "evidence_policy": "current_exact",
    "necessity": "Direct removal consumer or retained generic review/receipt regression coverage",
    "inputs": {
      "env": [
        "PATH"
      ]
    }
  },
  {
    "id": "related-4",
    "kind": "command",
    "command": "bun test tests/bootstrap-files.test.ts --timeout 60000 --max-concurrency 1",
    "cwd": ".",
    "phase": "verification",
    "cost": "normal",
    "evidence_policy": "current_exact",
    "necessity": "Direct removal consumer or retained generic review/receipt regression coverage",
    "inputs": {
      "env": [
        "PATH"
      ]
    }
  },
  {
    "id": "related-5",
    "kind": "command",
    "command": "bun test tests/prompt-handler.test.ts --timeout 60000 --max-concurrency 1",
    "cwd": ".",
    "phase": "verification",
    "cost": "normal",
    "evidence_policy": "current_exact",
    "necessity": "Direct removal consumer or retained generic review/receipt regression coverage",
    "inputs": {
      "env": [
        "PATH"
      ]
    }
  },
  {
    "id": "related-6",
    "kind": "command",
    "command": "bun test tests/harness-circuit-breakers.test.ts --timeout 60000 --max-concurrency 1",
    "cwd": ".",
    "phase": "verification",
    "cost": "normal",
    "evidence_policy": "current_exact",
    "necessity": "Direct removal consumer or retained generic review/receipt regression coverage",
    "inputs": {
      "env": [
        "PATH"
      ]
    }
  },
  {
    "id": "related-7",
    "kind": "command",
    "command": "bun test tests/generic-review.test.ts --timeout 60000 --max-concurrency 1",
    "cwd": ".",
    "phase": "verification",
    "cost": "normal",
    "evidence_policy": "current_exact",
    "necessity": "Direct removal consumer or retained generic review/receipt regression coverage",
    "inputs": {
      "env": [
        "PATH"
      ]
    }
  },
  {
    "id": "related-8",
    "kind": "command",
    "command": "bun test tests/acceptance-receipt.test.ts --timeout 60000 --max-concurrency 1",
    "cwd": ".",
    "phase": "verification",
    "cost": "normal",
    "evidence_policy": "current_exact",
    "necessity": "Direct removal consumer or retained generic review/receipt regression coverage",
    "inputs": {
      "env": [
        "PATH"
      ]
    }
  },
  {
    "id": "related-9",
    "kind": "command",
    "command": "bun test tests/acceptance-receipt-evidence-fingerprint.test.ts --timeout 60000 --max-concurrency 1",
    "cwd": ".",
    "phase": "verification",
    "cost": "normal",
    "evidence_policy": "current_exact",
    "necessity": "Direct removal consumer or retained generic review/receipt regression coverage",
    "inputs": {
      "env": [
        "PATH"
      ]
    }
  },
  {
    "id": "related-10",
    "kind": "command",
    "command": "bun test tests/skill-routing-eval.test.ts --timeout 60000 --max-concurrency 1",
    "cwd": ".",
    "phase": "verification",
    "cost": "normal",
    "evidence_policy": "current_exact",
    "necessity": "Direct removal consumer or retained generic review/receipt regression coverage",
    "inputs": {
      "env": [
        "PATH"
      ]
    }
  }
]
}
```

Author the actual checks using [Testing Policy and Artifact Standards](../../docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards).
The empty array is not permission to omit required repository checks: retain it
only when no executable criterion applies and explain why in Acceptance Notes.
Prefer existing covering tests; creating a task-named test or adding typecheck
is not a template requirement. For each selected check declare `id`, `kind`,
`cwd`, `phase`, `cost`, `evidence_policy`, `necessity`, `inputs.env`, and its
`command` or `path`. Declare the same execution once, including checks nested
inside aggregate scripts. Use `baseline_with_delta` only with an immutable
baseline and named current delta checks; never infer it from paths or command text.

## Acceptance Notes (Human Review)

- Changed behavior/boundary, existing covering tests and remaining gap:
- New test case/file rationale, or why existing coverage is sufficient:
- Selected check IDs and why their coverage is sufficient; omitted coverage:
- Full/expensive check justification and expected cost, if applicable:
- Execution/baseline references, subject, current delta and disposition:
- Residual risks and incomplete observations:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:

## Latest explicit owner overrides

Aimpact05:14 combined delivery was narrowed by the latest heartbeat:4bNOW, PhaseDmustNOTstart, Draft-only (no Ready). Gatekeeper and13repository integrity checks are paused; this plan contains only owner-required typecheck and related tests with60000/1. No AcceptanceReceipt/verdict is fabricated. #476mergedcc1fc8ee; original4stale candidates already retired with4real emptynoop receipts and architecturegate0 at84fc4198. Preserve evidence in original worktree, not transplant receipts as if they were valid for this new workspace. Subsequent OARworker resume/attach read-only study is authorized only after this retirement PRmerges; it is not started or included here.
