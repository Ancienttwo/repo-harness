# Plan: BDD² Experiment A — Audit Hypothesis

> **Status**: Executing
> **Created**: 20260712-1811
> **Slug**: bdd2-e-03-run-experiment-a-audit-hypothesis
> **Planning Source**: waza-think
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md#BDD2-E-03 — Run Experiment A: audit hypothesis
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Frozen 48-coordinate Audit run, condition-blind adjudication, deterministic metric projection, strict workflow checks, and an independent PR review.
> **Rollback Surface**: Revert branch `codex/bdd2-audit-experiment`; ignored raw run evidence can be removed independently because this slice adds no product runtime or migration.
> **PRD**: `plans/prds/20260712-0409-bdd2-shape-audit.prd.md`
> **Sprint**: `plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md`
> **Spec**: `docs/spec.md`
> **Task Contract**: `tasks/contracts/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.contract.md`
> **Task Review**: `tasks/reviews/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.review.md`
> **Implementation Notes**: `tasks/notes/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.notes.md`

## Goal

Run the second independent BDD² product proof: 12 held-out seeded/clean Audit
fixtures under baseline and treatment review prompts, two repetitions per
condition, followed by condition-blind adjudication and a deterministic Pass or
Kill decision. The experiment must prove or reject Audit on precision, seeded
recall, clean false positives, correct no-findings, and severity agreement without
creating any public BDD product surface.

## Success Criteria

- Exactly `12 × 2 × 2 = 48` successful held-out Audit outputs come from one clean,
  committed, content-addressed authority revision.
- Held-out fixtures contain six seeded and six clean tasks spanning web, CLI, and
  native UI behavior; development material is not used to tune after sealing.
- Condition-blind final scores match every response finding to at most one seeded
  truth issue; duplicate matches cannot inflate precision or recall.
- Treatment gates all pass: precision ≥70%, overall seeded recall ≥80%, P0/P1
  seeded recall =100%, clean false-positive rate ≤20%, correct no-findings ≥80%,
  severity agreement ≥85%, and no P0/P1 underestimation.
- A tracked report and generated 48-row evidence projection reproduce the decision
  from ignored raw packets, scores, mappings, and source-commit authority.
- Current Shape result and authority remain unchanged; no Experiment E/I or Phase P
  surface is added.

## Agentic Routing

- Selected route: isolated evaluation-only contract in
  `/Users/kito/Projects/repo-harness-worktrees/bdd2-audit-experiment`.
- Routing reason: E-03 owns an independent product claim, evidence set, rollback
  surface, and PR boundary.
- P1 architecture map:
  - `evals/bdd2/evaluation-manifest.json` owns frozen experiment and adjudication
    authority.
  - `evals/bdd2/tasks/held-out.json` owns agent-visible fixtures;
    `evals/bdd2/truth/held-out.json` owns private clean/seeded truth.
  - `evals/bdd2/prompts/audit-*.md` own the two review conditions.
  - per-experiment score schemas and metric specs own adjudication contracts;
    `scripts/run-bdd2-evals.ts` validates, executes, projects, and summarizes.
  - `.ai/harness/runs/bdd2/` owns ignored raw packets, mappings, responses, and
    locked scores; the tracked evidence/report own durable claims.
- P2 concrete trace:
  - sealed A authority → held-out fixture → baseline/treatment prompt → isolated
    Codex stdin invocation → blind response packet → condition-blind finding-to-truth
    score → private reveal → deterministic per-condition metrics → Pass/Kill report.
  - Missing/duplicate coordinates, truth leakage, prompt drift, duplicate truth
    matches, invalid no-findings, or severity underestimation fail before summary.
- P3 design decision:
  - Cut the manifest directly to a new schema with per-experiment adjudication
    authority. Keep no v2 parser, global score-schema fallback, or dual authority.
  - Preserve the existing Shape schema as a renamed Shape-specific file and add a
    separate Audit score schema/metric spec; A cannot seal until both are hashed.
  - Reuse the proven coordinate-envelope invariant for S and A rather than creating
    a second weaker projector. Extract shared code only where both projectors consume
    the same source-commit validation.
  - At 10× scale, blind adjudication throughput and duplicate matching fail first;
    flat deterministic files and uniqueness checks are sufficient here. A database,
    service, generic benchmark package, or queue is not justified.

## Scope

### In Scope

- Direct manifest cutover to per-experiment score schema and metric authority.
- Rename the generic Shape score schema to a Shape-specific path; add an Audit-only
  schema with no compatibility alias.
- Add ten held-out Audit fixtures so the set contains six seeded and six clean tasks
  across web, CLI, and native UI behavior, with exhaustive private truth.
- Freeze Audit metrics and pass/kill rules before any held-out execution.
- Extend the runner with fail-closed Audit score validation, exact-coordinate
  projection, and deterministic summarization while preserving the Shape result.
