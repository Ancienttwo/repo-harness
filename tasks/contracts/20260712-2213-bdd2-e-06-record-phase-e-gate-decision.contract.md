# Task Contract: bdd2-e-06-record-phase-e-gate-decision

> **Status**: Fulfilled
> **Plan**: plans/plan-20260712-2213-bdd2-e-06-record-phase-e-gate-decision.md
> **Task Profile**: eval-only
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-12 22:13
> **Review File**: `tasks/reviews/20260712-2213-bdd2-e-06-record-phase-e-gate-decision.review.md`
> **Notes File**: `tasks/notes/20260712-2213-bdd2-e-06-record-phase-e-gate-decision.notes.md`

## Why

The approved Phase E protocol must end in explicit decisions. Without E-06, gated
adapter/pilot rows remain ambiguous and a future agent could treat missing runs as
permission to productize Browser, ImageGen, audit, or workflow surfaces.

## Goal

Create one authoritative Phase E decision report, synchronize Sprint outcomes, and
prove that no failed or untested hypothesis authorizes Phase P.

## Scope

- In scope: final decision report, Sprint E-03/E-04/E-05/E-06 projection, plan,
  contract, review, notes, and current-status projection.
- Out of scope: evaluation reruns, new fixtures/runner code, product implementation,
  adapters, public skills/tools/hooks, schemas, sidecars, and compatibility paths.

## Stop Conditions

- Stop if the merged S/A reports do not reproduce `Reshape` and `Kill`.
- Stop if E/I execution is required; their prerequisites are false.
- Stop if closeout adds product or runtime surface.

## Falsifier

Any Phase P authorization, changed experiment threshold, or claim that a gated-not-run
adapter was empirically rejected invalidates this contract.

## Allowed Paths

```yaml
allowed_paths:
  - evals/bdd2/reports/phase-e-gate.md
  - plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md
  - plans/plan-20260712-2213-bdd2-e-06-record-phase-e-gate-decision.md
  - tasks/contracts/20260712-2213-bdd2-e-06-record-phase-e-gate-decision.contract.md
  - tasks/reviews/20260712-2213-bdd2-e-06-record-phase-e-gate-decision.review.md
  - tasks/notes/20260712-2213-bdd2-e-06-record-phase-e-gate-decision.notes.md
  - tests/bdd2-evals-contract.test.ts
  - tasks/current.md
  - .ai/harness/handoff/current.md
  - .ai/harness/handoff/resume.md
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - evals/bdd2/reports/phase-e-gate.md
    - evals/bdd2/reports/experiment-s.md
    - evals/bdd2/reports/experiment-a.md
  artifacts_exist:
    - tasks/notes/20260712-2213-bdd2-e-06-record-phase-e-gate-decision.notes.md
  tests_pass:
    - path: tests/bdd2-evals-contract.test.ts
  commands_succeed:
    - bun test tests/bdd2-evals-contract.test.ts
    - bun scripts/run-bdd2-evals.ts validate
    - REPO_HARNESS_BRAIN_ROOT=.ai/harness/runs/missing-brain-vault repo-harness run check-task-workflow --strict
  qa_scores:
    - dimension: functionality
      min: 8
```

## Acceptance Notes (Human Review)

- Shape is `Reshape`; Audit is `Kill`.
- Browser, ImageGen, and implementation pilot are `Defer` because prerequisites
  failed, not because their experiments produced negative evidence.
- Phase P and every public BDD product surface remain unauthorized.

## Rollback Point

- Revert the E-06 PR. Do not alter the already merged S/A historical evidence.
