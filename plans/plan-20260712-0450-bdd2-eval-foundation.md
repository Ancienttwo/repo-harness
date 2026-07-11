# Plan: BDD² Phase E Evaluation Foundation

> **Status**: Executing
> **Created**: 2026-07-12
> **Slug**: bdd2-eval-foundation
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: focused runner/contract tests + manifest validation + deterministic dry-run planning + strict workflow and root required checks
> **Rollback Surface**: Revert branch `codex/bdd2-eval-foundation`; no data migration or runtime cutover.
> **PRD**: `plans/prds/20260712-0409-bdd2-shape-audit.prd.md`
> **Sprint**: `plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md`
> **Task Contract**: `tasks/contracts/20260712-0450-bdd2-eval-foundation.contract.md`
> **Task Review**: `tasks/reviews/20260712-0450-bdd2-eval-foundation.review.md`
> **Implementation Notes**: `tasks/notes/20260712-0450-bdd2-eval-foundation.notes.md`

## Goal

Create the Phase E authority and execution foundation required to run reproducible,
blind BDD² experiments without creating any public BDD product surface.

## Agentic Routing

- Selected route: `eval-only` task contract in an isolated worktree.
- Routing reason: this slice establishes evaluation manifests, frozen treatments,
  experiment execution, validation, and deterministic tests. It does not change
  product runtime behavior.
- Due diligence:
  - P1 map: `evals/` owns committed benchmark authority; `scripts/` owns local
    orchestration; ignored `.ai/harness/runs/` owns raw runtime evidence; task
    review and notes own durable conclusions. Existing `run-skill-evals.ts` is a
    skill-installation benchmark and is not the semantic authority for BDD².
  - P2 trace: frozen experiment manifest -> selected task and condition -> exact
    prompt materialization -> configured agent command -> raw response and run
    metadata -> blinded output packet -> later human adjudication. Validation
    fails before execution when prompt/rubric/task hashes drift.
  - P3 decision rationale: use one BDD² evaluation manifest as the only committed
    experiment authority and a dedicated eval-only runner because proposal/audit
    experiments are text treatments, not skill-installation workspace mutations.
    Do not generalize or retrofit the existing skill runner without a shared
    runtime invariant. The first 10x failure would be silent treatment/data drift,
    so content-addressed inputs and fail-closed validation are the protected
    invariant.

## In Scope

- Approve and commit the BDD² PRD and Phase E Sprint.
- Define a versioned evaluation manifest for experiments S and A.
- Freeze baseline, shape, review, and audit treatment prompts.
- Define development/held-out task partitions without exposing truth labels to
  the agent execution packet.
- Define the blind adjudication rubric and machine-readable score contract.
- Implement an eval-only runner that validates hashes, supports deterministic
  selection/repetition/dry-run, captures exact commands and outputs, and emits
  blinded packets plus run metadata.
- Add deterministic tests using stub agent commands.

## Out of Scope

- Public `repo-harness-bdd` skill, command registry, CLI/MCP product tools, hooks,
  `/check` integration, Behavior Brief catalog/validator, sidecars, or lifecycle.
- Experiment S/A held-out result claims; those are later work-packages.
- Browser or ImageGen execution; their independent Experiment E remains a later
  gated Sprint row.
- Implementation Pilot I and any Phase P productization.

## Allowed Paths

```yaml
allowed_paths:
  - evals/bdd2
  - scripts/run-bdd2-evals.ts
  - tests/run-bdd2-evals.test.ts
  - tests/bdd2-evals-contract.test.ts
  - plans/prds/20260712-0409-bdd2-shape-audit.prd.md
  - plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md
  - plans/plan-20260712-0450-bdd2-eval-foundation.md
  - tasks/contracts/20260712-0450-bdd2-eval-foundation.contract.md
  - tasks/reviews/20260712-0450-bdd2-eval-foundation.review.md
  - tasks/notes/20260712-0450-bdd2-eval-foundation.notes.md
  - tasks/current.md
  - .ai/harness/handoff/current.md
  - .ai/harness/handoff/resume.md
```

## Authority Contract

- `evals/bdd2/evaluation-manifest.json` is the sole committed machine-readable
  authority for experiment IDs, conditions, repetitions, partitions, prompt
  paths, rubric path, output schema, and content hashes.
- Prompt, task, and rubric files are immutable within a recorded run. A changed
  byte requires an explicit manifest hash update before execution.
