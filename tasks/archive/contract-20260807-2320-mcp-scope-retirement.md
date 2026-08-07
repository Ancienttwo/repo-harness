> **Archived**: 2026-08-07 23:20
> **Related Plan**: plans/archive/plan-20260807-1606-mcp-scope-retirement.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260807-2320

# Task Contract: mcp-scope-retirement

> **Status**: Fulfilled
> **Plan**: plans/plan-20260807-1606-mcp-scope-retirement.md
> **Task Profile**: migration
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-07 16:06
> **Review File**: `tasks/reviews/20260807-1606-mcp-scope-retirement.review.md`
> **Notes File**: `tasks/notes/20260807-1606-mcp-scope-retirement.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

MCP config/auth storage has two authorities (repo scope `<repo>/.repo-harness/`, user scope `~/.repo-harness/`). The repo scope is a disowned historical layer: the shipped guide recommends against it while the CLI still defaults to it, the coding profile hard-rejects it in three places for the same security rationale that applies to all credentials, and the user-level registry already owns per-repo authorization. Dual authority violates one-source-of-truth, and every new storage file re-opens the ignore-discipline hole Slice 1 (#164) closed. Skipped, the fail-open default keeps writing credentials into git working trees.

## Goal

Repo scope fully retired, single user-level storage authority. `McpConfigScope` type and all branches gone; `--scope` flags gone; MCP commands fail closed with a clear error naming `repo-harness mcp migrate-scope` when legacy `<repo>/.repo-harness/mcp.local.json` exists; `mcp migrate-scope` migrates non-secret config fields, regenerates bearer/passphrase, deletes `mcp.oauth-tokens.json` (forcing one ChatGPT re-authorization), removes legacy files, and prints a rotated/invalidated inventory; re-run on a migrated repo reports nothing to do. `engine.ts` dead `ignoreLines` block removed. Guide text and `docs/repo-harness-chatgpt-mcp-setup.md` describe only the user-level shape. Existing user-scope installs untouched.

## Scope

- In scope: `src/cli/mcp/` scope branches and migration gate/command; `src/cli/commands/mcp.ts` CLI wiring; `src/cli/chatgpt-browser/engine.ts` dead `ignoreLines` block; affected tests under `tests/cli/`; `docs/repo-harness-chatgpt-mcp-setup.md`; setup guide text.
- Out of scope: relocating `chatgpt-browser.local.json` (Slice 3); registry identity rework (`repoHarnessRepoIdFor`); any OAuth provider/TTL behavior change (#162 semantics frozen); silent read-through compatibility fallbacks (policy-forbidden).
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If any supported deployment shape cannot set `REPO_HARNESS_HOME` and has an unwritable `$HOME`, repo scope has an independent reason to exist and retirement is wrong. Cheapest proof point: the three home-resolution sites (`auth.ts`, `repo-registry.ts`, `coding-workspaces.ts`) all honor `REPO_HARNESS_HOME` — verified in the migration review. Second falsifier: if `migrate-scope` silently copies old bearer/passphrase/OAuth values instead of rotating, the security rationale collapses — the rotation tests are the guard.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260807-1606-mcp-scope-retirement.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260807-1606-mcp-scope-retirement.review.md`
- Notes file: `tasks/notes/20260807-1606-mcp-scope-retirement.notes.md`
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
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260807-1606-mcp-scope-retirement.contract.md
  - tasks/reviews/20260807-1606-mcp-scope-retirement.review.md
  - tasks/notes/20260807-1606-mcp-scope-retirement.notes.md
  - .ai/context/capabilities.json
  - docs/repo-harness-chatgpt-mcp-setup.md
  - src/cli/mcp/
  - src/cli/commands/mcp.ts
  - src/cli/chatgpt-browser/engine.ts
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
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260807-1606-mcp-scope-retirement.notes.md
  tests_pass:
    - path: tests/cli/mcp-setup.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
