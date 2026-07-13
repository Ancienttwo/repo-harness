# Task Contract: codex-native-role-model-override

> **Status**: Blocked
> **Plan**: plans/plan-20260711-0219-codex-native-role-model-override.md
> **Task Profile**: bugfix
> **Owner**: codex
> **Capability ID**: workflow-engine-delegation
> **Last Updated**: 2026-07-11 19:49 +0800
> **Review File**: `tasks/reviews/20260711-0219-codex-native-role-model-override.review.md`
> **Notes File**: `tasks/notes/20260711-0219-codex-native-role-model-override.notes.md`

## Why

The desired GPT-5.6 native role split is not expressible through the active MultiAgentV2 tool schema. The flat reserved `spawn_agent` call uses task identity only and does not expose role/model metadata, so children inherit the root model.

## Goal

Keep Codex native subagent orchestration while making `explorer`, `worker`, and `reviewer` resolve deterministic role-specific model configurations: Terra/medium, Terra/xhigh, and Sol/high respectively. Leave the main Sol/xhigh default and Claude fleet semantics unchanged.

## Scope

- In scope:
  - Codex agent source files and host installation output.
  - Host-specific fleet name handling in installer and tooling inspection.
  - Advisor role-name parity and mirrored hook/helper assets.
  - Generated/default policy and operator documentation that encode the old shared-name assumption.
  - Focused regression coverage, full required checks, installed-host validation, and one native-subagent canary.
- Out of scope:
  - Claude agent renames or behavior changes.
  - Delegation eligibility/trigger changes.
  - Non-native runners, recursive spawning, model provider/auth changes, telemetry, or dashboard APIs.
  - Compatibility aliases for obsolete Codex fleet names.
- Taste constraints: preserve native Codex primitives; delete obsolete Codex role files instead of adding an alias or second matching layer.

## Stop Conditions

- Stop if Claude fleet output would need to change semantically.
- Stop if native Codex does not honor same-name custom-agent precedence in a current local canary.
- Stop if a required change falls outside Allowed Paths; widen this contract before editing.
- Stop if Goal, Scope, or Exit Criteria become contradictory.

## Falsifier

After installing same-name native role files, a fresh Codex native-subagent run still records only Sol for an explicit `explorer` or `worker` task and the spawned agent state does not identify the requested role.

**Triggered.** Plain-file, registered-role, and registered-role-plus-`use_agent_identity` canaries all produced `agent_role:null` and inherited Sol. Explicit `hide_spawn_agent_metadata=false` produced the GPT-5.6 reserved-schema HTTP 400 during prewarm. A fresh explicit-name canary on the latest published `codex-cli 0.144.1` reproduced the same result: `/root/explorer`, `agent_role:null`, and inherited Sol/high.

## Root Cause Evidence

- root_cause: GPT-5.6 resolves `multi_agent_version: "v2"`; the reserved flat tool schema omits `agent_type/model/reasoning_effort`. Its `task_name` becomes an agent path, not an `agents/*.toml` lookup key.
- disproved_hypothesis: same-name TOML files and `[agents.worker] config_file=...` do not bind V2 `task_name` to a role.
- local_evidence: `.ai/harness/checks/codex-native-role-model-override.canary.jsonl`, `.identity-canary.jsonl`, `.registry-canary.jsonl`, `.identity-registry-canary.jsonl`, and `.metadata-canary.stderr.txt`.
- latest_release_evidence: `.ai/harness/checks/codex-native-role-model-override.0.144.1-canary.md` records the current official-docs-vs-runtime mismatch.
- upstream_evidence: oh-my-openagent v4.16.3 Teammode explicitly forbids `agent_type/model/reasoning_effort` on V2 spawn and treats `task_name` only as `/root/<task_name>` identity.

## Workflow Inventory

- Source plan: `plans/plan-20260711-0219-codex-native-role-model-override.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260711-0219-codex-native-role-model-override.review.md`
- Notes file: `tasks/notes/20260711-0219-codex-native-role-model-override.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260711-0219-codex-native-role-model-override.md
  - tasks/contracts/20260711-0219-codex-native-role-model-override.contract.md
  - tasks/reviews/20260711-0219-codex-native-role-model-override.review.md
  - tasks/notes/20260711-0219-codex-native-role-model-override.notes.md
  - tasks/current.md
  - .ai/harness/checks/
  - .ai/harness/handoff/
  - .ai/harness/policy.json
  - .ai/hooks/codex-delegation-advisor.sh
  - .codex/agents/
  - assets/hooks/codex-delegation-advisor.sh
  - assets/codex-agents/
  - assets/reference-configs/external-tooling.md
  - assets/templates/helpers/
  - docs/reference-configs/external-tooling.md
  - scripts/check-agent-tooling.sh
  - scripts/ensure-task-workflow.sh
  - scripts/install-agent-fleet.sh
  - scripts/lib/project-init-lib.sh
  - tests/
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
      - codex-subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

The goal criteria below are intentionally unmet because the falsifier and stop condition triggered. This contract must not be marked fulfilled.

```yaml
exit_criteria:
  files_exist:
    - .codex/agents/explorer.toml
    - .codex/agents/worker.toml
    - .codex/agents/reviewer.toml
  files_contain:
    - path: .codex/agents/explorer.toml
      pattern: 'model = "gpt-5.6-terra"'
    - path: .codex/agents/worker.toml
      pattern: 'model_reasoning_effort = "xhigh"'
    - path: .codex/agents/reviewer.toml
      pattern: 'model = "gpt-5.6-sol"'
  artifacts_exist:
    - .ai/harness/checks/codex-native-role-model-override.pre-fix.txt
    - .ai/harness/checks/codex-native-role-model-override.canary.jsonl
    - .ai/harness/checks/codex-native-role-model-override.strict-config.txt
    - tasks/notes/20260711-0219-codex-native-role-model-override.notes.md
  tests_pass:
    - path: tests/install-agent-fleet.test.ts
    - path: tests/check-agent-tooling.test.ts
  commands_succeed:
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
    - bash scripts/check-agent-tooling.sh --host both --strict-readiness
  qa_scores:
    - dimension: functionality
      min: 8
    - dimension: code_quality
      min: 8
  manual_checks:
    - "Fresh local Codex session resolves the native role files; any unrelated user-level strict-config blocker is recorded separately"
    - "Native-subagent canary records the requested explorer/worker role and Terra usage, or the review fails closed"
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: not achieved; native V2 children still inherit the root Sol configuration.
- Rollback result: all candidate product changes were removed and the prior local managed fleet was restored.
- Residual risk: presenting TOML installation as a V2 routing fix would create false confidence and repeat the original all-Sol usage symptom.

## Rollback Point

- Commit / checkpoint: base `e020e0126460c78a19e9de8201322afe34c51980`
- Revert strategy: revert the branch commit and rerun the prior released installer.
