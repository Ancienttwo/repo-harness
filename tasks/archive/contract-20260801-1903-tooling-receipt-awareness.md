> **Archived**: 2026-08-01 19:03
> **Related Plan**: plans/archive/plan-20260801-1255-tooling-receipt-awareness.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260801-1903

# Task Contract: tooling-receipt-awareness

> **Status**: Fulfilled
> **Plan**: plans/plan-20260801-1255-tooling-receipt-awareness.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: verification-evals-checks
> **Last Updated**: 2026-08-01 12:55
> **Review File**: `tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md`
> **Notes File**: `tasks/notes/20260801-1255-tooling-receipt-awareness.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`scripts/check-agent-tooling.sh --host both --check-updates` compares installed Claude agent
`.md` files against the packaged `agents/fleet/` source with zero awareness of the
`~/.repo-harness/agent-fleet-user-managed.json` receipt `install-agent-fleet.sh --accept-user-managed`
writes. An operator who intentionally accepted a customized `deep-reasoner.md`/`gatekeeper.md`
gets a permanent false-positive `drift` reading with no way to clear it short of reverting the
customization or re-running `--force`.

## Goal

`detectAgentFleetHost()` consults the receipt before classifying a byte difference as drift: a
well-formed receipt entry whose sha256 matches the file's current installed content reclassifies
that file as `user-managed` and excludes it from `drift_agents`. Every other case (no receipt,
malformed receipt, no entry for that path, hash mismatch) still resolves to `drift`, fail-closed.
The per-host rollup `update_status` becomes `up-to-date` once nothing is left in drift, and the
text output surfaces the exemption on its own line instead of absorbing it silently.

## Scope

- In scope: `scripts/check-agent-tooling.sh` (`loadAgentFleetUserManagedReceipt`, `sha256Buffer`,
  `detectAgentFleetHost` drift/synced/user-managed classification, `update_status` vocabulary,
  text-output line); its projected mirror `assets/templates/helpers/check-agent-tooling.sh` via
  `bun scripts/sync-helper-sources.ts --write`; characterization tests in
  `tests/check-agent-tooling.test.ts` for valid-receipt exemption, stale-hash-still-drift,
  malformed-receipt-fail-closed, and no-receipt-unchanged; this contract's plan/notes pair.
- Out of scope: `scripts/install-agent-fleet.sh` (receipt-writing side, untouched); any other
  helper; new config flags; a receipt migration or new `~/.repo-harness` write path;
  `docs/reference-configs/external-tooling.md` (flagged as stale in the notes file, not corrected
  here); push or PR.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a file whose receipt entry is stale (edited again after acceptance, or the receipt itself is
malformed) still reports `user-managed` instead of `drift`, the fail-closed contract is broken and
the direction is wrong. Cheapest proof point: the "keeps drift when a receipt entry's sha256 no
longer matches" and "fails closed on a malformed receipt" tests in
`tests/check-agent-tooling.test.ts` must both still report `drift`/`[]` for `user_managed_agents`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

## Workflow Inventory

- Source plan: `plans/plan-20260801-1255-tooling-receipt-awareness.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md`
- Notes file: `tasks/notes/20260801-1255-tooling-receipt-awareness.notes.md`
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
  - tasks/contracts/20260801-1255-tooling-receipt-awareness.contract.md
  - tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md
  - tasks/notes/20260801-1255-tooling-receipt-awareness.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - scripts/check-agent-tooling.sh
  - assets/templates/helpers/check-agent-tooling.sh
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
    - tasks/notes/20260801-1255-tooling-receipt-awareness.notes.md
  tests_pass:
    - path: tests/check-agent-tooling.test.ts
  commands_succeed:
    - bun test
    - bun scripts/sync-helper-sources.ts --check
    - bash scripts/check-task-sync.sh
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: `4089376b` (main at branch creation, branch `codex/tooling-receipt-awareness`)
- Revert strategy: revert the commit — the drift check returns to plain sha1-vs-packaged-source
  comparison with the receipt ignored (false positive returns, no worse than before this change).
