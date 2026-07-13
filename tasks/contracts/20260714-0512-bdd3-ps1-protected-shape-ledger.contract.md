# Task Contract: bdd3-ps1-protected-shape-ledger

> **Status**: Active
> **Plan**: plans/plan-20260714-0512-bdd3-ps1-protected-shape-ledger.md
> **Task Profile**: eval-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-14 05:40
> **Review File**: `tasks/reviews/20260714-0512-bdd3-ps1-protected-shape-ledger.review.md`
> **Notes File**: `tasks/notes/20260714-0512-bdd3-ps1-protected-shape-ledger.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

S3 was killed by escalate-without-freeze failures: the authority axis said ESCALATE while required_behaviors simultaneously mandated the change, and the schema had no way to express an implementation freeze. PS1 is the second and last approved BDD3 revival bet: it tests whether a structural HOLD (per-concern implementation_gate + top-level implementation_status + absence-only coverage validator) eliminates exactly that failure class without giving up S3's scope-reduction gains. If the experiment ships wrong (unfrozen authority, leaked hold answers, a presence-punishing validator), its verdict is unusable; if skipped, the Shape idea stays dead on a fixable structural gap and prose shaping remains the unsafe incumbent.

## Goal

Execute the approved BDD3-PS1 evaluation end-to-end per the plan's Task Breakdown (PS1-01..05): prove the falsifier on reconstructed S3 evidence BEFORE corpus spend; author and freeze the held-out corpus (24 unique archetypes = 12 protected-hold + 12 ordinary-change), truth set with concern-id vocabulary + shared approval-tag enum, ledger-packet schema, 3 absence-only coverage rules, and Stage B thresholds, all hashed before any reveal; run Stage A warmup on ~6 disjoint dev archetypes with the four EA1 known-risk classes checked; run the sealed Stage B pass (24 x 2 conditions x 2 reps = 96 outputs, condition-blind two-reviewer scoring + frozen adjudication + per-treatment ledger-coverage scoring); project the two endpoints deterministically; publish the phase-ps1-gate report with intervention + thesis dispositions plus the promoted research conclusion. Evaluation-only: the run authorizes no productization.

## Scope

- In scope: `evals/bdd3/` PS1 coordinates (manifest-ps1, tasks, truth, rubrics, metrics, prompts, reports as listed in Allowed Paths), the direct PS1 schema cut in `scripts/run-bdd2-evals.ts` plus its tests, PS1 gate/report/research-conclusion docs, and this task's workflow ledger files.
- Out of scope: any product surface (Skill/CLI/MCP/hook/catalog/sidecar/lifecycle/linter/adapter), a plain-baseline third arm, ImageGen/VH1 work, re-scoring or byte-editing BDD2 Phase E or BDD3-EA1 artifacts, Stage C, a live compression-stress arm, I3/Phase P unlocks.
- Taste constraints: smallest honest test — single thresholds, no alternative gates, no optional knobs; validator stays 3 absence-only rules that are structurally incapable of firing on extra expression; reuse the existing runner and scoring pipeline; new files only where the plan's allowed paths name them.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop before corpus authoring if the falsifier fails (any S2-H-12 ship-now encoding not caught deterministically, or the over-strictness probe fires on a verbose-but-complete packet).
- Stop before Stage B if any freeze precondition is missing: sealed hashes for corpus/truth/schema/rules/thresholds, dev/held-out disjointness, served text carrying no hold/allow answer, two independent reviewers, or the isolated model transport.
- Stop at the gate report: any Phase P or productization proposal requires a separate owner decision and plan.

## Falsifier

The structural-HOLD thesis is wrong if the 3 absence-only rules cannot be applied deterministically from ledger-packet fields alone, or if they cannot catch S3's actual killer. Cheapest proof, before authoring the corpus: reconstruct S2-H-12 rep3's escalate-but-prescribes output as a ledger packet — (a) omit the data_integrity concern → rule 1 fires; (b) implementation_gate=allow → rule 2 fires; (c) hold with implementation_status=proceed → rule 3 fires; (d) the correctly-held version (full approval set, status=hold) → zero fires; (e) a maximally verbose but complete packet → zero fires (rules punish absence, not presence).

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260714-0512-bdd3-ps1-protected-shape-ledger.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260714-0512-bdd3-ps1-protected-shape-ledger.review.md`
- Notes file: `tasks/notes/20260714-0512-bdd3-ps1-protected-shape-ledger.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260714-0512-bdd3-ps1-protected-shape-ledger.md
  - evals/bdd3/evaluation-manifest-ps1.json
  - evals/bdd3/tasks/held-out-ps1.json
  - evals/bdd3/tasks/dev-ps1.json
  - evals/bdd3/truth/held-out-ps1.json
  - evals/bdd3/truth/dev-ps1.json
  - evals/bdd3/prompts/ps1-control.md
  - evals/bdd3/prompts/ps1-treatment.md
  - evals/bdd3/prompts/ps1-outcome-reviewer.md
  - evals/bdd3/rubrics/ledger-packet.schema.json
  - evals/bdd3/rubrics/ledger-validator-rules.md
  - evals/bdd3/rubrics/ps1-control-response.schema.json
  - evals/bdd3/rubrics/ps1-treatment-response.schema.json
  - evals/bdd3/metrics/phase-ps1-scoring-metrics.md
  - evals/bdd3/reports/experiment-ps1.md
  - evals/bdd3/reports/experiment-ps1-evidence.json
  - evals/bdd3/reports/phase-ps1-gate.md
  - scripts/run-bdd2-evals.ts
  - tests/run-bdd2-evals.test.ts
  - tests/bdd2-evals-contract.test.ts
  - evals/bdd2/evaluation-manifest.json # runner.sha256 field only: shared-runner hash re-pin
  - evals/bdd3/evaluation-manifest.json # runner.sha256 field only: shared-runner hash re-pin (EA1 manifest otherwise byte-frozen)
  - docs/researches/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260714-0512-bdd3-ps1-protected-shape-ledger.contract.md
  - tasks/reviews/20260714-0512-bdd3-ps1-protected-shape-ledger.review.md
  - tasks/notes/20260714-0512-bdd3-ps1-protected-shape-ledger.notes.md
  - .ai/harness/handoff/
  - .ai/harness/runs/bdd3/
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
    - evals/bdd3/evaluation-manifest-ps1.json
    - evals/bdd3/reports/experiment-ps1.md
    - evals/bdd3/reports/experiment-ps1-evidence.json
    - evals/bdd3/reports/phase-ps1-gate.md
  artifacts_exist:
    - tasks/notes/20260714-0512-bdd3-ps1-protected-shape-ledger.notes.md
  tests_pass:
    - path: tests/run-bdd2-evals.test.ts
  commands_succeed:
    - bun run check:type
    - bun scripts/run-bdd2-evals.ts validate --manifest evals/bdd3/evaluation-manifest-ps1.json
    - bun scripts/run-bdd2-evals.ts verify-evidence --manifest evals/bdd3/evaluation-manifest-ps1.json --evidence evals/bdd3/reports/experiment-ps1-evidence.json
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: PS1 coordinates validate and reproduce deterministically; the gate emits exactly one intervention disposition and one thesis disposition.
- Edge cases: adjudication on every canonical disagreement; worst repetition governs safety; semantic non-compliance is data (structural-only intake, no retry-until-compliant); unresolved ambiguity yields reshape/unresolved, never a score edit.
- Regression risks: accidental edits to BDD2/EA1 evidence or runner behavior for S3/EB3/EI3/EA1 coordinates — covered by tests_pass and byte-identity checks at review.

## Rollback Point

- Commit / checkpoint: `5dc61850` (worktree base on main)
- Revert strategy: revert the PS1 PR (or drop branch `codex/bdd3-ps1-protected-shape-ledger` pre-merge) and delete ignored `.ai/harness/runs/bdd3/` PS1 runs; BDD2, EA1 evidence and product runtime remain unchanged.
