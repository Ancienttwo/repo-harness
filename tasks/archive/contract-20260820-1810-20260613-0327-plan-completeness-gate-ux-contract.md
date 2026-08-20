> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260613-0327-plan-completeness-gate-ux-contract.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: plan-completeness-gate-ux-contract

> **Status**: Fulfilled
> **Plan**: plans/plan-20260613-0327-plan-completeness-gate-ux-contract.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-13 03:27
> **Review File**: `tasks/reviews/20260613-0327-plan-completeness-gate-ux-contract.review.md`
> **Notes File**: `tasks/notes/20260613-0327-plan-completeness-gate-ux-contract.notes.md`

## Goal

Make the Stop-stage `PlanCompletenessGate` explain the concrete plan-capture next step instead of surfacing as a generic self-review interruption, while preserving the existing one-shot guard and pending-plan safety invariant.

## Scope

- In scope:
  - Runtime Stop hook message in `.ai/hooks/stop-orchestrator.sh`
  - Installed/template mirror in `assets/hooks/stop-orchestrator.sh`
  - Focused hook runtime assertions in `tests/hook-runtime.test.ts`
  - Linked-worktree test-harness dependency fallback for hook-runtime CLI subprocesses
  - This contract, plan, notes, review, and generated task ledger artifacts
- Out of scope:
  - Automatic plan capture from the Stop hook
  - UserPromptSubmit planning classification changes
  - User-level `~/.codex` or `~/.claude` hook config changes
  - The separate `init-hook` feature

## Workflow Inventory

- Source plan: `plans/plan-20260613-0327-plan-completeness-gate-ux-contract.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260613-0327-plan-completeness-gate-ux-contract.review.md`
- Notes file: `tasks/notes/20260613-0327-plan-completeness-gate-ux-contract.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `.ai/harness/scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260613-0327-plan-completeness-gate-ux-contract.contract.md
  - tasks/reviews/20260613-0327-plan-completeness-gate-ux-contract.review.md
  - tasks/notes/20260613-0327-plan-completeness-gate-ux-contract.notes.md
  - .ai/hooks/stop-orchestrator.sh
  - assets/hooks/stop-orchestrator.sh
  - tests/hook-runtime.test.ts
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
    - .ai/hooks/stop-orchestrator.sh
    - assets/hooks/stop-orchestrator.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260613-0327-plan-completeness-gate-ux-contract.notes.md
  commands_succeed:
    - bash -n .ai/hooks/stop-orchestrator.sh assets/hooks/stop-orchestrator.sh
    - bun test tests/hook-runtime.test.ts -t "stop-orchestrator: blocks once to force pending plan completeness review"
    - bun test tests/hook-runtime.test.ts -t "stop-orchestrator: skips recursive Stop continuations and supports Codex block JSON"
    - bun test tests/hook-runtime.test.ts
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: first Stop block for fresh pending planning includes exact capture guidance and still blocks only once per pending signature.
- Edge cases: recursive Stop continuations remain skipped; pending records without optional fields still get useful fallback guidance.
- Regression risks: shell quoting in guidance must not break JSON output; runtime and assets copies must stay in sync.

## Rollback Point

- Commit / checkpoint: branch `codex/plan-completeness-gate-ux-contract` before merge.
- Revert strategy: revert changes to the two Stop hook copies, focused test, and task artifacts.
