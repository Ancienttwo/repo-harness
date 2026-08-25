> **Archived**: 2026-08-26 07:03
> **Related Plan**: plans/archive/plan-20260826-0257-me2a-me3b-readonly-delegation.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260826-0703

# Task Contract: me2a-me3b-readonly-delegation

> **Status**: Fulfilled
> **Plan**: plans/plan-20260826-0257-me2a-me3b-readonly-delegation.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-26 02:58
> **Review File**: `tasks/reviews/20260826-0257-me2a-me3b-readonly-delegation.review.md`
> **Notes File**: `tasks/notes/20260826-0257-me2a-me3b-readonly-delegation.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ME-2A cannot truthfully call a Worker read-only while native `SubagentStart` reports only a TOML declaration and the real child can still mutate the repository. ME-2B and trusted Worker evidence must remain blocked until one execution boundary proves effective sandbox denial, exact parent/profile/capability fences, at-most-once launch and untrusted result handling.

## Goal

Deliver the first supported read-only Worker path: exact logical Role Profile admission over current Task/Lease/WorkEnvelope/Engineer fences, a frozen Codex CLI read-only capability receipt, immutable admission/run evidence, and a one-shot `codex exec --sandbox read-only` adapter with fail-closed lost-ACK reconciliation. Native child read-only admission must remain rejected until Provider-issued effective sandbox evidence exists.

## Scope

- In scope: ME-2A/conditional ME-3B PRD closure; closed canonical schemas; current parent/profile/capability validation; immutable git-common-dir stores; one Codex CLI subprocess action; protected before/after snapshots; untrusted WorkerResult; bounded CLI; deterministic and real-canary evidence.
- Out of scope: native-child permission inference; writable delegation; ME-2C/ME-4A/ME-4B/ME-2B; daemon; generic Worker Host; model/tool loop; scheduler; history/compaction; Provider fallback; cancel/resume by guessed session; Task/Lease/Publication/Acceptance mutation.
- Taste constraints: Fail closed on every missing/stale authority. Logical Role Profile identity must never be presented as Provider-native `agent_type` identity. P0 guarantees at-most-once host action, not exactly-once completion.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If Host `codex sandbox --permission-profile :read-only --include-managed-config` can create or change either exact worktree/Git-common sentinel, or if its executable/version/argv/profile bytes cannot be frozen and revalidated before launch, no admitted receipt or subprocess intent may be produced and both PRDs remain Draft. Cheapest proof: the model-free two-sentinel mutation canary, exact denial set, and before/after protected snapshot digest.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260826-0257-me2a-me3b-readonly-delegation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260826-0257-me2a-me3b-readonly-delegation.review.md`
- Notes file: `tasks/notes/20260826-0257-me2a-me3b-readonly-delegation.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"me2a-me3b-deterministic-contract","kind":"deterministic_test","paths":["src/core/engineers/delegation.ts","src/effects/engineers/delegated-run-store.ts","src/cli/commands/delegation.ts","tests/unit/me2a-me3b-readonly-delegation.test.ts","tests/cli/delegation.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260826-0257-me2a-me3b-readonly-delegation.md
  - plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md
  - plans/prds/20260824-1653-read-only-delegation-admission.prd.md
  - plans/prds/20260825-1551-delegated-run-adapter.prd.md
  - docs/researches/20260824-persistent-module-engineer-organization.md
  - docs/architecture/
  - .archcontext/model/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260826-0257-me2a-me3b-readonly-delegation.contract.md
  - tasks/reviews/20260826-0257-me2a-me3b-readonly-delegation.review.md
  - tasks/notes/20260826-0257-me2a-me3b-readonly-delegation.notes.md
  - tasks/workstreams/runtime-harness/delegated-run/
  - src/core/engineers/delegation.ts
  - src/effects/engineers/delegated-run-store.ts
  - src/cli/commands/delegation.ts
  - src/cli/index.ts
  - tests/unit/me2a-me3b-readonly-delegation.test.ts
  - tests/cli/delegation.test.ts
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
    - src/core/engineers/delegation.ts
    - src/effects/engineers/delegated-run-store.ts
    - src/cli/commands/delegation.ts
    - tests/unit/me2a-me3b-readonly-delegation.test.ts
    - tests/cli/delegation.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260826-0257-me2a-me3b-readonly-delegation.notes.md
  tests_pass:
    - path: tests/unit/me2a-me3b-readonly-delegation.test.ts
    - path: tests/cli/delegation.test.ts
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

- Functional behavior: exact parent/profile/capability admission, immutable intent, one read-only Codex CLI action, observation/reconciliation and untrusted result only.
- Edge cases: native role declaration without effective proof, stale capability/profile/parent, launch ACK loss, missing or extra sandbox denial, and protected snapshot drift all fail closed without fallback. Provider stdout/stderr stays bounded untrusted evidence and is never parsed into authority.
- Regression risks: no changes to existing native SubagentStart observation, Task/Lease/Publication/Acceptance authorities or ME-3A provider-thread effect semantics.

## Rollback Point

- Commit / checkpoint: single contract-worktree publication.
- Revert strategy: revert ME-2A/ME-3B publication; immutable evidence has no authority pointer and the adapter has no daemon/background process.
