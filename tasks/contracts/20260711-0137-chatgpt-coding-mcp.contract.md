# Task Contract: chatgpt-coding-mcp

> **Status**: Fulfilled
> **Plan**: plans/plan-20260711-0137-chatgpt-coding-mcp.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-11 01:37
> **Review File**: `tasks/reviews/20260711-0137-chatgpt-coding-mcp.review.md`
> **Notes File**: `tasks/notes/20260711-0137-chatgpt-coding-mcp.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ChatGPT can currently plan through the public MCP sidecar and can opt into a fixed Goal runner, but it cannot directly perform the local coding loop demonstrated by DevSpace. Adding that loop crosses a high-risk trust boundary: a public OAuth client can cause arbitrary local-user Bash execution. The implementation must therefore keep every existing profile unchanged, put coding behind a distinct authorization scope and explicit repo grant, preserve repo-harness worktree/index/audit invariants, and make tunnel readiness independently verifiable.

## Goal

Deliver a default-off `coding` MCP profile that lets an authenticated ChatGPT Connector open an explicitly read-write repo in a managed worktree by default, read and atomically patch files, and run bounded pipe/PTY process sessions without invoking Codex. Deliver the associated access/setup/worktree administration, OAuth/profile isolation, Cloudflare-first setup guidance, live readiness diagnostics, durable DevSpace research, regression coverage, and workflow closeout. Stop short of mutating any live tunnel, DNS, ChatGPT App, or other external production state.

## Scope

- In scope:
  - Clone `Waishnav/devspace` at commit `6ccefbf6213c56056a98ff52d7bdb27c081d13b9` into ignored `_ref/devspace` and record a source-cited comparison under `docs/researches/`.
  - Add `coding` to the MCP profile/config/policy surface while preserving the exact existing planner, executor, and orchestrator tool contracts.
  - Add explicit user-scope repo access administration, authorization revisioning, coding OAuth scope/TTL/rotation/revocation, public-origin/Host/CORS/redirect hardening, and a coding-specific approval warning.
  - Add coding `open_workspace`, `read`, `apply_patch`, `exec_command`, and `write_stdin` tools, managed worktree metadata/list/cleanup, canonical path and write-deny enforcement, atomic patching, process lifecycle limits, environment scrubbing, audit, and CodeGraph invalidation/refresh.
  - Add v1/v2-to-v3 setup migration, `--profile coding`, `--grant-read-write`, `doctor --live`, Cloudflare-first Connector documentation, and focused/full verification.
  - Synchronize affected architecture, setup/skill, task, review, notes, and handoff artifacts required by repo policy.
- Out of scope:
  - Live Cloudflare tunnel, DNS, launchd/systemd, ChatGPT App, token, or production deployment mutations.
  - DevSpace as a runtime or vendored dependency; edits inside `_ref/devspace`.
  - Widgets, subagents, browser automation, container/command sandboxing, or first-class ngrok/Pinggy/Tailscale automation.
  - Widening arbitrary planner, executor, or orchestrator permissions; compatibility fallbacks that silently grant coding access.
- Taste constraints: Keep the public coding tool surface to the five approved tools, reuse existing repo registry/general-repo/CodeGraph/audit primitives where they preserve invariants, and add only the `node-pty` optional dependency. Fail closed on missing authorization, invalid paths, stale revisions, missing PTY support, and cross-session process access.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Direction is wrong if the current MCP SDK/ChatGPT Connector cannot advertise or invoke destructive/open-world tools under a distinct OAuth scope without changing existing profile schemas. Cheapest proof: add the coding profile/tool-definition and OAuth-scope contract tests first; if the SDK cannot represent the approved schema or scope isolation, stop before implementing filesystem/process execution.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260711-0137-chatgpt-coding-mcp.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260711-0137-chatgpt-coding-mcp.review.md`
- Notes file: `tasks/notes/20260711-0137-chatgpt-coding-mcp.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - _ref/devspace/
  - package.json
  - bun.lock
  - .gitignore
  - AGENTS.md
  - .agents/skills/repo-harness-chatgpt-bridge/
  - assets/
  - docs/spec.md
  - docs/repo-harness-chatgpt-mcp-setup.md
  - docs/reference-configs/
  - docs/researches/
  - docs/architecture/
  - plans/
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260711-0137-chatgpt-coding-mcp.contract.md
  - tasks/reviews/20260711-0137-chatgpt-coding-mcp.review.md
  - tasks/notes/20260711-0137-chatgpt-coding-mcp.notes.md
  - .ai/harness/handoff/
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
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
    - docs/researches/20260711-devspace-chatgpt-local-control.md
    - src/cli/mcp/coding-tools.ts
    - src/cli/mcp/process-sessions.ts
    - tests/cli/mcp-coding-tools.test.ts
    - tests/cli/mcp-process-sessions.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260711-0137-chatgpt-coding-mcp.notes.md
    - tasks/reviews/20260711-0137-chatgpt-coding-mcp.review.md
  tests_pass:
    - path: tests/cli/mcp-coding-tools.test.ts
    - path: tests/cli/mcp-process-sessions.test.ts
    - path: tests/cli/mcp-policy.test.ts
    - path: tests/cli/mcp-http.test.ts
    - path: tests/cli/mcp-oauth.test.ts
    - path: tests/cli/mcp-setup.test.ts
  commands_succeed:
    - bun test tests/cli/mcp-coding-tools.test.ts tests/cli/mcp-process-sessions.test.ts tests/cli/mcp-policy.test.ts tests/cli/mcp-http.test.ts tests/cli/mcp-oauth.test.ts tests/cli/mcp-setup.test.ts tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-tools.test.ts
    - bun test
    - bun run check:type
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 8
    - dimension: Code quality
      min: 8
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: Local E2E must prove OAuth coding scope -> initialize -> exact coding tools -> default worktree -> read -> atomic patch -> pipe/background process -> write_stdin, without invoking Codex.
- Human acceptance: Legacy planner, executor, and orchestrator schemas remain unchanged; coding stays default-off; coding metadata/audit/doctor do not reveal credentials or the local repo root; the live Cloudflare/ChatGPT canary is recorded as `live_canary_pending_authorization`, not completed acceptance.
- Edge cases: missing grants, stale authorization revision, v1/v2 config, dirty source, checkout opt-in, path/symlink escape, partial patch failure, PTY unavailable, timeout, output truncation, cross-session access, server/session shutdown, CodeGraph refresh failure, public Host/CORS/redirect mismatch.
- Regression risks: planner/executor/orchestrator schema drift; old OAuth tokens gaining coding privilege; shell command/env/audit leakage; worktree cleanup deleting unmerged work; general-repo reader behavior changing for existing users.

## Rollback Point

- Commit / checkpoint: isolated branch `codex/chatgpt-coding-mcp` before merge; no live external state is changed.
- Revert strategy: revert the reviewed branch diff, disable/remove the coding profile, revoke coding-scope tokens/authorization revision, restore registry entries to `read_only`, terminate coding process sessions, and preserve any dirty/unmerged managed worktrees for manual recovery.
