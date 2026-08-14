# Task Contract: change-assessment-v1

> **Status**: Fulfilled
> **Plan**: plans/plan-20260814-1808-change-assessment-v1.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-14 18:08
> **Review File**: `tasks/reviews/20260814-1808-change-assessment-v1.review.md`
> **Notes File**: `tasks/notes/20260814-1808-change-assessment-v1.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

AI-generated code has moved the review bottleneck upstream: a green unit-test
suite can prove only internal consistency unless the review subject, selected
risk paths, required oracle, and runtime readback are explicitly bound. The
current minimal-change hook is intentionally advisory and per-path; it cannot
become a merge authority. This work adds one deterministic, subject-bound
assessment at the existing prepare-acceptance boundary without weakening the
single AcceptanceReceipt authority.

## Goal

Deliver Change Assessment v1. `verify-sprint --prepare-acceptance` must
fail closed when the policy review base is missing/malformed, the final review
subject is degraded, a subject-bound ReviewSelectionPacket is invalid, or a
required oracle is missing. The packet must contain the closed five-reason
vocabulary, selected final paths, target revision, oracle requirements, and
an optional monotonic reviewer-disagreement escalation. Canonical verification
evidence, not a new AcceptanceReceipt field or protocol, binds the packet.

Deliver RuntimeEvidenceReceipt v1 for the repository's CLI/npm release shape:
published tarball identity, clean install/version readback, and installed hook
readback. It is separate from the merge AcceptanceReceipt lifecycle and has no
scheduler or service-auth readback.

## Scope

- In scope:
  - WP0 contract/doc freeze for hook advisory behavior, strict review-base
    authority, closed reason vocabulary, and monotonic escalation.
  - WP1 deterministic assessment/core fixtures, with no model or hook-journal
    input.
  - WP2 `verify-sprint --prepare-acceptance` packet/evidence binding and
    Receipt canonical-evidence validation.
  - WP3 RuntimeEvidenceReceipt protocol, CLI, fixtures, and documented npm
    release readback invariants.
  - Helper/workflow-contract/reference-config/architecture projections required
    for package runtime parity.
- Out of scope:
  - Hook gating, Hook journal aggregation, semantic/model risk scoring,
    AcceptanceReceipt protocol 3, receipt compatibility fallback, release
    scheduler, service authentication readback, publish/push/merge.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the exact same final ReviewSubject produces a different packet because edit
order, PostToolUse history, or a model response changed, the design is wrong.
The cheapest proof is a pure-fixture test that builds equal final subjects from
different mutation histories and asserts byte-identical assessment/packet
fingerprints. A packet that requires a second diff/base resolver is likewise a
falsification.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260814-1808-change-assessment-v1.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260814-1808-change-assessment-v1.review.md`
- Notes file: `tasks/notes/20260814-1808-change-assessment-v1.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"change-assessment-deterministic","kind":"deterministic_test","paths":["*"]},{"id":"change-assessment-runtime","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - docs/architecture/
  - docs/reference-configs/
  - plans/
  - tasks/
  - .ai/harness/workflow-contract.json
  - .claude/templates/
  - src/
  - tests/
  - scripts/
  - assets/
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
    - src/core/review/change-assessment.ts
    - src/effects/review/change-assessment.ts
    - scripts/change-assessment.ts
    - scripts/runtime-evidence-receipt.ts
  artifacts_exist:
    - tasks/notes/20260814-1808-change-assessment-v1.notes.md
  tests_pass:
    - path: tests/change-assessment.test.ts
    - path: tests/runtime-evidence-receipt.test.ts
  commands_succeed:
    - bun run check:type
    - bun test tests/change-assessment.test.ts tests/runtime-evidence-receipt.test.ts
    - bun run check:helpers
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
