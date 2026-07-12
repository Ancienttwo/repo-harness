# Task Contract: harness-kernel-reduction

> **Status**: Active
> **Plan**: plans/plan-20260712-2327-harness-kernel-reduction.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-12 23:28
> **Review File**: `tasks/reviews/20260712-2327-harness-kernel-reduction.review.md`
> **Notes File**: `tasks/notes/20260712-2327-harness-kernel-reduction.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

repo-harness currently applies Strict-style planning and prompt classification too
broadly. That increases context, model calls, hook work, artifact reconciliation,
and livelock risk for strong agents. Skipping the cutover leaves the product's
claimed token-lean behavior unproven and keeps ordinary work coupled to a cognitive
orchestration layer. Shipping it incorrectly could weaken deterministic scope,
security, worktree, review-freshness, and recovery boundaries.

## Goal

Deliver the complete P0/P1/P2 Goal from the attached source: authoritative
No Harness/Lite/Strict evidence; productized Lite/Standard/Strict risk profiles;
explicit-first routing; a global SessionStart budget; one effective-state owner;
bounded guard/review/repair/delegation loops; five-action default Skill discovery;
and transactional minimal/standard/product-planning/strict installation profiles.
The full 3x9 matrix and all preserved safety regressions must pass.

## Scope

- In scope:
  - Replace `with_skill/without_skill` benchmark authority with truly isolated
    `no_harness/lite/strict` profiles over the nine Goal scenarios.
  - Add live run-scoped hook evidence and streaming provider-event collection;
    retain null/unavailable when the provider/runtime has no authority.
  - Upgrade the current state-snapshot owner into the single effective-state
    resolver with risk floor, source hashes, freshness, version, next action,
    blockers, and orchestration counters.
  - Cut routing to explicit command or active-task routing; ordinary prompts
    bypass the legacy natural-language classifier.
  - Enforce one final SessionStart budget with priority, delta, dedupe, reference,
    and machine-readable dropped-section evidence.
  - Enforce profile-aware circuit breakers without weakening strong boundaries.
  - Cut root/default Skill discovery to five actions and remove retired facade
    authority in the same package.
  - Add one host-level install-profile transaction model with ownership proof,
    dry-run/apply/switch/rollback, persistent state, and drift status.
  - Update product/self-host projections, architecture, migration/rollback docs,
    benchmark authority/reports, and workflow evidence.
- Out of scope:
  - Push, merge, deploy, live secret/provider mutation, or destructive changes to
    the shared dirty `main` worktree.
  - New telemetry service/database, new package dependency without proof, or a
    second state/router/install authority.
  - Steady-state compatibility aliases, semantic fallbacks, regex inference of
    provider-owned values, or synthetic-only evidence presented as the full matrix.
- Taste constraints: Extend or replace existing owners; product sources project
  deterministically into self-host copies. A one-shot fail-closed migration is
  authorized, but the retired authority must be removed in the same work package.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Do not stop for task size, slow tests, rebase, an intermediate contract, one
  completed phase, external-review throttling, or a temporarily stale target branch.
- A blocker is terminal only after three concrete attempts and only when a new
  user decision, credential, live provider state, or permission expansion is required.

## Falsifier

The direction is wrong if Lite reduces ceremony but weakens any deterministic
security/scope/worktree boundary, violates a source quantitative gate, creates a
full Plan/Contract/External Acceptance chain for a low-risk task, or lowers
grader success. The matrix must report context/calls/duration truthfully, but the
source Goal defines no comparative cost threshold; measured provider variance
or a cost regression is an optimization finding, not permission to invent a new
completion gate or weaken safety. The cheapest proof is the focused risk/profile
plus SessionStart budget suite followed by one isolated scenario across all
three profiles before running the full matrix.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260712-2327-harness-kernel-reduction.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260712-2327-harness-kernel-reduction.review.md`
- Notes file: `tasks/notes/20260712-2327-harness-kernel-reduction.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - SKILL.md
  - README.md
  - README.zh-CN.md
  - README.zh-TW.md
  - package.json
  - bun.lock
  - install.sh
  - install.ps1
  - docs/spec.md
  - docs/architecture/
  - docs/reference-configs/
  - docs/researches/
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/archive/
  - tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md
  - tasks/reviews/20260712-2327-harness-kernel-reduction.review.md
  - tasks/notes/20260712-2327-harness-kernel-reduction.notes.md
  - .ai/context/capabilities.json
  - .ai/harness/policy.json
  - .ai/harness/workflow-contract.json
  - .ai/hooks/
  - .claude/templates/
  - assets/
  - evals/
  - scripts/
  - src/
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
  files_exist:
    - docs/spec.md
    - SKILL.md
    - evals/harness/scenarios.json
    - evals/harness/reports/profile-comparison.json
    - evals/harness/reports/profile-comparison.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260712-2327-harness-kernel-reduction.notes.md
  tests_pass:
    - path: tests/effective-state.test.ts
    - path: tests/harness-runtime-profiles.test.ts
    - path: tests/harness-context-budget.test.ts
    - path: tests/harness-circuit-breakers.test.ts
    - path: tests/install-profiles.test.ts
    - path: tests/harness-benchmark-matrix.test.ts
    - path: tests/run-skill-evals.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/action-command-skills.test.ts
  commands_succeed:
    - bun test tests/effective-state.test.ts tests/harness-runtime-profiles.test.ts tests/harness-context-budget.test.ts tests/harness-circuit-breakers.test.ts
    - bun test tests/install-profiles.test.ts tests/action-command-skills.test.ts
    - bun test tests/harness-benchmark-matrix.test.ts tests/run-skill-evals.test.ts tests/hook-runtime.test.ts
    - bun run benchmark:harness --provider claude --profile all --scenario all --require-authoritative
    - bun src/cli/index.ts state resolve --json
    - bun src/cli/index.ts install --profile minimal --dry-run --json
    - bun src/cli/index.ts install --profile strict --dry-run --json
    - bun run check:type
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts adopt --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 9
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: all nine Required Outcomes in the source Goal are product
  behavior, not documentation or future work; the 3x9 report is reproducible.
- Edge cases: inert/unchanged sessions, quoted old reports, Chinese/negative prompts,
  multi-capability edits, migrations, stale/conflicting state, modified legacy host
  files, missing provider fields, failed graders, and cross-session recovery.
- Regression risks: Lite must never lower a deterministic risk floor; strong guards
  never fail open; profile switches never delete unowned host content; review/check
  binding and dirty-main safety remain intact.

## Rollback Point

- Commit / checkpoint: branch `codex/harness-cost-baseline-slo` after archived
  partial authority and before the complete Goal implementation.
- Revert strategy: revert ordered work-package commits. The installation cutover
  uses its ownership manifest and rollback transaction; do not restore a retired
  runtime fallback.
