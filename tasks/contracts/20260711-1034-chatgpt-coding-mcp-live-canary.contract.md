# Task Contract: chatgpt-coding-mcp-live-canary

> **Status**: Blocked
> **Plan**: plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md
> **Task Profile**: eval-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-11 15:23
> **Review File**: `tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md`
> **Notes File**: `tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The coding profile is locally implemented and verified, but setup, schema discovery, and model prose do not prove that ChatGPT can invoke the tools through the real Cloudflare/OAuth boundary. Without one bounded live canary, the product claim that ChatGPT can directly control an explicitly granted local coding workspace remains unverified. A careless canary could expose unrelated repositories, replace the existing planner service, leak credentials, or disturb the user's dirty `main` checkout.

## Goal

Reuse the existing `repo-harness-mcp` named tunnel and stable `https://mcp.repoharness.com/mcp` endpoint, migrate the ignored user MCP config to the coding profile through the feature-worktree CLI, grant read-write access only to a dedicated canary Git repository, and obtain a real ChatGPT `Called tool` transcript for workspace read, atomic patch, bounded long pipe process/poll, and final file readback. Verify the matching local files and metadata-only audit, preserve the user's main WIP, and restore the prior planner state if the canary fails before invocation proof or cannot coexist safely.

## Scope

- In scope:
  - Read current Cloudflare tunnel/DNS/launchd state and reuse the existing named tunnel and hostname when ownership and routing are unambiguous.
  - Create `~/.repo-harness/live-canary/repo` as a dedicated Git repository and grant only that repo `read_write` coding access.
  - Run user-scoped v2-to-v3 setup through `bun src/cli/index.ts`, start the feature-worktree coding server on `127.0.0.1:8765`, and keep secrets out of output and tracked files.
  - Repair only the already-authorized `com.repo-harness.mcp.sidecar` and `com.repo-harness.mcp.tunnel` launchd services when current state proves they point to stale runtime/config.
  - Validate local/public health, OAuth discovery/DCR/PKCE/token, `initialize`, and exact coding `tools/list` through `mcp doctor --live`.
  - Create or refresh the ChatGPT developer-mode app with OAuth and write confirmations, then use a fresh chat for real read/patch/long-process/poll/readback tool calls.
  - With the user's explicit 2026-07-11 authorization, temporarily move `/etc/resolver/repoharness.com` aside, flush the macOS DNS cache, complete the bounded OAuth/canary flow, and restore the resolver byte-for-byte during rollback.
  - Record `invocation_verified` only from visible `Called tool` evidence; otherwise record `surface_blocked` and the exact observed boundary.
- Out of scope:
  - Product code, dependency, schema, migration, or test changes.
  - Any edit, merge, reset, stash, commit, or branch movement in `/Users/kito/Projects/repo-harness` main checkout.
  - ChatGPT write grants for repo-harness or any unrelated repository.
  - New tunnel providers, DNS changes other than the explicitly authorized temporary resolver move/restore, deletion of existing tunnels/apps, or new persistence systems.
  - PTY acceptance under Bun; the approved live canary uses the supported pipe session path.
- Taste constraints: Reuse the existing tunnel, hostname, app, CLI, launchd labels, and user config. Add no wrapper, dependency, product fallback, or second authority. Fail closed rather than guessing account, zone, redirect, token, app, or tool-call state.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the existing stable hostname cannot be unambiguously bound to the existing named tunnel and feature-worktree coding server without destroying the planner path, or if ChatGPT cannot complete OAuth and discover the exact coding schema. Cheapest proof: read tunnel/launchd/config state, then run local/public health and `mcp doctor --live` before changing the ChatGPT app or invoking a tool.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md`
- Notes file: `tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260711-1034-chatgpt-coding-mcp-live-canary.contract.md
  - tasks/reviews/20260711-1034-chatgpt-coding-mcp-live-canary.review.md
  - tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md
  - .ai/harness/handoff/
  - ~/.repo-harness/live-canary/
  - ~/.repo-harness/mcp.local.json
  - ~/.repo-harness/mcp.oauth.json
  - ~/.repo-harness/mcp.oauth-tokens.json
  - ~/.repo-harness/registered-repos.json
  - ~/.cloudflared/config.yml
  - /etc/resolver/repoharness.com
  - /etc/resolver/repoharness.com.repo-harness-canary-disabled
  - ~/Library/LaunchAgents/com.repo-harness.mcp.sidecar.plist
  - ~/Library/LaunchAgents/com.repo-harness.mcp.tunnel.plist
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
    - plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260711-1034-chatgpt-coding-mcp-live-canary.notes.md
  commands_succeed:
    - bun run check:type
    - bun src/cli/index.ts mcp doctor --repo "$HOME/.repo-harness/live-canary/repo" --live
  qa_scores:
    - dimension: functionality
      min: 8
    - dimension: security
      min: 8
  manual_checks:
    - "Cloudflare readback binds mcp.repoharness.com to the existing repo-harness-mcp named tunnel and loopback coding server"
    - "A fresh ChatGPT chat shows real Called tool evidence for read, patch, long pipe process polling, and final file readback"
    - "The dedicated canary repo and metadata-only audit match the ChatGPT tool transcript while main WIP remains untouched"
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: all five coding tools are discoverable; the canary invokes open/read/patch/process/poll and observes the expected files.
- Edge cases: OAuth revision must be current, Host must match the saved endpoint, worktree creation must not target repo-harness, and unsupported PTY must not be requested.
- Regression risks: replacing the existing planner service or app, widening grants, leaking credentials, and misclassifying prose/schema discovery as invocation proof.

## Rollback Point

- Commit / checkpoint: `47cbe506ab34ba63e5d0455ac9306ed8a3d30404` plus pre-canary copies/hashes of ignored config and launchd plists.
- Revert strategy: stop canary processes, restore prior ignored config and launchd plist bytes, bootstrap the prior planner services, downgrade the canary repo to `read_only`, revoke the coding authorization revision, and preserve managed worktrees for inspection.

## Blocked Evidence

- `config_ready`, local/public health, OAuth discovery, and the exact 24-action coding schema passed through the named Tunnel after the user-authorized temporary resolver move.
- Disposable App `kito-mcp-coding-canary-auth-runtime` connected over OAuth and used commit `2a9d49053acf`, whose authorization-scoped workspace/process runtime accepts sequential ChatGPT calls that use different MCP transports.
- Fresh Chat conversation `https://chatgpt.com/c/6a51ed4c-b6d8-83ea-904b-8b2b3debe7a7` completed the requested functional sequence in `cws_155e096c-f7ee-4dfe-90d9-3d7aca50db4c`: workspace open, cross-transport read, atomic patch, bounded process exit 0, and exact final readback. Local audit and file hashes match the final response without retaining raw command/output.
- The current ChatGPT Activity panel visibly exposed the workspace and read inputs plus exact final contents, but did not render the literal `Called tool` entries or enumerate every patch/process/poll row. Therefore the strict manual transcript criterion remains unmet and the fail-closed classifier stays `surface_blocked`, despite functional live execution being verified.
- Rollback deleted the disposable App, stopped the manual processes, removed generated credentials/runtime state, restored backed-up ignored config and launchd plists byte-for-byte, returned both launchd labels to their original stale `EX_CONFIG` state, kept the canary source repo clean, preserved the managed worktrees, and left main WIP untouched.
