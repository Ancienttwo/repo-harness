# Task Contract: pr17-review-freshness-failclosed

> **Status**: Active
> **Plan**: plans/plan-20260622-1651-pr17-review-freshness-failclosed.md
> **Task Profile**: code-change
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-06-22 16:51
> **Review File**: `tasks/reviews/20260622-1651-pr17-review-freshness-failclosed.review.md`
> **Notes File**: `tasks/notes/20260622-1651-pr17-review-freshness-failclosed.notes.md`

## Goal

Make the PR #17 review-freshness gate fail closed on every path an external review found. Original 4 P1s (missing/pending fingerprint, target-bound base ref, hash collisions + git-error, external self-binding) landed in f7b45ca; this slice closes the 2 residual P1s the re-review of f7b45ca found: (A) a malformed/unsupported Review Rubric Version must not downgrade to the lenient legacy path or disable external fingerprint binding; (B) the implementation fingerprint must stay sensitive to git pathspec-magic filenames, untracked symlinks, executable-bit changes, and non-utf-8 pathnames (fail closed when unobservable).

## Scope

- In scope: rubric classification + fail-closed handling in `assets/hooks/lib/workflow-state.sh` (freshness, external acceptance, top-header-only metadata parse) and the `stop-orchestrator.sh` nudge; `--literal-pathspecs`, lstat/symlink/mode modelling, and lossy-path fail-closed in `src/cli/hook/diff-fingerprint.ts`; regression tests; `.ai/hooks` projection sync.
- Out of scope: the original 4 P1 fixes (already in f7b45ca); projection design, release/tarball, and version surface (re-review confirmed passing); the merge-conflict (`mergeStateStatus: DIRTY`) resolution against `main`.

## Workflow Inventory

- Source plan: `plans/plan-20260622-1651-pr17-review-freshness-failclosed.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260622-1651-pr17-review-freshness-failclosed.review.md`
- Notes file: `tasks/notes/20260622-1651-pr17-review-freshness-failclosed.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260622-1651-pr17-review-freshness-failclosed.contract.md
  - tasks/reviews/20260622-1651-pr17-review-freshness-failclosed.review.md
  - tasks/notes/20260622-1651-pr17-review-freshness-failclosed.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - assets/hooks/
  - assets/templates/
  - .ai/hooks/
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
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260622-1651-pr17-review-freshness-failclosed.notes.md
  tests_pass:
    - path: tests/review-freshness.test.ts
  commands_succeed:
    - bun run check:hooks
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
