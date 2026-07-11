# Plan: BDD² Experiment S — Shape Hypothesis

> **Status**: Executing
> **Created**: 20260712-0605
> **Slug**: bdd2-e-02-run-experiment-s-shape-hypothesis
> **Planning Source**: waza-think
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md#BDD2-E-02 — Run Experiment S: shape hypothesis
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Frozen authority tests, one clean-HEAD 72-coordinate run, blind-score validation, aggregate metric reproduction, strict workflow checks, and PR review.
> **Rollback Surface**: Revert branch `codex/bdd2-shape-experiment`; raw ignored run evidence can be removed independently because no product runtime or data migration changes.
> **Spec**: `docs/spec.md`
> **PRD**: `plans/prds/20260712-0409-bdd2-shape-audit.prd.md`
> **Sprint**: `plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md`
> **Task Contract**: `tasks/contracts/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.contract.md`
> **Task Review**: `tasks/reviews/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.review.md`
> **Implementation Notes**: `tasks/notes/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.notes.md`

## Goal

Run the first independent BDD² product proof: 12 held-out Shape tasks under the
same frozen model in baseline and treatment conditions, three repetitions per
condition, followed by condition-blind human adjudication and a reproducible
Pass / Reshape / Kill decision. This slice must not add a public BDD product
surface or prepare Experiment A data as a hidden dependency.

## Agentic Routing

- Selected route: evaluation-only execution in the linked worktree
  `/Users/kito/Projects/repo-harness-worktrees/bdd2-shape-experiment`.
- Routing reason: the row owns an independent evidence and merge boundary; it
  changes committed evaluation authority and produces a product gate decision.
- Due diligence:
  - P1 map: `evals/bdd2/evaluation-manifest.json` owns machine authority;
    `evals/bdd2/tasks/held-out.json` owns agent-visible inputs;
    `evals/bdd2/truth/held-out.json` owns private adjudication truth;
    `evals/bdd2/metrics/shape-metrics.md` owns pre-registered aggregation rules;
    `scripts/run-bdd2-evals.ts` validates and executes; ignored
    `.ai/harness/runs/bdd2/` owns raw prompts, responses, blind packets, private
    mappings, and scores; the tracked report and task review own durable claims.
  - P2 trace: committed per-experiment seal -> held-out S task -> baseline or
    treatment prompt -> stdin-only agent packet in an isolated temporary cwd ->
    raw response -> random blind packet containing task input and response but no
    condition/truth -> locked human score -> private reveal -> pre-registered
    paired aggregation -> recorded gate decision.
  - P3 decision rationale: replace the unused global-seal schema directly with a
    per-experiment seal because S and A are separate hypotheses and Sprint rows.
    No v1 parser or fallback remains because no production consumer or valid run
    depends on it. Run model processes outside the repository so held-out truth
    cannot be discovered from the execution cwd. The first 10x failure would be
    a costly but invalid benchmark caused by truth leakage, post-hoc metrics, or
    cross-experiment freeze coupling; per-experiment content addressing,
    isolation, and pre-registration protect that invariant.

## In Scope

- Directly cut the evaluation manifest/runner/score contracts to v2 with
  independent `foundation` / `sealed` state per experiment; accept no v1 input.
- Add the remaining ten held-out Shape tasks for a heterogeneous 12-task set and
  add private Shape truth needed to adjudicate required, unsupported, protected,
  artifact-tier, and escalation decisions.
- Freeze an explicit Codex CLI/model/reasoning profile and verify its version at
  execution time.
- Deliver prompts via stdin and run each agent invocation in a fresh temporary
  directory outside the repository; blind packets include only task input and
  response, while private mappings retain condition and coordinate data.
- Freeze the Shape aggregation specification before any held-out run.
- Validate locked human score files and reproduce paired win/tie/loss,
  unsupported-expansion change, required/protected omission, correction-cost,
  artifact burden, and authority-fit metrics after reveal.
