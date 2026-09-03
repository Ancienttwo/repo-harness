# Task Contract: brc0-authority-freeze-baseline-characterization

> **Status**: Fulfilled
> **Plan**: plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-03 09:54
> **Review File**: `tasks/reviews/20260903-0954-brc0-authority-freeze-baseline-characterization.review.md`
> **Notes File**: `tasks/notes/20260903-0954-brc0-authority-freeze-baseline-characterization.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Every later row of `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md` assumes
that the repair campaign is a router that consumes Task, Lease, Acceptance and Publication authority
without changing any of it. Nothing in the repository asserts that today. If those bytes drift while
rows 3-15 are built on top of them, the drift is discovered only when a campaign silently mints a
Task from an Issue number or accepts its own work. This row installs the falsifier first, before any
campaign code exists to be measured against a moving baseline.

## Goal

Freeze the canonical bytes of the Task, Lease, Acceptance and Publication authorities at
`main@1022e100` as digest assertions over the real production serializers; freeze the negative facts
the campaign design depends on (an Issue is not a Task, a dispatch prompt is not a Claim,
`heartbeat-triage` is discovery-only, `repo-harness-autoplan` is retired, the campaign capability
does not exist, `external_sources.mode` is `off`); freeze the protected capability list and six
provider partial-success fixtures; publish the data-flow and permission research; and record one
architecture drift request declaring the planned `capability.runtime-harness.development-campaign`
boundary. Source behavior changes by zero lines.

## Scope

- In scope:
  - `tests/characterization/repair-campaign-authority-freeze.test.ts`
  - `tests/fixtures/repair-campaign/` (frozen baseline, protected capabilities, six provider batches)
  - `docs/researches/20260903-repair-campaign-authority-freeze.md`
  - `docs/architecture/requests/runtime-harness-development-campaign.md` (queue-generated),
    `docs/architecture/index.md` and `docs/architecture/.projection-manifest.json` (both regenerated
    by the queue and the automatic archctx projection), and
    `docs/architecture/snapshots/2026-09-03-development-campaign-boundary-declaration.md`
  - this plan, contract, review and notes
- Out of scope:
  - Any change to `src/`. No new command, no new type, no runtime path edit. `git diff
    origin/main...HEAD --stat -- src` must be empty.
  - Creating `.archcontext/model/nodes/capability.runtime-harness.development-campaign.yaml`; the
    node belongs to sprint row 3 (BRC3) and this row asserts its absence.
  - Implementing slot reconciliation, adoption, materialization or closure. The fixtures are frozen
    inputs for rows 7, 8 and 13; only the intake parse is exercised here.
  - Adding the `development_campaign` policy key or changing `external_sources.mode`.
- Taste constraints: assertions must pin production output, not restate it. No helper that
  recomputes a digest the way the code does.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If any characterization digest in `tests/fixtures/repair-campaign/authority-freeze-baseline.json`
differs on this branch from what the same test computes on `origin/main`, the freeze failed: the
branch changed an authority it promised not to touch, and the baseline is describing a surface that
no longer exists.

Cheapest proof point, in order:

1. `git diff origin/main...HEAD --stat -- src` must print nothing.
2. `bun test tests/characterization/repair-campaign-authority-freeze.test.ts --timeout 60000` must
   pass with the committed digests, which were produced by the production serializers and never
   hand-written.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260903-0954-brc0-authority-freeze-baseline-characterization.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260903-0954-brc0-authority-freeze-baseline-characterization.review.md`
- Notes file: `tasks/notes/20260903-0954-brc0-authority-freeze-baseline-characterization.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"authority-freeze-characterization","kind":"deterministic_test","paths":["*"]},{"id":"architecture-queue-readback","kind":"runtime_readback","paths":["docs/architecture/requests/runtime-harness-development-campaign.md","docs/architecture/index.md","docs/architecture/.projection-manifest.json"]},{"id":"codex-external-acceptance","kind":"manual_acceptance","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260903-0954-brc0-authority-freeze-baseline-characterization.contract.md
  - tasks/reviews/20260903-0954-brc0-authority-freeze-baseline-characterization.review.md
  - tasks/notes/20260903-0954-brc0-authority-freeze-baseline-characterization.notes.md
  - tests/characterization/
  - tests/fixtures/repair-campaign/
  - docs/researches/
  - docs/architecture/requests/
  - docs/architecture/snapshots/
  - docs/architecture/index.md
  - docs/architecture/.projection-manifest.json
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - tests/characterization/repair-campaign-authority-freeze.test.ts
    - tests/fixtures/repair-campaign/authority-freeze-baseline.json
    - tests/fixtures/repair-campaign/protected-capabilities.json
    - docs/researches/20260903-repair-campaign-authority-freeze.md
    - docs/architecture/requests/runtime-harness-development-campaign.md
    - docs/architecture/snapshots/2026-09-03-development-campaign-boundary-declaration.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260903-0954-brc0-authority-freeze-baseline-characterization.notes.md
  tests_pass:
    - path: tests/characterization/repair-campaign-authority-freeze.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: no runtime behavior changes. The added test asserts the current behavior of
  existing serializers and the current absence of campaign surfaces.
- Edge cases: the `classifyTaskOffer` freeze covers the full closed input matrix, so a new blocker
  code or a reordered branch fails the digest rather than slipping through.
- Regression risks: the intended failure mode is a loud digest mismatch. The one dangerous repair is
  regenerating a digest to make the test pass; both the fixture and the test header say so.

## Rollback Point

- Commit / checkpoint: branch `codex/brc0-authority-freeze-baseline-characterization` off
  `main@1022e100`.
- Revert strategy: revert the branch. Nothing in `src/` changed, and the only shared-state write is
  the pending architecture request plus its index entry, which
  `repo-harness run architecture-queue reindex` reconciles.
