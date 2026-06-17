# Plan: HE-08 Spec and Onboarding Compression

> **Status**: Approved
> **Created**: 2026-06-17
> **Slug**: HE-08-spec-onboarding-compression
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260616-harness-engineering-frameworks.md`
> **Task Contract**: `tasks/contracts/20260616-HE-08-spec-onboarding-compression.contract.md`
> **Task Review**: `tasks/reviews/20260616-HE-08-spec-onboarding-compression.review.md`
> **Implementation Notes**: `tasks/notes/20260616-HE-08-spec-onboarding-compression.notes.md`

## Agentic Routing

- Selected route: docs-only task contract
- Routing reason: HE-08 compresses product intent and onboarding docs without changing runtime behavior.
- Due diligence:
  - P1 map: `docs/spec.md` owns stable product intent; README owns human onboarding; reference docs own detailed agent routing.
  - P2 trace: fresh agent/human enters README/spec -> reads active artifacts/review card -> verifies task through contract/checks.
  - P3 decision rationale: add concise reader-specific paths instead of duplicating the full workflow docs in AGENTS/README.

## Evidence Contract

- **State/progress path**: HE-08 row in `plans/sprints/20260617-Sprint: Harness Engineering Optimization - State, Review, Eval, Delegation.md`
- **Verification evidence**: `grep -n "Product Outcome\\|Core Invariants\\|Human Review" docs/spec.md`; `bun test tests/readme-dx.test.ts`; `bash scripts/check-task-workflow.sh --strict`
- **Evaluator rubric**: spec is non-placeholder, README has human/agent paths in both languages, and reference docs state agent/human first-read split.
- **Stop condition**: HE-08 row checked and staged diff contains docs/tests/filing only.
- **Rollback surface**: revert spec, README, reference docs, readme tests, and uncheck HE-08.

## Agent Progress Checklist

- [x] Expand `docs/spec.md` with outcome, users, non-goals, invariants, workflow surfaces, safety, human review, and acceptance scenarios.
- [x] Add Human Review Path and Agent Tracking Path to README.
- [x] Update Chinese README equivalently.
- [x] Add agent-vs-human first-read table to reference docs.
- [x] Add docs/readme consistency tests.
- [x] Stage HE-08 artifact batch.