- Agent packets contain the task input and condition prompt only. Truth labels,
  expected findings, condition aliases, and adjudication keys are excluded.
- Run evidence is written under ignored `.ai/harness/runs/bdd2/`; only durable
  decisions and aggregate reports are committed later.
- No semantic fallback or legacy manifest parser is allowed.

## Promotion Gate

- **Merge/PR unit**: this evaluation authority and runner foundation is one
  independently reviewable PR; experiment execution and result claims are not
  part of the unit.
- **Rollback surface**: revert branch `codex/bdd2-eval-foundation`; no data
  migration or runtime cutover exists.
- **Verification boundary**: focused runner/contract tests, manifest validation,
  deterministic dry-run planning, strict workflow verification, and the root
  required checks.
- **Review/acceptance boundary**: `tasks/reviews/20260712-0450-bdd2-eval-foundation.review.md` must recommend pass against the frozen-authority and blind-packet criteria.
- **High-risk surface**: leakage of truth/treatment identity and silent content
  drift would invalidate later evaluation claims.
- **Why not checklist row**: `merge_boundary` — this slice creates the shared
  evidence authority and reproducibility boundary consumed by every later Phase E
  experiment.

## Evidence Contract

- **State/progress path**: the `BDD2-E-01` row in
  `plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md`, this plan's task
  breakdown, and its generated contract/review/notes artifacts.
- **Verification evidence**: focused Bun tests, `run-bdd2-evals.ts validate`, a
  deterministic dry-run plan, strict task-workflow verification, and the root
  repository required checks recorded in the task review.
- **Evaluator rubric**: the review must confirm manifest/hash drift fails closed,
  held-out truth and condition identity are absent from agent packets, repeated
  runs produce stable coordinates, and no Phase P surface appears in the diff.
- **Stop condition**: all task breakdown items pass, the task review recommends
  pass, and the branch contains only the allowed Phase E foundation surfaces.
- **Rollback surface**: revert the work-package commit; no product runtime,
  migration, user data, or compatibility path exists.

## Task Breakdown

- [x] Approve the PRD and add the ordered Phase E Sprint backlog.
- [x] Add frozen experiment authority, treatment prompts, datasets, and rubric.
- [x] Implement strict manifest/hash validation and run selection.
- [x] Implement agent execution, artifact capture, and blinded packet emission.
- [x] Add contract and runner tests, including drift and data-leak failures.
- [x] Run focused tests, strict workflow checks, and the repository required checks.
- [x] Complete task review/notes, commit, push, and open the module PR.
- [x] Address PR #53 P1 by separating deterministic private coordinates from random blind packet IDs.
- [x] Address PR #53 P2 by requiring every sealed authority input, including the manifest and runner, to be tracked at clean HEAD.

## Exit Criteria

```yaml
exit_criteria:
  files_exist:
    - evals/bdd2/evaluation-manifest.json
    - evals/bdd2/prompts/shape-baseline.md
    - evals/bdd2/prompts/shape-treatment.md
    - evals/bdd2/prompts/audit-baseline.md
    - evals/bdd2/prompts/audit-treatment.md
    - evals/bdd2/rubrics/blind-adjudication.md
    - evals/bdd2/rubrics/score.schema.json
    - evals/bdd2/tasks/development.json
    - evals/bdd2/tasks/held-out.json
    - evals/bdd2/truth/development.json
    - evals/bdd2/truth/held-out.json
    - scripts/run-bdd2-evals.ts
    - tests/run-bdd2-evals.test.ts
    - tests/bdd2-evals-contract.test.ts
  commands_succeed:
    - bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts
    - bun scripts/run-bdd2-evals.ts validate
    - bun scripts/run-bdd2-evals.ts plan --experiment S --partition development --dry-run
    - repo-harness run check-task-workflow --strict
  manual_checks:
    - "Review confirms no Phase P product surface was introduced"
    - "Review confirms agent packets exclude truth and treatment identity"
```

## Stop Conditions

- Stop if a runner design requires installing a BDD skill or mutating product
  registry/runtime to execute the experiment.
- Stop if held-out truth must be placed in the agent-visible task packet.
- Stop if reproducibility requires a second handwritten authority beside the
  evaluation manifest.

## Rollback Surface

Revert this work-package commit. No product runtime, migration, persistent user
data, or compatibility path is created by this slice.
