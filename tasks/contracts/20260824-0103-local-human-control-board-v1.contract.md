# Task Contract: local-human-control-board-v1

> **Status**: Fulfilled
> **Plan**: plans/plan-20260824-0103-local-human-control-board-v1.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-24 01:03
> **Review File**: `tasks/reviews/20260824-0103-local-human-control-board-v1.review.md`
> **Notes File**: `tasks/notes/20260824-0103-local-human-control-board-v1.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The Fleet read model is already the deterministic cross-repository authority,
but human operators still have to read JSON or coordinate multiple terminals.
The first browser surface must prove that Fleet facts can cross a localhost
HTTP boundary without leaking absolute paths or creating a second task/status
authority. If this slice ships incorrectly, the UI can misstate execution or
merge readiness, hide degraded authority, or make a future remote deployment
expose local filesystem details.

## Goal

Ship a reviewable localhost-only, read-only Human Control Board. The installed
`repo-harness operator serve` command must serve a versioned browser-safe Fleet
snapshot and a packaged React UI that renders summary, Attention Inbox, the
five canonical columns, task details, all authoritative failure states, and
responsive desktop/mobile layouts defined by
`docs/design/DESIGN-local-human-control-board-v1.md`.

## Scope

- In scope: a pure `FleetBoardSnapshotV1` to `OperatorFleetSnapshotV1`
  projection; loopback operator HTTP server; `/healthz` and one read-only Fleet
  API; React/Vite UI; exact `repo-harness-page@ffe3ff1...` visual tokens;
  manual single-flight refresh; package/prepack integration; focused, browser,
  package, and repository verification.
- Out of scope:
  - mutation/action routes, Agent spawning, plan approval, provider merge, Cloudflare, auth/RBAC, remote MCP changes, live push, background daemon, database/cache, offline support.
- Taste constraints: warm-paper operator console using ink, paper and carrot
  tokens from the confirmed reference. Do not copy the marketing hero, mascot,
  CTA, landing section rhythm, or uniform card-wall composition. Use one CSS
  strategy, restrained radii, 40px controls, visible focus and no bounce.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If `FleetBoardSnapshotV1` cannot support the required summary, five columns,
attention list, task drawer and failure states without client-side domain
inference, this thin read-only direction is wrong. Cheapest proof: render a
typed fixture covering every column, attention owner, null classification,
repo-local degraded row and changed-during-read state before connecting the
server. If an authoritative field is absent, stop and revise the upstream
contract instead of deriving it from prose or branch names.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260824-0103-local-human-control-board-v1.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260824-0103-local-human-control-board-v1.review.md`
- Notes file: `tasks/notes/20260824-0103-local-human-control-board-v1.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"operator-contract-and-server-tests","kind":"deterministic_test","paths":["src/cli/commands/operator.ts","src/core/operator/fleet-snapshot.ts","src/effects/operator/server.ts","src/operator-web/App.tsx","src/operator-web/types.ts"]},{"id":"operator-browser-acceptance","kind":"runtime_readback","paths":["src/operator-web/App.tsx","src/operator-web/types.ts"]},{"id":"package-runtime-smoke","kind":"runtime_readback","paths":["package.json","vite.operator.config.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - package.json
  - bun.lock
  - tsconfig.json
  - vite.operator.config.ts
  - README.md
  - scripts/check-tarball-install-smoke.sh
  - docs/design/DESIGN-local-human-control-board-v1.md
  - docs/architecture/
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/workstreams/
  - tasks/contracts/20260824-0103-local-human-control-board-v1.contract.md
  - tasks/reviews/20260824-0103-local-human-control-board-v1.review.md
  - tasks/notes/20260824-0103-local-human-control-board-v1.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
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
    - docs/design/DESIGN-local-human-control-board-v1.md
    - src/core/operator/fleet-snapshot.ts
    - src/effects/operator/server.ts
    - src/cli/commands/operator.ts
    - src/operator-web/main.tsx
    - vite.operator.config.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260824-0103-local-human-control-board-v1.notes.md
  tests_pass:
    - path: tests/unit/operator-fleet-snapshot.test.ts
    - path: tests/cli/operator-serve.test.ts
    - path: tests/operator-web/operator-ui.test.tsx
    - path: tests/operator-web/operator-interactions.test.tsx
  commands_succeed:
    - bun run check:type
    - bun run build:operator-web
    - bash scripts/check-tarball-install-smoke.sh
    - bun test tests/effects/fleet-board.test.ts --timeout 60000
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: `UX-local-human-control-board-v1-P1` proves the
  authoritative snapshot reaches the five-column UI and task drawer unchanged.
- Edge cases: `UX-local-human-control-board-v1-N1` proves absolute paths and
  mutation controls remain absent; `UX-local-human-control-board-v1-F1` proves
  whole-authority failures remain visible and are never replaced by an empty
  success state.
- Regression risks: preserve Fleet provider concurrency/deadline behavior,
  installed-package asset resolution, MCP HTTP separation, keyboard/focus
  access, mobile overflow and reduced-motion behavior.

## Rollback Point

- Commit / checkpoint: `codex/local-human-control-board-v1@1e52070b` before
  operator code, dependencies, bundle and workflow artifacts.
- Revert strategy: abandon or revert this isolated branch as one unit. The
  slice has no persistent data migration, remote deployment or compatibility
  window.
