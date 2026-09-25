# Task Contract: architecture-accept-recovery

> **Status**: Active
> **Plan**: plans/plan-20260924-0402-architecture-accept-recovery.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-24 04:02
> **Review File**: `tasks/reviews/20260924-0402-architecture-accept-recovery.review.md`
> **Notes File**: `tasks/notes/20260924-0402-architecture-accept-recovery.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

AKN-03c is blocked after a committed provider apply and a failed consumer refresh. Retrying acceptance currently repeats apply and cannot finish the missing consumer receipt.

## Goal

Provide explicit supported recovery of the exact interrupted acceptance, retaining provider-owned committed evidence and completing refresh and receipt publication once.

## Scope

- In scope: exact-candidate recovery in acceptance/provider/CLI, focused regression guards and owning documentation; approved 0.5.11 dependency integration across both consumers, generated policy defaults and existing version-bound fixtures. The user also approved repo-harness 0.19.3 release metadata, package verification and npm publication using Web Auth. Owner-approved (2026-09-25) third release-gate repair: installed-copy tree hashing through the single TS authority and `.codegraph/` rsync exclusion. Codex acceptance review P1 (refresh-owned mutation strands recovery) is recorded as a known fail-closed limitation; the fix requires an archctx provider recovery proof and is deferred.
- Out of scope: global runtime installation, provider internal journal edits, H0 admission, manual receipt creation, unrelated AKN-03c changes and new approval grants.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Recovery repeats semantic apply, accepts another approval or changed snapshot, discards original refresh signals, or writes a receipt without committed provider proof.

## Root Cause Evidence

- root_cause: src/effects/architecture/projection-acceptance.ts:175-178 runs provider apply again when the acceptance receipt is absent after a committed apply and failed refresh, because the committed result is not durably recorded before refresh at line 188.
- repro: bun test tests/architecture-projection-provider.test.ts --timeout 60000
- regression_guard: tests/architecture-projection-provider.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/accept-recovery/pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260924-0402-architecture-accept-recovery.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260924-0402-architecture-accept-recovery.review.md`
- Notes file: `tasks/notes/20260924-0402-architecture-accept-recovery.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "interrupted-acceptance", "kind": "deterministic_test", "paths": ["*"]}, {"id": "release-gate", "kind": "runtime_readback", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - scripts/sync-codex-installed-copies.sh
  - scripts/skill-surface-select.ts
  - src/cli/installer/install-profile.ts
  - tests/installed-copy-sync.test.ts
  - assets/skill-version.json
  - README.md
  - README.zh-CN.md
  - README.ja.md
  - README.fr.md
  - README.es.md
  - docs/CHANGELOG.md
  - deploy/release-checklists/260924-repo-harness-0.19.3.md
  - .ai/harness/policy.json
  - assets/templates/helpers/ensure-task-workflow.sh
  - scripts/ensure-task-workflow.sh
  - scripts/heartbeat-triage.sh
  - assets/templates/helpers/heartbeat-triage.sh
  - tests/harness-benchmark-matrix.test.ts
  - scripts/lib/project-init-lib.sh
  - scripts/axr5-archctx-clean-room.ts
  - scripts/axr6-stop-host-cycle.ts
  - scripts/axr7-consumer-e2e.ts
  - tests/cli/global-runtime-init.test.ts
  - tests/architecture-projection-late-write-receipt.test.ts
  - tests/state/operation-readiness.test.ts
  - tests/unit/refactor-provider-contract.test.ts
  - tests/unit/refactor-recommendations.test.ts
  - tests/unit/refactor-shadow-entry.test.ts
  - tests/unit/refactor-policy.test.ts
  - tests/unit/refactor-discovery-proposal-authoring.test.ts
  - tests/architecture-projection-continuation.test.ts
  - tests/stop-handler-restamp-publication.test.ts
  - tests/refactor-archctx-provider.test.ts
  - tests/architecture-projection-orchestration.test.ts
  - src/core/refactor/policy.ts
  - bun.lock
  - package.json
  - src/core/architecture/projection.ts
  - src/effects/architecture/archctx-provider.ts
  - src/effects/architecture/projection-acceptance.ts
  - src/cli/commands/architecture-projection.ts
  - tests/unit/architecture-projection-acceptance.test.ts
  - tests/architecture-projection-provider.test.ts
  - tests/architecture-projection-e2e.test.ts
  - docs/reference-configs/external-tooling.md
  - assets/reference-configs/external-tooling.md
  - plans/plan-20260924-0402-architecture-accept-recovery.md
  - tasks/contracts/20260924-0402-architecture-accept-recovery.contract.md
  - tasks/reviews/20260924-0402-architecture-accept-recovery.review.md
  - tasks/notes/20260924-0402-architecture-accept-recovery.notes.md
  - .ai/harness/runs/accept-recovery/
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

```yaml
exit_criteria:
  files_exist:
    - tests/unit/architecture-projection-acceptance.test.ts
  artifacts_exist:
    - .ai/harness/runs/accept-recovery/pre-fix.log
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "release-full",
      "kind": "command",
      "command": "BUN_TEST_ISOLATE_FILES=1 BUN_TEST_JOBS=2 BUN_TEST_MAX_CONCURRENCY=1 REPO_HARNESS_DIFF_BASE=6a0977924c4b9d23f503fe9e67a734b77e1b8f77 REPO_HARNESS_DIFF_MODE=merge-base bun run check:release",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "necessity": "The user-approved 0.19.3 publication requires the existing full release gate: all focused recovery and version fixtures, root integrity, real-install/Herdr cases and clean tarball smoke. This replaces separate duplicate component runs.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "release-version",
      "kind": "command",
      "command": "bun scripts/check-skill-version.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Check package, skill and template release identity through the existing version guard.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "recovery-regression-guard",
      "kind": "package_test",
      "path": "tests/architecture-projection-provider.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Bugfix Root Cause Evidence names this file as regression_guard; the bugfix gate requires it as its own package_test check.",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

- Missing invariant: committed apply plus failed refresh must recover using the same approval without replaying semantic writes. Existing acceptance tests only cover retries after a consumer receipt exists.
- Extend existing acceptance tests at the lowest provider boundary; provider/e2e cases cover actual public CLI protocol. No new test files; the subsequently approved 0.19.3 release requires the full release gate in Verification Plan.
- Root integrity checks plus explicit root-required init dry-run are retained. The init dry-run is an evidence producer outside canonical command checks as required by Verification Execution Boundary.
- The release gate is estimated at 20–40 minutes and includes isolated installed-runtime tests. Shared live daemon mutation is outside scope.
- Diagnosis agent may update the four Root Cause Evidence fields after producing the pre-fix artifact; production edits wait for confirmed root cause and protocol freeze.
- Canonical acceptance remains required before ship; no automatic human waiver.

## Rollback Point

- Base: 80fb3339fc2c96355d9696663d528e3485b91a97.
- Revert only isolated source changes; retain original provider/consumer evidence and original AKN worktree.
