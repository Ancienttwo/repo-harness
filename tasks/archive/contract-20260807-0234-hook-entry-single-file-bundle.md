> **Archived**: 2026-08-07 02:34
> **Related Plan**: plans/archive/plan-20260805-1745-hook-entry-single-file-bundle.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260807-0234

# Task Contract: hook-entry-single-file-bundle

> **Status**: Fulfilled
> **Plan**: plans/plan-20260805-1745-hook-entry-single-file-bundle.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-05 17:45
> **Review File**: `tasks/reviews/20260805-1745-hook-entry-single-file-bundle.review.md`
> **Notes File**: `tasks/notes/20260805-1745-hook-entry-single-file-bundle.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The globally installed `repo-harness-hook` bin executes the live multi-file TS tree; hooks firing during `bun install -g` reinstall windows resolve a half-replaced import graph and hang until the host kills them at the 30s adapter timeout (evidence in the source plan). Skipped: recurring hook-timeout noise and silently discarded advisory output on every reinstall. Shipped wrong: the bundle DCEs the detached tooling-populate respawn (permanent silent feature kill) or emits an invented "0.0.0" provider version into the evidence ledger (forbidden fail-open).

## Goal

`repo-harness-hook` bin points at a prepack-built single-file bundle `dist/hook-entry.js` that is behavior-preserving: the detached tooling-populate respawn works from the bundle via an explicit hook-entry dispatch branch (same exported function authority as the session-context receiver), and the bundled provider version is the real package version injected at build time via `bun build --define`. Managed adapter command strings, `timeout: 30`, and the `repo-harness` main bin mapping stay byte-identical.

## Scope

- In scope: `src/cli/hook-entry.ts` dispatch branch; exporting `DETACHED_TOOLING_POPULATE_FLAG` from `src/cli/hook/session-context.ts`; build-time version constant in `src/effects/evidence/post-bash-importer.ts`; `package.json` prepack script + bin + files; `.gitignore` `dist/` entry; `tests/bootstrap-files.test.ts` bin expectation; regression test `tests/unit/hook-entry-single-file-bundle.test.ts`.
- Out of scope: `src/cli/installer/managed-entries.ts`, managed hook command strings, adapter files under `~/.claude`/`~/.codex`, the `repo-harness` main bin mapping, hook runtime semantics beyond the dispatch branch, version bumps, local symlink-install coverage (accepted residual per plan).
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a hook run from the single-file bundle still hangs to the 30s kill during a registry reinstall window, the half-tree-resolution diagnosis is wrong and the fix direction dies. Cheapest proof point: `bash scripts/check-tarball-install-smoke.sh` (prepack → tarball → installed bin runs), then loop `bun dist/hook-entry.js UserPromptSubmit --route default` probes while replacing the bundle file via rename — probes must never block.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260805-1745-hook-entry-single-file-bundle.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260805-1745-hook-entry-single-file-bundle.review.md`
- Notes file: `tasks/notes/20260805-1745-hook-entry-single-file-bundle.notes.md`
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
  - tasks/contracts/20260805-1745-hook-entry-single-file-bundle.contract.md
  - tasks/reviews/20260805-1745-hook-entry-single-file-bundle.review.md
  - tasks/notes/20260805-1745-hook-entry-single-file-bundle.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - package.json
  - .gitignore
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
    - tasks/notes/20260805-1745-hook-entry-single-file-bundle.notes.md
  tests_pass:
    - path: tests/unit/hook-entry-single-file-bundle.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
    - bash scripts/check-tarball-install-smoke.sh
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: worktree branch `codex/hook-entry-single-file-bundle` off `699bc70c`
- Revert strategy: single revert of the branch commit restores bin → `src/cli/hook-entry.ts` and removes the prepack script and dispatch branch; no adapter or settings migration involved.
