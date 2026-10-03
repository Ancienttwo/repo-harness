# Task Contract: Campaign successor replacement

> **Status**: Active
> **Plan**: plans/plan-20260909-1909-campaign-successor-replacement.md
> **Task Profile**: bugfix
> **Owner**: ancienttwo
> **Capability ID**: root
> **Review File**: tasks/reviews/20260909-1909-campaign-successor-replacement.review.md
> **Notes File**: tasks/notes/20260909-1909-campaign-successor-replacement.notes.md

## Why

A successor campaign that is formally stopped and never adopted still holds the predecessor's exclusive `continuation` binding, so no further recovery of the original Issues is possible through the formal entrypoint. Relaxing the writer alone would split writer authority from adoption authority and let a superseded successor still adopt.

## Goal

Allow one controlled, evidence-bound replacement of a stopped, never-adopted successor while preserving the full recovery chain, and reject a `start_group` that precedes its group adoption and publication.

## Scope

- In scope: a typed `superseded-<intent>` replacement record on the predecessor, one `resolveEffectiveContinuation` used by both binder and adoption checker, a zero-write canonical-store eligibility check invoked before any write or dispatch, an evidence-bounded `previous_markers` set, a `campaign prepare-resume` zero-provider CLI, and a gpt_pro `start_group` ordering guard.
- In scope: an `automation budget repair` operator verb (`repairAutomationBudgetDrift`) bounded to the `lockedStatus` reconciliation every mutating verb already performs — folding existing durable records and sealing an exhaustion receipt the run's own records already prove — and never rewriting or deleting any durable record.
- Out of scope: rolling `stopped` back to runnable, relaxing the issue-batch observer, changing resume identity rules, raising or inheriting authorization caps, and rewriting or deleting any continuation, intent, session, grant, stop event or budget run.
- Taste constraints: no compatibility fallback, no dual authority, no new error vocabulary.

## Falsifier

A superseded successor can still adopt, or two competing successors both obtain provider-dispatch eligibility, or a replacement admits while canonical evidence of execution is missing, corrupt or undeterminable.

## Root Cause Evidence

- root_cause: `src/effects/automation/campaign-authoring-resume.ts:56` writes an exclusive immutable `continuation` artifact that no later successor can replace, and `src/effects/automation/gpt-pro-issue-authoring.ts:254` renders `previous_marker` from the resume source intent, so a stopped never-adopted successor permanently blocks recovery and would demand a stale marker.
- repro: bun test --timeout 60000 tests/effects/campaign-authoring-resume.test.ts
- regression_guard: tests/effects/campaign-authoring-resume.test.ts
- pre_fix_failure_artifact: tasks/evidence/campaign-successor-replacement-pre-fix.log — captured RED for the root-cause row (the real failure shape) and the ordering row only, at 30 tests / 2 failing. The rejection table, the atomicity/retry case and the ledger cases were added after this capture and are not represented in it.

## Allowed Paths

```yaml
allowed_paths:
  - src/effects/automation/campaign-authoring-resume.ts
  - src/effects/automation/issue-batch-store.ts
  - src/effects/automation/gpt-pro-issue-authoring.ts
  - src/effects/automation/campaign-fresh-audit.ts
  - src/cli/commands/campaign.ts
  - src/effects/automation/budget-store.ts
  - src/cli/commands/automation.ts
  - docs/spec.md
  - tests/effects/campaign-authoring-resume.test.ts
  - tests/unit/issue-282-automation-budget-store.test.ts
  - tests/unit/issue-282-automation-budget-e2e.test.ts
  - tests/effects/campaign-fresh-audit.test.ts
  - .archcontext/model/nodes/capability.runtime-harness.development-campaign.yaml
  - docs/architecture/
  - docs/architecture/modules/runtime-harness/development-campaign.md
  - docs/researches/20260909-campaign-successor-replacement.md
  - tasks/evidence/campaign-successor-replacement-pre-fix.log
  - plans/plan-20260909-1909-campaign-successor-replacement.md
  - tasks/contracts/20260909-1909-campaign-successor-replacement.contract.md
  - tasks/notes/20260909-1909-campaign-successor-replacement.notes.md
  - tasks/reviews/20260909-1909-campaign-successor-replacement.review.md
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "successor-replacement", "kind": "deterministic_test", "paths": [".archcontext/model/nodes/capability.runtime-harness.development-campaign.yaml", "docs/architecture/.projection-manifest.json", "docs/architecture/changelog.md", "docs/architecture/decisions/index.md", "docs/architecture/diagrams/architecture.likec4", "docs/architecture/diagrams/architecture.mmd", "docs/architecture/diagrams/architecture.structurizr.json", "docs/architecture/index.md", "docs/architecture/modules/runtime-harness/development-campaign.md", "docs/researches/20260909-campaign-successor-replacement.md", "src/cli/commands/automation.ts", "src/cli/commands/campaign.ts", "docs/spec.md", "src/effects/automation/budget-store.ts", "src/effects/automation/campaign-authoring-resume.ts", "src/effects/automation/campaign-fresh-audit.ts", "src/effects/automation/gpt-pro-issue-authoring.ts", "src/effects/automation/issue-batch-store.ts", "tasks/evidence/campaign-successor-replacement-pre-fix.log", "tests/effects/campaign-authoring-resume.test.ts", "tests/effects/campaign-fresh-audit.test.ts", "tests/unit/issue-282-automation-budget-e2e.test.ts", "tests/unit/issue-282-automation-budget-store.test.ts"]}]}
```

