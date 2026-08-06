# Task Contract: issue-161-oauth-restart-regression

> **Status**: Active
> **Plan**: plans/plan-20260806-2319-issue-161-oauth-restart-regression.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-06 23:19
> **Review File**: `tasks/reviews/20260806-2319-issue-161-oauth-restart-regression.review.md`
> **Notes File**: `tasks/notes/20260806-2319-issue-161-oauth-restart-regression.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

GitHub issue #161 reported invalid_client / invalid_grant after a local OAuth server restart (in another tool). repo-harness answered that its MCP OAuth state survives restarts, but that claim is only backed by a throwaway runtime probe: `tests/cli/mcp-http.test.ts` covers client reload only, and `tests/cli/mcp-oauth.test.ts` tests are single-store. Without a committed regression test, a future change to `McpOAuthTokenStore.load()`/`flush()` or the refresh exchange could silently reintroduce the exact failure the issue asked about.

## Goal

`tests/cli/mcp-oauth.test.ts` contains one new test case, `dynamic client and refresh token survive server restart (issue #161)`, that fails if cross-restart DCR client lookup or refresh-token exchange breaks, and the full test suite stays green.

## Scope

- In scope: add exactly one test case inside the existing `mcp oauth provider` describe block in `tests/cli/mcp-oauth.test.ts`, matching existing style (mkdtempSync + try/finally rmSync, reuse `redirectRecorder()`). Scenario: store A registers a dynamic client and completes authorize + `exchangeAuthorizationCode` with `repo-harness offline_access` scopes; a fresh store B on the same path calls `load()`; assert `getClient` finds the client, `exchangeRefreshToken` with the old refresh token succeeds with rotated tokens, `verifyAccessToken` passes on the new access token, and reusing the old refresh token rejects with `InvalidGrantError`.
- Out of scope: production code changes, other test files, refactors of existing tests.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the new test passes even when `McpOAuthTokenStore.load()` is skipped on store B (i.e. it does not actually exercise the restart path), the test is worthless. Cheapest proof point: temporarily comment out `storeB.load()` locally and confirm the test fails.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260806-2319-issue-161-oauth-restart-regression.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260806-2319-issue-161-oauth-restart-regression.review.md`
- Notes file: `tasks/notes/20260806-2319-issue-161-oauth-restart-regression.notes.md`
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
  - tasks/contracts/20260806-2319-issue-161-oauth-restart-regression.contract.md
  - tasks/reviews/20260806-2319-issue-161-oauth-restart-regression.review.md
  - tasks/notes/20260806-2319-issue-161-oauth-restart-regression.notes.md
  - tests/cli/mcp-oauth.test.ts
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
    - tests/cli/mcp-oauth.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260806-2319-issue-161-oauth-restart-regression.notes.md
  tests_pass:
    - path: tests/cli/mcp-oauth.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: dbf0a397 (worktree base)
- Revert strategy: revert the single test addition in `tests/cli/mcp-oauth.test.ts`; no production code is touched.
