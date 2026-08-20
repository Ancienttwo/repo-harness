> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260818-0019-setup-plugins-empty-args.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1619

# Task Contract: setup-plugins-empty-args

> **Status**: Active
> **Plan**: plans/plan-20260818-0019-setup-plugins-empty-args.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 00:19
> **Review File**: `tasks/reviews/20260818-0019-setup-plugins-empty-args.review.md`
> **Notes File**: `tasks/notes/20260818-0019-setup-plugins-empty-args.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`scripts/setup-plugins.sh` crashes instead of installing whenever the forwarded
argument array ends up empty. Two call shapes reach it: no arguments at all,
which is the most natural way to invoke a setup script, and arguments consisting
entirely of retired options, where the caller believes they passed something and
still gets `unbound variable`.

This is the second instance of the defect class fixed in `09f9d8f7`
(`scripts/ship-worktrees.sh:806`). That fix's acceptance sweep checked every
`set -u` script in `scripts/` and identified this as the only other genuinely
reachable one.

## Goal

`scripts/setup-plugins.sh` forwards to `repo-harness install` (or the bun
fallback) with zero arguments instead of aborting, and tests that actually
execute the script lock both empty-args paths.

## Scope

- In scope: change `scripts/setup-plugins.sh:35` and `:39` to expand
  `${args[@]+"${args[@]}"}`; add execution tests to
  `tests/setup-plugins-structure.test.ts` covering no-args, retired-options-only,
  and a non-empty control, driven against a stub `repo-harness` placed on PATH.
- Out of scope: which options are retired and what they log, the exec targets,
  the bun fallback's `ROOT_DIR` resolution, and every other script the sweep
  cleared. Do not fix other scripts in this contract.
- Taste constraints: use the idiom already present at
  `scripts/ship-worktrees.sh:806`, `:1085`, and `:1105`. Do not introduce a
  different empty-array pattern, do not restructure the arg loop, and do not
  relax `set -euo pipefail`.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if a test would invoke the real `repo-harness install` or the real bun
  entrypoint. Every execution test must resolve a stub on PATH; nothing may be
  installed on the host.

## Falsifier

If the guarded expansion changes forwarding when `args` is non-empty — in
particular if an argument containing a space arrives as two arguments — the fix
is wrong regardless of the empty case passing. Cheapest proof:
`setup-plugins.sh --repo "/tmp/a b"` against the stub must forward exactly two
arguments (`--repo` and `/tmp/a b`), not three.

## Root Cause Evidence

- root_cause: scripts/setup-plugins.sh:35 (and the identical :39 bun fallback) expands `"${args[@]}"` under `set -euo pipefail`, and bash 3.2 (macOS `/bin/bash`, which the `#!/bin/bash` shebang selects) raises `unbound variable` for an empty array, so the script exits 1 before reaching exec whenever no argument survives the retired-option loop.
- repro: with a stub `repo-harness` on PATH, `bash scripts/setup-plugins.sh` prints `scripts/setup-plugins.sh: line 35: args[@]: unbound variable` and exits 1; `bash scripts/setup-plugins.sh --lsp ts` does the same after logging the retired option; `bash scripts/setup-plugins.sh --repo .` forwards normally and exits 0.
- regression_guard: tests/setup-plugins-structure.test.ts
- pre_fix_failure_artifact: tasks/notes/20260818-setup-plugins-empty-args.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260818-0019-setup-plugins-empty-args.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-0019-setup-plugins-empty-args.review.md`
- Notes file: `tasks/notes/20260818-0019-setup-plugins-empty-args.notes.md`
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
  - tasks/contracts/20260818-0019-setup-plugins-empty-args.contract.md
  - tasks/reviews/20260818-0019-setup-plugins-empty-args.review.md
  - tasks/notes/20260818-0019-setup-plugins-empty-args.notes.md
  - .ai/context/capabilities.json
  - tasks/notes/20260818-setup-plugins-empty-args.pre-fix.log
  - scripts/
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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260818-0019-setup-plugins-empty-args.notes.md
  tests_pass:
    - path: tests/setup-plugins-structure.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
