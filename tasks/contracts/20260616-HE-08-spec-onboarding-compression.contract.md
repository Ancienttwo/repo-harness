# Task Contract: HE-08 Spec and Onboarding Compression

> **Status**: Active
> **Plan**: `plans/plan-20260616-HE-08-spec-onboarding-compression.md`
> **Task Profile**: eval-only
> **Owner**: Codex
> **Capability ID**: docs/onboarding-compression
> **Last Updated**: 2026-06-17
> **Review File**: `tasks/reviews/20260616-HE-08-spec-onboarding-compression.review.md`
> **Notes File**: `tasks/notes/20260616-HE-08-spec-onboarding-compression.notes.md`

## Goal

Make repo-harness understandable from spec, README, and reference docs without
turning root agent prompts into long manuals.

## Scope

- In scope: product spec, English/Chinese README onboarding sections, reference docs, tests, and HE-08 filing.
- Out of scope: runtime helper behavior, AGENTS/CLAUDE expansion, release publishing.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - README.md
  - README.zh-CN.md
  - docs/reference-configs/agentic-development-flow.md
  - assets/reference-configs/agentic-development-flow.md
  - docs/reference-configs/document-generation.md
  - assets/reference-configs/document-generation.md
  - tests/readme-dx.test.ts
  - plans/plan-20260616-HE-08-spec-onboarding-compression.md
  - tasks/contracts/20260616-HE-08-spec-onboarding-compression.contract.md
  - tasks/reviews/20260616-HE-08-spec-onboarding-compression.review.md
  - tasks/notes/20260616-HE-08-spec-onboarding-compression.notes.md
  - "plans/sprints/20260617-Sprint: Harness Engineering Optimization — State, Review, Eval, Delegation.md"
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
    - README.md
    - README.zh-CN.md
    - tests/readme-dx.test.ts
  commands_succeed:
    - grep -n "Product Outcome\\|Core Invariants\\|Human Review" docs/spec.md
    - grep -n "Human Review Path" README.md README.zh-CN.md
    - grep -n "Agent reads first" README.md docs/reference-configs/agentic-development-flow.md
    - bun test tests/readme-dx.test.ts
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: docs now explain product outcome, review path, and agent tracking path.
- Edge cases: root AGENTS/CLAUDE remain short; detailed rules stay in reference docs.
- Regression risks: localized READMEs beyond Chinese still only get release-surface parity, not full translation in this slice.

## Rollback Point

- Commit / checkpoint: staged HE-07 batch.
- Revert strategy: restore previous docs/spec, README, reference docs, and readme tests.
