# Task Contract: official-codex-plugin-outside-review

> **Status**: Active
> **Plan**: plans/plan-20260825-1234-official-codex-plugin-outside-review.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-25 12:34
> **Review File**: `tasks/reviews/20260825-1234-official-codex-plugin-outside-review.review.md`
> **Notes File**: `tasks/notes/20260825-1234-official-codex-plugin-outside-review.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Codex-host outside review currently launches Claude as the reviewer. The official OpenAI Claude Code Codex plugin now exposes a Codex app-server review runtime, so leaving the old path in place misstates the reviewer boundary and keeps deprecated Claude-specific prompt, retry, and transcript-recovery machinery alive. A partial migration would be worse: it could issue an acceptance receipt whose reviewer/source does not match the process that actually reviewed the subject.

## Goal

On Codex hosts, route repo-harness outside review through the enabled official `codex@openai-codex` plugin and record `reviewer=Codex, source=codex-plugin`. Preserve the existing pinned combined subject, one-review budget, typed P1/P2 findings, and fail-closed evidence binding. Keep Claude-host outside review on the existing direct Codex provider.

## Scope

- In scope:
  - Replace the runnable `claude` provider with a `codex-plugin` provider backed by the official plugin companion/app-server runtime.
  - Validate official plugin inventory, enabled state, install-path containment, command result, and structured findings before accepting output.
  - Special-case Codex-host skill selection, installation/readiness checks, contract policy projection, hook guidance, and acceptance receipts.
  - Preserve historical protocol-1 Claude receipts as readable evidence while preventing them from selecting a runnable provider.
- Out of scope:
  - plugin Review Gate, rescue/transfer commands, Claude-host direct Codex review, merge-gate receipts, and unrelated provider/model routing.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop rather than falling back to Claude or direct Codex when the official plugin is missing, disabled, unsafe, or returns malformed output on a Codex host.

## Falsifier

The direction is wrong if Claude Code's public plugin inventory cannot yield a safely-contained enabled official install path, or if one official app-server review cannot inspect the pinned base plus staged, unstaged, and untracked paths. The cheapest proof is the adapter contract test followed by one live exact-branch plugin smoke.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260825-1234-official-codex-plugin-outside-review.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260825-1234-official-codex-plugin-outside-review.review.md`
- Notes file: `tasks/notes/20260825-1234-official-codex-plugin-outside-review.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"official-plugin-contract-tests","kind":"deterministic_test","paths":["*"]},{"id":"official-plugin-live-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - README.md
  - README.zh-CN.md
  - docs/reference-configs/
  - docs/architecture/
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260825-1234-official-codex-plugin-outside-review.contract.md
  - tasks/reviews/20260825-1234-official-codex-plugin-outside-review.review.md
  - tasks/notes/20260825-1234-official-codex-plugin-outside-review.notes.md
  - .ai/context/capabilities.json
  - .ai/hooks/.projection.json
  - .ai/hooks/lib/workflow-state.sh
  - .ai/harness/architecture-events/
  - .ai/harness/architecture-requests/
  - .archcontext/model/nodes/
  - .claude/templates/
  - assets/
  - scripts/
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
    - src/effects/review/codex-plugin-provider.ts
    - assets/skills/repo-harness-cross-review/references/codex-plugin-mode.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260825-1234-official-codex-plugin-outside-review.notes.md
  tests_pass:
    - path: tests/cli/cross-review.test.ts
    - path: tests/skill-surface/cross-review-package.test.ts
    - path: tests/acceptance-receipt.test.ts
    - path: tests/prompt-handler.test.ts
    - path: tests/cli/init.test.ts
    - path: tests/cli/global-runtime-init.test.ts
    - path: tests/check-agent-tooling.test.ts
    - path: tests/evidence-checks-materializer.test.ts
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

- Functional behavior: Codex host selects the official plugin provider; Claude host selects direct Codex; both return the existing typed result shape.
- Edge cases: missing/disabled/multiple/unsafe plugin installs, non-zero app-server exit, malformed JSON, invalid severity/path/line fields, and subject drift all fail closed.
- Regression risks: plugin CLI inventory or output-schema drift; host detection ambiguity; template/source mirror drift; historical receipt rejection.

## Rollback Point

- Commit / checkpoint: worktree branch `codex/official-codex-plugin-outside-review` before any `codex-plugin` receipt is published.
- Revert strategy: revert the provider, host projection, acceptance-policy protocol, and templates together; no persisted product data migration is required.
