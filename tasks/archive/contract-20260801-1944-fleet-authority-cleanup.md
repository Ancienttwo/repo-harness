> **Archived**: 2026-08-01 19:44
> **Related Plan**: plans/archive/plan-20260801-1625-fleet-authority-cleanup.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260801-1944

# Task Contract: fleet-authority-cleanup

> **Status**: Fulfilled
> **Plan**: plans/plan-20260801-1625-fleet-authority-cleanup.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: workflow-engine-contract-assets
> **Last Updated**: 2026-08-01 16:25
> **Review File**: `tasks/reviews/20260801-1625-fleet-authority-cleanup.review.md`
> **Notes File**: `tasks/notes/20260801-1625-fleet-authority-cleanup.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Two authority defects are still open after #148. The `### Readiness` prose in
`assets/reference-configs/external-tooling.md` describes a drift check that no
longer exists, so an operator reading it will not know the
`--accept-user-managed` receipt can clear a false-positive `drift`. And
`.claude/agents/` carries a tracked second copy of the agent fleet that has
already gone stale against `agents/fleet/` — `.claude/agents/fast-worker.md`
still declares `model: sonnet` / `effort: max` where the authored source says
`opus` / `medium`. Left alone, that duplicate keeps answering questions about
fleet roles with retired facts, and `gatekeeper` stays pinned to the retired
`fable` family that no longer exists in the routing hierarchy.

## Goal

`agents/fleet/*.md` becomes the single authored authority for the fleet:
`gatekeeper` is respecced to `model: opus` / `effort: high` with a matching
`gpt-5.6-terra`/`xhigh` Codex projection, the tracked `.claude/agents/` duplicate
is deleted, and `.codex/agents/gatekeeper.toml` is regenerated so the installer
golden byte-identity assertion stays green with no assertion weakened. The
`### Readiness` prose describes the receipt-aware behavior actually shipped in
#148, the #148 review artifact lands, and three known-deferred goals get ledger
entries with tradeoff and revisit trigger.

## Scope

- In scope: `agents/fleet/gatekeeper.md` (frontmatter `model`/`effort` plus the
  description's leading model phrase; body untouched);
  `scripts/install-agent-fleet.sh` (`AGENT_TARGET_OVERRIDES` gains a
  `gatekeeper` entry) and its mirror `assets/templates/helpers/install-agent-fleet.sh`
  via `bun scripts/sync-helper-sources.ts --write`; regeneration of the single
  golden `.codex/agents/gatekeeper.toml`; deletion of the seven tracked
  `.claude/agents/*.md`; the `### Readiness` section and the fleet model-mapping
  prose in `assets/reference-configs/external-tooling.md` plus its
  `docs/reference-configs/` projection via `bun scripts/sync-reference-configs.ts --write`;
  roster/model assertion alignment in `tests/bootstrap-files.test.ts` and
  `tests/install-agent-fleet.test.ts`; three new rows in `tasks/todos.md`;
  committing `tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md`
  unchanged; this contract's plan/notes pair.
- Out of scope: deleting or relocating `.codex/agents/` (it is the installer
  golden, not a duplicate — `tests/install-agent-fleet.test.ts:10` binds
  `GOLDEN_CODEX_DIR` to it and asserts byte-identity; moving that authority is a
  separate architecture decision); the `.gitignore` `!.codex/agents/` carve-out;
  every `~/.claude` / `~/.codex` HOME target in `.ai/harness/policy.json`,
  `scripts/lib/project-init-lib.sh`, and the `ensure-task-workflow.sh` pair
  (product surfaces governing downstream generation); the six non-gatekeeper
  goldens; `scripts/verify-sprint.sh`, `scripts/verify-contract.sh`,
  `scripts/run-bounded-verifier.sh`; archiving
  `plans/plan-20260801-1255-tooling-receipt-awareness.md` or its artifacts; any
  write under `$HOME`; push, PR, publish.
- Taste constraints: fleet documentation names model families and effort tiers
  only, never a specific Claude version number. <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if regenerating `.codex/agents/gatekeeper.toml` produces a diff in any of
  the other six goldens.

## Falsifier

If deleting `.claude/agents/` changes any downstream generation behavior, the
"tracked duplicate, not a product surface" premise is wrong and the direction is
bad. Cheapest proof point: `bun src/cli/index.ts init --repo . --dry-run` and
`bun test tests/install-profiles.test.ts tests/create-project-dirs.runtime.test.ts`
must be unaffected, because every surviving reference to those paths is either a
`~/`-prefixed HOME target or a test-local fixture directory.

Second falsifier: if the gatekeeper respec silently weakened the golden contract,
`tests/install-agent-fleet.test.ts`'s `expect(installedCodex).toBe(golden)` would
have had to be edited. It must remain byte-identity.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

## Workflow Inventory

- Source plan: `plans/plan-20260801-1625-fleet-authority-cleanup.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260801-1625-fleet-authority-cleanup.review.md`
- Notes file: `tasks/notes/20260801-1625-fleet-authority-cleanup.notes.md`
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
  - tasks/contracts/20260801-1625-fleet-authority-cleanup.contract.md
  - tasks/reviews/
  - tasks/notes/20260801-1625-fleet-authority-cleanup.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - .claude/agents/
  - .codex/agents/
  - agents/fleet/
  - scripts/install-agent-fleet.sh
  - assets/templates/helpers/install-agent-fleet.sh
  - assets/reference-configs/external-tooling.md
  - docs/reference-configs/external-tooling.md
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
    - agents/fleet/gatekeeper.md
    - .codex/agents/gatekeeper.toml
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260801-1625-fleet-authority-cleanup.notes.md
  tests_pass:
    - path: tests/install-agent-fleet.test.ts
    - path: tests/bootstrap-files.test.ts
  commands_succeed:
    - bun test
    - bun scripts/sync-helper-sources.ts --check
    - bun scripts/sync-reference-configs.ts --check
    - bash scripts/check-task-sync.sh
    - bash scripts/check-architecture-sync.sh
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: `e5498b86` (main at branch creation, branch `codex/receipt-awareness-closeout`)
- Revert strategy: revert the two commits — `.claude/agents/` returns as a tracked
  duplicate, `gatekeeper` returns to the `fable`/`xhigh` spec with its golden
  regenerated back, and the `### Readiness` prose returns to its pre-#148
  description. No data migration or external state is involved.
