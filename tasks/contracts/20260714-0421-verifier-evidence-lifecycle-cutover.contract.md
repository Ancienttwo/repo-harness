# Task Contract: verifier-evidence-lifecycle-cutover

> **Status**: Active
> **Plan**: plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md
> **Task Profile**: code-change
> **Workflow Profile**: strict
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-14 04:22
> **Review File**: `tasks/reviews/20260714-0421-verifier-evidence-lifecycle-cutover.review.md`
> **Notes File**: `tasks/notes/20260714-0421-verifier-evidence-lifecycle-cutover.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The synchronous verifier currently executes every `commands_succeed` entry without
a global wall-clock budget. A fulfilled benchmark contract still lists the live
3x9 provider matrix and repeats focused tests before `bun test`, so a Done/finish
gate can spend hours producing evidence instead of validating a frozen subject.
Review and benchmark freshness are also tied to Git ancestry rather than the
actual bytes being accepted, and sprint verification still admits Human Review
Card external-acceptance fallback. Together these make verification unbounded,
duplicate authority, and stale for reasons unrelated to the reviewed content.

## Goal

Make contract/sprint verification a deterministic, provider-free consumer of one
subject-bound authoritative benchmark report and one canonical External Acceptance
Advice section. Bind review freshness to normalized final content, enforce a fixed
600-second verifier budget with process-group termination and per-command duration
evidence, and prepare benchmark installation once per profile while retaining 27
isolated writable runtime arms.

## Scope

- In scope:
  - Remove live benchmark/provider production and duplicate focused-test authority
    from verifier-owned contract/template surfaces.
  - Add one fixed 600-second strict-verifier wall-clock budget, per-command timing,
    and whole-process-group termination on timeout.
  - Replace ancestry-bound review freshness with normalized final-content
    `review_subject_sha256`; keep target revision only as metadata/overlap evidence.
  - Make `## External Acceptance Advice` the only external-acceptance authority.
  - Add benchmark subject/provenance/report-byte fields, prepare three immutable
    profile bases, and clone 27 isolated writable overlays.
  - Keep source/product projections, docs, workflow artifacts, and regression tests
    synchronized; produce exactly one final authoritative matrix after code freeze.
- Out of scope:
  - Distributed scheduling, checkpoint/resume, a general artifact registry, new
    providers, compatibility readers, configurable budget relaxation, deployment,
    release, push/merge, external state mutation, and unrelated cleanup.
- Taste constraints: one authority per datum; remove retired paths in this package;
  do not add compatibility behavior, fallback acceptance, or a second schema.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a verifier call path can still launch a provider,
benchmark, adopt, or substantive install; if a timed-out descendant survives; if
unrelated target-branch movement stales unchanged reviewed content; if byte/path/
mode/deletion changes do not stale it; if acceptance can pass without the canonical
section; or if benchmark setup occurs more than three times. Structural and fixture
tests are the cheapest proof and run before any authoritative matrix.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260714-0421-verifier-evidence-lifecycle-cutover.review.md`
- Notes file: `tasks/notes/20260714-0421-verifier-evidence-lifecycle-cutover.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and canonical `## External Acceptance Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - docs/architecture/
  - docs/reference-configs/
  - docs/researches/20260714-gpt-review.md
  - docs/spec.md
  - plans/
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260714-0421-verifier-evidence-lifecycle-cutover.contract.md
  - tasks/reviews/20260714-0421-verifier-evidence-lifecycle-cutover.review.md
  - tasks/notes/20260714-0421-verifier-evidence-lifecycle-cutover.notes.md
  - .ai/context/capabilities.json
  - .ai/harness/workflow-contract.json
  - .ai/hooks/lib/workflow-state.sh
  - .claude/templates/
  - assets/hooks/
  - assets/workflow-contract.v1.json
  - assets/reference-configs/
  - assets/templates/
  - evals/harness/
  - package.json
  - scripts/
  - src/
  - tests/
  - tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md
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
    - docs/spec.md
    - evals/harness/reports/profile-comparison.json
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260714-0421-verifier-evidence-lifecycle-cutover.notes.md
  tests_pass:
    - path: tests/unit/verifier-evidence-lifecycle-cutover.test.ts
    - path: tests/harness-benchmark-matrix.test.ts
    - path: tests/review-freshness.test.ts
    - path: tests/workflow-state-lib.test.ts
  commands_succeed:
    - bun test tests/unit/verifier-evidence-lifecycle-cutover.test.ts tests/harness-benchmark-matrix.test.ts tests/review-freshness.test.ts tests/workflow-state-lib.test.ts
    - diff -q scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh
    - diff -q scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh
    - diff -q assets/hooks/lib/workflow-state.sh .ai/hooks/lib/workflow-state.sh
    - bun run check:type
  qa_scores:
    - dimension: functionality
      min: 9
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
