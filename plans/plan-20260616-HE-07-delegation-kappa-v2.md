# Plan: HE-07 Delegation Contract Kappa v2

> **Status**: Approved
> **Created**: 2026-06-17
> **Slug**: HE-07-delegation-kappa-v2
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260616-harness-engineering-frameworks.md`
> **Task Contract**: `tasks/contracts/20260616-HE-07-delegation-kappa-v2.contract.md`
> **Task Review**: `tasks/reviews/20260616-HE-07-delegation-kappa-v2.review.md`
> **Implementation Notes**: `tasks/notes/20260616-HE-07-delegation-kappa-v2.notes.md`

## Agentic Routing

- Selected route: migration task contract
- Routing reason: HE-07 changes delegation metadata templates, `contract-run` manifest/prompt behavior, docs, and tests.
- Due diligence:
  - P1 map: contract templates create delegation metadata; `contract-run.ts` consumes it; `verify-contract.sh` still gates only exit criteria.
  - P2 trace: contract delegation YAML -> `contract-run.ts dry-run` -> worker/verifier prompts and manifest -> verifier rubric points back to `exit_criteria`.
  - P3 decision rationale: v2 adds role/permission clarity without widening allowed paths or spawning hidden agents.

## Evidence Contract

- **State/progress path**: HE-07 row in `plans/sprints/20260617-Sprint: Harness Engineering Optimization - State, Review, Eval, Delegation.md`
- **Verification evidence**: `bun test tests/contract-run.test.ts`; `bash scripts/verify-contract.sh --contract tasks/contracts/20260616-HE-07-delegation-kappa-v2.contract.md --strict --read-only`; `bash scripts/check-task-workflow.sh --strict`
- **Evaluator rubric**: dry-run prints delegation plan, worker is constrained to allowed paths, verifier rubric is the contract exit criteria, and parent remains checkpoint owner.
- **Stop condition**: HE-07 row checked and staged diff contains delegation template/runner/docs/tests/filing only.
- **Rollback surface**: restore old delegation scalar roles and previous `contract-run` manifest shape; uncheck HE-07.

## Agent Progress Checklist

- [x] Add explorer/worker/verifier role separation to templates.
- [x] Make `contract-run` verifier prompt use contract exit criteria only.
- [x] Record delegation plan, permissions, budgets, allowed paths, and rubric in run manifest.
- [x] Preserve budget handling where `tool_calls` is enforceable and document advisory semantics.
- [x] Add contract-run dry-run dogfood command.
- [ ] Stage HE-07 artifact batch.
