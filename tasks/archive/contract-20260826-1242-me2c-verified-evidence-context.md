> **Archived**: 2026-08-26 12:42
> **Related Plan**: plans/archive/plan-20260826-0707-me2c-verified-evidence-context.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260826-1242

# Task Contract: me2c-verified-evidence-context

> **Status**: Fulfilled
> **Plan**: plans/plan-20260826-0707-me2c-verified-evidence-context.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-26 07:08
> **Review File**: `tasks/reviews/20260826-0707-me2c-verified-evidence-context.review.md`
> **Notes File**: `tasks/notes/20260826-0707-me2c-verified-evidence-context.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ME-2A deliberately returns untrusted WorkerResult bytes. Without an exact candidate/verifier checkpoint boundary, Provider history, Worker prose or mutable refs can be mistaken for trusted cross-round facts. ME-2C must create a content-addressed evidence projection without becoming a Task, Lease, Publication, Acceptance or Agent-runtime authority.

## Goal

Deliver ME-2C: stable semantic constraint IDs carried by the exact canonical Contract, closed candidate-bound proposal/round/assertion records, a unique continuous assertion-chain compiler, immutable evidence validation and Human-fenced DecisionRequest recovery. Trusted context must contain only exact verified evidence; Worker claims remain explicitly untrusted.

## Scope

- In scope: ME-2C PRD approval; strict Contract semantic-constraint catalog; canonical core schemas/digests; exact tracked Contract projection; immutable checkpoint evidence and DecisionRequest event/current store; deterministic trusted/untrusted context compiler; bounded CLI; fixtures and ArchContext projection.
- Out of scope:
  - Provider turns/history/compaction, prompt assembly, runtime dispatch, Task/Lease/Publication/Acceptance transitions, writable delegation and timestamp-based latest selection.
- Taste constraints: Fail closed on missing catalog, subject drift, invalid/mutable evidence, forks/gaps, incomplete constraint partitions and open Human decisions. Never infer latest by timestamp/file order or parse Provider/Worker prose into authority.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If stable constraint IDs cannot be carried inside and recovered from one exact tracked Contract revision without changing existing contract-run behavior, keep the PRD Draft. Cheapest proof: add one strict JSON catalog to a fixture Contract, project it by Git revision/digest, mutate the working file and prove the projection remains exact while a mutable evidence ref is rejected.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260826-0707-me2c-verified-evidence-context.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260826-0707-me2c-verified-evidence-context.review.md`
- Notes file: `tasks/notes/20260826-0707-me2c-verified-evidence-context.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"me2c-deterministic-contract","kind":"deterministic_test","paths":["src/core/engineers/verified-context.ts","src/effects/engineers/verified-context-store.ts","src/cli/commands/verified-context.ts","tests/unit/me2c-verified-evidence-context.test.ts","tests/cli/verified-context.test.ts"]}]}
```

## Semantic Constraint Catalog

```json
{"protocol":1,"constraints":[{"constraint_id":"me2c-exact-contract","statement":"Every trusted constraint ID comes from one exact tracked Contract revision and digest."},{"constraint_id":"me2c-continuous-chain","statement":"Only one unique continuous subject-matching assertion chain may be selected."},{"constraint_id":"me2c-immutable-evidence","statement":"Every trusted evidence ref is content addressed and byte-valid at compilation."},{"constraint_id":"me2c-human-decision-fence","statement":"An open DecisionRequest blocks the next proposal until a revision-fenced Human answer."},{"constraint_id":"me2c-no-authority-transition","statement":"ME-2C cannot mutate Task, Lease, Publication or Acceptance authority."}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260826-0707-me2c-verified-evidence-context.md
  - plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md
  - plans/prds/20260824-1653-verified-context-contracts.prd.md
  - docs/researches/20260824-persistent-module-engineer-organization.md
  - docs/architecture/
  - .archcontext/model/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260826-0707-me2c-verified-evidence-context.contract.md
  - tasks/reviews/20260826-0707-me2c-verified-evidence-context.review.md
  - tasks/notes/20260826-0707-me2c-verified-evidence-context.notes.md
  - tasks/workstreams/runtime-harness/verified-context/
  - assets/templates/contract.template.md
  - scripts/contract-run.ts
  - src/core/engineers/verified-context.ts
  - src/effects/engineers/verified-context-store.ts
  - src/cli/commands/verified-context.ts
  - src/cli/index.ts
  - tests/unit/me2c-verified-evidence-context.test.ts
  - tests/cli/verified-context.test.ts
  - tests/contract-run.test.ts
  - tests/architecture-projection-e2e.test.ts
  - tests/capability-archcontext-export.test.ts
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
    - src/core/engineers/verified-context.ts
    - src/effects/engineers/verified-context-store.ts
    - src/cli/commands/verified-context.ts
    - tests/unit/me2c-verified-evidence-context.test.ts
    - tests/cli/verified-context.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260826-0707-me2c-verified-evidence-context.notes.md
  tests_pass:
    - path: tests/unit/me2c-verified-evidence-context.test.ts
    - path: tests/cli/verified-context.test.ts
    - path: tests/contract-run.test.ts
  commands_succeed:
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun run check:type
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: exact Contract catalog projection, proposal/round/assertion joining, continuous chain selection, immutable evidence and Human decision lifecycle.
- Edge cases: fork, gap, duplicate round, stale digest, changed evidence bytes, candidate/Contract/worker subject mismatch, constraint omission/overlap, stale actor and all decision crash boundaries fail closed.
- Regression risks: the Contract catalog is optional for ordinary contract-run behavior; no existing task Contract or runner path gains a compatibility parser or authority transition.

## Rollback Point

- Commit / checkpoint: single contract-worktree publication.
- Revert strategy: revert ME-2C publication; immutable evidence has no authority pointer or background process.
