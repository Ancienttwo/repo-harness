# Plan: HE-04 Contract Profiles and Allowed Paths Narrowing

> **Status**: Approved
> **Created**: 2026-06-17
> **Slug**: HE-04-contract-profiles
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260616-harness-engineering-frameworks.md`
> **Task Contract**: `tasks/contracts/20260616-HE-04-contract-profiles.contract.md`
> **Task Review**: `tasks/reviews/20260616-HE-04-contract-profiles.review.md`
> **Implementation Notes**: `tasks/notes/20260616-HE-04-contract-profiles.notes.md`

## Agentic Routing

- Selected route: migration task contract
- Routing reason: HE-04 changes contract template semantics and `verify-contract` gates.
- Due diligence:
  - P1 map: contract templates and `verify-contract.sh` own the task profile field; package helper copies must stay synced.
  - P2 trace: task contract metadata -> `verify-contract.sh` parses `Task Profile` -> allowed paths are checked before exit criteria commands.
  - P3 decision rationale: new generated contracts declare `code-change`; old contracts without a profile remain valid with an advisory pass.

## Evidence Contract

- **State/progress path**: HE-04 row in `plans/sprints/20260617-Sprint: Harness Engineering Optimization - State, Review, Eval, Delegation.md`
- **Verification evidence**: `bun test tests/helper-scripts.test.ts`; `bash scripts/check-task-workflow.sh --strict`; `bash scripts/verify-contract.sh --contract tasks/contracts/20260616-HE-04-contract-profiles.contract.md --strict --read-only`
- **Evaluator rubric**: templates include Task Profile, unsupported profiles fail, ledger-closeout runtime allowed paths fail, and legacy no-profile contracts still pass.
- **Stop condition**: HE-04 row checked and staged diff contains only profile/template/verifier/docs/test/file artifacts.
- **Rollback surface**: revert HE-04 verifier/template/docs/test edits and uncheck HE-04.

## Agent Progress Checklist

- [x] Add `Task Profile` field to contract templates.
- [x] Add profile validation to `verify-contract.sh`.
- [x] Add profile-specific allowed path failures.
- [x] Document profiles in sprint-contracts reference docs.
- [x] Add tests for valid legacy contracts, invalid profile, and ledger-closeout runtime paths.
- [ ] Stage HE-04 artifact batch.