- Freeze `/Users/kito/.local/bin/codex`, `codex-cli 0.144.1`, `gpt-5.6-sol`, xhigh
  reasoning, stdin/stdout, ephemeral mode, read-only sandbox, and minimal isolated
  environment for the 48-coordinate run.
- Obtain owner-authorized condition-blind Agent adjudication, validate 48/48 locked
  scores before reveal, and report evidence grade explicitly.
- Generate the tracked Experiment A report/evidence, record Pass or Kill, run full
  checks, and ship one E-03 PR.
- Correct the Sprint projection that E-02 merged as PR #59 and attach the E-03 plan
  to backlog row 3; this is workflow state only, not hypothesis coupling.

### Out of Scope

- Rerunning or reinterpreting Experiment S.
- Experiment E Browser/ImageGen adapters or Experiment I implementation pilot.
- Public `repo-harness-bdd` skill, CLI/MCP tools, hook, `/check` integration,
  Behavior Brief catalog/validator, sidecar, lifecycle, or product runtime.
- Human-panel claims; Agent adjudication must be labeled as proxy evidence.
- Generic eval framework, database, service, new dependency, or compatibility path.
- Treating a Pass as Phase P authorization; final Phase E gate remains E-06.

## Authority and Schema Decisions

### Manifest cutover

- `repo-harness-bdd2-evaluation.v3` replaces v2 directly.
- `adjudication.experiments.S` owns the Shape score schema and metrics hash.
- `adjudication.experiments.A` owns the Audit score schema and metrics hash.
- The shared blind-review rubric remains common because both experiments use the
  same condition-blind packet protocol; experiment-specific fields do not.
- Foundation-only experiments still have no runnable agent profile. Sealing A
  requires one exact agent profile; S remains foundation-only and does not borrow A's
  claim.

### Audit score

Each locked score records:

- packet/task identity, reviewer, lock time, and `experiment: A`;
- response verdict: `pass | findings | inconclusive`;
- every distinct response finding with a stable reviewer reference, reported
  severity, one optional matched seeded issue ID, and match notes;
- correction minutes and adjudication notes.

The validator enforces that `pass` has zero findings, `findings` has at least one,
matched issue IDs exist in that task's truth, and one seeded issue cannot be claimed
by multiple response findings. Unmatched findings are false positives. Missing truth
issues are derived rather than reviewer-authored.

### Audit metrics

- Precision: unique truth-matched findings / all reported findings.
- Seeded recall: unique seeded issues matched / all seeded issues.
- P0/P1 recall: matched P0/P1 issues / all P0/P1 issues.
- Clean false-positive rate: clean outputs containing any finding / all clean outputs.
- Correct no-findings: clean outputs with `verdict: pass` and zero findings / all
  clean outputs. `inconclusive` is not a correct no-findings result.
- Severity agreement: matched findings whose reported severity is identical or one
  adjacent level / all matched findings, with an independent hard gate forbidding
  any P0/P1 underestimation.
- Correction cost is reported by condition but is not substituted for the five
  explicit Audit quality gates.

## File Changes

| File | Action | Responsibility |
|---|---|---|
| `evals/bdd2/evaluation-manifest.json` | Update | v3 per-experiment adjudication and sealed A profile. |
| `evals/bdd2/tasks/held-out.json` | Update | Complete 12-task Audit fixture set. |
| `evals/bdd2/truth/held-out.json` | Update | Exhaustive seeded/clean Audit truth. |
| `evals/bdd2/rubrics/score.schema.json` | Delete | Remove misleading global/Shape-only authority. |
| `evals/bdd2/rubrics/shape-score.schema.json` | Add | Shape-only locked score authority. |
| `evals/bdd2/rubrics/audit-score.schema.json` | Add | Audit-only locked score authority. |
| `evals/bdd2/rubrics/blind-adjudication.md` | Update | Exact Audit matching and no-findings rules. |
| `evals/bdd2/metrics/audit-metrics.md` | Add | Frozen metric formulas and Pass/Kill thresholds. |
| `evals/bdd2/reports/experiment-a-evidence.json` | Add | Generated durable 48-row scored-coordinate authority. |
| `evals/bdd2/reports/experiment-a.md` | Add | Metrics, gate decision, and evidence limits. |
| `scripts/run-bdd2-evals.ts` | Update | v3 validation, Audit scoring/projection/summary. |
| `tests/run-bdd2-evals.test.ts` | Update | Audit schema, coordinate, metric, and kill regressions. |
| `tests/bdd2-evals-contract.test.ts` | Update | Phase E surface and independent authority contract. |
| Sprint/plan/contract/review/notes/current/handoff | Update | E-02/E-03 workflow projection and evidence. |

This slice changes more than eight files because the frozen authority, fixtures,
private truth, runner, deterministic projection, tests, and workflow evidence must
change atomically. It adds no runtime dependency or service.

