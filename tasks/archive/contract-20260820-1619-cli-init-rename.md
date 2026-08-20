> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260730-1855-cli-init-rename.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1619

# Task Contract: cli-init-rename

> **Status**: Active
> **Plan**: plans/plan-20260730-1855-cli-init-rename.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-30 18:55
> **Review File**: `tasks/reviews/20260730-1855-cli-init-rename.review.md`
> **Notes File**: `tasks/notes/20260730-1855-cli-init-rename.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The CLI currently ships two global bootstrap entrypoints (`install` and a duplicate `init` carrying a compatibility no-op `--refresh`) while repo-local adoption lives under `adopt`. This inverts the codegraph semantic convention (`install` = host-level, `init` = repo-local) that users and docs reference, leaves a ghost `init` entrypoint undocumented, and keeps stale docs (README.md:473, tasks/notes/init-update-cli-semantics.notes.md) diverging from code. If skipped, every future doc/skill/agent surface keeps teaching two conflicting vocabularies.

## Goal

`repo-harness install` is the only global/host-level bootstrap; `repo-harness init` is the repo-local adoption command carrying the former `adopt` implementation and flags byte-for-byte; `adopt` and the old global `init` block are removed fail-closed (commander unknown-command, no alias, no stub) in this same work-package, with all live docs, scripts, tests, skill assets, evals, and agent-context surfaces rewired per the source plan.

## Scope

- In scope: CLI rewiring in `src/cli/index.ts`; rename `src/cli/commands/adopt-plan.ts` -> `adoption-plan.ts`; live command literals/prefixes -> `init`; at-rest protocol-1 manifest literal `"adopt"` frozen in `src/effects/fs-transaction.ts`; registry source `"init"` for new writes with `"adopt"` legacy-read-only; test updates + two new fail-closed/registry tests; scripts incl. anchored `verify-contract.sh` guard pattern + helper mirror sync; docs/README x5/CLAUDE+AGENTS pairs/skill assets/evals/agent-fleet projections/CHANGELOG Unreleased entry; archive stale notes file.
- Out of scope: any behavior change to adoption planning/apply/rollback logic itself; `assets/workflow-contract.v1.json` and `.ai/harness/workflow-contract.json` (zero adopt refs — must remain untouched and byte-identical); historical archives, released CHANGELOG sections, plans/tasks archives, evals/bdd*/skill-routing baselines; `harness-overview.md` mirror equalization (intentionally divergent).
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a pre-rename on-disk transaction manifest (`"command": "adopt"`, protocol 1) can no longer roll back through the renamed CLI, the at-rest/live split is wrong and the cutover strands every previously adopted repo. Cheapest proof point: `tests/cli/adoption-plan.test.ts:87` must stay green unchanged, and `bun src/cli/index.ts init rollback --transaction <old-manifest>` must still accept the old literal.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260730-1855-cli-init-rename.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260730-1855-cli-init-rename.review.md`
- Notes file: `tasks/notes/20260730-1855-cli-init-rename.notes.md`
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
  - tasks/current.md
  - tasks/contracts/20260730-1855-cli-init-rename.contract.md
  - tasks/reviews/20260730-1855-cli-init-rename.review.md
  - tasks/notes/20260730-1855-cli-init-rename.notes.md
  - tasks/notes/init-update-cli-semantics.notes.md
  - tasks/archive/
  - .ai/context/capabilities.json
  - .claude/templates/
  - .claude/agents/harness-evaluator.md
  - .codex/agents/harness-evaluator.toml
  - agents/fleet/harness-evaluator.md
  - src/
  - tests/
  - scripts/
  - docs/
  - assets/
  - references/
  - evals/evals.json
  - README.md
  - README.zh-CN.md
  - README.fr.md
  - README.ja.md
  - README.es.md
  - CLAUDE.md
  - AGENTS.md
  - SKILL.md
  - install.sh
  - install.ps1
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
    - src/cli/commands/adoption-plan.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260730-1855-cli-init-rename.notes.md
  tests_pass:
    - path: tests/cli/init.test.ts
    - path: tests/cli/adoption-plan.test.ts
    - path: tests/readme-dx.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
    - bun run check:helpers
    - bun src/cli/index.ts init --repo . --dry-run
    - diff CLAUDE.md AGENTS.md
    - diff scripts/CLAUDE.md scripts/AGENTS.md
    - diff assets/workflow-contract.v1.json .ai/harness/workflow-contract.json
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: `095dcb06` (main at worktree creation, branch `codex/cli-init-rename`)
- Revert strategy: drop the `codex/cli-init-rename` branch/worktree before merge; after merge, a single revert of the merge commit restores `adopt` — no data migration to unwind (at-rest manifest protocol is intentionally unchanged).
