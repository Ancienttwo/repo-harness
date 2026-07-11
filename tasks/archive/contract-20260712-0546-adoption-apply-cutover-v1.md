> **Archived**: 2026-07-12 05:46
> **Related Plan**: plans/archive/plan-20260711-2105-adoption-apply-cutover-v1.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260712-0546

# Task Contract: adoption-apply-cutover-v1

> **Status**: Fulfilled
> **Plan**: plans/plan-20260711-2105-adoption-apply-cutover-v1.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-12 03:54
> **Review File**: `tasks/reviews/20260711-2105-adoption-apply-cutover-v1.review.md`
> **Notes File**: `tasks/notes/20260711-2105-adoption-apply-cutover-v1.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`repo-harness adopt` has two mutation authorities: ordinary standard apply
routes through `runInit()` and the shell migrator, while dry-run and opt-in
apply use the TypeScript planner and transaction executor. They do not expose
the same operation set or recovery evidence, so a flag flip would silently
drop current migration behavior and a legacy route would preserve dual
authority.

## Goal

Make the TypeScript adoption planner and transaction executor the only
repo-local mutation authority for `repo-harness adopt` and `runInit()`.
Ordinary standard apply must reproduce the current known-generated migration
outcome, return structured transaction/rollback evidence, then run explicit
registration, CodeGraph readiness, handoff refresh, and strict workflow
verification. Remove the experimental flag and shell migration route in the
same breaking cutover; no alias, shell fallback, or second apply authority may
remain.

## Scope

- In scope:
  - Extend `src/core/adoption` and `src/effects/fs-transaction.ts` so the
    deterministic plan represents and preflights standard scaffold, hook,
    workflow-document/archive, context/policy/state, reference, deploy scaffold/research,
    package-script, `.gitignore`, known-generated cleanup, and verification
    operations before the first write.
  - Preserve user-owned files by applying replacement/removal only to
    known-generated targets, archiving legacy workflow artifacts before moves,
    recording every applied/failed operation in a recoverable manifest, and
    failing closed for ambiguous ownership or post-apply user edits.
    `_ops/`, repo-local host adapter configuration, custom hooks, real env files,
    and secrets are user-owned and are never moved, rewritten, or deleted.
  - Route ordinary `adopt` and the repo-local portion of `runInit()` through
    the canonical TS apply result; preserve registry, CodeGraph, handoff, and
    strict workflow post-apply effects as explicit steps, not hidden fallback.
  - Remove `--experimental-ts-apply`, the experimental JSON field, shell
    migration script/helper contract entry, and retired no-op adopt options.
    Keep minimal planner apply supported; self-host apply must fail before
    writes until its manual runtime-review operation is deterministic.
  - Update active architecture/reference/action documentation and regressions,
    then close the plan/contract/review workflow.
- Out of scope:
  - User-level host adapter installation, global skill installation, global
    CodeGraph MCP configuration, brain-root configuration, package publication,
    a monorepo, new dependency, or automatic resolution of ambiguous file
    ownership.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->
  One plan and one executor per repo-local mutation. Reuse the existing pure
  planner, effects, assets, ownership classifiers, and transaction mechanism;
  a new shared module is allowed only when it separates a real two-consumer
  invariant such as target validation.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a standard downstream fixture either changes a user-owned file, omits a
known shell-migrator result, or needs the shell script to pass, the cutover is
unsafe. Cheapest proof: compare a standard fixture's deterministic TS plan and
apply result against the current migration fixture assertions before deleting
the shell route.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260711-2105-adoption-apply-cutover-v1.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260711-2105-adoption-apply-cutover-v1.review.md`
- Notes file: `tasks/notes/20260711-2105-adoption-apply-cutover-v1.notes.md`
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
  - tasks/contracts/20260711-2105-adoption-apply-cutover-v1.contract.md
  - tasks/reviews/20260711-2105-adoption-apply-cutover-v1.review.md
  - tasks/notes/20260711-2105-adoption-apply-cutover-v1.notes.md
  - .ai/harness/workflow-contract.json
  - .ai/context/capabilities.json
  - assets/workflow-contract.v1.json
  - assets/templates/
  - assets/hooks/
  - assets/reference-configs/
  - docs/architecture/transactional-adoption-planner.md
  - docs/architecture/modules/public-surface/adoption.md
  - docs/reference-configs/
  - docs/architecture/
  - docs/CHANGELOG.md
  - README.md
  - README.*.md
  - README.es.md
  - README.fr.md
  - README.ja.md
  - README.zh-CN.md
  - SKILL.md
  - AGENTS.md
  - CLAUDE.md
  - references/
  - evals/
  - src/cli/index.ts
  - src/cli/commands/adopt-plan.ts
  - src/cli/commands/init.ts
  - src/cli/repo-adoption/
  - src/core/adoption/
  - src/effects/fs-transaction.ts
  - src/effects/path-safety.ts
  - scripts/migrate-project-template.sh
  - scripts/migrate-workflow-docs.ts
  - scripts/AGENTS.md
  - scripts/CLAUDE.md
  - scripts/check-ci.sh
  - scripts/check-task-workflow.sh
  - scripts/architecture-queue.sh
  - scripts/sync-helper-sources.ts
  - scripts/lib/project-init-lib.sh
  - assets/skill-commands/
  - tests/
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
    - tasks/notes/20260711-2105-adoption-apply-cutover-v1.notes.md
  tests_pass:
    - path: tests/cli/adoption-plan.test.ts
    - path: tests/cli/init.test.ts
    - path: tests/cli/init-hook.test.ts
    - path: tests/migration-script.test.ts
    - path: tests/hook-recursive-copy.test.ts
    - path: tests/helper-scripts.test.ts
    - path: tests/reclaim-runtime.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:hooks
    - bun run check:helpers
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bun src/cli/index.ts run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun test tests/cli/adoption-plan.test.ts tests/cli/init.test.ts tests/cli/init-hook.test.ts tests/migration-script.test.ts tests/hook-recursive-copy.test.ts tests/helper-scripts.test.ts tests/reclaim-runtime.test.ts
    - bun test --max-concurrency 4
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
  Ordinary standard and minimal apply use the same TypeScript operation
  authority as dry-run and return an executable transaction manifest. The
  public experimental and shell migration surfaces are absent.
- Edge cases:
  Unsupported self-host, ambiguous ownership, unsafe paths, and mixed plans
  fail before writes. Rollback restores transaction-owned changes only and
  rejects post-apply user edits.
- Regression risks:
  This is an intentional breaking CLI change. The cutover must reproduce every
  known-generated standard migration result without retaining a shell route.

## Rollback Point

- Commit / checkpoint:
- Revert strategy: Revert the reviewed B2 commits. Downstream transactions use
  `repo-harness adopt rollback --transaction <manifest>`; no hosted or
  credential state is mutated.
