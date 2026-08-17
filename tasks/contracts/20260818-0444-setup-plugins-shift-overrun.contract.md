# Task Contract: setup-plugins-shift-overrun

> **Status**: Active
> **Plan**: plans/plan-20260818-0444-setup-plugins-shift-overrun.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 04:44
> **Review File**: `tasks/reviews/20260818-0444-setup-plugins-shift-overrun.review.md`
> **Notes File**: `tasks/notes/20260818-0444-setup-plugins-shift-overrun.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`scripts/setup-plugins.sh` exits 1 without installing whenever a retired
two-token option lands in final position. It prints a reassuring "ignored" line
first, so the failure looks like a successful no-op that then died for unstated
reasons. In the `--repo . --lsp` case the user supplied a valid argument that
never reaches the installer.

This is harder to diagnose than the empty-array defect fixed in `c121a7ed`:
that one named `unbound variable` and a line number, this one is silent.

The two are independent. This failure fires inside the parse loop, strictly
before the expansion sites the earlier fix guarded, so neither masks the other —
`--hooks` exited 1 identically before and after `c121a7ed`.

## Goal

`scripts/setup-plugins.sh` forwards to the installer when `--hooks`, `--lsp`, or
`--project-type` is the final argument, and execution tests lock all three
positions plus the `:39` bun-fallback branch.

## Scope

- In scope: change `scripts/setup-plugins.sh:21` and `:25` to
  `shift $(( $# >= 2 ? 2 : 1 ))`; add execution tests for all three options in
  final position plus a control proving two-token forms still consume both
  tokens; add a bun-fallback test that places a stub `bun` on PATH with
  `repo-harness` unresolvable.
- Out of scope: which options are retired and what they log (messages stay
  verbatim), the empty-array guards at `:35`/`:39` that landed in `c121a7ed`,
  and every other script.
- Taste constraints: keep the parse loop's shape. Do not restructure the case
  statement, do not convert to a different argument parser, and do not relax
  `set -euo pipefail`.

## Semantic decision (frozen)

A retired two-token option in final position is treated as a **missing value to
discard**, not a user error. Log and continue, exactly as the valued form does.

Three reasons, the third decisive:

1. These options are retired and their values are never consumed. `--lsp ts` and
   `--lsp` produce the same outcome — nothing. Rejecting only the valueless form
   draws a distinction the program does not act on.
2. The branches already log and continue when the value is present. Failing when
   it is absent is inconsistent with the behavior one token away.
3. `:15` already reads `profile="${2:-}"` with a default and `:19` already
   prints `<missing>` for that case. The author anticipated the absent value and
   handled it in the branch body; only the `shift` was left unguarded. This is a
   half-finished guard, not a deliberate rejection.

Do not implement an error path. If you believe the rejection semantics are
better, stop and hand back rather than changing direction.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if a test would invoke the real `repo-harness install` or the real bun
  entrypoint. Every execution test must resolve a stub on PATH.

## Falsifier

The guard must not change consumption when the value is present. Run
`setup-plugins.sh --lsp ts --repo .` against the stub: it must forward
`--repo` and `.` and nothing else. If the fix ever shifts 1 where it should
shift 2, the stray `ts` leaks into the forwarded arguments. **That leak, not the
exit code, is the signal** — the exit code stays 0 in both the correct and the
broken version, so an exit-code-only assertion would pass a broken fix.

## Root Cause Evidence

- root_cause: scripts/setup-plugins.sh:21 and :25 call `shift 2` when a retired two-token option may be the last argument, and bash 3.2 returns non-zero from `shift` once the requested count exceeds `$#`, so `set -e` exits the script after the "ignored" message and before either exec target.
- repro: with a stub `repo-harness` on PATH, `bash scripts/setup-plugins.sh --hooks`, `bash scripts/setup-plugins.sh --repo . --lsp`, and `bash scripts/setup-plugins.sh --repo . --project-type` each print their retired-option message and exit 1; `bash scripts/setup-plugins.sh --hooks none` forwards `install --no-hooks` and exits 0.
- regression_guard: tests/setup-plugins-structure.test.ts
- pre_fix_failure_artifact: tasks/notes/20260818-setup-plugins-shift-overrun.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260818-0444-setup-plugins-shift-overrun.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-0444-setup-plugins-shift-overrun.review.md`
- Notes file: `tasks/notes/20260818-0444-setup-plugins-shift-overrun.notes.md`
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
  - tasks/contracts/20260818-0444-setup-plugins-shift-overrun.contract.md
  - tasks/reviews/20260818-0444-setup-plugins-shift-overrun.review.md
  - tasks/notes/20260818-0444-setup-plugins-shift-overrun.notes.md
  - .ai/context/capabilities.json
  - tasks/notes/20260818-setup-plugins-shift-overrun.pre-fix.log
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
    - tasks/notes/20260818-0444-setup-plugins-shift-overrun.notes.md
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
