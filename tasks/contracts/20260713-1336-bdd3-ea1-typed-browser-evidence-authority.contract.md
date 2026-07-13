# Task Contract: bdd3-ea1-typed-browser-evidence-authority

> **Status**: Active
> **Plan**: plans/plan-20260713-1336-bdd3-ea1-typed-browser-evidence-authority.md
> **Task Profile**: eval-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-13 19:13
> **Review File**: `tasks/reviews/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.review.md`
> **Notes File**: `tasks/notes/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

BDD2 Phase E killed all three treatments; the dual-track adjudication (docs/researches/20260713-bdd3-ea1-direction-adjudication.md) approved exactly one revival bet: browser evidence is host capability, and the only candidate product value is a thin typed evidence authority contract governing what evidence may close. If this experiment ships wrong (unfrozen scoring authority, leaked corpus, or a treatment-only safety metric), its verdict is unusable and the killed-adapter question reopens on vibes; if it is skipped, browser evidence stays ungoverned and the EB-H-04 class of compliance leak (screenshot-to-policy/need inference) remains unmeasured and unprevented.

## Goal

Execute the approved BDD3-EA1 evaluation end-to-end per the plan's Task Breakdown (EA1-01..05): author and freeze the held-out corpus (24 unique archetypes = 12 closable + 12 authority-trap), truth set, single shared evidence appendix, typed-packet schema, 6 deterministic validator rules, and Stage B gate thresholds, all hashed before any Stage B output exists; run Stage A warmup on ~6 disjoint dev archetypes; run the sealed Stage B confirmatory pass (24 x 2 conditions x 2 repetitions = 96 outputs, condition-blind two-reviewer scoring + frozen adjudication + per-output evidence-compliance on both arms); project the two endpoints deterministically; and publish the phase-ea1-gate report with intervention + thesis dispositions plus the promoted research conclusion. Evaluation-only: the run authorizes no productization.

## Scope

- In scope: `evals/bdd3/` (manifest, tasks, truth, evidence appendix, rubrics, metrics, prompts, reports), the direct EA1 schema cut in `scripts/run-bdd2-evals.ts` plus its tests, EA1 gate/report/research-conclusion docs, and this task's workflow ledger files.
- Out of scope: any product surface (Skill/CLI/MCP/hook/catalog/sidecar/lifecycle/linter/adapter), ImageGen work, re-scoring or byte-editing BDD2 Phase E artifacts, Stage C scale qualification, a live-tool arm, I3/Phase P unlocks.
- Taste constraints: smallest honest test — single thresholds, no alternative gates, no optional knobs; validator stays 6 deterministic rules; reuse the existing runner and scoring pipeline; new files only where the plan's allowed paths name them.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop before Stage B if any freeze precondition is missing: sealed hashes for corpus/truth/appendix/schema/rules/thresholds, dev/held-out disjointness, two independent reviewers, or the isolated model transport.
- Stop at the gate report: any Phase P or productization proposal requires a separate owner decision and plan.

## Falsifier

The thin-contract thesis is wrong if the 6 validator rules cannot be applied deterministically from packet fields alone (i.e., rule application demands per-output semantic judgment). Cheapest proof point, before authoring the full corpus: apply the drafted rules to two known BDD2 outputs — EB-H-04 treatment rep 1 (must flag: invented one-retry policy, screenshot-derived feature need) and one clean EB3 output (must pass) — using only packet-level fields.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260713-1336-bdd3-ea1-typed-browser-evidence-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.review.md`
- Notes file: `tasks/notes/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260713-1336-bdd3-ea1-typed-browser-evidence-authority.md
  - evals/bdd3/
  - evals/bdd2/evaluation-manifest.json # runner.sha256 field only: shared-runner hash re-pin; all other BDD2 bytes stay frozen
  - scripts/run-bdd2-evals.ts
  - tests/run-bdd2-evals.test.ts
  - tests/bdd2-evals-contract.test.ts
  - docs/researches/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.contract.md
  - tasks/reviews/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.review.md
  - tasks/notes/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.notes.md
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
    - evals/bdd3/evaluation-manifest.json
    - evals/bdd3/reports/experiment-ea1.md
    - evals/bdd3/reports/experiment-ea1-evidence.json
    - evals/bdd3/reports/phase-ea1-gate.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260713-1336-bdd3-ea1-typed-browser-evidence-authority.notes.md
  tests_pass:
    - path: tests/run-bdd2-evals.test.ts
  commands_succeed:
    - bun run check:type
    - bun scripts/run-bdd2-evals.ts validate --manifest evals/bdd3/evaluation-manifest.json
    - bun scripts/run-bdd2-evals.ts verify-evidence --manifest evals/bdd3/evaluation-manifest.json --evidence evals/bdd3/reports/experiment-ea1-evidence.json
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
    - "Scoring-authority hashes (corpus, truth, appendix, schema, rules, thresholds) sealed before any Stage B output was generated"
    - "phase-ea1-gate.md records intervention and thesis dispositions from the frozen thresholds, unchanged post-reveal"
    - "BDD2 Phase E artifacts byte-identical to main"
```

## Acceptance Notes (Human Review)

- Functional behavior: EA1 coordinates validate and reproduce deterministically; the gate emits exactly one intervention disposition and one thesis disposition.
- Edge cases: adjudication on every canonical disagreement; worst repetition governs safety; unresolved ambiguity yields reshape/unresolved, never a score edit.
- Regression risks: accidental edits to BDD2 evidence or runner behavior for S3/EB3/EI3 coordinates — covered by tests_pass and the byte-identical manual check.

## Rollback Point

- Commit / checkpoint: `d65e45b` (worktree base on main)
- Revert strategy: revert the EA1 PR (or drop branch `codex/bdd3-ea1-typed-browser-evidence-authority` pre-merge) and delete ignored `.ai/harness/runs/bdd3/`; BDD2 Phase E evidence and product runtime remain unchanged.
