# Task Contract: axr7-consumer-e2e-adoption-dogfood

> **Status**: Fulfilled
> **Plan**: plans/plan-20260809-0327-axr7-consumer-e2e-adoption-dogfood.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-09 03:32
> **Review File**: `tasks/reviews/20260809-0327-axr7-consumer-e2e-adoption-dogfood.review.md`
> **Notes File**: `tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

AXR5/AXR6 provide the provider and durable runtime, but repo-harness still lacks a
consumer-owned proof that all ten real nested architecture documents can be adopted
without losing human prose. Shipping without this slice would enable an automatic
writer whose package resolution, semantic diagrams, fidelity and readiness aggregation
have only been proven in producer fixtures.

## Goal

Make repo-harness a production-shaped ArchContext consumer: ten modelled capabilities
compile evidence-backed P1/P2 Mermaid, existing documents adopt through one reviewed
ChangeSet with marker-external bytes preserved, the provider runs from integrity-bound
packed packages without sibling source resolution, and advisory Stop/readiness dogfood
records durable receipts and stable no-op reruns.

## Scope

- In scope: ten node-v2 selector updates; child component nodes, relations and flows;
  ChangeSet-only model mutation; all-target docs adoption; packed consumer E2E;
  architecture sync aggregation; advisory provider/apply activation; three dogfood
  cycles; exact evidence and rollback receipts.
- Out of scope: npm publish and registry dependency pins (AXR8); a general public model
  mutation API; direct `.archcontext` writes; semantic inference from Markdown; strict
  freshness enforcement; a second capability-authority cutover.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If any of the ten exact CodeGraph source→sink selectors is unmatched/truncated, or any
marker-external byte ledger changes during a single all-target adoption preview, the
ten-target atomic adoption is unsafe. The cheapest proof is model validation plus docs
adoption preview before enabling the provider or running the packed host fixture.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260809-0327-axr7-consumer-e2e-adoption-dogfood.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260809-0327-axr7-consumer-e2e-adoption-dogfood.review.md`
- Notes file: `tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - .gitignore
  - docs/spec.md
  - .archcontext/model/
  - .ai/harness/policy.json
  - assets/workflow-contract.v1.json
  - assets/templates/helpers/
  - docs/architecture/
  - plans/
  - package.json
  - bun.lock
  - scripts/axr7-
  - scripts/check-architecture-sync.sh
  - tasks/todos.md
  - tasks/contracts/20260809-0327-axr7-consumer-e2e-adoption-dogfood.contract.md
  - tasks/reviews/20260809-0327-axr7-consumer-e2e-adoption-dogfood.review.md
  - tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.notes.md
  - tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.model-proposal.json
  - tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.flow-repair-proposal.json
  - tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.bootstrap-cleanup-proposal.json
  - tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.selector-repair-proposal.json
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - .archcontext/model/flows/flow.hook-adapters.primary.yaml
    - docs/architecture/.projection-manifest.json
    - scripts/axr7-consumer-e2e.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260809-0327-axr7-consumer-e2e-adoption-dogfood.notes.md
  tests_pass:
    - path: tests/architecture-projection-e2e.test.ts
  commands_succeed:
    - bun scripts/axr7-consumer-e2e.ts
    - bun run check:ci
    - bash scripts/check-architecture-sync.sh
```

## Acceptance Notes (Human Review)

- Functional behavior: all ten capabilities have proven P1/P2 output, adoption is
  atomic, and clean/single/multi Stop cycles bind projection and refresh receipts.
- Edge cases: missing package, selector mismatch, stale snapshot, ambiguous marker,
  preimage drift, retry/dead-letter and second-run no-op are explicit assertions.
- Regression risks: existing P3/history/backlog prose and human-owned bytes must remain
  byte-identical; runtime state and generated docs cannot feed a projection loop.

## Rollback Point

- Commit / checkpoint: AXR7 merge commit plus paired ArchContext helper `cdccc08`.
- Revert strategy: set provider/apply to disabled, revert AXR7 model/docs/runtime commit,
  and retain ChangeSet, projection, refresh and dead-letter receipts for diagnosis.
