# Sprint Contract: think-scan-init-hook

> **Status**: Fulfilled
> **Plan**: plans/plan-20260613-0328-think-scan-init-hook.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-13 04:03
> **Review File**: `tasks/reviews/20260613-0328-think-scan-init-hook.review.md`
> **Notes File**: `tasks/notes/20260613-0328-think-scan-init-hook.notes.md`

## Goal

Replace the outdated anti-simplification edit advisory with a first-principles
anti-overengineering guard that reviews actual Edit/Write diffs, stays
non-blocking, and is mirrored across the self-host and generated hook surfaces.

## Scope

- In scope:
  - Add the canonical first-principles guard to both `assets/hooks/` and `.ai/hooks/`.
  - Rewire `post-edit-guard.sh` on both hook surfaces without changing route shape.
  - Keep compatibility behavior for stale references to `anti-simplification.sh`.
  - Update hook documentation and focused tests for the new advisory semantics.
- Out of scope:
  - Ponytail plugin installation or vendoring.
  - SessionStart/global prompt injection or always-on simplicity mode.
  - Blocking gates, LLM calls, subagent spawning, or file rewrites from hooks.
  - User-level hook adapter refresh or installer hook-count changes.

## Workflow Inventory

- Source plan: `plans/plan-20260613-0328-think-scan-init-hook.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260613-0328-think-scan-init-hook.review.md`
- Notes file: `tasks/notes/20260613-0328-think-scan-init-hook.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `.ai/harness/scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - assets/hooks/first-principles-guard.sh
  - assets/hooks/anti-simplification.sh
  - assets/hooks/post-edit-guard.sh
  - .ai/hooks/first-principles-guard.sh
  - .ai/hooks/anti-simplification.sh
  - .ai/hooks/post-edit-guard.sh
  - docs/reference-configs/hook-operations.md
  - assets/reference-configs/hook-operations.md
  - brain/repo-harness/references/harness-overview.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260613-0328-think-scan-init-hook.contract.md
  - tasks/reviews/20260613-0328-think-scan-init-hook.review.md
  - tasks/notes/20260613-0328-think-scan-init-hook.notes.md
  - tests/hook-contracts.test.ts
  - tests/hook-runtime.test.ts
  - tests/cli/route-registry.test.ts
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
    parent: narrate_and_gatekeep
    worker: implement_contract
    verifier: review_exit_criteria
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - assets/hooks/first-principles-guard.sh
    - .ai/hooks/first-principles-guard.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260613-0328-think-scan-init-hook.notes.md
  tests_pass:
    - path: tests/hook-contracts.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/cli/route-registry.test.ts
  commands_succeed:
    - bash -n assets/hooks/first-principles-guard.sh .ai/hooks/first-principles-guard.sh assets/hooks/post-edit-guard.sh .ai/hooks/post-edit-guard.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bash scripts/migrate-project-template.sh --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: edit diffs that add compatibility branches, branch-heavy
  logic, dependencies, or one-implementation abstractions emit stable
  `[FirstPrinciples]` advisories and exit 0.
- Edge cases: empty diffs stay quiet; safety-critical validation/error handling
  is not described as removable.
- Regression risks: stale downstream references to `anti-simplification.sh` must
  continue to work or have an explicit compatibility decision recorded.

## Rollback Point

- Commit / checkpoint: branch `codex/think-scan-init-hook` before merge.
- Revert strategy: revert the branch or restore `post-edit-guard.sh` to the
  previous `anti-simplification.sh` call; no external state should change.
