# Task Contract: windows-protected-helper-platform-contract

> **Status**: Active
> **Plan**: plans/plan-20260820-2347-windows-protected-helper-platform-contract.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: workflow-engine-contract-assets
> **Last Updated**: 2026-08-20 23:47
> **Review File**: `tasks/reviews/20260820-2347-windows-protected-helper-platform-contract.review.md`
> **Notes File**: `tasks/notes/20260820-2347-windows-protected-helper-platform-contract.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The Windows installer and README advertise a native entrypoint, but every protected helper resolves `/bin/bash` before dispatch. That blocks acceptance, merge, contract-worktree, and ship authority on Windows; trusting caller `PATH` as a quick repair would instead weaken the protected execution boundary.

## Goal

Install one explicit host-owned Git-for-Windows runtime contract and make all four protected helpers consume it with the same fail-closed source, binary, environment, and process-supervision guarantees as macOS/Linux.

## Scope

- In scope: protected-helper platform runtime resolution; install/update contract projection; sanitized Windows child PATH/TMP; trusted Windows process-tree termination; protected TS-helper Git pinning; packaged mirrors; Windows CI smoke; docs.
- Out of scope: installing Git/jq/gh/WSL/Cygwin/MSYS2; PowerShell/TypeScript rewrites of shell helpers; caller-PATH runtime fallback; unrelated issue allegations.
- Taste constraints: one strict protocol-1 host contract; Git/Bash/POSIX tools must bind to one Git-for-Windows root; runtime relocation fails closed with an update instruction.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A GitHub `windows-latest` runner with its standard Git for Windows installation cannot execute the four protected helper smoke commands after install-time contract projection, or the runtime can be redirected by caller `PATH`/binary overrides. The cheapest proof is the focused Windows matrix test.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/cli/runtime/helper-runner.ts:28-33,391-402` pins protected dispatch to POSIX-only `/bin/bash` and `/usr/bin|/bin/git`, builds a colon-delimited Unix PATH/TMP contract, and provides no Windows host authority for the Git-for-Windows POSIX toolchain.
- repro: on Windows run `repo-harness run contract-worktree status`; protected resolution throws `required system executable is unavailable: bash` before the packaged helper starts.
- regression_guard: `tests/unit/windows-protected-helper-platform-contract.test.ts`
- pre_fix_failure_artifact: `.ai/harness/runs/windows-protected-helper-platform-contract/pre-fix-regression.txt`

## Workflow Inventory

- Source plan: `plans/plan-20260820-2347-windows-protected-helper-platform-contract.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-2347-windows-protected-helper-platform-contract.review.md`
- Notes file: `tasks/notes/20260820-2347-windows-protected-helper-platform-contract.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"focused-regression","kind":"deterministic_test","paths":["*"]},{"id":"windows-runtime-smoke","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - .github/workflows/ci.yml
  - README.md
  - README.zh-CN.md
  - assets/templates/helpers/acceptance-receipt.ts
  - assets/templates/helpers/contract-worktree.sh
  - assets/templates/helpers/merge-gate.ts
  - assets/templates/helpers/ship-worktrees.sh
  - assets/reference-configs/external-tooling.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - docs/reference-configs/external-tooling.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260820-2347-windows-protected-helper-platform-contract.contract.md
  - tasks/reviews/20260820-2347-windows-protected-helper-platform-contract.review.md
  - tasks/notes/20260820-2347-windows-protected-helper-platform-contract.notes.md
  - scripts/acceptance-receipt.ts
  - scripts/contract-worktree.sh
  - scripts/merge-gate.ts
  - scripts/ship-worktrees.sh
  - src/
  - tests/
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
    - src/cli/runtime/protected-helper-platform.ts
    - tests/unit/windows-protected-helper-platform-contract.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/windows-protected-helper-platform-contract/pre-fix-regression.txt
    - tasks/notes/20260820-2347-windows-protected-helper-platform-contract.notes.md
  tests_pass:
    - path: tests/unit/windows-protected-helper-platform-contract.test.ts
  commands_succeed:
    - bun test tests/unit/windows-protected-helper-platform-contract.test.ts tests/cli/run.test.ts tests/process-runner.test.ts --timeout 60000
    - bun run check:type
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: native Windows protected dispatch is installed explicitly and consumes only pinned Git-for-Windows/system tool paths.
- Edge cases: absent/malformed/stale/cross-root/symlinked contract, caller env injection, path delimiter, native temp, process-supervisor taskkill lookup.
- Regression risks: POSIX protected-helper authority must remain unchanged; source/template helper mirrors must remain exact.

## Rollback Point

- Commit / checkpoint: contract branch publication commit.
- Revert strategy: revert runtime-contract, installer, runner/supervisor, helper mirror, CI, tests, and docs together; the added host config field becomes inert.
