# Task Contract: c9-real-multi-agent-canary-and-multi-seat-decision

> **Status**: Partial
> **Plan**: plans/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-30 18:39
> **Review File**: `tasks/reviews/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.review.md`
> **Notes File**: `tasks/notes/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Rows C1-C8 proved protocol mechanics with deterministic fixtures, but they did
not prove that three real delegated readers produce reusable knowledge cheaply
enough to justify the collaboration substrate, nor whether delegated startup
and handoff are a repeated bottleneck requiring persistent same-capability
seats. A wrong decision either promotes an unmeasured runtime or introduces a
second durable identity/authority surface without evidence.

## Goal

Produce three isolated matched baseline/treatment live-provider runs. C9-A must
show three read-only participants, at least one source-signal reuse, at least
one explicit handoff adoption, one writer and byte-identical delivery authority.
C9-B must preserve all three runs and apply the pre-frozen rubric and decision
gate. Publish a persistent `EngineerSeatV2` go/no-go and separate Phase 5/6
activation decisions, with provider-authoritative token usage and wall time.

## Scope

- In scope: the exact Codex JSONL contribution adapter, a repeatable live canary,
  deterministic regression coverage, durable canary evidence and operator/release documentation.
- Out of scope: persistent `EngineerSeatV2`, a second writer, autonomous review,
  autonomous merge, provider fallback, Task/Lease/Publication/Acceptance schema changes.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Any real treatment run that cannot traverse immutable Codex JSONL stdout into a
valid contribution, any delivery-authority digest drift, writer count above one,
cross-arm root/store overlap, no source-signal reuse, or no handoff adoption
falsifies C9-A. The cheapest proof point is one three-line contribution returned
by real `codex exec --json`; it exposed the raw-marker/JSONL mismatch before the
full experiment and must pass after the bounded adapter correction.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.review.md`
- Notes file: `tasks/notes/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - README.md
  - docs/CHANGELOG.md
  - docs/architecture/.projection-manifest.json
  - docs/researches/
  - docs/spec.md
  - examples/agent-architecture.md
  - deploy/release-checklists/
  - plans/
  - scripts/c9-collaboration-canary.ts
  - scripts/c9-collaboration-dispatch-runner.ts
  - tasks/todos.md
  - tasks/lessons.md
  - tasks/current.md
  - tasks/workstreams/runtime-harness/collaboration/collaboration-substrate-program.md
  - tasks/contracts/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.contract.md
  - tasks/reviews/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.review.md
  - tasks/notes/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/effects/collaboration/provider-output-adapter.ts
  - src/effects/engineers/delegated-run-store.ts
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.notes.md
  tests_pass:
    - path: tests/unit/c9-real-multi-agent-canary-and-multi-seat-decision.test.ts
    - path: tests/effects/collaboration-contribution-collector.test.ts
  commands_succeed:
    - bun scripts/c9-collaboration-canary.ts --live
    - bun test tests/unit/c9-real-multi-agent-canary-and-multi-seat-decision.test.ts tests/effects/collaboration-contribution-collector.test.ts --timeout 60000
    - bun run check:type
    - bun run build:operator-web
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