- Execute exactly `12 × 2 × 3 = 72` successful held-out S coordinates from a
  clean committed HEAD and retain raw evidence under the ignored run surface.
- Record a tracked Experiment S report and Pass / Reshape / Kill decision only
  after condition-blind human scoring is complete.

## Out of Scope

- Experiment A tasks, truth, execution, or conclusions.
- Browser or ImageGen adapter experiments and implementation pilot I.
- Public `repo-harness-bdd` skill, product CLI/MCP tools, hooks, `/check`
  integration, Behavior Brief catalog/validator, sidecar, or lifecycle.
- Model-generated scores presented as human adjudication.
- Retrofitting a generic benchmark framework or adding dependencies.

## Allowed Paths

```yaml
allowed_paths:
  - evals/bdd2/evaluation-manifest.json
  - evals/bdd2/tasks/held-out.json
  - evals/bdd2/truth/held-out.json
  - evals/bdd2/rubrics/blind-adjudication.md
  - evals/bdd2/rubrics/score.schema.json
  - evals/bdd2/metrics/shape-metrics.md
  - evals/bdd2/reports/experiment-s.md
  - scripts/run-bdd2-evals.ts
  - tests/run-bdd2-evals.test.ts
  - tests/bdd2-evals-contract.test.ts
  - plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md
  - plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md
  - tasks/contracts/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.contract.md
  - tasks/reviews/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.review.md
  - tasks/notes/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.notes.md
  - tasks/current.md
  - .ai/harness/handoff/current.md
  - .ai/harness/handoff/resume.md
  - .ai/harness/runs/bdd2
```

## Detailed Design

### Per-experiment authority

- Manifest schema becomes `repo-harness-bdd2-evaluation.v2`.
- Each experiment owns `freeze.id`, `freeze.state`, and `freeze.sealed_at`.
- A run validates only the selected experiment is sealed and that its held-out
  task count exactly matches its own frozen expectation. Unselected experiment
  files remain hash-validated foundation authority but cannot block or borrow a
  claim.
- The runner, task partitions, truth partitions, rubric, score schema, and metric
  specification remain tracked-and-hashed authority at clean HEAD.

### Leakage and execution boundary

- Agent profile requires exact `version_args`, `expected_version`,
  `input_source: stdin`, and `workspace_mode: isolated` fields.
- Runner creates a new OS temporary directory for every coordinate, executes the
  agent there, provides only the materialized packet on stdin, captures the final
  response from stdout, and removes the directory after the process exits.
- The real repository path, task truth, condition alias, prompt path, private
  coordinate, and sibling outputs are absent from agent and reviewer packets.
- The Shape run profile is frozen to `codex-cli 0.144.1`, model
  `gpt-5.6-sol`, reasoning effort `xhigh`, ephemeral mode, ignored user config,
  no repository requirement/rules, and read-only sandbox.

### Blind scoring and aggregation

- Human reviewers receive one self-contained random-ID packet at a time and lock
  a v2 score before reveal. The score records unsupported expansion, required
  omissions, typed/severity-rated protected omissions, authority fit, tracked
  artifact burden, escalation correctness, and correction minutes.
- Conditions reveal only after every required packet has one valid locked final
  score. Missing, duplicate, mismatched, malformed, or unknown packet scores fail
  closed.
- Pairing uses task plus repetition. Pre-registered metrics and zero-denominator
  handling live in `evals/bdd2/metrics/shape-metrics.md`; the summarizer implements
  that document and emits both machine JSON and a human Markdown report.
- Gate logic follows the PRD: unsupported expansion must improve at least 30% with
  wins greater than losses; required behavior omission may not increase and may
  have no stable new treatment omission; new treatment P0/P1 protected omissions
  are zero; correction cost and artifact burden remain inside their thresholds.
  A failed core or protected gate records Kill/Reshape rather than rationalizing
  the result.

## Promotion Gate

- **Merge/PR unit**: Experiment S authority, complete 72-output run, blind scores,
  aggregate report, and decision form one independently reviewable PR.
