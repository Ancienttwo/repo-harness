# Task Contract: external-source-intake-p0

> **Status**: Active
> **Plan**: plans/plan-20260831-1512-external-source-intake-p0.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-external-source-intake
> **Last Updated**: 2026-08-31 15:12
> **Review File**: `tasks/reviews/20260831-1512-external-source-intake-p0.review.md`
> **Notes File**: `tasks/notes/20260831-1512-external-source-intake-p0.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

repo-harness currently has no auditable ingress for external Issue facts. If provider state is mapped directly into TaskOffer, priority, Claim, Lease, collaboration, or Agent Runtime effects, GitHub becomes a second scheduler and bypasses the approved sprint/plan/contract authority chain. If refresh failure is collapsed into an empty backlog, operators cannot distinguish a healthy zero-Issue result from auth, rate-limit, pagination, or response-limit failure.

## Goal

Ship one reviewable P0 capability that performs an explicitly enabled, bounded, manual GitHub refresh; persists provider-neutral immutable Issue observations plus one immutable attempt receipt; derives a read-only projection; and exposes `external-source refresh/list` CLI commands while leaving every existing planning, Fleet, Claim/Lease, WorkEnvelope, collaboration, and Agent Runtime authority unchanged.

## Scope

- In scope: `ProviderIssueObservationV1`, `ExternalSourceRefreshReceiptV1`, and `ExternalSourceProjectionV1`; strict `external_sources` policy parsing with absent/off as the only default and exactly one label-scan or Issue-number selection mode; Git-common-dir create-once storage; bounded GitHub `gh` adapter; one-shot refresh/list CLI; initialization/config documentation required for the new key; architecture/workstream projection; focused protocol, policy, store, adapter, CLI, and authority tests.
- Out of scope: GitLab; webhooks; daemon/timer; MCP surface; UI; provider writeback; comments fetch; task adoption/binding; prompt rendering; fuzzy identity; migration/compatibility readers; mutable `seen/processing/done` state; any change to TaskOffer/acquire/Claim/Lease/WorkEnvelope/collaboration/runtime authority or semantics.
- Taste constraints: provider content remains inert untrusted JSON; immutable provider repository/Issue IDs own identity and display refs do not; every limit is explicit and positive; exact batches resolve only declared Issue numbers and fail if any member is unavailable; GitHub labels/assignees/state never infer local dispatch; incomplete/unavailable attempts are persisted and return non-zero; no semantic fallback, alias, inferred legacy shape, mutable cache, or speculative shared abstraction.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Cheapest proof point: a deterministic two-page GitHub fixture containing an eligible Issue, an ineligible Issue, a PR-shaped item, prompt-injection body text, a later content revision, a complete empty refresh, and a 429 attempt. Stop and hand back if bounded observation cannot retain stable immutable provider repository/Issue IDs or cannot distinguish complete-empty from failure/incomplete pagination; the approved fallback is a separate explicit signed-file or single-Issue import design, not fuzzy matching or best-effort state.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260831-1512-external-source-intake-p0.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260831-1512-external-source-intake-p0.review.md`
- Notes file: `tasks/notes/20260831-1512-external-source-intake-p0.notes.md`
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
  - .ai/harness/policy.json
  - .archcontext/model/flows/
  - .archcontext/model/nodes/
  - .archcontext/model/relations/
  - AGENTS.md
  - CLAUDE.md
  - assets/reference-configs/external-tooling.md
  - docs/architecture/
  - docs/reference-configs/
  - plans/plan-20260831-1512-external-source-intake-p0.md
  - scripts/ensure-task-workflow.sh
  - src/cli/index.ts
  - src/cli/commands/external-source.ts
  - src/core/external-sources/
  - src/effects/external-sources/
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260831-1512-external-source-intake-p0.contract.md
  - tasks/reviews/20260831-1512-external-source-intake-p0.review.md
  - tasks/notes/20260831-1512-external-source-intake-p0.notes.md
  - tasks/workstreams/runtime-harness/external-source-intake/
  - tests/cli/external-source-intake.test.ts
  - tests/effects/external-source-github.test.ts
  - tests/effects/external-source-store.test.ts
  - tests/unit/external-source-authority.test.ts
  - tests/unit/external-source-intake-p0.test.ts
  - tests/unit/external-source-policy.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - tests/capability-archcontext-export.test.ts
  - tests/architecture-projection-e2e.test.ts
  - tests/workflow-state-lock.test.ts
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
    runner_invocations: 2
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
    - src/core/external-sources/issue-observation.ts
    - src/core/external-sources/projection.ts
    - src/effects/external-sources/policy.ts
    - src/effects/external-sources/store.ts
    - src/effects/external-sources/github.ts
    - src/effects/external-sources/refresh.ts
    - src/cli/commands/external-source.ts
    - docs/architecture/modules/runtime-harness/external-source-intake.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260831-1512-external-source-intake-p0.notes.md
  tests_pass:
    - path: tests/unit/external-source-intake-p0.test.ts
    - path: tests/unit/external-source-policy.test.ts
    - path: tests/effects/external-source-store.test.ts
    - path: tests/effects/external-source-github.test.ts
    - path: tests/cli/external-source-intake.test.ts
    - path: tests/unit/external-source-authority.test.ts
    - path: tests/workflow-state-lock.test.ts
  commands_succeed:
    - bun run check:type
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

- Functional behavior: manual GitHub refresh writes immutable observations and one attempt receipt, then list derives a provider-neutral read-only projection; duplicate content is idempotent and content drift preserves history.
- Edge cases: PR filtering, complete empty, 403/429/network/invalid JSON, pagination/body/total-byte/deadline limits, repository rename/transfer, unsafe paths/symlinks, concurrent identical writes, conflicting bytes, and prompt-injection content.
- Regression risks: any write or semantic change under sprint/TaskOffer/Fleet/Claim/Lease/WorkEnvelope/collaboration/runtime stores is a release blocker; init policy drift and provider failure represented as a healthy empty result are release blockers.

## Rollback Point

- Commit / checkpoint: `5da19636221d2aaed21ed7be1545c2648a204265` before the P0 worktree branch.
- Revert strategy: revert the single `codex/external-source-intake-p0` merge unit. Preserve existing Git-common-dir external-source records as inert user evidence; no current authority reads them and rollback must not delete them.
