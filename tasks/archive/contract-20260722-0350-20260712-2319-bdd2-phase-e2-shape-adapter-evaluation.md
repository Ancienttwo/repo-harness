# Task Contract: bdd2-phase-e2-shape-adapter-evaluation

> **Status**: Fulfilled
> **Plan**: plans/plan-20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.md
> **Task Profile**: eval-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-13 02:20
> **Review File**: `tasks/reviews/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.review.md`
> **Notes File**: `tasks/notes/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Phase E proved that the original Audit treatment should be killed and that Shape must
be reshaped, but its `Shape AND Audit` prerequisite prevented Browser, ImageGen, and
the implementation pilot from running. If this task is skipped, those hypotheses
remain unevaluated. If it ships with weak causal isolation, reference screenshots or
synthetic prototypes could be mistaken for requirement authority and falsely approve
Phase P.

## Goal

Complete BDD² Phase E2 under a newly frozen authority: evaluate the inline-only Shape
treatment, Browser Evidence Adapter, and ImageGen Prototype Adapter independently;
run a four-output page-feature pilot only when Shape and at least one adapter pass;
record one immutable decision per hypothesis; and stop before any Phase P product
surface.

## Scope

- In scope:
  - Directly cut the current S/A evaluation authority to E2 experiments `S2`, `EB`,
    `EI`, and conditional `I2`; do not add a current-authority compatibility parser.
  - Add new development/held-out fixtures, private truth, prompts, score schemas,
    metric specifications, deterministic report projections, and regression tests.
  - Capture task-bound Browser and ImageGen evidence before sealing; preserve raw
    assets and provider metadata under ignored run evidence, and track the selected
    redacted/compressed evaluation assets and appendices with content hashes.
  - Keep evaluated Agent processes isolated and model-transport-only; disable
    browser, web-search, MCP, and external tools, and inject only the frozen adapter
    appendix for treatment coordinates.
  - Split two independent normalized-outcome scores from output-specific evidence-use
    scores; record owner adjudication for every schema-defined primary-reviewer
    disagreement before condition reveal.
  - Execute S2=72, EB=24, and EI=24 outputs and their exact required score counts.
  - If S2=Pass and EB or EI=Pass, execute I2=4 outputs from fresh copies of one frozen
    page-feature fixture; otherwise record I2 as gated-not-run.
  - Publish `experiment-s2`, `experiment-eb`, `experiment-ei`, optional
    `experiment-i2`, and `phase-e2-gate` reports; preserve Phase E reports unchanged.
- Out of scope:
  - The killed Behavior Audit treatment, a renamed Audit hypothesis, or `/check`
    integration.
  - Public BDD skill, CLI/MCP mutation tools, hooks, Behavior Card/Brief catalog,
    JSON sidecar, lifecycle, generic counting linter, screenshot catalog, or prototype
    catalog.
  - Autonomous provider selection, live provider/tool calls inside evaluated Agent runs,
    Phase P implementation, or claims that screenshots/ImageGen prove user demand.
  - Compatibility fallbacks, unrelated cleanup, refactors, dependencies, telemetry,
    or documentation outside the listed evaluation/workflow artifacts.
- Taste constraints: The inline Behavior Card must remain useful for one bounded page
  feature without creating a tracked behavior artifact or unnecessary PRD escalation.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop before held-out execution if the owner-approved E2 authority is dirty,
  unsealed, hash-drifted, uses Phase E held-out tasks, lacks two independent reviewers,
  or allows evaluated Agent browser/web/MCP/tool or repository access beyond the
  required remote model transport.
- Stop only EB or EI as gated-not-run when its named provider cannot produce a frozen,
    privacy-reviewed artifact; never fabricate or substitute evidence.
- Stop before reveal if any primary-reviewer disagreement lacks a locked owner
  adjudication; after reveal scores are immutable and unresolved ambiguity cannot be
  repaired by editing a score.
- Stop I2 unless S2=Pass and at least one of EB/EI=Pass.
- Stop after the Phase E2 gate report; do not implement Phase P.

## Falsifier

The direction is wrong if inline Shape does not reduce unsupported expansion without
new required/protected omissions, or if Browser/ImageGen mostly expand concepts rather
than close their named uncertainty. The cheapest proof is the frozen development
fixture suite plus coordinate/packet isolation tests before any paid held-out run.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.review.md`
- Notes file: `tasks/notes/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/prds/20260712-0409-bdd2-shape-audit.prd.md
  - plans/plan-20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.md
  - evals/bdd2/evaluation-manifest.json
  - evals/bdd2/prompts/
  - evals/bdd2/evidence/
  - evals/bdd2/fixtures/
  - evals/bdd2/tasks/
  - evals/bdd2/truth/
  - evals/bdd2/rubrics/
  - evals/bdd2/metrics/
  - evals/bdd2/reports/
  - scripts/run-bdd2-evals.ts
  - tests/run-bdd2-evals.test.ts
  - tests/bdd2-evals-contract.test.ts
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.contract.md
  - tasks/reviews/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.review.md
  - tasks/notes/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.notes.md
  - .ai/harness/handoff/current.md
  - .ai/harness/handoff/resume.md
  - .ai/harness/runs/bdd2/
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
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - evals/bdd2/evaluation-manifest.json
    - evals/bdd2/metrics/shape-v2-metrics.md
    - evals/bdd2/metrics/browser-adapter-metrics.md
    - evals/bdd2/metrics/imagegen-adapter-metrics.md
    - evals/bdd2/reports/experiment-s2.md
    - evals/bdd2/reports/experiment-eb.md
    - evals/bdd2/reports/experiment-ei.md
    - evals/bdd2/reports/phase-e2-gate.md
  artifacts_exist:
    - .ai/harness/runs/bdd2/
    - tasks/notes/20260712-2319-bdd2-phase-e2-shape-adapter-evaluation.notes.md
  tests_pass:
    - path: tests/run-bdd2-evals.test.ts
    - path: tests/bdd2-evals-contract.test.ts
  commands_succeed:
    - bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts
    - bun scripts/run-bdd2-evals.ts validate
    - repo-harness run check-task-workflow --strict
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts adopt --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 8
  manual_checks:
    - "S2 has exactly 72 outputs and 144 independent outcome scores"
    - "EB has exactly 24 outputs, 48 outcome scores, and 12 EB-1 output-specific evidence-use scores"
    - "EI has exactly 24 outputs, 48 outcome scores, and 12 EI-1 output-specific evidence-use scores"
    - "Every schema-defined reviewer disagreement has a locked pre-reveal owner adjudication"
    - "I2 has exactly 4 outputs when its prerequisite passes, otherwise the gate report records gated-not-run"
    - "Phase E historical reports remain unchanged and Behavior Audit remains killed"
    - "No public Phase P product surface exists in the reviewed diff"
    - "Evaluator review file and external acceptance recommend pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: every hypothesis receives an independent evidence-backed
  decision; adapter results remain conditional efficacy evidence rather than product
  authorization.
- Edge cases: zero baseline disagreement, provider unavailable, privacy rejection,
  external asset drift, score disagreement, decision-boundary adjudication, failed
  S2 prerequisite, and contaminated I2 workspace all fail closed.
- Regression risks: replacing the S/A current schema must not rewrite Phase E reports
  or weaken existing path/hash/environment isolation checks.

## Rollback Point

- Commit / checkpoint: E2 authority freeze commit before held-out execution; separate
  evidence/report commits may follow after immutable runs.
- Revert strategy: revert the E2 evaluation commits and remove ignored E2 raw runs;
  Phase E history and product runtime are unaffected.
