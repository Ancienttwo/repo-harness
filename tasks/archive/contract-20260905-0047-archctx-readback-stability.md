> **Archived**: 2026-09-05 00:47
> **Related Plan**: plans/archive/plan-20260905-0040-archctx-readback-stability.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260905-0047
> **Archive Projection V1**: `plans/plan-20260905-0040-archctx-readback-stability.md` => `plans/archive/plan-20260905-0040-archctx-readback-stability.md`
> **Archive Projection V1**: `tasks/notes/20260905-0040-archctx-readback-stability.notes.md` => `tasks/archive/notes-20260905-0047-archctx-readback-stability.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0040-archctx-readback-stability.contract.md` => `tasks/archive/contract-20260905-0047-archctx-readback-stability.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0040-archctx-readback-stability.review.md` => `tasks/archive/review-20260905-0047-archctx-readback-stability.md`

# Task Contract: archctx-readback-stability

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260905-0040-archctx-readback-stability.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 00:40
> **Review File**: `tasks/archive/review-20260905-0047-archctx-readback-stability.md`
> **Notes File**: `tasks/archive/notes-20260905-0047-archctx-readback-stability.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The 0.5.6 clean-room command rewrites tracked evidence on every equivalent run,
so verification cannot freeze one review subject or leave the repository clean.

## Goal

Make repeated `bun run check:archctx-integration` runs byte-stable while retaining
the stable source, version, schema, capability, renderer, and worktree-match proof.

## Scope

- In scope: clean-room readback shape, its tracked evidence, direct regression
  coverage, and coupled workflow artifacts.
- Out of scope: package installation, provider runtime behavior, package versions,
  acceptance semantics, and compatibility paths.
- Taste constraints: record semantic/provenance identity, not ephemeral archive bytes.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Two consecutive clean-room runs produce different tracked bytes, or the reduced
evidence no longer proves exact package versions and the provider handshake.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/axr5-archctx-clean-room.ts` persisted integrity/SHA-512
  for a newly packed temporary tarball whose non-semantic archive bytes vary.
- repro: run `bun run check:archctx-integration` twice and inspect
  `docs/verification/axr5-archctx-clean-room-readback.json`.
- regression_guard: tests/architecture-projection-provider.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/archctx-readback-stability-pre-fix.txt

## Workflow Inventory

- Source plan: `plans/archive/plan-20260905-0040-archctx-readback-stability.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260905-0047-archctx-readback-stability.md`
- Notes file: `tasks/archive/notes-20260905-0047-archctx-readback-stability.md`
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
  - docs/spec.md
  - docs/verification/axr5-archctx-clean-room-readback.json
  - plans/
  - tasks/todos.md
  - tasks/archive/contract-20260905-0047-archctx-readback-stability.md
  - tasks/archive/review-20260905-0047-archctx-readback-stability.md
  - tasks/archive/notes-20260905-0047-archctx-readback-stability.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - scripts/axr5-archctx-clean-room.ts
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
    - tasks/archive/notes-20260905-0047-archctx-readback-stability.md
  tests_pass:
    - path: tests/architecture-projection-provider.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:archctx-integration
    - git diff --exit-code -- docs/verification/axr5-archctx-clean-room-readback.json
    - bun run check:archctx-integration
    - git diff --exit-code -- docs/verification/axr5-archctx-clean-room-readback.json
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
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

- Commit / checkpoint: branch `codex/archctx-readback-stability`
- Revert strategy: restore ephemeral tarball hashes only if a reproducible published
  artifact becomes the clean-room authority.