- **Rollback surface**: revert this branch; ignored raw evidence is removable and
  no runtime migration exists.
- **Verification boundary**: focused tests, manifest validation, clean-HEAD run,
  score validation, deterministic re-summary, strict workflow and repository
  checks.
- **Review/acceptance boundary**: a human blind panel must supply locked scores;
  task review must verify no condition/truth leakage and accept the computed gate
  decision before PR completion.
- **High-risk surface**: benchmark validity and a false productization decision.
- **Why not checklist row**: `merge_boundary` — this row changes frozen
  evaluation authority, incurs remote model execution, and creates an independent
  product decision consumed by later gated rows.

## Evidence Contract

- **State/progress path**: this plan, its contract/notes/review, and Sprint row 2.
- **Verification evidence**: focused Bun tests; `validate`, `plan`, `run`,
  `validate-scores`, and `summarize-shape` outputs; clean HEAD/source commit;
  ignored raw run directory; tracked aggregate report; strict workflow checks.
- **Evaluator rubric**: PRD Experiment S metrics plus proof that packets and
  execution workspace exclude condition/truth identity.
- **Stop condition**: 72 successful coordinates, all blind scores locked and
  valid, reproducible metric report, explicit gate decision, passing review, and
  no Phase P surface in the diff.
- **Rollback surface**: revert the work-package commit/PR and delete ignored raw
  run evidence; no compatibility or data rollback is required.

## Task Breakdown

- [x] Project this decision-complete plan into its contract/review/notes bundle.
- [x] Cut manifest, runner, rubric, and score contracts directly to v2 with
      per-experiment sealing and isolated stdin execution.
- [x] Add and validate the complete 12-task held-out Shape set plus private truth.
- [x] Freeze Shape metric definitions and implement fail-closed score validation
      and deterministic aggregation.
- [x] Add regression tests for independent S sealing, A remaining unsealed,
      isolated cwd/stdin delivery, leakage prevention, score errors, and gate math.
- [x] Commit the final authority, update every frozen hash, and verify a clean HEAD.
- [x] Execute the 72-coordinate held-out Shape run with the frozen Codex profile.
- [ ] Obtain condition-blind human scores without exposing the private mapping.
- [ ] Generate and verify the tracked Experiment S report and gate decision.
- [ ] Complete review/notes/current/handoff, run required checks, commit, push, and
      open the E-02 module PR.

## Exit Criteria

```yaml
exit_criteria:
  files_exist:
    - evals/bdd2/metrics/shape-metrics.md
    - evals/bdd2/reports/experiment-s.md
    - tasks/contracts/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.contract.md
    - tasks/reviews/20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.review.md
  commands_succeed:
    - bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts
    - bun scripts/run-bdd2-evals.ts validate
    - bun scripts/run-bdd2-evals.ts plan --experiment S --partition held_out --dry-run
    - bun scripts/run-bdd2-evals.ts validate-scores --experiment S --run <ignored-run-path>
    - bun scripts/run-bdd2-evals.ts summarize-shape --run <ignored-run-path> --output evals/bdd2/reports/experiment-s.md
    - repo-harness run check-task-workflow --strict
  numeric_assertions:
    - "held-out S task count = 12"
    - "successful run packets = 72"
    - "valid locked final scores = 72"
  manual_checks:
    - "Human blind panel confirms scores were locked before condition reveal"
    - "Review confirms no Phase P product surface or Experiment A claim was introduced"
```

## Stop Conditions

- Stop before execution if any authority input is dirty, untracked, hash-drifted,
  or the selected S experiment is not independently sealed.
- Stop if the agent can inspect the repository/truth partition or the reviewer can
  infer treatment identity from its packet.
- Stop before result claims or PR completion if condition-blind human scores are
  unavailable; model-generated adjudication must not be relabeled as human proof.
- Stop dependent Phase E rows when the computed Shape gate records Kill.

## Rollback Surface

Revert the E-02 PR and delete its ignored raw run directory. There is no product
runtime, persisted user data, migration, public command, or compatibility path.