## Evidence Requirements

```yaml
evidence_requirements:
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

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop before any real provider, Oracle, Docker or canary campaign invocation; this contract is validated model-free.

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/researches/20260909-campaign-successor-replacement.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "successor-replacement",
      "kind": "package_test",
      "path": "tests/effects/campaign-authoring-resume.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Real failure shape, rejection boundary, atomicity/retry and ledger continuity for the replacement record.",
      "inputs": { "env": [] }
    },
    {
      "id": "automation-budget-drift-repair",
      "kind": "command",
      "command": "bun test --timeout 60000 tests/unit/issue-282-automation-budget-store.test.ts tests/unit/issue-282-automation-budget-e2e.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "The new repair verb seals an exhaustion receipt under the run lock and must spend nothing; the CLI wiring is verified over a real store.",
      "inputs": { "env": [] }
    },
    {
      "id": "campaign-ordering-regression",
      "kind": "command",
      "command": "bun test --timeout 60000 tests/effects/campaign-fresh-audit.test.ts tests/effects/issue-batch-adoption.test.ts tests/effects/gpt-pro-issue-authoring.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "start_group ordering guard, adoption identity and authoring admission are the directly changed behaviors.",
      "inputs": { "env": [] }
    },
    {
      "id": "development-campaign-capability-core",
      "kind": "command",
      "command": "bun test tests/unit/development-campaign-core.test.ts tests/unit/development-campaign-policy.test.ts tests/unit/issue-batch.test.ts tests/effects/development-campaign-store.test.ts tests/effects/gpt-pro-issue-authoring.test.ts tests/cli/development-campaign.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Declared verification of the development-campaign capability node whose sources this contract changes.",
      "inputs": { "env": [] }
    },
    {
      "id": "development-campaign-capability-reconcile",
      "kind": "command",
      "command": "bun test tests/unit/issue-batch-reconcile.test.ts tests/effects/issue-batch-observer.test.ts tests/effects/campaign-step.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Declared verification of the development-campaign capability node; the observer and step paths must stay unchanged.",
      "inputs": { "env": [] }
    },
    {
      "id": "typecheck",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "New artifact name family, resolver and CLI subcommand must typecheck across their callers.",
      "inputs": { "env": [] }
    },
    {
      "id": "repository-integrity",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh && bash scripts/check-architecture-sync.sh && bash scripts/check-task-sync.sh && bash scripts/check-task-workflow.sh --strict && bun scripts/inspect-project-state.ts --repo . --format text && bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository-integrity checks for a substantive repository change.",
      "inputs": { "env": [] }
    }
  ]
}
```

## Acceptance Notes (Human Review)

- Functional behavior: a stopped never-adopted successor can be superseded exactly once through `campaign author --resume-from`, the replacement successor adopts with the original Issue identities, and the superseded successor can neither adopt nor act as a resume source.
- Edge cases: competing successors, crash after the replacement write, stale or non-effective `supersedes`, unverified authoring sessions, unsettled reservations, budget drift, and a gpt_pro group whose intent is missing.
- Regression risks: the existing resume rejection table and the issue-batch observer must stay unchanged; the `start_group` guard applies unconditionally because `ProgramAuthorizationV1.campaign.issue_author` is validator-pinned to `gpt_pro`.

## Rollback Point

- Commit / checkpoint: base `origin/main` 16b8670c on branch `codex/campaign-successor-replacement`.
- Revert strategy: revert the branch's fix and feature commits in one PR; the replacement record, resolver, eligibility check, prepare-resume CLI and start_group guard are additive and share one rollback surface.
