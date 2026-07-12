# Task Contract: bdd2-phase-e3-scoring-authority

> **Status**: Fulfilled
> **Plan**: plans/plan-20260713-0314-bdd2-phase-e3-scoring-authority.md
> **Task Profile**: eval-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-13 04:50
> **Review File**: `tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md`
> **Notes File**: `tasks/notes/20260713-0314-bdd2-phase-e3-scoring-authority.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Phase E2 executed the Browser and ImageGen adapter hypotheses but its scoring authority
was invalidated by three post-seal semantic defects. Without E3, inline Shape and both
adapters remain inconclusive and the implementation pilot cannot receive a valid gate.
If E3 silently edits E2 evidence or leaks conditions to reviewers, it manufactures an
efficacy result and invalidates the entire BDD² Sprint.

## Goal

Rescore the immutable E2 Agent outputs under a new pre-sealed authority that freezes
disagreement resolution, distinguishes explicit limitations from unsupported
assertions, and derives implementation artifacts from filesystem evidence. Record
independent S3/EB3/EI3 decisions, run exactly four I3 outputs only when its prerequisite
passes, publish a Sprint-level gate, and stop before Phase P.

## Scope

- In scope:
  - Direct-cut the current evaluation authority from E2 to E3 with no compatibility
    parser or dual source of truth.
  - Track a redacted E3 source corpus whose full and normalized response hashes match
    all 120 immutable E2 Agent outputs; do not generate replacement intervention output.
  - Freeze reviewer/adjudicator identities, prompts, schemas, model transport, packet
    isolation, disagreement resolution, metrics, thresholds, and report projection.
  - Execute two primary outcome scores per row, one fresh adjudicator score for every
    canonical disagreement, and one output-specific evidence score per adapter
    treatment row.
  - Record Pass/Reshape/Kill for S3, EB3, and EI3; conditionally execute I3 from four
    fresh fixture materializations.
  - Preserve Phase E and E2 reports byte-for-byte and update PRD/Sprint/workflow truth.
- Out of scope:
  - New intervention outputs for S2, EB, or EI; rewriting any historical score or
    decision; Behavior Audit resurrection.
  - Public BDD skill, CLI/MCP tools, hooks, catalog, sidecar, lifecycle, generic
    counting linter, screenshot/prototype repository, or Phase P implementation.
  - Browser/ImageGen provider calls; E3 scores the already-frozen task-bound assets.
- Taste constraints: scoring authority must be smaller than E2, explicit, and
  reproducible from a clean checkout; no post-reveal threshold or semantic changes.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop before score execution if the E3 source corpus does not match all E2 response
  hashes or if reviewer packets expose condition, pair, provider, URL, or appendix.
- Stop before reveal if any required score/adjudication is missing or any reviewer
  identity is reused across prohibited roles.
- Stop I3 unless S3=Pass and EB3=Pass or EI3=Pass.
- Stop after the Phase E3 gate; Phase P requires a separate owner decision.

## Falsifier

The direction is wrong if a corrected pre-sealed scorer cannot produce stable decisions
without condition leakage, or if fresh reviewer scores still show Shape/adapters expand
surface or omit required/protected behavior. The cheapest proof is a development-corpus
score roundtrip plus packet-leakage and deterministic-projection tests before held-out
scoring.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260713-0314-bdd2-phase-e3-scoring-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md`
- Notes file: `tasks/notes/20260713-0314-bdd2-phase-e3-scoring-authority.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260713-0314-bdd2-phase-e3-scoring-authority.md
  - plans/prds/20260712-0409-bdd2-shape-audit.prd.md
  - plans/sprints/20260712-bdd2-phase-e-evaluation.sprint.md
  - evals/bdd2/evaluation-manifest.json
  - evals/bdd2/evidence/e3/
  - evals/bdd2/prompts/
  - evals/bdd2/rubrics/
  - evals/bdd2/metrics/
  - evals/bdd2/reports/
  - scripts/run-bdd2-evals.ts
  - tests/run-bdd2-evals.test.ts
  - tests/bdd2-evals-contract.test.ts
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260713-0314-bdd2-phase-e3-scoring-authority.contract.md
  - tasks/reviews/20260713-0314-bdd2-phase-e3-scoring-authority.review.md
  - tasks/notes/20260713-0314-bdd2-phase-e3-scoring-authority.notes.md
  - .ai/harness/handoff/current.md
  - .ai/harness/handoff/resume.md
  - .ai/harness/runs/bdd2/e3/
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
    - evals/bdd2/evidence/e3/source-corpus.json
    - evals/bdd2/reports/experiment-s3.md
    - evals/bdd2/reports/experiment-eb3.md
    - evals/bdd2/reports/experiment-ei3.md
    - evals/bdd2/reports/experiment-i3.md
    - evals/bdd2/reports/phase-e3-gate.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260713-0314-bdd2-phase-e3-scoring-authority.notes.md
  tests_pass:
    - path: tests/run-bdd2-evals.test.ts
    - path: tests/bdd2-evals-contract.test.ts
  commands_succeed:
    - bun test tests/run-bdd2-evals.test.ts tests/bdd2-evals-contract.test.ts
    - bun scripts/run-bdd2-evals.ts validate
    - bun scripts/run-bdd2-evals.ts verify-evidence --evidence evals/bdd2/reports/experiment-s3-evidence.json
    - bun scripts/run-bdd2-evals.ts verify-evidence --evidence evals/bdd2/reports/experiment-eb3-evidence.json
    - bun scripts/run-bdd2-evals.ts verify-evidence --evidence evals/bdd2/reports/experiment-ei3-evidence.json
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts adopt --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 8
  manual_checks:
    - "Evaluator review file recommends pass"
    - "No new S2/EB/EI intervention output exists"
    - "Every E3 corpus row matches its E2 full and normalized hashes"
    - "Historical Phase E and E2 reports are byte-identical"
    - "I3 ran exactly four outputs only when its prerequisite passed, otherwise gated-not-run"
    - "Current Behavior Audit remains killed and no Phase P surface exists"
```

## Acceptance Notes (Human Review)

- Functional behavior: corrected scoring produces immutable independent decisions and
  gates I3 without authorizing productization.
- Edge cases: zero baseline disagreement, reviewer disagreement, missing adjudicator,
  role identity reuse, corpus/hash drift, evidence limitation vs assertion, nonclosable
  ImageGen tasks, failed I3 prerequisite, contaminated fixture copies.
- Regression risks: historical evidence mutation, treatment leakage, post-reveal rule
  changes, or accidental public product surface.

## Rollback Point

- Commit / checkpoint: sealed E3 authority before held-out scores.
- Revert strategy: revert E3 commits and delete ignored E3 runs; Phase E/E2 remain
  unchanged and authoritative.
