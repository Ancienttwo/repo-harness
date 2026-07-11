> **Archived**: 2026-07-11 20:33
> **Related Plan**: plans/archive/plan-20260711-1401-mcp-rollout-cutover-v1.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260711-2033

# Task Contract: mcp-rollout-cutover-v1

> **Status**: Fulfilled
> **Plan**: plans/plan-20260711-1401-mcp-rollout-cutover-v1.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-11 14:01
> **Review File**: `tasks/reviews/20260711-1401-mcp-rollout-cutover-v1.review.md`
> **Notes File**: `tasks/notes/20260711-1401-mcp-rollout-cutover-v1.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The general-repository API is complete but temporary rollout flags still change
read visibility, write authorization, CodeGraph fallback behavior, and legacy
dispatch independently of registered repository state. Keeping those controls
creates dual authority and makes the public MCP schema deployment-dependent.

## Goal

Remove the six general-repository rollout controls and their temporary gate so
that an enabled workspace reader deterministically exposes the general repo API,
`accessMode` is the sole mutation authority, and guarded filesystem reads remain
available for visible unindexed content.

## Scope

- In scope:
  - Remove `McpPolicy.generalRepo`, its options/defaults, local-config schema,
    setup projection, server environment parsing, and static policy copies.
  - Publish general repository tools for an enabled workspace reader without a
    process rollout gate; keep mutation execution fail-closed on the registered
    repo `accessMode` and existing revision/path/ignore guards.
  - Remove the workspace `search_text` fallback and workflow-to-general-repo
    wrapper so those requests have one explicit implementation route.
  - Remove the temporary MCP rollout gate and its dedicated test, then update
    active MCP reference/setup/runbook documentation and focused regressions.
  - Record the design decision and verification in this plan, review, and notes.
- Out of scope:
  - B2 TypeScript adoption apply cutover, new MCP tools, auth/OAuth changes,
    repo-registration semantics, CodeGraph adapter/index changes, release
    publication, and historical evidence rewrites.
- Taste constraints: No aliases, semantic fallbacks, or replacement feature
  flags. Reuse the existing registry, path/ignore, and mutation authorities.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If removing the rollout policy exposes a mutation for a registered `read_only`
repo, or a visible unindexed read bypasses path/ignore checks, the cutover is
unsafe. Cheapest proof: focused MCP reader/tool tests with read-only and
unindexed fixtures before the full suite.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260711-1401-mcp-rollout-cutover-v1.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260711-1401-mcp-rollout-cutover-v1.review.md`
- Notes file: `tasks/notes/20260711-1401-mcp-rollout-cutover-v1.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/archive/
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260711-1401-mcp-rollout-cutover-v1.contract.md
  - tasks/reviews/20260711-1401-mcp-rollout-cutover-v1.review.md
  - tasks/notes/20260711-1401-mcp-rollout-cutover-v1.notes.md
  - src/cli/chatgpt-browser/file-policy.ts
  - src/cli/mcp/auth.ts
  - src/cli/mcp/general-repo-access.ts
  - src/cli/mcp/general-repo-access/authority.ts
  - src/cli/mcp/policy.ts
  - src/cli/mcp/reader-tools.ts
  - src/cli/mcp/server.ts
  - src/cli/mcp/setup.ts
  - src/cli/mcp/tools.ts
  - src/cli/mcp/types.ts
  - scripts/mcp-rollout-gate.ts
  - tests/cli/mcp-http.test.ts
  - tests/cli/mcp-stdio.test.ts
  - tests/cli/mcp.test.ts
  - tests/cli/mcp-policy.test.ts
  - tests/cli/mcp-reader-tools.test.ts
  - tests/cli/mcp-setup.test.ts
  - tests/cli/mcp-tools.test.ts
  - tests/mcp-rollout-gate.test.ts
  - docs/reference-configs/general-repo-mcp.md
  - docs/repo-harness-chatgpt-mcp-setup.md
  - deploy/runbooks/general-repo-mcp-codegraph.md
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260711-1401-mcp-rollout-cutover-v1.notes.md
  tests_pass:
    - path: tests/cli/mcp-policy.test.ts
    - path: tests/cli/mcp-reader-tools.test.ts
    - path: tests/cli/mcp-tools.test.ts
    - path: tests/cli/mcp-setup.test.ts
    - path: tests/cli/mcp-http.test.ts
  commands_succeed:
    - bun test tests/cli/mcp-policy.test.ts tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-tools.test.ts tests/cli/mcp-setup.test.ts tests/cli/mcp-http.test.ts
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: General repo tools are deterministic for an enabled
  reader; retired rollout fields and environment variables are absent from
  active runtime/config/doc/test surfaces.
- Edge cases: `read_only` repo mutations remain denied; visible unindexed text
  reads/searches succeed through guarded filesystem access; ignored and escaped
  paths remain denied.
- Regression risks: This is an intentional public MCP breaking change; callers
  must use `repo_id` for `search_text` and rely on registry `accessMode` rather
  than rollout switches.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
