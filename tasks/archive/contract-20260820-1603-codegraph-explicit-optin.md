> **Archived**: 2026-08-20 16:03
> **Related Plan**: plans/archive/plan-20260818-1636-codegraph-explicit-optin.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1603

# Task Contract: codegraph-explicit-optin

> **Status**: Fulfilled
> **Plan**: plans/plan-20260818-1636-codegraph-explicit-optin.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 16:36
> **Review File**: `tasks/reviews/20260818-1636-codegraph-explicit-optin.review.md`
> **Notes File**: `tasks/notes/20260818-1636-codegraph-explicit-optin.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`profileEnablesCodegraph` currently auto-enables codegraph for any downstream repo with >=2000 tracked files, contradicting the CLAUDE.md contract ("downstream repos keep the global MCP default unless local policy opts in") and the no-heuristic-fallback principle. If left, downstream installs silently gain a codegraph dependency nobody opted into.

## Goal

Codegraph enablement becomes purely explicit: `profileEnablesCodegraph` returns true only for `profile === 'full'` or `tooling.codegraph.enabled === true` in the target repo's `.ai/harness/policy.json`; otherwise false. Self-host repo keeps codegraph via an explicit `tooling.codegraph.enabled: true` in its own policy.json. Tests cover all three semantics; the one doc describing "conditional" enablement is reworded to explicit opt-in.

## Scope

- In scope: `src/cli/installer/install-profile.ts` (delete the `git ls-files` size branch and the then-dead `spawnSync` import), `.ai/harness/policy.json` (add `tooling.codegraph.enabled: true`), `tests/install-profiles.test.ts` (add opt-in->true and large-repo-no-opt-in->false coverage), `docs/reference-configs/install-profiles.md:94-95` (reword "Minimal keeps CodeGraph conditional").
- Out of scope: any other heuristic or installer behavior; user WIP files (`scripts/contract-worktree.sh`, `assets/templates/helpers/contract-worktree.sh`, `tasks/todos.md`, `docs/architecture/*`); no version bump; no release.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If some downstream generated-repo fixture or test depends on the size heuristic enabling codegraph (rg for `2_000`/`profileEnablesCodegraph` consumers beyond the two `src/cli/index.ts` call sites), the delete would break a real contract. Cheapest proof: `rg -n "profileEnablesCodegraph" src/ tests/` before editing.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260818-1636-codegraph-explicit-optin.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-1636-codegraph-explicit-optin.review.md`
- Notes file: `tasks/notes/20260818-1636-codegraph-explicit-optin.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

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
  - tasks/contracts/20260818-1636-codegraph-explicit-optin.contract.md
  - tasks/reviews/20260818-1636-codegraph-explicit-optin.review.md
  - tasks/notes/20260818-1636-codegraph-explicit-optin.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - docs/reference-configs/install-profiles.md
  - .ai/harness/policy.json
  - docs/CHANGELOG.md
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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260818-1636-codegraph-explicit-optin.notes.md
  tests_pass:
    - path: tests/install-profiles.test.ts
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
