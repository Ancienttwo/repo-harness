# Task Contract: repo-harness-0-10-0-release-blockers

> **Status**: Active
> **Plan**: plans/plan-20260714-2318-repo-harness-0-10-0-release-blockers.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-14 23:18
> **Review File**: `tasks/reviews/20260714-2318-repo-harness-0-10-0-release-blockers.review.md`
> **Notes File**: `tasks/notes/20260714-2318-repo-harness-0-10-0-release-blockers.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The deep `v0.9.2..HEAD` release review found three P1 blockers and three bounded safety P2 findings in newly introduced update, install-profile, packaged Skill, and coding MCP surfaces. Shipping them would silently remove a user's selected runtime profile, grant write authority after a failed setup, ship broken Skill references, permit crafted install state to drive destructive deletion, expose unbounded HTTP/OAuth state, and advertise a PTY path the official Bun runtime cannot execute.

## Goal

Ship one frozen `0.10.0` commit whose update path preserves the recorded profile, packaged Skill references resolve inside the npm archive, failed coding setup cannot change access authority, destructive profile switching accepts only canonical managed surfaces, HTTP/OAuth state is bounded and direct-header spoof resistant, and the unshipped unreachable PTY surface is removed. Publish only after the final release gate, CI, npm/GitHub, and installed-runtime readbacks agree.

## Scope

- In scope: the six reviewed release blockers, their focused regressions, package/dependency cleanup, architecture/release documentation, and workflow/release evidence needed to publish `0.10.0`.
- Out of scope:
  - compatibility aliases/fallbacks, dual install-profile authority, heuristic semantic recovery, new proxy configuration knobs, broad MCP redesign, unrelated PR #75, and speculative refactors.
- Taste constraints: fail closed; no semantic fallback, compatibility alias, dual profile authority, or trusted-proxy heuristic.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a pre-fix regression does not reproduce the reported unsafe state on `ee571b85`, or if the proposed narrow fix requires a second source of truth, the direction is wrong. Cheapest proof: run the new focused test first on the unfixed tree and require a non-zero exit with the exact invariant violation.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/cli/index.ts:399` omits recorded profile authority from update, while `src/cli/commands/global-runtime.ts:610` defaults that destructive projection to `minimal`; the same release batch has analogous validate-after-persist and trust-before-validate ordering at the cited MCP/install boundaries.
- repro: seed a strict install under a disposable HOME, run ordinary `repo-harness update`, and observe strict-only routes removed; the other reviewed triggers are encoded in the same focused release-blocker regression suite.
- regression_guard: tests/cli/global-runtime-init.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/20260714-0.10.0-release-blockers-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260714-2318-repo-harness-0-10-0-release-blockers.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260714-2318-repo-harness-0-10-0-release-blockers.review.md`
- Notes file: `tasks/notes/20260714-2318-repo-harness-0-10-0-release-blockers.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and canonical `## External Acceptance Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/current.md
  - tasks/todos.md
  - tasks/archive/
  - tasks/contracts/20260714-2318-repo-harness-0-10-0-release-blockers.contract.md
  - tasks/reviews/20260714-2318-repo-harness-0-10-0-release-blockers.review.md
  - tasks/notes/20260714-2318-repo-harness-0-10-0-release-blockers.notes.md
  - docs/CHANGELOG.md
  - docs/architecture/
  - docs/reference-configs/install-profiles.md
  - docs/reference-configs/hook-operations.md
  - docs/reference-configs/chatgpt-coding-mcp.md
  - deploy/release-checklists/260714-repo-harness-0.10.0.md
  - README.md
  - SKILL.md
  - package.json
  - bun.lock
  - scripts/check-tarball-install-smoke.sh
  - src/cli/index.ts
  - src/cli/commands/global-runtime.ts
  - src/cli/installer/install-profile.ts
  - src/effects/repo-registry.ts
  - src/cli/mcp/setup.ts
  - src/cli/mcp/server.ts
  - src/cli/mcp/oauth.ts
  - src/cli/mcp/transports/http.ts
  - src/cli/mcp/process-sessions.ts
  - src/cli/mcp/coding-tools.ts
  - tests/cli/global-runtime-init.test.ts
  - tests/cli/status.test.ts
  - tests/install-profiles.test.ts
  - tests/cli/registry.test.ts
  - tests/cli/mcp-setup.test.ts
  - tests/cli/mcp-http.test.ts
  - tests/cli/mcp-process-sessions.test.ts
  - tests/cli/mcp-coding-tools.test.ts
  - tests/cli/docs.test.ts
  - tests/bootstrap-files.test.ts
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
  files_exist:
    - SKILL.md
    - deploy/release-checklists/260714-repo-harness-0.10.0.md
  artifacts_exist:
    - .ai/harness/runs/20260714-0.10.0-release-blockers-pre-fix.log
    - tasks/notes/20260714-2318-repo-harness-0-10-0-release-blockers.notes.md
  tests_pass:
    - path: tests/cli/global-runtime-init.test.ts
    - path: tests/cli/status.test.ts
    - path: tests/install-profiles.test.ts
    - path: tests/cli/mcp-setup.test.ts
    - path: tests/cli/mcp-http.test.ts
    - path: tests/cli/mcp-process-sessions.test.ts
    - path: tests/cli/mcp-coding-tools.test.ts
    - path: tests/cli/docs.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-tarball-install-smoke.sh
  qa_scores:
    - dimension: functionality
      min: 9
  manual_checks:
    - "Evaluator review file recommends pass"
    - "Installed update preserves the recorded strict and product-planning profiles"
    - "Failed coding setup leaves repo access mode and authorization revision unchanged"
    - "Packed root Skill resolves both on-demand docs through the installed CLI"
    - "Frozen HEAD passes one final bun run check:release and current GitHub CI"
    - "Fresh security and architecture review reports no P1 or P2 release blocker"
```

## Acceptance Notes (Human Review)

- Functional behavior: all six reported release boundaries fail closed and preserve their single source of truth.
- Edge cases: missing profile state defaults to minimal; malformed state, late setup failure, spoofed forwarded headers, and capacity exhaustion reject without unsafe mutation.
- Regression risks: install/update user-level writes, coding MCP authority, package contents, and HTTP/OAuth availability; each has a focused regression plus final packaged-runtime proof.

## Rollback Point

- Commit / checkpoint: one reviewed release-blocker commit on `codex/0.10.0-release-blockers`, then fast-forward merge to `main`.
- Revert strategy: revert before npm publish; after immutable publish, issue a patch release.
