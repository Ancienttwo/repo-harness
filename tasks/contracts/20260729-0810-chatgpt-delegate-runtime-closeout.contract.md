# Task Contract: chatgpt-delegate-runtime-closeout

> **Status**: Active
> **Plan**: plans/plan-20260729-0810-chatgpt-delegate-runtime-closeout.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-29 08:11
> **Review File**: `tasks/reviews/20260729-0810-chatgpt-delegate-runtime-closeout.review.md`
> **Notes File**: `tasks/notes/20260729-0810-chatgpt-delegate-runtime-closeout.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

PR #135 currently claims a fail-closed delegate workflow, but independent acceptance proved that an allowed staged file containing a synthetic token reaches the generated `prompt.md`, and that the canonical delegate skill is absent from both host discovery roots. Shipping this state would expose repository secrets to an external browser and would still require a hand-written prompt to activate the workflow.

## Goal

Close both reproduced P1 gaps without creating a second protocol authority: add a required Gitleaks scan over the exact delegate PromptBundle before session/provider activity, and add an explicit owned projection of the canonical `repo-harness-chatgpt` package into Codex and Claude skill roots. Correct the PR evidence, rerun Canary B, and leave default install profiles unchanged.

## Scope

- In scope: ChatGPT browser egress scan and receipt; CLI plumbing; canonical skill source/projection lifecycle; tests; setup/delegate/browser-engine documentation; current plan/notes/review/todos/status evidence.
- Out of scope:
  - Oracle model/conversation metadata projection.
  - Default install-profile membership or MCP bridge behavior changes.
  - Automatic Gitleaks installation, browser/provider fallbacks, deployment, database work, or unrelated cleanup.
- Taste constraints: one canonical skill byte source; explicit opt-in projection; exact egress scan; missing scanner, findings, unowned destinations, and malformed sources all fail closed.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If Gitleaks cannot scan stdin without persisting/exposing the payload, if the scan occurs after provider/session side effects, or if the host projection requires copied independent protocol prose, stop and redesign before implementation. Cheapest proof: a synthetic-token fixture must fail before `.ai/harness/chatgpt/sessions/` exists, while an explicit host install must resolve through `realpath` to the canonical package.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260729-0810-chatgpt-delegate-runtime-closeout.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260729-0810-chatgpt-delegate-runtime-closeout.review.md`
- Notes file: `tasks/notes/20260729-0810-chatgpt-delegate-runtime-closeout.notes.md`
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
  - assets/skills/repo-harness-chatgpt/
  - docs/repo-harness-chatgpt-browser-engine.md
  - docs/architecture/
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260729-0810-chatgpt-delegate-runtime-closeout.contract.md
  - tasks/reviews/20260729-0810-chatgpt-delegate-runtime-closeout.review.md
  - tasks/notes/20260729-0810-chatgpt-delegate-runtime-closeout.notes.md
  - .ai/context/capabilities.json
  - src/cli/chatgpt-browser/
  - src/cli/chatgpt-skill/
  - src/cli/commands/chatgpt.ts
  - src/cli/mcp/setup.ts
  - tests/cli/chatgpt-browser.test.ts
  - tests/cli/mcp-setup.test.ts
  - tests/skill-surface/chatgpt-package.test.ts
  # Inherited surface from the prior stacked package (20260729-0106
  # chatgpt-delegate-mode, already receipted external_pass and pushed at
  # efef17c9); the branch-vs-main diff includes it, this package does not
  # modify it further.
  - .gitignore
  - tasks/archive/contract-20260729-0201-chatgpt-delegate-mode.md
  - tasks/archive/notes-20260729-0201-chatgpt-delegate-mode.md
  - tasks/archive/review-20260729-0201-chatgpt-delegate-mode.md
  - tasks/archive/todo-20260729-0201-chatgpt-delegate-mode.md
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
    - src/cli/chatgpt-browser/secret-scan.ts
    - src/cli/chatgpt-skill/source.ts
    - src/cli/chatgpt-skill/installer.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260729-0810-chatgpt-delegate-runtime-closeout.notes.md
  tests_pass:
    - path: tests/cli/chatgpt-browser.test.ts
    - path: tests/cli/mcp-setup.test.ts
    - path: tests/skill-surface/chatgpt-package.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
  manual_checks:
    - "A synthetic token in an allowed staged source file is rejected before session creation or provider launch, and neither stdout nor stderr contains the token"
    - "Explicit install makes repo-harness-chatgpt discoverable in both disposable Codex and Claude host roots by symlink to the canonical package; idempotent reinstall is a no-op and uninstall refuses unowned paths"
    - "Default minimal and full profile selectors still do not install repo-harness-chatgpt"
    - "Corrected Codex built-in-browser Canary B records the selected Pro label, conversation URL, exact trailing sentinel, and attachment result"
```

## Acceptance Notes (Human Review)

- Functional behavior: only a scan-passed delegate bundle may be persisted or submitted; explicit setup exposes one canonical skill to requested hosts.
- Edge cases: missing/incompatible scanner, scanner finding/error, repo-local Gitleaks config, synthetic allow comments, stale/unowned skill destinations, and idempotent install/uninstall.
- Regression risks: silently broadening ordinary consult behavior, loading repo-controlled scanner configuration, overwriting user skills, or reintroducing copied protocol authorities.

## Rollback Point

- Commit / checkpoint: PR #135 head `efef17c9ca263957217cbe1b044c8458fcc9d8d9` before the correction slice.
- Revert strategy: revert the single correction commit; no schema, default-profile, provider-state, or deployment migration is involved.
