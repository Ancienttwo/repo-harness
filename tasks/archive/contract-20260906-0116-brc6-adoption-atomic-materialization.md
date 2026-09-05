> **Archived**: 2026-09-06 01:16
> **Related Plan**: plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260906-0116
> **Archive Projection V1**: `plans/plan-20260905-1835-brc6-adoption-atomic-materialization.md` => `plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md`
> **Archive Projection V1**: `tasks/notes/20260905-1835-brc6-adoption-atomic-materialization.notes.md` => `tasks/archive/notes-20260906-0116-brc6-adoption-atomic-materialization.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1835-brc6-adoption-atomic-materialization.contract.md` => `tasks/archive/contract-20260906-0116-brc6-adoption-atomic-materialization.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1835-brc6-adoption-atomic-materialization.review.md` => `tasks/archive/review-20260906-0116-brc6-adoption-atomic-materialization.md`

# Task Contract: brc6-adoption-atomic-materialization

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 23:22
> **Review File**: `tasks/archive/review-20260906-0116-brc6-adoption-atomic-materialization.md`
> **Notes File**: `tasks/archive/notes-20260906-0116-brc6-adoption-atomic-materialization.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

BRC6 converts provider-authored repair slots into canonical scheduling inputs; partial publication or unproven authoring completion can dispatch incorrect work.

## Goal

Validate exact-SHA challenge and budget terminal, adopt valid bounded slots, and publish Sprint/WorkGraph/manifest as one replay-safe candidate commit without claims or direct main mutation.

## Scope

- In scope: approved BRC6 core protocols, campaign adopt CLI/effect, immutable evidence, atomic publication, focused behavior fixtures and canonical verification.
- Out of scope: budget core/store, authoring/step, BRC7 planning, BRC8 dispatch, remaining BRC9 accounting, issue closure, real GPT canary.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A candidate ref exposing any new canonical Offer before integration, replay dispatching another browser call, or a missing terminal allowing partial adoption falsifies the design; dedicated effect fixtures exercise each boundary.

## Workflow Inventory

- Source plan: `plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260906-0116-brc6-adoption-atomic-materialization.md`
- Notes file: `tasks/archive/notes-20260906-0116-brc6-adoption-atomic-materialization.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"brc6-deterministic-regressions","kind":"deterministic_test","paths":["*"]},{"id":"brc6-persisted-terminal-and-publication-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/
  - docs/researches/20260905-repair-campaign-sprint-execution-boundaries.md
  - docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md
  - docs/architecture/
  - .archcontext/
  - src/core/automation/connector-challenge.ts
  - src/core/automation/issue-batch-adoption.ts
  - src/effects/automation/issue-batch-adoption.ts
  - src/effects/automation/issue-batch-publication.ts
  - src/effects/automation/issue-batch-store.ts
  - src/cli/commands/campaign.ts
  - tests/helpers/issue-batch-adoption-fixture.ts
  - tests/unit/connector-challenge.test.ts
  - tests/unit/issue-batch-adoption.test.ts
  - tests/unit/collaboration-authority-baseline.test.ts
  - tests/effects/issue-batch-adoption.test.ts
  - tests/effects/issue-batch-publication.test.ts
  - tests/cli/development-campaign.test.ts
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
    - src/core/automation/issue-batch-adoption.ts
    - src/core/automation/connector-challenge.ts
    - src/effects/automation/issue-batch-publication.ts
  artifacts_exist:
    - tasks/archive/notes-20260906-0116-brc6-adoption-atomic-materialization.md
  commands_succeed:
    - bun run check:type
    - bun run check:state-boundaries
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
    - bun test --timeout 60000 tests/unit/connector-challenge.test.ts tests/unit/issue-batch-adoption.test.ts tests/effects/issue-batch-adoption.test.ts tests/effects/issue-batch-publication.test.ts tests/cli/development-campaign.test.ts tests/unit/collaboration-authority-baseline.test.ts
criterion_reuse:
  tests_pass: []
  commands_succeed:
    - bun run check:type
    - bun run check:state-boundaries
    - bun test --timeout 60000 tests/unit/connector-challenge.test.ts tests/unit/issue-batch-adoption.test.ts tests/effects/issue-batch-adoption.test.ts tests/effects/issue-batch-publication.test.ts tests/cli/development-campaign.test.ts tests/unit/collaboration-authority-baseline.test.ts
```

## Acceptance Notes (Human Review)

- Full suite is required by the user-supplied AGENTS rule for runtime/shared-contract changes; expected 20–25 minutes, run only once after freezing implementation and target. Focused new and adjacent suites are development checks, not duplicate final criteria.
- All three publication paths are invisible until one candidate ref CAS; canonical visibility, conflict/replay and crash injection fixtures are mandatory.
- Typed acceptance remains a separate final boundary; no prior budget full pass is relabeled as BRC6 evidence.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:

## Final evidence baseline and contract-only delta

- Frozen product candidate ce7d2c9776198f7a220300f432c0bdc43f51b0b5 passed full bun test --timeout 60000 in run-20260906T003115-49256, exit 0, 1208444 ms. Baseline subject sha256:a257ccae789261dd27787f40af34bbb5943fe36f12861d427ba74e7042b339f9; target 5a6a2121a76e2da9b286359d786cc9938ddeae83; toolchain fingerprint sha256:b8b61b7b6ffe343652bc280222340cf898095097a7e3c91e5b0f80feb1ca0523. The enclosing prepare run-20260906T003105-46378 passed all 15 criteria but failed Change Assessment because oracle declarations were absent.
- This follow-up changes contract/review/notes evidence only. No runtime, test, architecture or target content changes. Preserve the full pass under its original context; use the named focused command and required integrity checks to bind the updated contract. A declaration-only contract digest change does not justify another full run.
- brc6-deterministic-regressions is the six-file focused command above, backed by the frozen full baseline. brc6-persisted-terminal-and-publication-readback covers actual temporary Git/common-dir budget terminal records, candidate commits, manifest readback, real canonical TaskOffer collection and crash/retry recovery in those effect fixtures. It does not claim a live GPT or production Connector canary.
