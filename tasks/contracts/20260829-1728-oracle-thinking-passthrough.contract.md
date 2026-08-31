# Task Contract: oracle-thinking-passthrough

> **Status**: Active
> **Plan**: plans/plan-20260829-1728-oracle-thinking-passthrough.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-29 17:28
> **Review File**: `tasks/reviews/20260829-1728-oracle-thinking-passthrough.review.md`
> **Notes File**: `tasks/notes/20260829-1728-oracle-thinking-passthrough.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The wrapper's hardcoded thinking whitelist (light/standard/extended/heavy) already drifted from Oracle 0.18.0 browser mode, blocking valid runs such as GPT-5.6 Pro (`--model gpt-5.6-sol --browser-thinking-time pro`). Any local re-derivation of Oracle's accepted set will drift again on the next Oracle release.

## Goal

`repo-harness chatgpt browser-consult --thinking <value>` (CLI and MCP tool) passes the value through to Oracle's `--browser-thinking-time` verbatim with no local whitelist; invalid values fail closed with Oracle's own error. Help text and MCP schema description name Oracle 0.18 examples (light, standard, extended, extra-high, pro, heavy; UI aliases instant, medium, high, xhigh).

## Scope

- In scope: `src/cli/chatgpt-browser/types.ts` (ThinkingLevel), `src/cli/commands/chatgpt.ts` (parseThinking + option help), `src/cli/mcp/tools.ts` (thinking schema enum + parseThinking), tests in `tests/cli/chatgpt-browser.test.ts` and `tests/cli/mcp-tools.test.ts`.
- Out of scope: native provider semantics (it still rejects presence of `--thinking`), oracle-provider command construction (already passthrough), session-store meta shape, any Oracle version probing changes.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If Oracle 0.18 silently accepted arbitrary `--browser-thinking-time` values instead of rejecting them, delegating validation would open a silent-garbage path. Checked before this contract: `oracle --engine browser --browser-thinking-time bogus --dry-run json --prompt probe` exits with `error: option '--browser-thinking-time <level>' argument 'bogus' is invalid` listing the accepted set — fail-closed confirmed.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260829-1728-oracle-thinking-passthrough.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260829-1728-oracle-thinking-passthrough.review.md`
- Notes file: `tasks/notes/20260829-1728-oracle-thinking-passthrough.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"thinking-passthrough","kind":"test","paths":["tests/cli/chatgpt-browser.test.ts"]},{"id":"mcp-thinking-schema","kind":"test","paths":["tests/cli/mcp-tools.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260829-1728-oracle-thinking-passthrough.contract.md
  - tasks/reviews/20260829-1728-oracle-thinking-passthrough.review.md
  - tasks/notes/20260829-1728-oracle-thinking-passthrough.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - docs/repo-harness-chatgpt-browser-engine.md
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
    - tasks/notes/20260829-1728-oracle-thinking-passthrough.notes.md
  tests_pass:
    - path: tests/cli/chatgpt-browser.test.ts
    - path: tests/cli/mcp-tools.test.ts
  commands_succeed:
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

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: branch `claude/nervous-dubinsky-e16525` at plan capture.
- Revert strategy: single revert of this work-package's commits; no persisted state or migration.
