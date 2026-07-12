> **Archived**: 2026-07-12 23:21
> **Related Plan**: plans/archive/plan-20260712-2151-harness-cost-baseline-slo.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260712-2321

# Task Contract: harness-cost-baseline-slo

> **Status**: Active
> **Plan**: plans/plan-20260712-2151-harness-cost-baseline-slo.md
> **Task Profile**: eval-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-12 21:51
> **Review File**: `tasks/reviews/20260712-2151-harness-cost-baseline-slo.review.md`
> **Notes File**: `tasks/notes/20260712-2151-harness-cost-baseline-slo.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

repo-harness currently claims a token-lean, hook-dieted workflow without one
machine-readable baseline that distinguishes measured cost from unavailable
telemetry. Without this slice, later routing or hook-removal decisions would be
made from file size and anecdote rather than authoritative evidence.

## Goal

Extend the existing hook-diet report and skill-eval runner with fail-closed cost
evidence, provider-structured token usage, and explicit SLO semantics while
preserving current hook runtime and benchmark behavior.

## Scope

- In scope:
  - Add synthetic phase latency percentiles, SessionStart output/context size,
    an explicitly labeled token estimate, unavailable-runtime evidence, and SLO
    results to `scripts/hook-dispatch-diet-report.ts`.
  - Parse Claude single-result JSON and Codex JSONL usage in
    `scripts/run-skill-evals.ts`, preserve raw output/final responses, and record
    nullable provider-authoritative usage fields.
  - Add focused tests and document evidence authority/SLO definitions in the
    existing harness overview.
  - Update only this plan's workflow artifacts required for review and closeout.
- Out of scope:
  - Hot-path edits to `src/cli/hook/runtime.ts` or any hook script/route.
  - Live hook invocation latency, guard-repeat fingerprints, real
    time-to-first-edit, provider model-call count, or native subagent count.
  - A host-isolated No Harness profile, candidate Lite profile, routing changes,
    context truncation, hook removal, Skill consolidation, or install profiles.
- Taste constraints: Extend the two existing evidence owners in place. Add no
  dependency, service, compatibility path, fallback parser, inferred metric, or
  new abstraction file. Missing structured evidence must remain unavailable/null.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if either CLI cannot emit stable structured usage without
changing task behavior or final-response capture. The cheapest proof is the
focused stub suite: malformed/missing structured data must preserve agent and
grader status while producing unavailable/null usage.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260712-2151-harness-cost-baseline-slo.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260712-2151-harness-cost-baseline-slo.review.md`
- Notes file: `tasks/notes/20260712-2151-harness-cost-baseline-slo.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - scripts/hook-dispatch-diet-report.ts
  - scripts/run-skill-evals.ts
  - tests/hook-dispatch-diet-report.test.ts
  - tests/run-skill-evals.test.ts
  - docs/reference-configs/harness-overview.md
  - assets/reference-configs/harness-overview.md
  - plans/plan-20260712-2151-harness-cost-baseline-slo.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260712-2151-harness-cost-baseline-slo.contract.md
  - tasks/reviews/20260712-2151-harness-cost-baseline-slo.review.md
  - tasks/notes/20260712-2151-harness-cost-baseline-slo.notes.md
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
    - scripts/hook-dispatch-diet-report.ts
    - scripts/run-skill-evals.ts
    - tests/hook-dispatch-diet-report.test.ts
    - tests/run-skill-evals.test.ts
    - docs/reference-configs/harness-overview.md
    - assets/reference-configs/harness-overview.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260712-2151-harness-cost-baseline-slo.notes.md
  tests_pass:
    - path: tests/hook-dispatch-diet-report.test.ts
    - path: tests/run-skill-evals.test.ts
  commands_succeed:
    - bun test tests/hook-dispatch-diet-report.test.ts tests/run-skill-evals.test.ts
    - bun scripts/hook-dispatch-diet-report.ts --repo . --out /tmp/harness-cost-baseline.json --iterations 20 --baseline-ms 250 --json
    - bun run check:type
    - grep -n "Harness Cost Evidence and SLOs" docs/reference-configs/harness-overview.md
    - cmp docs/reference-configs/harness-overview.md assets/reference-configs/harness-overview.md
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: existing benchmark profiles and grader outcomes remain
  unchanged; reports gain additive evidence fields.
- Edge cases: malformed/missing provider JSON records unavailable/null metrics,
  never zero; SessionStart token count is explicitly an estimate, not billing
  usage.
- Regression risks: switching benchmark CLIs to structured output could obscure
  final responses unless the focused tests prove Claude `.result` and Codex `-o`
  preservation.

## Rollback Point

- Commit / checkpoint: branch `codex/harness-cost-baseline-slo` at `e070d18`
  before implementation.
- Revert strategy: revert the reporter, eval runner, focused tests, SLO doc, and
  this plan's workflow artifacts; no persisted data migration is involved.