## Risks and Stop Conditions

| Risk | Mitigation / stop |
|---|---|
| Free-text output makes finding boundaries ambiguous | Blind reviewer assigns stable finding refs; unresolved ambiguity becomes `inconclusive`, never an invented match. |
| Truth or treatment leaks to the review agent | Isolated cwd/HOME, minimal env, agent-visible task file without truth, randomized packet IDs, separate private mapping. Stop and invalidate the revision on any leak. |
| Duplicate response findings inflate recall | Matched truth IDs are unique per score; duplicates are false positives or validation failures. |
| Clean fixtures reward silence without adequate review | Correct no-findings requires explicit `pass`; `inconclusive` does not count. |
| Proxy panel is mistaken for human evidence | Report labels Agent panel, reviewer overlap, and limitations; no human claim. |
| A prompt/schema changes after run | Preserve source commit as invalid evidence, cut a new foundation revision, and rerun; no compatibility reader. |
| Any Audit gate fails | Record `Kill` for Audit productization. Do not soften thresholds or start E/I. |

## Verification

Before remote execution:

```bash
bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts
bunx tsc --noEmit --pretty false
bun scripts/run-bdd2-evals.ts validate
bun scripts/run-bdd2-evals.ts plan --experiment A --partition held_out --dry-run
```

After execution and scoring:

```bash
bun scripts/run-bdd2-evals.ts validate-scores --experiment A --run <run>
bun scripts/run-bdd2-evals.ts project-audit-evidence --run <run> --output evals/bdd2/reports/experiment-a-evidence.json
bun scripts/run-bdd2-evals.ts summarize-audit --run <run> --output evals/bdd2/reports/experiment-a.md
repo-harness run verify-contract -- --contract tasks/contracts/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.contract.md --read-only --strict
bun run check:ci
```

Manual acceptance:

- 48 successful outputs and 48 unique locked final scores exist before reveal.
- Six seeded and six clean tasks are represented in each condition twice.
- Tracked evidence reproduces byte-for-byte from raw evidence and source commit.
- Report includes every pre-registered metric, condition totals, gate, and evidence limitation.
- No public BDD product surface, default hook latency, or parallel authority appears.

## Task Breakdown

- [x] Expand Sprint row E-03 into this decision-complete plan.
- [x] Project the plan into an E-03 contract/review/notes bundle in this worktree.
- [x] Cut manifest/adjudication authority directly to v3 with separate Shape/Audit schemas.
- [x] Complete and validate the six-seeded/six-clean held-out Audit fixture set.
- [x] Freeze Audit metric rules and implement score, coordinate, projection, and summary validation.
- [x] Add focused happy-path and fail-closed regressions, then pass typecheck/validation.
- [x] Seal A with the exact Codex profile at a clean committed HEAD.
- [ ] Execute all 48 coordinates and retain ignored raw evidence.
- [ ] Obtain and validate 48 condition-blind Agent-panel scores before reveal.
- [ ] Generate durable evidence, metrics, Pass/Kill report, and evidence-grade disclosure.
- [ ] Run strict contract/full CI/external review, push, and open the E-03 module PR.

## Promotion Gate

- **Merge/PR unit**: Experiment A's frozen authority, 48-run evidence, locked
  adjudication, deterministic report, and tests ship together as one E-03 PR.
- **Rollback surface**: revert the E-03 PR and delete ignored Audit run evidence;
  no product runtime or persisted user state changes.
- **Verification boundary**: focused runner tests, exact 48-coordinate plan/run,
  score/evidence/report validation, strict contract, full CI, and hosted matrix.
- **Review/acceptance boundary**: the E-03 review binds the exact diff fingerprint
  and independently checks all pre-registered Audit gates and evidence limits.
- **High-risk surface**: held-out leakage, duplicate truth matching, post-hoc metric
  changes, and false human-evidence claims invalidate the experiment.
- **Why not checklist row**: E-03 is an independent hypothesis, source-commit freeze,
  expensive run, product gate, rollback surface, and required PR boundary.

## Evidence Contract

- State/progress path: this plan, the E-03 contract/review/notes, Sprint row 3,
  `tasks/current.md`, and ignored run snapshots.
- Verification evidence: exact commands above, 48-coordinate raw run, 48 locked
  scores, generated tracked evidence/report, hosted PR checks, and external review.
- Evaluator rubric: the E-03 review must bind the exact diff fingerprint and record
  all Audit gates without manual threshold override.
- Stop condition: record Pass or Kill, preserve limitations, and stop before any
  dependent or productization scope.
- Rollback surface: revert the E-03 branch/PR and remove ignored Audit run evidence;
  there is no product runtime, persisted user state, or migration to unwind.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`
- Exact next step: run `repo-harness run plan-to-todo --plan plans/plan-20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.md` in this existing worktree, then implement only the generated contract's allowed paths.
